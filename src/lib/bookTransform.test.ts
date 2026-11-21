import { describe, expect, it } from 'vitest'
import {
  alignSentences,
  alignTimeline,
  audioFileName,
  buildLesson,
  expandLesson,
  shortHash,
  splitLines,
  tokenize,
  type RawArticle,
} from './bookTransform'

const raw = (over: Partial<RawArticle> = {}): RawArticle => ({
  id: 1,
  title: 'Excuse me!',
  titleTranslate: '对不起！',
  text: 'This is your ticket.\nShow me your ticket, please.',
  textTranslate: '这是您的票。\n请出示您的票。',
  audioSrc: '/sound/article/001&002－Excuse_Me.mp3',
  ...over,
})

describe('splitLines', () => {
  it('兼容 \\n 与 \\n\\n 两种分隔', () => {
    expect(splitLines('a\n\nb\nc')).toEqual(['a', 'b', 'c'])
  })

  it('忽略空行与首尾空白', () => {
    expect(splitLines('  a  \n\n\n  b ')).toEqual(['a', 'b'])
  })

  it('空文本返回空数组', () => {
    expect(splitLines('')).toEqual([])
  })
})

describe('tokenize', () => {
  it('切出词与标点并给出偏移', () => {
    const tokens = tokenize("It's a dog.")
    expect(tokens.map((t) => t.text)).toEqual(["It's", 'a', 'dog', '.'])
    const dog = tokens.find((t) => t.text === 'dog')!
    expect("It's a dog.".slice(dog.start, dog.end)).toBe('dog')
  })

  it('偏移可还原原文', () => {
    const line = 'Mr. Smith paid $5.50, right?'
    const tokens = tokenize(line)
    for (const t of tokens) {
      expect(line.slice(t.start, t.end)).toBe(t.text)
    }
  })

  it('数字带小数点视为一个 token', () => {
    expect(tokenize('5.50').map((t) => t.text)).toEqual(['5.50'])
  })
})

describe('alignSentences', () => {
  it('中英行数相等时逐行对齐', () => {
    const { en, zh } = alignSentences('a\nb', '甲\n乙')
    expect(en).toEqual(['a', 'b'])
    expect(zh).toEqual(['甲', '乙'])
  })

  it('中文缺失时补空串，以英文为准', () => {
    const { en, zh } = alignSentences('a\nb\nc', '甲')
    expect(en).toEqual(['a', 'b', 'c'])
    expect(zh).toEqual(['甲', '', ''])
  })
})

describe('alignTimeline', () => {
  it('数量一致时 1:1 使用', () => {
    const tl = alignTimeline(2, [
      [0, 3],
      [3, 7],
    ])
    expect(tl).toEqual([
      { start: 0, end: 3 },
      { start: 3, end: 7 },
    ])
  })

  it('缺失时间轴返回空数组（关闭句级高亮）', () => {
    expect(alignTimeline(3, null)).toEqual([])
    expect(alignTimeline(3, [])).toEqual([])
  })

  it('偏差超过 20% 时放弃高亮', () => {
    expect(alignTimeline(10, [[0, 1]])).toEqual([])
  })

  it('偏差在 20% 内按中点插值', () => {
    const lrc: [number, number][] = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 8],
      [8, 9],
      [9, 10],
    ]
    const tl = alignTimeline(9, lrc)
    expect(tl).toHaveLength(9)
    expect(tl[0].start).toBeLessThan(1)
    expect(tl[8].end).toBeCloseTo(10, 0)
    // 插值后仍单调递增
    for (let i = 1; i < tl.length; i++) {
      expect(tl[i].start).toBeGreaterThanOrEqual(tl[i - 1].start)
    }
  })

  it('丢弃非法时间轴项（剩余偏差过大则整体放弃）', () => {
    expect(
      alignTimeline(2, [
        [0, 3],
        [Number.NaN, 5],
      ]),
    ).toEqual([])
  })
})

describe('audioFileName', () => {
  it('生成 ASCII 安全文件名且稳定', () => {
    const name = audioFileName('nce-1', 12, '/sound/article/001&002－Excuse_Me.mp3')
    expect(name).toMatch(/^nce-1-012-[0-9a-f]{8}\.mp3$/)
    expect(name).toBe(audioFileName('nce-1', 12, '/sound/article/001&002－Excuse_Me.mp3'))
  })

  it('不同来源得到不同文件名', () => {
    expect(audioFileName('nce-1', 1, '/a.mp3')).not.toBe(audioFileName('nce-1', 1, '/b.mp3'))
  })
})

describe('shortHash', () => {
  it('定长 8 位十六进制', () => {
    expect(shortHash('hello')).toMatch(/^[0-9a-f]{8}$/)
  })
})

describe('buildLesson / expandLesson', () => {
  it('生成课文字段并展开为运行期结构', () => {
    const lesson = buildLesson('nce-1', 1, raw())
    expect(lesson.id).toBe('nce-1-001')
    expect(lesson.i).toBe(1)
    expect(lesson.t).toBe('Excuse me!')
    expect(lesson.tz).toBe('对不起！')
    expect(lesson.s).toHaveLength(2)
    expect(lesson.s[0].tk[0]).toEqual(['This', 0, 4])
    expect(lesson.a?.[1]).toContain('files.typewords.cc')

    const expanded = expandLesson(lesson)
    expect(expanded.index).toBe(1)
    expect(expanded.sentences[0].tokens[0].text).toBe('This')
    expect(expanded.sentences[0].zh).toBe('这是您的票。')
    expect(expanded.audio?.key).toBe(lesson.a?.[0])
  })

  it('question / quote / nameList 缺失时不下发字段', () => {
    const lesson = buildLesson('nce-1', 2, raw({ question: null, quote: null, nameList: [] }))
    expect(lesson.q).toBeUndefined()
    expect(lesson.q2).toBeUndefined()
    expect(lesson.p).toBeUndefined()
    expect(expandLesson(lesson).question).toBeUndefined()
  })

  it('question 有值时展开为中英对', () => {
    const lesson = buildLesson(
      'nce-1',
      3,
      raw({ question: { text: 'What is it?', translate: '这是什么？' } }),
    )
    expect(expandLesson(lesson).question).toEqual({ en: 'What is it?', zh: '这是什么？' })
  })

  it('无 audioSrc 时不带音频', () => {
    const lesson = buildLesson('nce-1', 4, raw({ audioSrc: '' }))
    expect(lesson.a).toBeUndefined()
    expect(expandLesson(lesson).audio).toBeUndefined()
  })
})
