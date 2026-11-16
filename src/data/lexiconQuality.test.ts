import { describe, expect, it } from 'vitest'
import { isJunkWord } from './lexiconQuality'

/**
 * 词库质量过滤：只剔除明确不是单词的条目，
 * 关键是**不能误伤** no / at / left / children / news 这类正常词。
 */
describe('isJunkWord', () => {
  it('剔除缩写与符号', () => {
    expect(isJunkWord('USA', 'abbr. 美国；美利坚合众国')).toBe(true)
    expect(isJunkWord('RSVP', 'abbr. 请回复')).toBe(true)
    expect(isJunkWord('GPS', 'abbr. 全球定位系统'))
      .toBe(true)
  })

  it('剔除缩略形式与带点的缩写', () => {
    expect(isJunkWord("we'll", 'abbr. 我们将')).toBe(true)
    expect(isJunkWord("aren't", 'abbr. 不是')).toBe(true)
    expect(isJunkWord('p.m.', 'abbr. 午后')).toBe(true)
  })

  it('剔除人名地名与变体条目', () => {
    expect(isJunkWord('Eric', '埃里克（人名）')).toBe(true)
    expect(isJunkWord('Qomolangma', '珠穆朗玛峰；珠峰')).toBe(true)
    expect(isJunkWord('longer', '长的（long的比较级）')).toBe(true)
    expect(isJunkWord('chiwen', '无')).toBe(true)
  })

  it('不误伤正常词（含释义里带 abbr. 的多义项）', () => {
    expect(isJunkWord('no', 'adv. 不；adj. 没有；abbr. 数字（number）')).toBe(false)
    expect(isJunkWord('at', 'prep. 在；因为；abbr. 密封的（airtight）')).toBe(false)
    expect(isJunkWord('left', 'adj. 左边的；v. 离开（leave的过去式）')).toBe(false)
    expect(isJunkWord('children', 'n. 孩子们（child的复数）')).toBe(false)
    expect(isJunkWord('news', 'n. 新闻；消息')).toBe(false)
    expect(isJunkWord('tired', 'v. 疲倦；adj. 疲倦的')).toBe(false)
  })

  it('保留 a / I 与常用缩写', () => {
    expect(isJunkWord('I', 'n. 碘元素；pron. 我')).toBe(false)
    expect(isJunkWord('a', 'art. 一个')).toBe(false)
    expect(isJunkWord('TV', 'abbr. 电视（television）')).toBe(false)
    expect(isJunkWord('CD', 'abbr. 光盘')).toBe(false)
  })
})
