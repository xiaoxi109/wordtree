import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DESIRED_RETENTION,
  initialDifficulty,
  initialStability,
  intervalDays,
  nextDifficulty,
  retrievability,
  review,
  stabilityAfterLapse,
  stabilityAfterRecall,
} from './fsrs'

describe('FSRS-4.5 算法性质', () => {
  it('目标留存 0.9 时间隔≈稳定性', () => {
    expect(intervalDays(1, DEFAULT_DESIRED_RETENTION)).toBe(1)
    expect(intervalDays(10, DEFAULT_DESIRED_RETENTION)).toBe(10)
    expect(intervalDays(100, DEFAULT_DESIRED_RETENTION)).toBe(100)
  })

  it('可提取概率随时间递减，t=stability 时约 0.9', () => {
    const s = 10
    expect(retrievability(0, s)).toBeCloseTo(1, 5)
    expect(retrievability(s, s)).toBeCloseTo(0.9, 2)
    expect(retrievability(s * 2, s)).toBeLessThan(retrievability(s, s))
  })

  it('初始稳定性随评分递增：Again < Hard < Good', () => {
    expect(initialStability(1)).toBeLessThan(initialStability(2))
    expect(initialStability(2)).toBeLessThan(initialStability(3))
  })

  it('初始难度随评分递减：Again 最难，Good 最易', () => {
    expect(initialDifficulty(1)).toBeGreaterThan(initialDifficulty(2))
    expect(initialDifficulty(2)).toBeGreaterThan(initialDifficulty(3))
    for (const g of [1, 2, 3] as const) {
      expect(initialDifficulty(g)).toBeGreaterThanOrEqual(1)
      expect(initialDifficulty(g)).toBeLessThanOrEqual(10)
    }
  })

  it('新卡首次复习：用初始 S/D，间隔至少 1 天', () => {
    const again = review(null, 1)
    const good = review(null, 3)
    expect(again.stability).toBeCloseTo(initialStability(1), 5)
    expect(good.stability).toBeCloseTo(initialStability(3), 5)
    expect(again.interval).toBeGreaterThanOrEqual(1)
    expect(good.interval).toBeGreaterThan(again.interval)
  })

  it('连续 Good 让稳定性与间隔单调增长', () => {
    let state = { stability: initialStability(3), difficulty: initialDifficulty(3) }
    let prevInterval = 0
    for (let day = 0; day < 6; day += 1) {
      const elapsed = day === 0 ? state.stability : state.stability
      const r = review(state, 3, elapsed)
      expect(r.stability).toBeGreaterThan(state.stability)
      expect(r.interval).toBeGreaterThanOrEqual(prevInterval)
      prevInterval = r.interval
      state = { stability: r.stability, difficulty: r.difficulty }
    }
  })

  it('Hard 的稳定性增长小于 Good（同一状态出发）', () => {
    const state = { stability: 5, difficulty: 5 }
    const r = 0.9
    const hard = stabilityAfterRecall(state.difficulty, state.stability, r, 2)
    const good = stabilityAfterRecall(state.difficulty, state.stability, r, 3)
    expect(hard).toBeLessThan(good)
  })

  it('Again（遗忘）把稳定性降到远低于原值', () => {
    const lapse = stabilityAfterLapse(5, 20, 0.9)
    expect(lapse).toBeLessThan(20)
    expect(lapse).toBeGreaterThan(0)
  })

  it('难度更新：Again 变难、Good 向基准回归，且始终在 [1,10]', () => {
    expect(nextDifficulty(5, 1)).toBeGreaterThan(5)
    // Good 让难度向基准 D0(3)=w4≈5.16 回归：高难度会降低、低难度会略升
    expect(nextDifficulty(8, 3)).toBeLessThan(8)
    expect(nextDifficulty(3, 3)).toBeGreaterThan(3)
    expect(nextDifficulty(10, 1)).toBeLessThanOrEqual(10)
    expect(nextDifficulty(1, 3)).toBeGreaterThanOrEqual(1)
  })

  it('遗忘后再复习仍能给出合法间隔', () => {
    let state = { stability: initialStability(3), difficulty: initialDifficulty(3) }
    const afterLapse = review(state, 1, state.stability)
    expect(afterLapse.interval).toBeGreaterThanOrEqual(1)
    expect(Number.isFinite(afterLapse.stability)).toBe(true)
    expect(afterLapse.difficulty).toBeGreaterThanOrEqual(1)
    expect(afterLapse.difficulty).toBeLessThanOrEqual(10)
    state = { stability: afterLapse.stability, difficulty: afterLapse.difficulty }
    expect(review(state, 3, afterLapse.stability).interval).toBeGreaterThanOrEqual(1)
  })
})
