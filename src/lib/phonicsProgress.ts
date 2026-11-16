import { PHONEME_TOTAL, RULE_TOTAL } from '../data/phonics'

/**
 * 自然拼读 / 音标模块的本地进度。
 *
 * 音标与拼读规则分开存储（音标 id 是 IPA 符号，规则 id 形如 `L-a` / `D-sh`），
 * 互不干扰，也不会和单词 mastered 的 key 冲突。
 */
const PHONEME_KEY = 'lexicore-phonetics-mastered'
const RULE_KEY = 'lexicore-phonics-rules-mastered'
const DRILL_KEY = 'lexicore-phonics-drill-best'

const listeners = new Set<() => void>()

/** 进度变化订阅：首页模块与学习页同时保活时，两处统计要同步。 */
export function subscribePhonicsProgress(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

function emit(): void {
  listeners.forEach((fn) => fn())
}

function readSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((v): v is string => typeof v === 'string'))
  } catch {
    return new Set()
  }
}

function writeSet(key: string, set: Set<string>): void {
  try {
    localStorage.setItem(key, JSON.stringify([...set]))
  } catch {
    /* 隐私模式 / 配额满：本次会话仍然可用 */
  }
  emit()
}

export function getPhonemeMastered(): Set<string> {
  return readSet(PHONEME_KEY)
}

export function isPhonemeMastered(id: string): boolean {
  return readSet(PHONEME_KEY).has(id)
}

export function togglePhonemeMastered(id: string): Set<string> {
  const next = readSet(PHONEME_KEY)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  writeSet(PHONEME_KEY, next)
  return next
}

export function getRuleMastered(): Set<string> {
  return readSet(RULE_KEY)
}

export function isRuleMastered(id: string): boolean {
  return readSet(RULE_KEY).has(id)
}

export function toggleRuleMastered(id: string): Set<string> {
  const next = readSet(RULE_KEY)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  writeSet(RULE_KEY, next)
  return next
}

export interface PhonicsStats {
  phonemeDone: number
  phonemeTotal: number
  ruleDone: number
  ruleTotal: number
  /** 总体完成度 0-100 */
  pct: number
}

export function getPhonicsStats(): PhonicsStats {
  const phonemeDone = getPhonemeMastered().size
  const ruleDone = getRuleMastered().size
  const total = PHONEME_TOTAL + RULE_TOTAL
  const done = phonemeDone + ruleDone
  return {
    phonemeDone,
    phonemeTotal: PHONEME_TOTAL,
    ruleDone,
    ruleTotal: RULE_TOTAL,
    pct: total > 0 ? Math.round((done / total) * 100) : 0,
  }
}

/* ── 听辨练习成绩（只在破纪录时写入） ───────────────────── */
export type DrillMode = 'ipa' | 'rule'

export interface DrillBest {
  ipa: number
  rule: number
  /** 满分题数，用于换算正确率 */
  total: number
}

const DEFAULT_BEST: DrillBest = { ipa: 0, rule: 0, total: 10 }

export function getDrillBest(): DrillBest {
  try {
    const raw = localStorage.getItem(DRILL_KEY)
    if (!raw) return { ...DEFAULT_BEST }
    const parsed = JSON.parse(raw) as Partial<DrillBest>
    return {
      ipa: typeof parsed.ipa === 'number' ? parsed.ipa : 0,
      rule: typeof parsed.rule === 'number' ? parsed.rule : 0,
      total: typeof parsed.total === 'number' && parsed.total > 0 ? parsed.total : DEFAULT_BEST.total,
    }
  } catch {
    return { ...DEFAULT_BEST }
  }
}

/** 返回是否破纪录，便于页面给一句「新纪录」。 */
export function saveDrillBest(mode: DrillMode, score: number, total: number): boolean {
  const best = getDrillBest()
  if (score <= best[mode]) return false
  const next: DrillBest = { ...best, [mode]: score, total }
  try {
    localStorage.setItem(DRILL_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
  emit()
  return true
}
