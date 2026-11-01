import { describe, expect, it } from 'vitest'
import { ALL_WORDS } from '../data'
import { CATEGORIES } from '../data/generated/categories'
import {
  buildMasteredPool,
  clusterWords,
  TOPICS,
  wordKey,
  type PoolWord,
} from './cluster'
import type { CategoryId } from '../data/types'

/** 构造合成词池：在真实分类 id 间轮转，主题按需分配。 */
function makePool(count: number, cats: CategoryId[] = CATEGORIES.slice(0, 6).map((c) => c.id)): PoolWord[] {
  const out: PoolWord[] = []
  for (let i = 0; i < count; i++) {
    const cat = cats[i % cats.length]
    out.push({
      key: `word${i}`,
      word: `Word${i}`,
      ipa: '',
      meaning: `词${i}`,
      category: cat,
      theme: i % 3 === 0 ? `theme${i % 5}` : null,
    })
  }
  return out
}

describe('wordKey', () => {
  it('统一小写并剥离非词字符', () => {
    expect(wordKey('Order')).toBe('order')
    expect(wordKey('ICE  Cream')).toBe('icecream')
    expect(wordKey("don't")).toBe("don't")
  })
})

describe('buildMasteredPool', () => {
  it('只保留已掌握的词，且键唯一', () => {
    const sample = [ALL_WORDS[0], ALL_WORDS[1], ALL_WORDS[2]]
    const mastered = new Set(sample.map((w) => w.word))
    const pool = buildMasteredPool(mastered)

    expect(pool.length).toBe(sample.length)
    expect(new Set(pool.map((w) => w.key)).size).toBe(pool.length)
    for (const w of pool) expect(mastered.has(w.word)).toBe(true)
  })

  it('空掌握集返回空池', () => {
    expect(buildMasteredPool(new Set()).length).toBe(0)
  })
})

describe('clusterWords 不变量', () => {
  const per = 20
  const max = per + 5

  it('每个词恰好归属一组：数量守恒、无重复', () => {
    for (const total of [1, 5, 25, 120, 500]) {
      const pool = makePool(total)
      const groups = clusterWords(pool, { wordsPerLesson: per, topic: 'random' })
      const keys = groups.flatMap((g) => g.words.map((w) => w.key))
      expect(keys.length).toBe(total)
      expect(new Set(keys).size).toBe(total)
      expect(groups.every((g) => g.words.length > 0)).toBe(true)
    }
  })

  it('单组容量不超过上限', () => {
    const pool = makePool(500)
    const groups = clusterWords(pool, { wordsPerLesson: per, topic: 'random' })
    expect(groups.every((g) => g.words.length <= max)).toBe(true)
    expect(groups.length).toBeGreaterThan(1)
  })

  it('同主题词倾向聚到同一篇（桶过大先按主题切块）', () => {
    // 100 词、1 个分类，主题循环 theme0..theme4
    const pool = Array.from({ length: 100 }, (_, i) => ({
      key: `w${i}`,
      word: `W${i}`,
      ipa: '',
      meaning: `词${i}`,
      category: 'food' as CategoryId,
      theme: `theme${i % 5}`,
    }))
    const groups = clusterWords(pool, { wordsPerLesson: 20, topic: 'random' })
    // 每组内部主题种类应显著小于词数（聚类生效）
    for (const g of groups) {
      const themes = new Set(g.words.map((w) => w.theme))
      expect(themes.size).toBeLessThan(g.words.length)
    }
  })

  it('指定题材时命中场景排在最前，但不丢任何场景的词', () => {
    const foodMeta = TOPICS.find((t) => t.id === 'food')!
    const pool = makePool(300, [...foodMeta.categories, 'home', 'people', 'time'])
    const groups = clusterWords(pool, { wordsPerLesson: 20, topic: 'food' })
    // 覆盖守恒
    expect(groups.reduce((n, g) => n + g.words.length, 0)).toBe(300)
    // 首组类别应为题材命中集合中的一个
    expect(foodMeta.categories).toContain(groups[0].category)
    // 非命中场景的词也全部保留（题材只影响排序，不做过滤）
    const nonPreferred = groups.filter((g) => !foodMeta.categories.includes(g.category as never))
    expect(nonPreferred.length).toBeGreaterThan(0)
  })

  it('不同 wordsPerLesson 都能收敛（边界值）', () => {
    for (const wpl of [8, 15, 20, 30, 100]) {
      const pool = makePool(300)
      const groups = clusterWords(pool, { wordsPerLesson: wpl, topic: 'random' })
      const keys = groups.flatMap((g) => g.words.map((w) => w.key))
      expect(new Set(keys).size).toBe(300)
    }
  })
})

describe('clusterWords 复习词注入', () => {
  const reviewWord = (key: string): PoolWord => ({
    key,
    word: key,
    ipa: '',
    meaning: '复习词',
    category: 'thinking',
    theme: null,
    isReview: true,
  })

  it('复习词按每篇 ~25% 预算编入且标记 isReview', () => {
    const pool = makePool(60)
    const review = Array.from({ length: 10 }, (_, i) => reviewWord(`review${i}`))
    const groups = clusterWords(pool, { wordsPerLesson: 20, topic: 'random', review })

    const injected = groups.flatMap((g) => g.words.filter((w) => w.isReview))
    expect(injected.length).toBeGreaterThan(0)
    // 每篇最多 max(2, round(20*0.25)) = 5 个复习词
    for (const g of groups) {
      expect(g.words.filter((w) => w.isReview).length).toBeLessThanOrEqual(5)
    }
    // 已掌握词一个都不少
    const masteredKeys = groups.flatMap((g) => g.words.filter((w) => !w.isReview).map((w) => w.key))
    expect(new Set(masteredKeys).size).toBe(60)
  })

  it('没有复习词时不影响原有分组', () => {
    const pool = makePool(40)
    const groups = clusterWords(pool, { wordsPerLesson: 20, topic: 'random', review: [] })
    expect(groups.flatMap((g) => g.words).every((w) => !w.isReview)).toBe(true)
  })
})
