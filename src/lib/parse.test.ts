import { describe, expect, it } from 'vitest'
import {
  buildWordIndex,
  hasWTags,
  matchedKeys,
  normalizeKind,
  parseLessonContent,
  segmentNodes,
  stripWTags,
  textTokens,
} from './parse'

describe('parseLessonContent', () => {
  it('解析标准故事 JSON', () => {
    const c = parseLessonContent({
      title: 'A Busy Morning',
      type: 'story',
      segments: [
        { speaker: '', en: 'Tom got up early.', zh: '汤姆早起。' },
        { en: 'He ate breakfast.', zh: '他吃了早餐。' },
      ],
    })
    expect(c.kind).toBe('story')
    expect(c.title).toBe('A Busy Morning')
    expect(c.segments).toHaveLength(2)
    expect(c.segments[0].speaker).toBeUndefined() // 空串归一为 undefined
    expect(c.segments[1].zh).toBe('他吃了早餐。')
  })

  it('识别对话类型并保留说话人', () => {
    const c = parseLessonContent({
      title: 'At the Cafe',
      type: 'dialogue',
      segments: [{ speaker: 'Waiter', en: 'What would you like?', zh: '你想要什么？' }],
    })
    expect(c.kind).toBe('dialogue')
    expect(c.segments[0].speaker).toBe('Waiter')
  })

  it('兼容 text / paragraphs 等别名字段', () => {
    const c = parseLessonContent({
      paragraphs: [{ text: 'It rained.', translation: '下雨了。' }],
    })
    expect(c.segments).toHaveLength(1)
    expect(c.segments[0].en).toBe('It rained.')
    expect(c.segments[0].zh).toBe('下雨了。')
  })

  it('缺少 segments 时抛错（触发重试）', () => {
    expect(() => parseLessonContent({ title: 'x', type: 'story' })).toThrow()
    expect(() => parseLessonContent({ segments: [] })).toThrow()
    expect(() => parseLessonContent(null)).toThrow()
  })

  it('识别日记 / 邮件 / 科普 / 小诗等新体裁', () => {
    const kinds = {
      diary: 'diary',
      'e-mail': 'email',
      article: 'article',
      poem: 'poem',
      日记: 'diary',
      邮件: 'email',
      科普短文: 'article',
      诗: 'poem',
      story: 'story',
      unknown: 'story',
    } as const
    for (const [input, expected] of Object.entries(kinds)) {
      expect(normalizeKind(input)).toBe(expected)
    }
    const c = parseLessonContent({
      title: 'A Little Poem',
      type: 'poem',
      segments: [{ en: 'The sun is warm.', zh: '阳光很暖。' }],
    })
    expect(c.kind).toBe('poem')
  })

  it('标题缺失时按体裁给出默认标题', () => {
    expect(parseLessonContent({ type: 'diary', segments: [{ en: 'x', zh: 'x' }] }).title).toBe('一篇日记')
    expect(parseLessonContent({ type: 'email', segments: [{ en: 'x', zh: 'x' }] }).title).toBe('一封邮件')
    expect(parseLessonContent({ type: 'poem', segments: [{ en: 'x', zh: 'x' }] }).title).toBe('一首小诗')
  })
})

describe('<w> 标签解析', () => {
  const vocab = [
    { key: 'order', word: 'order' },
    { key: 'salad', word: 'salad' },
    { key: 'icecream', word: 'ice cream' },
  ]

  it('hasWTags / stripWTags', () => {
    expect(hasWTags('He <w>ordered</w> a salad.')).toBe(true)
    expect(hasWTags('He ordered a salad.')).toBe(false)
    expect(stripWTags('He <w>ordered</w> a salad.')).toBe('He ordered a salad.')
  })

  it('有标签时按标签切分，标签内词形归一为词键', () => {
    const nodes = segmentNodes('He <w>ordered</w> an <w>ice cream</w>.', buildWordIndex(vocab))
    const targets = nodes.filter((n) => n.word)
    expect(targets.map((n) => n.word)).toEqual(['order', 'icecream'])
    expect(targets[0].text).toBe('ordered') // 保留原文词形用于展示
  })

  it('无标签时按词形变体回退匹配', () => {
    const index = buildWordIndex(vocab)
    const nodes = segmentNodes('She ordered a salad yesterday.', index)
    const hit = nodes.find((n) => n.word)
    expect(hit?.word).toBe('order')
    expect(hit?.text).toBe('ordered')
    // 词组（ice cream）按整体匹配
    const nodes2 = segmentNodes('I like ice cream.', index)
    expect(nodes2.find((n) => n.word)?.word).toBe('icecream')
  })

  it('回退匹配忽略大小写并保留原始展示', () => {
    const index = buildWordIndex(vocab)
    const nodes = segmentNodes('ORDER was placed.', index)
    expect(nodes.find((n) => n.word)?.text).toBe('ORDER')
    expect(nodes.find((n) => n.word)?.word).toBe('order')
  })

  it('未命中词表的文本原样返回', () => {
    const nodes = segmentNodes('Nothing here.', buildWordIndex(vocab))
    expect(nodes).toHaveLength(1)
    expect(nodes[0].word).toBeUndefined()
  })

  it('词形展开覆盖常见屈折变化', () => {
    const index = buildWordIndex([{ key: 'like', word: 'like' }])
    expect(index.has('likes')).toBe(true)
    expect(index.has('liked')).toBe(true)
    expect(index.has('liking')).toBe(true)
    const yIndex = buildWordIndex([{ key: 'study', word: 'study' }])
    expect(yIndex.has('studies')).toBe(true)
  })
})

describe('textTokens（任意词可点）', () => {
  const vocab = [
    { key: 'order', word: 'order' },
    { key: 'salad', word: 'salad' },
  ]

  it('每个英文单词都是可点节点，命中目标词时附词键', () => {
    const nodes = textTokens('He ordered a salad, then left.', buildWordIndex(vocab))
    const words = nodes.filter((n) => n.isWord)
    expect(words.map((n) => n.text)).toEqual(['He', 'ordered', 'a', 'salad', 'then', 'left'])
    expect(words.find((n) => n.text === 'ordered')?.word).toBe('order')
    expect(words.find((n) => n.text === 'salad')?.word).toBe('salad')
    // 非目标词也可点，但没有词键
    expect(words.find((n) => n.text === 'then')?.word).toBeUndefined()
  })

  it('标点与空白不是词节点', () => {
    const nodes = textTokens('Hi, ok!', buildWordIndex(vocab))
    expect(nodes.filter((n) => n.isWord)).toHaveLength(2)
    expect(nodes.filter((n) => !n.isWord).map((n) => n.text).join('')).toBe(', !')
  })

  it('剥离 <w> 标签后仍能识别目标词（含屈折变化）', () => {
    const nodes = textTokens('He <w>ordered</w> a <w>salad</w>.', buildWordIndex(vocab))
    expect(nodes.map((n) => n.text).join('')).toBe('He ordered a salad.')
    expect(nodes.filter((n) => n.word).map((n) => n.word)).toEqual(['order', 'salad'])
  })
})

describe('matchedKeys（覆盖率校验）', () => {
  const vocab = [
    { key: 'order', word: 'order' },
    { key: 'salad', word: 'salad' },
    { key: 'icecream', word: 'ice cream' },
  ]

  it('统计正文中出现的重点词（忽略标签与大小写）', () => {
    const hit = matchedKeys(vocab, 'She <w>ORDERED</w> a salad and ice cream.')
    expect(hit).toEqual(new Set(['order', 'salad', 'icecream']))
  })

  it('未出现的词不在命中集合中', () => {
    const hit = matchedKeys(vocab, 'He ordered a salad.')
    expect(hit.has('icecream')).toBe(false)
  })
})
