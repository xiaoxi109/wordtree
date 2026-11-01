// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { clearReviewWords, getReviewKeySet, getReviewWords, pushReviewWord, removeReviewWord } from './review'

const word = { key: 'salad', word: 'salad', ipa: '/ˈsæləd/', meaning: '沙拉' }

describe('错词复习队列', () => {
  beforeEach(() => {
    localStorage.clear()
    clearReviewWords()
  })

  it('标记不认识 → 入队并记录错误次数', () => {
    pushReviewWord(word, 'unknown')
    const list = getReviewWords()
    expect(list).toHaveLength(1)
    expect(list[0].key).toBe('salad')
    expect(list[0].misses).toBe(2) // 不认识权重更高
    pushReviewWord(word, 'fuzzy')
    expect(getReviewWords()[0].misses).toBe(3) // 已存在则累加
    expect(getReviewWords()).toHaveLength(1)
  })

  it('重新标记已掌握 → 移出队列', () => {
    pushReviewWord(word, 'fuzzy')
    expect(getReviewKeySet().has('salad')).toBe(true)
    removeReviewWord('salad')
    expect(getReviewWords()).toHaveLength(0)
  })

  it('脏数据不会导致崩溃', () => {
    localStorage.setItem('lexicore-ai-review', '{not json')
    expect(getReviewWords()).toEqual([])
  })
})
