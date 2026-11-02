import { ALL_WORDS } from '../data'
import { GRADES, wordsByGrade, type GradeId } from '../data/grades'
import type { Level, Word } from '../data/types'
import { wordKey } from './cluster'
import { getReviewWords, type ReviewWord } from './review'

/** 背词结果的三个档位：不认识 / 模糊 / 认识。 */
export type StudyGrade = 'again' | 'hard' | 'good'
/** 新词来源：CEFR 主库 / 人教词表。 */
export type StudySource = 'cefr' | 'pep'
/** 当前范围：全部、某个 CEFR 等级，或某个人教年级。 */
export type StudyScope = 'all' | Level | GradeId
/** 卡片来源标记，用于 UI 徽标与统计。 */
export type StudyStage = 'new' | 'review' | 'wrong'

export interface StudyCard {
  key: string
  word: string
  ipa: string
  pos: string
  meaning: string
  examples: Word['examples']
  level?: Level
  grade?: string
  pepOnly?: boolean
  /** 常用词（详情卡显示「常用词」标签） */
  common?: boolean
  stage: StudyStage
  /** 错词本里的累计错误次数 */
  misses?: number
}

export interface StudyRecord {
  key: string
  /** Leitner 盒号：0=待重学，1~5 依次拉长间隔 */
  box: number
  dueAt: number
  lastAt: number
  seen: number
  lapses: number
}

export interface StudyBuildOptions {
  source: StudySource
  scope: StudyScope
  wrongOnly: boolean
  masteredSet: Set<string>
  /**
   * 只复习已掌握的词（默认背词页用）：取该范围内的全部已掌握词，不分批、不掺新词。
   */
  masteredOnly?: boolean
  limit?: number
  now?: number
}

const STORAGE_KEY = 'lexicore-study'
const DAY = 86_400_000
/**
 * 间隔重复序列（设计要求）：1 → 2 → 4 → 8 → 16 → 30 天（封顶）。
 * again / hard 都重置回第 0 格（1 天后再来）；good 逐级推进。
 */
export const BOX_INTERVALS_DAYS = [1, 2, 4, 8, 16, 30] as const
const MAX_BOX = BOX_INTERVALS_DAYS.length - 1 // 5
export const SESSION_SIZE = 20

/* ------------------------------ 持久化 ------------------------------ */

function isStudyRecord(v: unknown): v is StudyRecord {
  const o = v as StudyRecord
  return (
    !!o &&
    typeof o.key === 'string' &&
    typeof o.box === 'number' &&
    typeof o.dueAt === 'number' &&
    typeof o.lastAt === 'number' &&
    typeof o.seen === 'number' &&
    typeof o.lapses === 'number'
  )
}

function readRecords(): Record<string, StudyRecord> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, StudyRecord> = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (isStudyRecord(value)) out[key] = value
    }
    return out
  } catch {
    return {}
  }
}

function writeRecords(records: Record<string, StudyRecord>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
  } catch {
    /* 隐私模式 / 存储满：静默失败，当前会话仍可继续 */
  }
}

export function getStudyRecords(): Record<string, StudyRecord> {
  return readRecords()
}

/** 记录一次背词结果，并按间隔重复序列安排下次复习时间。 */
export function applyStudyGrade(key: string, grade: StudyGrade, now = Date.now()): StudyRecord {
  const records = readRecords()
  const prev = records[key]
  const prevSeen = prev?.seen ?? 0
  let box = 0
  let dueAt = now + BOX_INTERVALS_DAYS[0] * DAY // 默认 1 天后再来
  let lapses = prev?.lapses ?? 0

  if (grade === 'good') {
    // 间隔档位 = 之前见过的次数；第一次 good 进 BOX_INTERVALS_DAYS[0]（1 天）
    box = Math.min(MAX_BOX, prevSeen)
    dueAt = now + BOX_INTERVALS_DAYS[box] * DAY
  } else if (grade === 'hard') {
    box = 0
    dueAt = now + BOX_INTERVALS_DAYS[0] * DAY
  } else {
    box = 0
    dueAt = now + BOX_INTERVALS_DAYS[0] * DAY
    lapses += 1
  }

  const next: StudyRecord = {
    key,
    box,
    dueAt,
    lastAt: now,
    seen: (prev?.seen ?? 0) + 1,
    lapses,
  }
  records[key] = next
  writeRecords(records)
  return next
}

/** 这张卡如果点「认识」，下次隔多少天复习（用于按钮提示）。 */
export function goodIntervalDays(key: string): number {
  const record = readRecords()[key]
  const nextBox = Math.min(MAX_BOX, record?.seen ?? 0) // 下次 good 的 box = 当前 seen 次数
  return BOX_INTERVALS_DAYS[nextBox]
}

export function getDueCount(now = Date.now()): number {
  return Object.values(readRecords()).filter((r) => r.seen > 0 && r.dueAt <= now).length
}

/** 今天碰过的词数（同一个词重复判断只算一个）。 */
export function getTodayStudiedCount(now = Date.now()): number {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const t = start.getTime()
  return Object.values(readRecords()).filter((r) => r.lastAt >= t).length
}

export function clearStudyRecords(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/* ------------------------------ 词库索引 ------------------------------ */

let pepCache: Word[] | null = null
let indexCache: Map<string, Word> | null = null

/** 人教全年级词表（按规范化键去重，保留首次出现的年级）。 */
function pepWords(): Word[] {
  if (pepCache) return pepCache
  const byGrade = wordsByGrade()
  const map = new Map<string, Word>()
  for (const g of GRADES) {
    for (const w of byGrade[g.id]) {
      const key = wordKey(w.word)
      if (!map.has(key)) map.set(key, w)
    }
  }
  pepCache = Array.from(map.values())
  return pepCache
}

/** CEFR / 人教合并索引：错词本里的词即使来自人教专有词也能补全释义与例句。 */
function studyIndex(): Map<string, Word> {
  if (indexCache) return indexCache
  const map = new Map<string, Word>()
  for (const w of ALL_WORDS) map.set(wordKey(w.word), w)
  const byGrade = wordsByGrade()
  for (const g of GRADES) {
    for (const w of byGrade[g.id]) {
      const key = wordKey(w.word)
      const prev = map.get(key)
      if (!prev) map.set(key, w)
      else if (!prev.grade && w.grade) map.set(key, { ...prev, grade: w.grade })
    }
  }
  indexCache = map
  return map
}

/* ------------------------------ 组卡 ------------------------------ */

function toCard(word: Word, key: string, stage: StudyStage, misses?: number): StudyCard {
  return {
    key,
    word: word.word,
    ipa: word.ipa || '',
    pos: word.pos || '',
    meaning: word.meaning || '',
    examples: word.examples ?? [],
    level: word.level,
    grade: word.grade,
    pepOnly: word.pepOnly,
    common: word.common,
    stage,
    misses,
  }
}

function reviewCard(review: ReviewWord): StudyCard {
  const word = studyIndex().get(review.key)
  if (word) return toCard(word, review.key, 'wrong', review.misses)
  return {
    key: review.key,
    word: review.word,
    ipa: review.ipa || '',
    pos: '',
    meaning: review.meaning,
    examples: [],
    stage: 'wrong',
    misses: review.misses,
  }
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * 组一组背词卡：
 * 1. 错词 / 到期复习优先（默认最多占 60%，避免一组全是旧词）；
 * 2. 用新词补足；
 * 3. 新词不够时，用最久没碰过的已掌握词补位，保证「再来一组」不空场。
 * 错词本模式只出错词。
 */
export function buildStudySession(opts: StudyBuildOptions): StudyCard[] {
  const limit = Math.max(1, opts.limit ?? SESSION_SIZE)
  const now = opts.now ?? Date.now()
  const records = readRecords()
  const review = getReviewWords().sort((a, b) => b.misses - a.misses || a.lastAt - b.lastAt)

  if (opts.wrongOnly) {
    return review.slice(0, limit).map(reviewCard)
  }

  const base = opts.source === 'pep' ? pepWords() : ALL_WORDS
  const scoped = base.filter((w) =>
    opts.scope === 'all'
      ? true
      : opts.source === 'cefr'
        ? w.level === opts.scope
        : w.grade === opts.scope,
  )

  // 只复习已掌握的词：全量返回（不分批，也不掺新词/错词）
  if (opts.masteredOnly) {
    return scoped
      .filter((w) => opts.masteredSet.has(w.word))
      .map((w) => toCard(w, wordKey(w.word), 'review'))
  }

  const byKey = new Map<string, Word>()
  for (const w of scoped) byKey.set(wordKey(w.word), w)

  const out: StudyCard[] = []
  const used = new Set<string>()
  const reviewBudget = Math.ceil(limit * 0.6)

  const addWord = (word: Word, stage: StudyStage) => {
    const key = wordKey(word.word)
    if (used.has(key) || out.length >= limit) return
    used.add(key)
    out.push(toCard(word, key, stage))
  }

  const addReview = (item: ReviewWord) => {
    if (used.has(item.key) || out.length >= limit) return
    const word = byKey.get(item.key)
    if (!word) return
    used.add(item.key)
    out.push(toCard(word, item.key, 'wrong', item.misses))
  }

  // 错词 + 到期复习，最多占 60%
  for (const item of review) {
    if (out.length >= reviewBudget) break
    addReview(item)
  }
  const dueRecords = Object.values(records)
    .filter((r) => r.seen > 0 && r.dueAt <= now)
    .sort((a, b) => a.dueAt - b.dueAt)
  for (const record of dueRecords) {
    if (out.length >= reviewBudget) break
    const word = byKey.get(record.key)
    if (word) addWord(word, 'review')
  }

  // 新词补足
  const newWords = shuffle(
    scoped.filter((w) => {
      const key = wordKey(w.word)
      return !opts.masteredSet.has(w.word) && !records[key]?.seen
    }),
  )
  for (const word of newWords) addWord(word, 'new')

  // 最后用已掌握 / 已见词补位（最久没复习的优先）
  const rest = scoped
    .filter((w) => {
      const key = wordKey(w.word)
      return opts.masteredSet.has(w.word) || !!records[key]?.seen
    })
    .sort((a, b) => (records[wordKey(a.word)]?.lastAt ?? 0) - (records[wordKey(b.word)]?.lastAt ?? 0))
  for (const word of rest) addWord(word, 'review')

  return out
}
