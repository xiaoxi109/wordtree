// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { ALL_WORDS } from '../data'
import { wordKey } from './cluster'
import { dictIndex, lookupWord } from './dict'

describe('lookupWord（正文任意词查词）', () => {
  const sample = ALL_WORDS[0]

  it('命中已知词，大小写不敏感', () => {
    const entry = lookupWord(sample.word.toUpperCase())
    expect(entry).not.toBeNull()
    expect(entry!.key).toBe(wordKey(sample.word))
  })

  it('按词形变体兜底（复数 / 过去式）', () => {
    const base = ALL_WORDS.find((w) => /^[a-z]{3,}$/.test(w.word))
    expect(base).toBeTruthy()
    const plural = lookupWord(`${base!.word}s`)
    expect(plural?.key).toBe(wordKey(base!.word))
  })

  it('不规则变化映射到原形', () => {
    const irregulars: Array<[string, string]> = [
      ['went', 'go'],
      ['drank', 'drink'],
      ['swam', 'swim'],
      ['mice', 'mouse'],
      ['teeth', 'tooth'],
    ]
    let asserted = 0
    for (const [form, lemma] of irregulars) {
      const base = lookupWord(lemma)
      if (!base) continue
      // 若数据本身把屈折形列为词条，则以词条为准
      if (dictIndex().has(form)) continue
      expect(lookupWord(form)?.key).toBe(base.key)
      asserted++
    }
    expect(asserted).toBeGreaterThan(0)
  })

  it('未收录的词返回 null 而不是抛错', () => {
    expect(lookupWord('zzzznotawordzzz')).toBeNull()
    expect(lookupWord('')).toBeNull()
  })

  it('索引包含大量词形，足够覆盖常见阅读', () => {
    expect(dictIndex().size).toBeGreaterThan(1000)
  })
})
