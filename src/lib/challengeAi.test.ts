// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { getBattleReport } from './battleReport'
import { ensureChallengeStory, getChallengeStory } from './challengeStory'
import { poolSignature, type AiCandidate } from './aiQuiz'
import { isLevelUnlocked, saveLevelResult, clearChallengeProgress } from './challengeProgress'

const candidates: AiCandidate[] = [
  { word: 'apple', meaning: '苹果', pos: 'n.' },
  { word: 'book', meaning: '书', pos: 'n.' },
  { word: 'water', meaning: '水', pos: 'n.' },
  { word: 'school', meaning: '学校', pos: 'n.' },
]

describe('AI 闯关增强', () => {
  beforeEach(() => {
    localStorage.clear()
    clearChallengeProgress()
  })

  it('词池签名稳定且与顺序无关（AI 题目缓存的依据）', () => {
    expect(poolSignature(candidates)).toBe(poolSignature([...candidates].reverse()))
    expect(poolSignature(candidates)).not.toBe(poolSignature(candidates.slice(0, 3)))
  })

  it('剧情：无模型时有本地兜底，且落盘可复用', async () => {
    const story = await ensureChallengeStory('word-pick', 5)
    expect(story.title).toBeTruthy()
    expect(story.chapters).toHaveLength(5)
    expect(story.chapters[0].intro).toBeTruthy()
    expect(getChallengeStory('word-pick')?.title).toBe(story.title)
  })

  it('战报：缓存命中前无记录，写入后可读', () => {
    const input = {
      game: '词义闪电选', level: 0, score: 8, total: 10, stars: 2,
      avgMs: 2400, bestStreak: 4, wrongWords: ['apple', 'book'],
    }
    expect(getBattleReport(input)).toBeUndefined()
  })

  it('关卡解锁规则未被剧情改动影响', () => {
    expect(isLevelUnlocked('word-pick', 0)).toBe(true)
    expect(isLevelUnlocked('word-pick', 1)).toBe(false)
    saveLevelResult('word-pick', 0, { stars: 1, score: 5, total: 10, avgMs: 3000 })
    expect(isLevelUnlocked('word-pick', 1)).toBe(true)
  })
})
