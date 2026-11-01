import { describe, expect, it } from 'vitest'
import { ALL_WORDS } from '../data'
import { wordsByGrade } from '../data/grades'
import { countPos, matchesPos, posShort, posTags } from './pos'

describe('词性归一化', () => {
  it('拆分逗号分隔的多词性', () => {
    expect(posTags({ pos: 'n., v.' })).toEqual(['n', 'v'])
  })

  it('拆分斜杠分隔的多词性', () => {
    expect(posTags({ pos: 'n./v.' })).toEqual(['n', 'v'])
  })

  it('识别情态动词（modal v. / modalv）', () => {
    expect(posTags({ pos: 'modal v.' })).toEqual(['modal'])
    expect(posTags({ pos: 'modalv' })).toEqual(['modal'])
  })

  it('识别助动词与多个词性组合', () => {
    expect(posTags({ pos: 'v./aux.' })).toEqual(['v', 'aux'])
  })

  it('number / num. 统一为 num，det./pron. 保留多个', () => {
    expect(posTags({ pos: 'number' })).toEqual(['num'])
    expect(posTags({ pos: 'num./n.' })).toEqual(['n', 'num'])
    expect(posTags({ pos: 'det., pron.' })).toEqual(['pron', 'det'])
  })

  it('释义前缀兜底：adj. / vt. / vi.', () => {
    expect(posTags({ pos: '', meaning: 'adj. 精确的；明确的' })).toEqual(['adj'])
    expect(posTags({ pos: '', meaning: 'vt. 购买' })).toEqual(['v'])
    expect(posTags({ pos: '', meaning: 'vi. 浮现' })).toEqual(['v'])
  })

  it('缩写、符号与完全无法识别的词归入「其他」', () => {
    expect(posTags({ pos: '', meaning: 'abbr. 美国' })).toEqual(['other'])
    expect(posTags({ pos: 'symb.' })).toEqual(['other'])
    expect(posTags({ pos: '', meaning: '走廊' })).toEqual(['other'])
    expect(posTags({})).toEqual(['other'])
  })

  it('词性缩写用于卡片展示，多个用 / 连接', () => {
    expect(posShort({ pos: 'n., v.' })).toBe('n. / v.')
    expect(posShort({ pos: '', meaning: 'adj. 精确的' })).toBe('adj.')
    expect(posShort({ pos: '', meaning: '走廊' })).toBe('')
  })
})

describe('词性筛选匹配', () => {
  it('空集合表示不限词性', () => {
    expect(matchesPos({ pos: 'n.' }, new Set())).toBe(true)
  })

  it('多选题中命中任意一个词性即可', () => {
    const word = { pos: 'n./v.' }
    expect(matchesPos(word, new Set(['n']))).toBe(true)
    expect(matchesPos(word, new Set(['v']))).toBe(true)
    expect(matchesPos(word, new Set(['adv', 'v']))).toBe(true)
    expect(matchesPos(word, new Set(['adj', 'adv']))).toBe(false)
  })

  it('词数统计按词性分别计数（多词性词重复计数）', () => {
    const counts = countPos([
      { pos: 'n.' },
      { pos: 'n., v.' },
      { pos: 'v.' },
      { pos: '', meaning: 'adj. 精确的' },
    ])
    expect(counts.n).toBe(2)
    expect(counts.v).toBe(2)
    expect(counts.adj).toBe(1)
    expect(counts.other).toBe(0)
  })
})

describe('真实词库覆盖', () => {
  it('CEFR 词库每个词都能映射到具体词性', () => {
    const unmapped = ALL_WORDS.filter((w) => {
      const tags = posTags(w)
      return tags.length === 1 && tags[0] === 'other'
    })
    expect(unmapped).toEqual([])
  })

  it('人教词库绝大多数补充词可从释义前缀还原词性', () => {
    const pep = Object.values(wordsByGrade()).flat()
    const fallback = pep.filter((w) => !w.pos && posTags(w)[0] === 'other')
    // 仅少量专有名词 / 缩写 / 无语义标注的词无法归类
    expect(fallback.length).toBeLessThan(80)
  })
})
