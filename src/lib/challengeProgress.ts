/**
 * 闯关模块的本地进度：每种玩法的每一关的星级、最好成绩与最快用时。
 *
 * 独立存储（lexicore-challenge-progress），与单词掌握状态、SRS 记录互不干扰。
 * 解锁规则：第 1 关永远开放，通关（≥1 星）后解锁下一关。
 */
const STORAGE_KEY = 'lexicore-challenge-progress'

const listeners = new Set<() => void>()

/** 进度变化订阅：闯关页与首页同时保活时，两处统计要同步刷新。 */
export function subscribeChallengeProgress(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

function emit(): void {
  listeners.forEach((fn) => fn())
}

/** 单关记录：星级 + 最好成绩 + 最快平均用时（毫秒）。 */
export interface LevelRecord {
  stars: number
  bestScore: number
  total: number
  bestAvgMs: number
  plays: number
}

interface ProgressShape {
  /** gameId → 关卡序号(字符串) → 记录 */
  games: Record<string, Record<string, LevelRecord>>
}

function isLevelRecord(v: unknown): v is LevelRecord {
  const o = v as LevelRecord
  return (
    !!o &&
    typeof o.stars === 'number' &&
    typeof o.bestScore === 'number' &&
    typeof o.total === 'number' &&
    typeof o.bestAvgMs === 'number' &&
    typeof o.plays === 'number'
  )
}

function read(): ProgressShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { games: {} }
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { games: {} }
    const src = (parsed as Partial<ProgressShape>).games
    if (!src || typeof src !== 'object') return { games: {} }
    const games: Record<string, Record<string, LevelRecord>> = {}
    for (const [gameId, levels] of Object.entries(src)) {
      if (!levels || typeof levels !== 'object') continue
      const out: Record<string, LevelRecord> = {}
      for (const [lv, rec] of Object.entries(levels as Record<string, unknown>)) {
        if (isLevelRecord(rec)) out[lv] = rec
      }
      games[gameId] = out
    }
    return { games }
  } catch {
    return { games: {} }
  }
}

function write(p: ProgressShape): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p))
  } catch {
    /* 隐私模式 / 配额满：本次会话仍可用 */
  }
  emit()
}

export function getChallengeProgress(): ProgressShape {
  return read()
}

export function getLevelRecord(gameId: string, level: number): LevelRecord | undefined {
  return read().games[gameId]?.[String(level)]
}

export function getLevelStars(gameId: string, level: number): number {
  return getLevelRecord(gameId, level)?.stars ?? 0
}

/**
 * 关卡是否解锁：第 1 关永远开放；之后每关需要上一关至少拿到 1 星。
 */
export function isLevelUnlocked(gameId: string, level: number): boolean {
  if (level <= 0) return true
  return getLevelStars(gameId, level - 1) >= 1
}

export interface LevelResult {
  stars: number
  score: number
  total: number
  avgMs: number
}

/** 保存一关成绩：星级取历史最好，用时取最快，返回是否刷新了最佳纪录。 */
export function saveLevelResult(gameId: string, level: number, result: LevelResult): boolean {
  const p = read()
  const levels = { ...(p.games[gameId] ?? {}) }
  const prev = levels[String(level)]
  const next: LevelRecord = {
    stars: Math.max(prev?.stars ?? 0, result.stars),
    bestScore: Math.max(prev?.bestScore ?? 0, result.score),
    total: result.total,
    bestAvgMs: prev?.bestAvgMs ? Math.min(prev.bestAvgMs, result.avgMs) : result.avgMs,
    plays: (prev?.plays ?? 0) + 1,
  }
  levels[String(level)] = next
  write({ games: { ...p.games, [gameId]: levels } })
  return (
    result.stars > (prev?.stars ?? 0) ||
    result.score > (prev?.bestScore ?? 0) ||
    !prev ||
    result.avgMs < prev.bestAvgMs
  )
}

export interface GameStars {
  /** 已获得的星数 */
  stars: number
  /** 满星数（关卡数 × 3） */
  maxStars: number
  /** 通关数（拿到 ≥1 星的关卡数） */
  cleared: number
  /** 关卡总数 */
  levels: number
}

export function getGameStars(gameId: string, levels: number): GameStars {
  const recs = read().games[gameId] ?? {}
  let stars = 0
  let cleared = 0
  for (let i = 0; i < levels; i += 1) {
    const s = recs[String(i)]?.stars ?? 0
    stars += s
    if (s >= 1) cleared += 1
  }
  return { stars, maxStars: levels * 3, cleared, levels }
}

/** 全部玩法的总星数（首页展示）。maxStars 由调用方按玩法关卡数传入。 */
export function getTotalStars(maxStars = 0): { stars: number; maxStars: number; cleared: number } {
  const p = read()
  let stars = 0
  let cleared = 0
  for (const levels of Object.values(p.games)) {
    for (const rec of Object.values(levels)) {
      stars += rec.stars
      if (rec.stars >= 1) cleared += 1
    }
  }
  return { stars, maxStars, cleared }
}

export function clearChallengeProgress(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
  emit()
}
