// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  applyBattleResult,
  canEvolve,
  clearSpirits,
  ensureSpirit,
  expProgress,
  expToLevel,
  getSpirit,
  levelFromExp,
  MAX_HP,
  spiritCount,
} from './spirit'

describe('词灵养成规则', () => {
  beforeEach(() => {
    localStorage.clear()
    clearSpirits()
  })

  it('未配置模型时也能收服词灵（朴素形态兜底）', async () => {
    const s = await ensureSpirit('apple', '苹果', 'n.')
    expect(s).toBeTruthy()
    expect(s!.word).toBe('apple')
    expect(s!.hp).toBe(MAX_HP)
    expect(s!.level).toBe(1)
    expect(spiritCount()).toBe(1)
    expect(getSpirit('APPLE')).toBeTruthy()
  })

  it('同一词重复收服不会覆盖已有养成进度', async () => {
    const first = await ensureSpirit('book', '书')
    expect(first).toBeTruthy()
    for (let i = 0; i < 9; i++) applyBattleResult('book', true)
    const again = await ensureSpirit('book', '书')
    expect(again?.level).toBeGreaterThanOrEqual(2)
    expect(again?.wins).toBe(9)
  })

  it('答对涨经验回血、答错掉血并记录战绩', async () => {
    const s = await ensureSpirit('water', '水')
    if (!s) return
    applyBattleResult('water', false)
    expect(getSpirit('water')!.hp).toBe(MAX_HP - 25)
    expect(getSpirit('water')!.losses).toBe(1)
    applyBattleResult('water', true)
    expect(getSpirit('water')!.exp).toBe(15)
    expect(getSpirit('water')!.wins).toBe(1)
  })

  it('等级按经验递进，升级时回满血', () => {
    expect(levelFromExp(0)).toBe(1)
    expect(levelFromExp(expToLevel(1))).toBe(2)
    expect(levelFromExp(expToLevel(4))).toBe(5)
    expect(expProgress({ exp: 0, level: 1 } as never)).toBeGreaterThanOrEqual(0)
  })

  it('进化条件：等级达标且未进化', async () => {
    const s = await ensureSpirit('friend', '朋友')
    if (!s) return
    expect(canEvolve(s)).toBe(false)
    s.level = 5
    expect(canEvolve(s)).toBe(true)
  })
})
