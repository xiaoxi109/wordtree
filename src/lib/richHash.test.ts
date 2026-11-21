import { describe, expect, it } from 'vitest'
import { normWord } from './normalize'
import { RICH_SHARDS, fnv1a, richKeyOf, richShardOf } from './richHash'

describe('normWord：富字典键的归一化口径', () => {
  it('转小写并去掉首尾符号', () => {
    expect(normWord('Cancel')).toBe('cancel')
    expect(normWord('  Hello  ')).toBe('hello')
    expect(normWord('don\'t')).toBe('don\'t')
    expect(normWord('well-known')).toBe('well-known')
  })

  it('全角字符按 NFKC 折叠', () => {
    expect(normWord('ＡＢＣ')).toBe('abc')
  })

  it('保留数字，去掉其余符号', () => {
    expect(normWord('CD-1')).toBe('cd-1')
    expect(normWord('U.S.A.')).toBe('usa')
  })

  it('空输入返回空串', () => {
    expect(normWord('')).toBe('')
    expect(normWord('!!!')).toBe('')
  })
})

describe('richShardOf：词 → 分片路由', () => {
  it('同一词恒定命中同一片', () => {
    expect(richShardOf('cancel')).toBe(richShardOf('cancel'))
    expect(richShardOf('Cancel')).toBe(richShardOf('cancel'))
  })

  it('分片下标落在合法区间内', () => {
    for (const w of ['a', 'play', 'water', 'cancel', 'the', 'dictionary']) {
      const s = richShardOf(w)
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThan(RICH_SHARDS)
    }
  })

  it('不同词能分散到多个分片（不是全部落在一片）', () => {
    const used = new Set<number>()
    for (const w of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p']) {
      used.add(richShardOf(w))
    }
    expect(used.size).toBeGreaterThan(1)
  })

  it('fnv1a 输出 32 位无符号整数', () => {
    expect(fnv1a('')).toBe(0x811c9dc5)
    expect(fnv1a('cancel')).toBeLessThanOrEqual(0xffffffff)
    expect(fnv1a('cancel')).toBeGreaterThanOrEqual(0)
  })

  it('richKeyOf 与 normWord 同口径', () => {
    expect(richKeyOf('  Cancel! ')).toBe(normWord('  Cancel! '))
  })
})
