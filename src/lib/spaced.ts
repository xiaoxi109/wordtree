/**
 * 间隔重复复习引擎（与高保真原型一致）。
 *
 * 规则：
 * - 连续答对 n 次 → 下次间隔天数取 GAP[min(n, len-1)]，封顶 30 天。
 * - 答错 → 连续次数归零、间隔回到 1 天、退回未掌握列表。
 * - 到期判断：now >= dueAt 即视为待复习。
 */

export const GAP = [1, 2, 4, 8, 16, 30] as const
export const DAY = 864e5

/** 连续答对 n 次对应的下次间隔（天），n 越大间隔越长。 */
export function gapOf(n: number): number {
  return GAP[Math.min(Math.max(n, 0), GAP.length - 1)]
}

/** 返回所有已到期的词 id（按到期时间升序）。 */
export function dueList(dueAt: Record<string, number>, now: number): string[] {
  return Object.keys(dueAt)
    .filter((id) => dueAt[id] <= now)
    .sort((a, b) => dueAt[a] - dueAt[b])
}

export interface SpacedState {
  streaks: Record<string, number>
  dueAt: Record<string, number>
}

/**
 * 首次演示预置：10 个词，连对次数各异 → 间隔周期各异，且全部已到期，
 * 让首页与复习页一进入就有内容。真实使用时由用户学习行为累积。
 */
export const SEED: [string, number][] = [
  ['grape', 0],
  ['coat', 0],
  ['windy', 0],
  ['strawberry', 1],
  ['dress', 1],
  ['watermelon', 2],
  ['elephant', 2],
  ['milk', 3],
  ['bread', 4],
  ['water', 5],
]

export function seedReview(now = Date.now()): SpacedState {
  const streaks: Record<string, number> = {}
  const dueAt: Record<string, number> = {}
  SEED.forEach(([id, s]) => {
    streaks[id] = s
    dueAt[id] = now - 3600e3 // 全部设为已到期
  })
  return { streaks, dueAt }
}

/**
 * 计算一次作答后的新连对次数与下次到期时间。
 * - correct：连对次数 +1，间隔随连对次数递增。
 * - wrong：连对次数归零，间隔回到 1 天。
 */
export function scheduleAfter(
  state: SpacedState,
  id: string,
  correct: boolean,
  now = Date.now(),
): { streak: number; dueAt: number } {
  const nextStreak = correct ? (state.streaks[id] || 0) + 1 : 0
  return { streak: nextStreak, dueAt: now + gapOf(nextStreak) * DAY }
}
