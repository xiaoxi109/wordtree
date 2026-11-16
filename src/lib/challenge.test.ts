// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { ALL_WORDS } from '../data'
import {
  buildQuestion,
  levelPlan,
  spellCorrect,
  starsFor,
  CHALLENGE_GAMES,
  type ChallengeWord,
} from './challenge'
import {
  clearChallengeProgress,
  getGameStars,
  getLevelStars,
  isLevelUnlocked,
  saveLevelResult,
} from './challengeProgress'

const a1 = ALL_WORDS.filter((w) => w.level === 'A1' && w.meaning)

describe('闯关规则', () => {
  it('星级：90% 三星 / 70% 两星 / 50% 一星', () => {
    expect(starsFor(9, 10)).toBe(3)
    expect(starsFor(10, 10)).toBe(3)
    expect(starsFor(7, 10)).toBe(2)
    expect(starsFor(5, 10)).toBe(1)
    expect(starsFor(4, 10)).toBe(0)
  })

  it('拼写判分：忽略大小写、空格与连字符', () => {
    expect(spellCorrect('Apple', 'apple')).toBe(true)
    expect(spellCorrect(' ice cream ', 'icecream')).toBe(true)
    expect(spellCorrect('well-known', 'wellknown')).toBe(true)
    expect(spellCorrect('apples', 'apple')).toBe(false)
  })

  it('关卡曲线：前松后紧，末关打薄弱词', () => {
    expect(levelPlan(0).similarity).toBe(0)
    expect(levelPlan(0).focus).toBe('all')
    expect(levelPlan(2).focus).toBe('learned')
    expect(levelPlan(4).focus).toBe('weak')
    expect(levelPlan(4).similarity).toBe(2)
  })

  it('四种玩法都有 5 关、题量合理', () => {
    expect(CHALLENGE_GAMES.map((g) => g.id)).toEqual(['word-pick', 'listen-pick', 'spell', 'ai-smart'])
    for (const g of CHALLENGE_GAMES) {
      expect(g.levelCount).toBe(5)
      expect(g.perLevel).toBeGreaterThanOrEqual(8)
    }
    // AI 玩法需要大模型
    expect(CHALLENGE_GAMES.find((g) => g.id === 'ai-smart')?.requiresLlm).toBe(true)
  })
})

describe('闯关出题', () => {
  const def = CHALLENGE_GAMES[0]

  it('四个选项，且本局不重复出同一个词', () => {
    const used = new Set<string>()
    for (let i = 0; i < 8; i++) {
      const q = buildQuestion({ def, pool: a1, plan: levelPlan(0), used })
      expect(q).not.toBeNull()
      expect(q!.options).toHaveLength(4)
      expect(new Set(q!.options).size).toBe(4)
      used.add(q!.target.word.toLowerCase())
    }
    expect(used.size).toBe(8)
  })

  it('高相似度关卡的干扰项更接近同词性', () => {
    const pool = a1 as ChallengeWord[]
    const q = buildQuestion({ def, pool, plan: levelPlan(3), used: new Set() })
    expect(q).not.toBeNull()
    const target = q!.target
    const samePos = pool.filter((w) => w.word !== target.word && w.pos && w.pos === target.pos)
    if (samePos.length >= 3) {
      const meanings = new Set(q!.options)
      const hits = samePos.filter((w) => meanings.has(w.meaning)).length
      expect(hits).toBeGreaterThan(0)
    }
  })

  it('词池为空时返回 null', () => {
    expect(buildQuestion({ def, pool: [], plan: levelPlan(0), used: new Set() })).toBeNull()
  })
})

describe('闯关进度与解锁', () => {
  beforeEach(() => {
    localStorage.clear()
    clearChallengeProgress()
  })

  it('第 1 关永远解锁，后续关需上一关拿到 1 星以上', () => {
    expect(isLevelUnlocked('word-pick', 0)).toBe(true)
    expect(isLevelUnlocked('word-pick', 1)).toBe(false)
    saveLevelResult('word-pick', 0, { stars: 1, score: 5, total: 10, avgMs: 3000 })
    expect(isLevelUnlocked('word-pick', 1)).toBe(true)
    expect(isLevelUnlocked('word-pick', 2)).toBe(false)
  })

  it('星级取历史最好，用时取最快', () => {
    saveLevelResult('word-pick', 0, { stars: 1, score: 6, total: 10, avgMs: 4000 })
    saveLevelResult('word-pick', 0, { stars: 3, score: 9, total: 10, avgMs: 5000 })
    expect(getLevelStars('word-pick', 0)).toBe(3)
    const rec = getGameStars('word-pick', 5)
    expect(rec.cleared).toBe(1)
    expect(rec.stars).toBe(3)
    expect(rec.maxStars).toBe(15)
  })

  it('进度落盘后重新读取仍然存在', () => {
    saveLevelResult('spell', 2, { stars: 2, score: 7, total: 8, avgMs: 2500 })
    expect(getLevelStars('spell', 2)).toBe(2)
    expect(getLevelStars('spell', 0)).toBe(0)
  })
})
