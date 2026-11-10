import {
  SHORT_SENTENCES,
  SHORT_SENTENCE_TOTAL,
  type SentenceSceneId,
  type ShortSentence,
} from '../data/sentences'

/**
 * 短句的「已掌握 / 未掌握」与间隔重复记录。
 *
 * 与单词的 mastered / study 分开存储：短句 id 形如 `food-01`，
 * 不会和词库 key 冲突，清词库进度也不会误删短句进度。
 */
const MASTERED_KEY = 'lexicore-sentence-mastered'
const SRS_KEY = 'lexicore-sentence-srs'
const DAY = 86_400_000
const BOX_INTERVALS_DAYS = [1, 2, 4, 8, 16, 30] as const
const MAX_BOX = BOX_INTERVALS_DAYS.length - 1
export const SENTENCE_SESSION_SIZE = 20

export interface SentenceRecord {
  box: number
  dueAt: number
  lastAt: number
  seen: number
  lapses: number
}

export type SentenceGrade = 'good' | 'again'

const listeners = new Set<() => void>()

/** 状态变化订阅：短句页与复习页同时保活时，两处统计要同步刷新。 */
export function subscribeSentenceProgress(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

function emit(): void {
  listeners.forEach((fn) => fn())
}

function readMastered(): Set<string> {
  try {
    const raw = localStorage.getItem(MASTERED_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((v): v is string => typeof v === 'string'))
  } catch {
    return new Set()
  }
}

function writeMastered(set: Set<string>): void {
  try {
    localStorage.setItem(MASTERED_KEY, JSON.stringify([...set]))
  } catch {
    /* 隐私模式 / 配额满：本次会话仍可用 */
  }
  emit()
}

export function getSentenceMastered(): Set<string> {
  return readMastered()
}

export function isSentenceMastered(id: string): boolean {
  return readMastered().has(id)
}

/** 设置单条状态，返回更新后的集合，方便页面直接 setState。 */
export function setSentenceMastered(id: string, mastered: boolean): Set<string> {
  const next = readMastered()
  if (mastered) next.add(id)
  else next.delete(id)
  writeMastered(next)
  return next
}

export function toggleSentenceMastered(id: string): Set<string> {
  return setSentenceMastered(id, !isSentenceMastered(id))
}

function isRecord(v: unknown): v is SentenceRecord {
  const o = v as SentenceRecord
  return (
    !!o &&
    typeof o.box === 'number' &&
    typeof o.dueAt === 'number' &&
    typeof o.lastAt === 'number' &&
    typeof o.seen === 'number' &&
    typeof o.lapses === 'number'
  )
}

function readRecords(): Record<string, SentenceRecord> {
  try {
    const raw = localStorage.getItem(SRS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, SentenceRecord> = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (isRecord(value)) out[key] = value
    }
    return out
  } catch {
    return {}
  }
}

function writeRecords(records: Record<string, SentenceRecord>): void {
  try {
    localStorage.setItem(SRS_KEY, JSON.stringify(records))
  } catch {
    /* ignore */
  }
}

/** 记录一次「认识 / 不认识」，按 Leitner 盒安排下次复习。 */
export function applySentenceGrade(id: string, grade: SentenceGrade, now = Date.now()): SentenceRecord {
  const records = readRecords()
  const prev = records[id]
  let box = 0
  let dueAt = now + BOX_INTERVALS_DAYS[0] * DAY
  let lapses = prev?.lapses ?? 0

  if (grade === 'good') {
    box = Math.min(MAX_BOX, (prev?.box ?? -1) + 1)
    dueAt = now + BOX_INTERVALS_DAYS[box] * DAY
  } else {
    lapses += 1
  }

  const next: SentenceRecord = {
    box,
    dueAt,
    lastAt: now,
    seen: (prev?.seen ?? 0) + 1,
    lapses,
  }
  records[id] = next
  writeRecords(records)
  setSentenceMastered(id, grade === 'good')
  return next
}

export function getSentenceDueCount(now = Date.now()): number {
  return Object.values(readRecords()).filter((r) => r.seen > 0 && r.dueAt <= now).length
}

export interface SentenceProgress {
  total: number
  mastered: number
  unmastered: number
  due: number
}

export function getSentenceProgress(now = Date.now()): SentenceProgress {
  const mastered = readMastered().size
  return {
    total: SHORT_SENTENCE_TOTAL,
    mastered,
    unmastered: SHORT_SENTENCE_TOTAL - mastered,
    due: getSentenceDueCount(now),
  }
}

export function getSentenceTodayCount(now = Date.now()): number {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const t = start.getTime()
  return Object.values(readRecords()).filter((r) => r.lastAt >= t).length
}

export interface SentenceSessionOptions {
  scene?: SentenceSceneId | 'all'
  /** all=全部；unknown=只练未掌握；due=只练到期 */
  mode?: 'all' | 'unknown' | 'due'
  limit?: number
  now?: number
}

/**
 * 组一组短句复习卡：到期 → 未掌握 → 没练过 → 已掌握补位。
 * 正面永远先给中文，让用户先想英文，再看答案。
 */
export function buildSentenceSession(opts: SentenceSessionOptions = {}): ShortSentence[] {
  const limit = Math.max(1, opts.limit ?? SENTENCE_SESSION_SIZE)
  const now = opts.now ?? Date.now()
  const mode = opts.mode ?? 'all'
  const records = readRecords()
  const mastered = readMastered()

  let pool = SHORT_SENTENCES
  if (opts.scene && opts.scene !== 'all') pool = pool.filter((s) => s.scene === opts.scene)
  if (mode === 'unknown') pool = pool.filter((s) => !mastered.has(s.id))
  if (mode === 'due') {
    pool = pool.filter((s) => {
      const r = records[s.id]
      return !!r && r.seen > 0 && r.dueAt <= now
    })
  }

  const rank = (s: ShortSentence): number => {
    const r = records[s.id]
    if (r && r.seen > 0 && r.dueAt <= now) return 0
    if (!mastered.has(s.id)) return 1
    if (!r) return 2
    return 3
  }
  const sorted = [...pool].sort((a, b) => {
    const diff = rank(a) - rank(b)
    if (diff !== 0) return diff
    const ta = records[a.id]?.lastAt ?? 0
    const tb = records[b.id]?.lastAt ?? 0
    if (ta !== tb) return ta - tb
    return a.id.localeCompare(b.id)
  })

  return sorted.slice(0, limit)
}

export function clearSentenceProgress(): void {
  try {
    localStorage.removeItem(MASTERED_KEY)
    localStorage.removeItem(SRS_KEY)
  } catch {
    /* ignore */
  }
  emit()
}
