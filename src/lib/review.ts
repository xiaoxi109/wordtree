/**
 * AI 课程「错词复习队列」。
 *
 * 阅读中点「不认识 / 模糊」的词会从 lexicore-mastered 移除（回到 CEFR/人教 的
 * 未掌握列表），同时进入本队列；后续生成课程时会从队列里挑一部分作为「复习词」
 * 编进新文章，并要求在文中重复出现 —— 这样错词才真正回流到 AI 课程。
 */
export interface ReviewWord {
  key: string
  word: string
  ipa: string
  meaning: string
  /** 累计被标记为不认识/模糊的次数 */
  misses: number
  /** 最近一次标记时间（ms） */
  lastAt: number
}

const STORAGE_KEY = 'lexicore-ai-review'
const MAX_SIZE = 200

export function getReviewWords(): ReviewWord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isReviewWord).sort((a, b) => b.lastAt - a.lastAt)
  } catch {
    return []
  }
}

export function getReviewKeySet(): Set<string> {
  return new Set(getReviewWords().map((w) => w.key))
}

/** 记录一次错误标记；已存在则累加次数并刷新时间。 */
export function pushReviewWord(
  word: { key: string; word: string; ipa: string; meaning: string },
  state: 'unknown' | 'fuzzy',
): void {
  const list = getReviewWords()
  const idx = list.findIndex((w) => w.key === word.key)
  const now = Date.now()
  if (idx >= 0) {
    list[idx] = {
      ...list[idx],
      misses: list[idx].misses + 1,
      lastAt: now,
      // 模糊不计入权重？统一累加，UI 不区分，保持简单
      ipa: word.ipa || list[idx].ipa,
      meaning: word.meaning || list[idx].meaning,
    }
  } else {
    list.push({ ...word, misses: state === 'unknown' ? 2 : 1, lastAt: now })
  }
  save(list)
}

/** 标记为已掌握时移出复习队列。 */
export function removeReviewWord(key: string): void {
  save(getReviewWords().filter((w) => w.key !== key))
}

export function clearReviewWords(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

function save(list: ReviewWord[]): void {
  try {
    const trimmed = [...list].sort((a, b) => b.lastAt - a.lastAt).slice(0, MAX_SIZE)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    /* 配额或隐私模式忽略 */
  }
}

function isReviewWord(v: unknown): v is ReviewWord {
  const o = v as ReviewWord
  return !!o && typeof o.key === 'string' && typeof o.word === 'string' && typeof o.meaning === 'string'
}
