/**
 * 短句的「已掌握 / 未掌握」状态。
 *
 * 与单词的 mastered / study 分开存储：短句 id 形如 `food-01`，
 * 不会和词库 key 冲突，清词库进度也不会误删短句进度。
 *
 * 注：短句原本还有一套间隔重复（SRS）记录，用于复习页的「短句」牌堆。
 * 复习模块已按需求只保留单词，短句的 SRS 随之移除（不再安排到期复习）。
 */
const MASTERED_KEY = 'lexicore-sentence-mastered'
/** 旧版短句 SRS 的存储键：仅在清进度时顺手清掉，不再读取。 */
const LEGACY_SRS_KEY = 'lexicore-sentence-srs'

const listeners = new Set<() => void>()

/** 状态变化订阅：短句页标记后，首页等处统计要同步刷新。 */
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

export function clearSentenceProgress(): void {
  try {
    localStorage.removeItem(MASTERED_KEY)
    localStorage.removeItem(LEGACY_SRS_KEY)
  } catch {
    /* ignore */
  }
  emit()
}
