import { describe, expect, it } from 'vitest'
import { ADVANCEMENT_CONFIG, requiredMastery } from './advancement'

/**
 * 晋级门槛：
 *   - 小词池（≤300）要求 100%，保证低等级扎实；
 *   - 中等词池按 95% / 90%；
 *   - 大词池放宽到 80% / 70%，但受 MAX_REQUIRED 上限约束。
 */
describe('requiredMastery', () => {
  it('小词池要求全部掌握', () => {
    expect(requiredMastery(0)).toBe(0)
    expect(requiredMastery(100)).toBe(100)
    expect(requiredMastery(300)).toBe(300)
  })

  it('中等词池按 95% / 90% 要求', () => {
    expect(requiredMastery(600)).toBe(570)
    expect(requiredMastery(1000)).toBe(950)
  })

  it('大词池受绝对上限约束', () => {
    const cap = ADVANCEMENT_CONFIG.MAX_REQUIRED
    expect(requiredMastery(1800)).toBe(cap)
    expect(requiredMastery(5000)).toBe(cap)
    expect(requiredMastery(15000)).toBe(cap)
  })

  it('要求数永远不超过词池本身', () => {
    for (const n of [1, 10, 299, 301, 999, 1001, 2999, 3001, 5999, 6001, 20000]) {
      expect(requiredMastery(n)).toBeLessThanOrEqual(n)
    }
  })
})
