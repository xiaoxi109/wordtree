import { describe, expect, it } from 'vitest'
import { guessScene } from './sceneRules'

/**
 * 场景规则只用于 ECDICT 补充词（没有人工分类），
 * 这里锁住几类典型信号：领域标签 > 中文关键词 > 词性兜底。
 */
describe('guessScene', () => {
  it('词典领域标签优先', () => {
    expect(guessScene('[医] 疾病；病症')).toBe('health')
    expect(guessScene('[法] 判决；诉讼')).toBe('society')
  })

  it('中文关键词命中常见场景', () => {
    expect(guessScene('n. 苹果；苹果树')).toBe('food')
    expect(guessScene('n. 医生；医院')).toBe('health')
    expect(guessScene('n. 法律；法规')).toBe('society')
    expect(guessScene('n. 汽车；车辆')).toBe('travel')
    expect(guessScene('n. 颜色；红色')).toBe('colors')
  })

  it('没有关键词时按词性兜底', () => {
    expect(guessScene('vt. 完成；实现')).toBe('actions')
    expect(guessScene('prep. 向；对于')).toBe('grammar')
    expect(guessScene('adv. 主要地')).toBe('thinking')
  })

  it('空释义返回 null，交给调用方回退', () => {
    expect(guessScene('')).toBeNull()
    expect(guessScene('n. 某种抽象概念')).not.toBe('food')
  })
})
