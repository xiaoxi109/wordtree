import { ALL_WORDS, CORE_WORDS } from '../data'
import { getLexiconVersion } from '../data/lexicon'
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
   * 只复习已掌握的词（默认背词页用）：到期词优先，按 limit 分批，不掺新词/错词。
   */
  masteredOnly?: boolean
  limit?: number
  now?: number
  /** 外部词库词池；不传则用 CORE_WORDS。 */
  pool?: Word[]
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
  let box = 0
  let dueAt = now + BOX_INTERVALS_DAYS[0] * DAY // 默认 1 天后再来
  let lapses = prev?.lapses ?? 0

  if (grade === 'good') {
    // 逐级推进 Leitner 盒号：首次 good 落在第 0 格（1 天后），
    // again / hard 归零后从 0 重新爬，不再受累计 seen 次数影响。
    box = Math.min(MAX_BOX, (prev?.box ?? -1) + 1)
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
  const nextBox = Math.min(MAX_BOX, (record?.box ?? -1) + 1) // 与 applyStudyGrade 的晋级口径一致
  return BOX_INTERVALS_DAYS[nextBox]
}

/**
 * 到期复习的词数。
 * 复习队列只放「已掌握」的词，所以传入 masteredSet 时只统计其中的到期词；
 * 不传则统计全部有记录的词（仅调试用）。
 */
export function getDueCount(now = Date.now(), masteredSet?: Set<string>): number {
  const records = readRecords()
  const mastered = masteredSet ? new Set([...masteredSet].map(wordKey)) : null
  return Object.values(records).filter(
    (r) => r.seen > 0 && r.dueAt <= now && (!mastered || mastered.has(r.key)),
  ).length
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
/** 索引对应的词典版本：扩展词懒加载完成后需要重建 */
let indexVersion = -1

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
  const version = getLexiconVersion()
  if (indexCache && indexVersion === version) return indexCache
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
  indexVersion = version
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

  // 背词只抽课程词表；用户主动标记过的词典扩展词会经 review 队列进入复习
  const base = opts.pool ?? (opts.source === 'pep' ? pepWords() : CORE_WORDS)
  const scoped = base.filter((w) =>
    opts.scope === 'all'
      ? true
      : opts.source === 'cefr'
        ? w.level === opts.scope
        : w.grade === opts.scope,
  )

  // 只复习已掌握的词：SRS 到期词优先，其次按最久未复习补位；
  // 每轮最多 limit 张，避免一次会话把全部已掌握词塞进来。
  if (opts.masteredOnly) {
    const masteredKeys = new Set([...opts.masteredSet].map(wordKey))
    const candidates: { word: Word; key: string; rec?: StudyRecord }[] = []
    const picked = new Set<string>()
    // 1) 当前范围词表里已掌握的词
    for (const w of scoped) {
      const key = wordKey(w.word)
      if (!masteredKeys.has(key) || picked.has(key)) continue
      picked.add(key)
      candidates.push({ word: w, key, rec: records[key] })
    }
    // 2) 已掌握但不在范围词表里的词（查词时手动标记的扩展词，运行时才加载进总词库）同样可以复习
    for (const [key, w] of studyIndex()) {
      if (picked.has(key) || !masteredKeys.has(key)) continue
      picked.add(key)
      candidates.push({ word: w, key, rec: records[key] })
    }
    // 无记录 = 从未复习（dueAt 视为 0），不能把它当成「已到期」抢在真正到期词前面。
    const rank = (rec?: StudyRecord): number => {
      if (!rec || rec.seen === 0) return 1
      return rec.dueAt <= now ? 0 : 2
    }
    candidates.sort((a, b) => {
      const diff = rank(a.rec) - rank(b.rec)
      if (diff !== 0) return diff
      return (a.rec?.dueAt ?? 0) - (b.rec?.dueAt ?? 0)
    })
    return candidates.slice(0, limit).map(({ word, key }) => toCard(word, key, 'review'))
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
