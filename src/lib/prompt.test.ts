import { describe, expect, it } from 'vitest'
import type { LessonGroup } from './cluster'
import {
  buildLessonMessages,
  DIFFICULTIES,
  difficultyHint,
  formatMeta,
  LESSON_FORMATS,
  planKind,
} from './prompt'

const group: LessonGroup = {
  id: 'g1',
  category: 'food',
  sceneLabel: '食物与饮料',
  sceneEn: '',
  words: [
    { key: 'order', word: 'order', ipa: '/ˈɔːrdər/', meaning: '点菜；命令', category: 'food', theme: null },
    { key: 'salad', word: 'salad', ipa: '/ˈsæləd/', meaning: '沙拉', category: 'food', theme: null },
  ],
}

describe('buildLessonMessages', () => {
  it('包含全部重点词与释义', () => {
    const msgs = buildLessonMessages(group, { topic: 'food', difficulty: 'A2' }, 'story')
    const user = msgs.find((m) => m.role === 'user')!.content
    expect(user).toContain('order — 点菜；命令')
    expect(user).toContain('salad — 沙拉')
    expect(user).toContain('场景') // 场景名注入
  })

  it('要求 <w> 标签包裹与 JSON 输出', () => {
    const msgs = buildLessonMessages(group, { topic: 'random', difficulty: 'adaptive' }, 'story')
    const user = msgs.find((m) => m.role === 'user')!.content
    expect(user).toContain('<w>')
    expect(user).toContain('"segments"')
    expect(user).toContain('"story"')
    expect(msgs[0].role).toBe('system')
  })

  it('对话类型与故事类型的 type 指令不同', () => {
    const story = buildLessonMessages(group, { topic: 'random', difficulty: 'adaptive' }, 'story')
    const dialog = buildLessonMessages(group, { topic: 'random', difficulty: 'adaptive' }, 'dialogue')
    expect(story[1].content).toContain('"story"')
    expect(dialog[1].content).toContain('"dialogue"')
    expect(dialog[1].content).toContain('对话')
  })

  it('题材为 random 时不强加题材', () => {
    const random = buildLessonMessages(group, { topic: 'random', difficulty: 'adaptive' }, 'story')
    const food = buildLessonMessages(group, { topic: 'food', difficulty: 'adaptive' }, 'story')
    expect(random[1].content).toMatch(/题材随机/)
    expect(food[1].content).toContain('美食')
  })

  it('注入可用词汇表（只用已掌握词写作）', () => {
    const msgs = buildLessonMessages(group, { topic: 'random', difficulty: 'adaptive' }, 'story', {
      allowedWords: ['order', 'salad', 'rice', 'water'],
    })
    const user = msgs[1].content
    expect(user).toContain('可用词汇表')
    expect(user).toContain('order, salad, rice, water')
    expect(user).toContain('功能词')
  })

  it('覆盖率重试时带上遗漏词提示', () => {
    const msgs = buildLessonMessages(group, { topic: 'random', difficulty: 'adaptive' }, 'story', {
      allowedWords: ['order', 'salad'],
      missingWords: ['salad'],
    })
    expect(msgs[1].content).toContain('上一稿遗漏')
    expect(msgs[1].content).toContain('salad')
  })

  it('复习词要求重复出现 2-3 次', () => {
    const withReview: LessonGroup = {
      ...group,
      words: [...group.words, { ...group.words[0], key: 'rice', word: 'rice', isReview: true }],
    }
    const user = buildLessonMessages(withReview, { topic: 'random', difficulty: 'adaptive' }, 'story')[1].content
    expect(user).toContain('复习词')
    expect(user).toContain('2-3 次')
    expect(user).toContain('rice — 点菜；命令（复习词）')
  })
})

describe('难度指令', () => {
  it('每个难度都有提示文案且各不相同', () => {
    const hints = DIFFICULTIES.map((d) => difficultyHint(d.id))
    expect(hints.every((h) => h.length > 5)).toBe(true)
    expect(new Set(hints).size).toBe(DIFFICULTIES.length)
  })
})

describe('课程体裁', () => {
  it('提供六种体裁且元数据完整', () => {
    expect(LESSON_FORMATS.map((f) => f.id)).toEqual([
      'story',
      'dialogue',
      'diary',
      'email',
      'article',
      'poem',
    ])
    for (const f of LESSON_FORMATS) {
      expect(f.label.length).toBeGreaterThan(0)
      expect(f.emoji.length).toBeGreaterThan(0)
      expect(f.brief.length).toBeGreaterThan(5)
      expect(f.length).toContain('单词')
      expect(f.badge).toContain('bg-')
    }
  })

  it('自动混搭按六种体裁循环，指定体裁则固定', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((i) => planKind(i, 'auto'))).toEqual([
      'story',
      'dialogue',
      'diary',
      'email',
      'article',
      'poem',
      'story',
      'dialogue',
    ])
    expect(planKind(0, 'email')).toBe('email')
    expect(planKind(7, 'poem')).toBe('poem')
    // 旧课程集没有 format 字段：默认按自动混搭处理
    expect(planKind(2, undefined)).toBe('diary')
  })

  it('每种体裁的 prompt 都写入对应 type 与体裁规则', () => {
    const rules: Record<string, string> = {
      story: '小短故事',
      dialogue: '每段是一轮对话',
      diary: '第一人称',
      email: 'Dear',
      article: '说明性语言',
      poem: '一行诗句',
    }
    for (const f of LESSON_FORMATS) {
      const user = buildLessonMessages(group, { topic: 'random', difficulty: 'adaptive' }, f.id)[1].content
      expect(user).toContain(`"type": "${f.id}"`)
      expect(user).toContain(rules[f.id])
      expect(user).toContain('重点词')
    }
  })

  it('formatMeta 对未知/空值回退到故事', () => {
    expect(formatMeta(undefined).id).toBe('story')
    expect(formatMeta('poem').label).toBe('韵律小诗')
  })
})
