import { loadMastered, masteredKey } from '../data/lexicons'

/**
 * 书籍课程的学习进度与收藏。
 *
 * 与其它模块一致走 localStorage（key: lexicore-book-progress），
 * 掌握词进度则复用词表本体的存储（masteredKey），保证词库页 / 复习页同步可见。
 */

/** 单册书的进度 */
export interface BookProgressEntry {
  /** 已学篇目 id */
  readIds: string[]
  /** 收藏篇目 id */
  favIds: string[]
  /** 最后学习的篇目 id */
  lastId?: string
  /** 学习日期戳（YYYY-MM-DD），用于连续学习天数 */
  days: string[]
}

/** 全局进度表 */
export type BookProgressMap = Record<string, BookProgressEntry>

export const BOOK_PROGRESS_KEY = 'lexicore-book-progress'

/** 书籍 → 词表 id 的固定映射（与 inferLexiconLevel 的 A1/A2/B1/B2 口径一致） */
export const BOOK_LEXICON_IDS: Record<string, string> = {
  'nce-1': 'nce-new-1',
  'nce-2': 'nce-new-2',
  'nce-3': 'nce-new-3',
  'nce-4': 'nce-new-4',
}

/** 取某册对应的词表 id（未知册回退到第一册） */
export function lexiconIdForBook(bookId: string): string {
  return BOOK_LEXICON_IDS[bookId] ?? 'nce-new-1'
}

/** 今天的日期戳 */
export function todayStamp(): string {
  return new Date().toISOString().slice(0, 10)
}

function emptyEntry(): BookProgressEntry {
  return { readIds: [], favIds: [], days: [] }
}

function sanitizeEntry(raw: unknown): BookProgressEntry {
  if (!raw || typeof raw !== 'object') return emptyEntry()
  const obj = raw as Partial<BookProgressEntry>
  const readIds = Array.isArray(obj.readIds) ? obj.readIds.filter((v) => typeof v === 'string') : []
  const favIds = Array.isArray(obj.favIds) ? obj.favIds.filter((v) => typeof v === 'string') : []
  const days = Array.isArray(obj.days) ? obj.days.filter((v) => typeof v === 'string') : []
  const entry: BookProgressEntry = { readIds, favIds, days }
  if (typeof obj.lastId === 'string') entry.lastId = obj.lastId
  return entry
}

/** 读取全部进度 */
export function loadBookProgress(): BookProgressMap {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(BOOK_PROGRESS_KEY) || '{}')
    if (!parsed || typeof parsed !== 'object') return {}
    const out: BookProgressMap = {}
    for (const [bookId, value] of Object.entries(parsed as Record<string, unknown>)) {
      out[bookId] = sanitizeEntry(value)
    }
    return out
  } catch {
    return {}
  }
}

/** 写入全部进度 */
export function saveBookProgress(map: BookProgressMap): void {
  try {
    localStorage.setItem(BOOK_PROGRESS_KEY, JSON.stringify(map))
  } catch {
    /* 配额不足时静默忽略，不影响阅读 */
  }
}

/** 取某册进度（不存在则返回空进度） */
export function getBookEntry(map: BookProgressMap, bookId: string): BookProgressEntry {
  return map[bookId] ?? emptyEntry()
}

/**
 * 标记一篇已学：加入已学列表、记为最后学习位置、记录今日学习日。
 * 返回新的进度表（不修改入参）。
 */
export function markLessonRead(
  map: BookProgressMap,
  bookId: string,
  lessonId: string,
  stamp: string = todayStamp(),
): BookProgressMap {
  const entry = sanitizeEntry(map[bookId])
  const readIds = entry.readIds.includes(lessonId) ? entry.readIds : [...entry.readIds, lessonId]
  const days = entry.days.includes(stamp) ? entry.days : [...entry.days, stamp]
  return { ...map, [bookId]: { ...entry, readIds, days, lastId: lessonId } }
}

/** 切换收藏状态，返回新的进度表 */
export function toggleFavorite(
  map: BookProgressMap,
  bookId: string,
  lessonId: string,
): BookProgressMap {
  const entry = sanitizeEntry(map[bookId])
  const favIds = entry.favIds.includes(lessonId)
    ? entry.favIds.filter((id) => id !== lessonId)
    : [...entry.favIds, lessonId]
  return { ...map, [bookId]: { ...entry, favIds } }
}

/**
 * 连续学习天数：从今天（或昨天）往前连续数，日期戳去重。
 * 中间断一天即归零。
 */
export function computeStreak(days: string[], now: number = Date.now()): number {
  if (!Array.isArray(days) || days.length === 0) return 0
  const unique = new Set(days.filter((d) => typeof d === 'string' && d.length > 0))
  if (unique.size === 0) return 0
  const today = new Date(now).toISOString().slice(0, 10)
  const yesterday = new Date(now - 86_400_000).toISOString().slice(0, 10)
  let cursor: string
  if (unique.has(today)) cursor = today
  else if (unique.has(yesterday)) cursor = yesterday
  else return 0
  let count = 0
  while (unique.has(cursor)) {
    count += 1
    cursor = new Date(new Date(`${cursor}T00:00:00Z`).getTime() - 86_400_000)
      .toISOString()
      .slice(0, 10)
  }
  return count
}

/* ---------------- 掌握进度回写（与词表共享同一份数据） ---------------- */

/** 掌握状态变更事件名（App 监听后同步内存状态） */
export const MASTERED_EVENT = 'lexicore-mastered-changed'

/**
 * 标记某个词在某词表里的掌握状态。
 * 直接写词表的 localStorage 列表，并广播事件让词库页 / 复习页即时刷新。
 */
export function setWordMastered(lexiconId: string, word: string, mastered: boolean): void {
  const key = masteredKey(lexiconId)
  const list = loadMastered(lexiconId)
  const exists = list.includes(word)
  if (mastered === exists) return
  const next = mastered ? [...list, word] : list.filter((w) => w !== word)
  try {
    localStorage.setItem(key, JSON.stringify(next))
  } catch {
    return
  }
  window.dispatchEvent(
    new CustomEvent(MASTERED_EVENT, { detail: { lexiconId, word, mastered } }),
  )
}

/** 读取某词表里已掌握的词（归一化小写后返回集合） */
export function masteredWordSet(lexiconId: string): Set<string> {
  return new Set(loadMastered(lexiconId).map((w) => w.toLowerCase()))
}
