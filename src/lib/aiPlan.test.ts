// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { poolSignature } from './aiQuiz'
import { buildLocalAdvice, type DailyStats } from './dailyPlan'

const stats = (over: Partial<DailyStats> = {}): DailyStats => ({
  masteredCount: 120,
  dueCount: 8,
  wrongCount: 5,
  todayStudied: 20,
  totalAnswered: 300,
  accuracy: 78,
  avgReactionMs: 2400,
  stars: 12,
  clearedLevels: 6,
  activeDays: 5,
  ...over,
})

describe('今日计划（本地规则版）', () => {
  it('有待复习词时，第一条建议是复习', () => {
    const advice = buildLocalAdvice(stats())
    expect(advice.source).toBe('local')
    expect(advice.actions[0].label).toContain('复习')
    expect(advice.actions[0].detail).toContain('8')
  })

  it('没有到期词也没有错词时，给出背词建议', () => {
    const advice = buildLocalAdvice(stats({ dueCount: 0, wrongCount: 0, clearedLevels: 0 }))
    expect(advice.actions.length).toBeGreaterThan(0)
    expect(advice.actions[0].label).toContain('背词')
  })

  it('建议最多三条、用时在 5-30 分钟之间', () => {
    const advice = buildLocalAdvice(stats({ dueCount: 100, wrongCount: 100 }))
    expect(advice.actions.length).toBeLessThanOrEqual(3)
    expect(advice.minutes).toBeGreaterThanOrEqual(5)
    expect(advice.minutes).toBeLessThanOrEqual(30)
  })

  it('今天已练过时标题带上正确率', () => {
    const advice = buildLocalAdvice(stats({ todayStudied: 12, accuracy: 83 }))
    expect(advice.headline).toContain('12')
    expect(advice.headline).toContain('83')
  })
})

describe('AI 出题候选池签名', () => {
  it('同样的词池签名一致，与顺序无关', () => {
    const a = [{ word: 'apple', meaning: '苹果' }, { word: 'book', meaning: '书' }]
    const b = [{ word: 'book', meaning: '书' }, { word: 'apple', meaning: '苹果' }]
    expect(poolSignature(a)).toBe(poolSignature(b))
  })

  it('不同的词池签名不同', () => {
    const a = [{ word: 'apple', meaning: '苹果' }]
    const b = [{ word: 'orange', meaning: '橙子' }]
    expect(poolSignature(a)).not.toBe(poolSignature(b))
  })
})
