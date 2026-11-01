import { describe, expect, it } from 'vitest'
import { FUNCTION_WORDS, IRREGULAR, vocabUsage } from './vocab'

const vocab = [
  { key: 'order', word: 'order' },
  { key: 'salad', word: 'salad' },
]
const allowed = ['order', 'salad', 'rice']

describe('vocabUsage（文章用词来自已掌握词的比例）', () => {
  it('统计实词并识别超纲词，功能词不计入', () => {
    const u = vocabUsage(vocab, allowed, 'I <w>ordered</w> a salad with rice and bread.')
    // 实词：ordered / salad / rice / bread（I、a、with、and 是功能词）
    expect(u.realWords).toBe(4)
    expect(u.knownWords).toBe(3)
    expect(u.ratio).toBeCloseTo(0.75)
    expect(u.outOfVocab).toEqual(['bread'])
  })

  it('屈折变化算作已掌握（ordered → order）', () => {
    const u = vocabUsage([{ key: 'order', word: 'order' }], ['order'], 'She ordered it.')
    expect(u.knownWords).toBe(1)
    expect(u.outOfVocab).toEqual([])
  })

  it('不规则变化按原形判断（went → go）', () => {
    const u = vocabUsage([{ key: 'go', word: 'go' }], ['go'], 'We went.')
    expect(u.realWords).toBe(1)
    expect(u.knownWords).toBe(1)
    expect(u.outOfVocab).toEqual([])
  })

  it('纯功能词文本覆盖率为 1', () => {
    const u = vocabUsage(vocab, allowed, 'I am here and it is good.')
    // good 不在词表 → 1 个实词
    expect(u.realWords).toBe(1)
    expect(u.outOfVocab).toEqual(['good'])
    expect(vocabUsage(vocab, allowed, 'I am here and it is.').ratio).toBe(1)
  })

  it('功能词表与非规则表可用于其他模块', () => {
    expect(FUNCTION_WORDS.has('the')).toBe(true)
    expect(IRREGULAR['went']).toBe('go')
  })
})
