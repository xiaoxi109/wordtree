import type { CategoryId, Level } from '../data/types'
import type { PoolWord } from './cluster'
import type { ReviewWord } from './review'

/**
 * 因材施教推荐器
 * ================
 * 从学习者画像（已掌握词 + 错词 + 晋级状态 + 学习节奏）算出：
 *   - 推荐词数 wordsPerLesson
 *   - 推荐难度 difficulty
 *   - 推荐复习词占比 reviewRatio
 *   - 加权场景权重（用于 pickOneGroup 的 weightedPick）
 *   - 三种模式预设（巩固 / 日常 / 拉伸）
 *
 * 输入全来自现有的状态，不请求网络。所有规则都有可解释的理由，顶部状态栏会把理由展示给用户。
 */

export type LearningMode = 'review' | 'daily' | 'stretch'

export const MODE_LABEL: Record<LearningMode, { emoji: string; label: string; hint: string }> = {
  review: {
    emoji: '🎯',
    label: '巩固',
    hint: '错词多 / 刚入门 · 课程更短，一半用来练错词',
  },
  daily: {
    emoji: '✨',
    label: '日常（推荐）',
    hint: '按你的画像动态调节，覆盖已掌握 + 少量复习词',
  },
  stretch: {
    emoji: '🚀',
    label: '拉伸',
    hint: '想突破舒适区 · 引入下一级词，句式更有挑战',
  },
}

export interface LearnerProfile {
  masteredCount: number
  reviewCount: number
  reviewPressure: 'low' | 'normal' | 'high'
  streakDays: number
  levelDistribution: Record<string, number>
  averageLevel: Level | null
  targetLevel: Level | null
  categoryDistribution: Record<string, number>
  weakCategories: CategoryId[]
  strongCategories: CategoryId[]
  reasonTags: string[]
}

export interface GeneratedPlan {
  wordsPerLesson: number
  difficulty: Difficulty
  reviewRatio: number
  categoryWeights: Partial<Record<CategoryId, number>>
  reason: string
}

type Difficulty = 'adaptive' | 'A1' | 'A2' | 'B1' | 'B2'

const LEVEL_ORDER: Level[] = ['Pre-A1', 'A1', 'A2', 'B1', 'B2']
const LEVEL_INDEX: Record<string, number> = Object.fromEntries(LEVEL_ORDER.map((l, i) => [l, i]))

/** 构建学习者画像（所有规则的原始信号来源）。 */
export function buildLearnerProfile(
  masteredPool: PoolWord[],
  reviewPool: ReviewWord[],
  targetLevel: Level | null,
  streakDays: number,
): LearnerProfile {
  const levelDist: Record<string, number> = {}
  const catDist: Record<string, number> = {}

  for (const w of masteredPool) {
    if (w.level) levelDist[w.level] = (levelDist[w.level] ?? 0) + 1
    catDist[w.category] = (catDist[w.category] ?? 0) + 1
  }

  const avgLevel = computeAverageLevel(levelDist)

  const reviewByCat = new Map<string, number>()
  for (const r of reviewPool) {
    // 从 masteredPool 里通过 key 找到 category（reviewPool 本身没 category 字段）
    const hit = masteredPool.find((w) => w.key === r.key)
    const cat = hit?.category ?? 'thinking'
    reviewByCat.set(cat, (reviewByCat.get(cat) ?? 0) + r.misses)
  }

  const total = masteredPool.length + reviewPool.length
  const pressure: 'low' | 'normal' | 'high' =
    reviewPool.length === 0 ? 'low'
    : reviewPool.length / Math.max(1, total) > 0.25 ? 'high'
    : reviewPool.length / Math.max(1, total) > 0.1 ? 'normal'
    : 'low'

  const weakCats = Array.from(Object.entries(reviewByCat))
    .sort((a, b) => b[1] - a[1])
    .filter((entry) => (entry as [string, number])[1] >= 2)
    .map((entry) => (entry as [string, number])[0] as CategoryId)

  const strongCats = Array.from(Object.entries(catDist))
    .sort((a, b) => b[1] - a[1])
    .filter((entry) => (entry as [string, number])[1] >= 5)
    .map((entry) => (entry as [string, number])[0] as CategoryId)

  const reasonTags: string[] = []
  if (masteredPool.length < 30) reasonTags.push('已掌握词少')
  if (avgLevel) reasonTags.push(`平均等级 ${avgLevel}`)
  if (pressure === 'high') reasonTags.push('错词较多')
  if (pressure === 'low' && masteredPool.length >= 50) reasonTags.push('状态良好')
  if (streakDays >= 7) reasonTags.push(`连续学习 ${streakDays} 天`)

  return {
    masteredCount: masteredPool.length,
    reviewCount: reviewPool.length,
    reviewPressure: pressure,
    streakDays,
    levelDistribution: levelDist,
    averageLevel: avgLevel,
    targetLevel,
    categoryDistribution: catDist,
    weakCategories: weakCats,
    strongCategories: strongCats,
    reasonTags,
  }
}

function computeAverageLevel(dist: Record<string, number>): Level | null {
  let total = 0
  let weighted = 0
  for (const [lvl, count] of Object.entries(dist)) {
    const idx = LEVEL_INDEX[lvl]
    if (idx === undefined) continue
    total += count
    weighted += idx * count
  }
  if (total === 0) return null
  const avgIdx = Math.round(weighted / total)
  return LEVEL_ORDER[Math.min(LEVEL_ORDER.length - 1, Math.max(0, avgIdx))]
}

/** 全场景推荐 + 模式覆盖 → 最终生成计划。 */
export function recommend(profile: LearnerProfile, mode: LearningMode): GeneratedPlan {
  const baseWords = baseWordsPerLesson(profile)
  const baseDiff = baseDifficulty(profile)
  const baseRatio = baseReviewRatio(profile)

  // 模式覆盖基础推荐值
  let words = baseWords
  let difficulty = baseDiff
  let ratio = baseRatio

  if (mode === 'review') {
    words = Math.max(12, baseWords - 4)
    // 巩固模式：取平均等级（不拉伸），但至少 A1
    if (profile.averageLevel) {
      difficulty = clampToDifficulty(profile.averageLevel)
    } else {
      difficulty = 'A1'
    }
    ratio = Math.max(0.4, baseRatio) // 至少 40% 复习词
  } else if (mode === 'stretch') {
    words = Math.min(28, baseWords + 4)
    // 拉伸模式：目标等级 或 平均等级 + 1
    if (profile.targetLevel) {
      difficulty = clampToDifficulty(profile.targetLevel)
    } else if (profile.averageLevel) {
      const idx = LEVEL_INDEX[profile.averageLevel] ?? 1
      const next = LEVEL_ORDER[Math.min(LEVEL_ORDER.length - 1, idx + 1)]
      difficulty = clampToDifficulty(next)
    } else {
      difficulty = 'A2'
    }
    ratio = 0.15
  } else {
    // daily：直接用基础推荐值，只微调一些边界
    if (profile.reviewPressure === 'high') ratio = Math.max(0.3, baseRatio)
  }

  const categoryWeights = buildCategoryWeights(profile, mode)

  // 生成人类可读的理由
  const reasonLine = buildReason(profile, mode, { words, difficulty, ratio })

  return { wordsPerLesson: clampWords(words), difficulty, reviewRatio: clampRatio(ratio), categoryWeights, reason: reasonLine }
}

function baseWordsPerLesson(p: LearnerProfile): number {
  let n: number
  if (p.masteredCount < 30) n = 12
  else if (p.masteredCount < 100) n = 18
  else if (p.masteredCount < 300) n = 22
  else n = 26

  // 节奏微调
  if (p.streakDays > 7) n += 2        // 连续学习 → 稍长
  if (p.streakDays === 1 && p.reviewPressure !== 'low') n -= 2  // 刚回来 → 先短的

  // 错词压力 → 短一点先练错词
  if (p.reviewPressure === 'high') n -= 2

  return clampWords(n)
}

function baseDifficulty(p: LearnerProfile): Difficulty {
  // 进阶拉伸逻辑：如果平均等级 B1 且目标 B2 → 推 B2
  if (p.averageLevel && p.targetLevel) {
    const avgIdx = LEVEL_INDEX[p.averageLevel] ?? 0
    const targetIdx = LEVEL_INDEX[p.targetLevel] ?? avgIdx
    if (targetIdx > avgIdx) return clampToDifficulty(p.targetLevel)
  }
  // 巩固期 → 自适应（让模型自己贴合）
  if (p.reviewPressure === 'high') return 'adaptive'
  return clampToDifficulty(p.averageLevel ?? 'A1')
}

function baseReviewRatio(p: LearnerProfile): number {
  if (p.reviewPressure === 'high') return 0.4
  if (p.reviewPressure === 'low') return 0.1
  return 0.25
}

function buildCategoryWeights(p: LearnerProfile, mode: LearningMode): Partial<Record<CategoryId, number>> {
  const weights: Partial<Record<CategoryId, number>> = {}

  // 基础权重 1
  // 巩固模式：weak × 5，strong × 0.3
  // 日常模式：weak × 3，strong × 0.5
  // 拉伸模式：strong × 3（在已熟的场景里扩维），weak × 0.5
  for (const cat of [...p.weakCategories, ...p.strongCategories]) {
    let w = 1
    if (mode === 'review') {
      if (p.weakCategories.includes(cat)) w = 5
      if (p.strongCategories.includes(cat)) w = 0.3
    } else if (mode === 'stretch') {
      if (p.strongCategories.includes(cat)) w = 3
      if (p.weakCategories.includes(cat)) w = 0.5
    } else {
      if (p.weakCategories.includes(cat)) w = 3
      if (p.strongCategories.includes(cat)) w = 0.5
    }
    weights[cat] = w
  }

  return weights
}

function buildReason(p: LearnerProfile, mode: LearningMode, plan: { words: number; difficulty: Difficulty; ratio: number }): string {
  const modeLabel = MODE_LABEL[mode].label
  const diffLabel = plan.difficulty === 'adaptive' ? '自适应' : plan.difficulty

  const parts: string[] = []
  parts.push(`${modeLabel}模式`)
  if (plan.words >= 0) parts.push(`${plan.words} 词`)
  parts.push(diffLabel)

  const extra: string[] = []
  if (p.reviewPressure === 'high') extra.push('错词偏多，复习词占比拉高')
  else if (p.reviewPressure === 'low' && p.masteredCount > 50) extra.push('已掌握基础好，可看新内容')
  if (p.streakDays >= 7) extra.push(`连续学习 ${p.streakDays} 天，节奏稳定`)
  if (p.averageLevel) extra.push(`平均等级 ${p.averageLevel}`)
  if (extra.length) parts.push(`· ${extra.join('；')}`)

  return parts.join(' · ')
}

function clampWords(n: number): number {
  return Math.min(28, Math.max(8, Math.round(n)))
}

function clampRatio(r: number): number {
  return Math.min(0.6, Math.max(0, r))
}

function clampToDifficulty(level: Level): Difficulty {
  // Pre-A1 对应 A1 难度（Level 表最底层的 Pre-A1 映射到 A1 prompt hint 就够用了）
  if (level === 'Pre-A1') return 'A1'
  return level
}

// ========================= 加权随机（pickOneGroup 用） =========================

/** 简单的加权随机：{ cat: weight } → 从所有 category 里挑一个。 */
export function weightedPick<T extends string>(items: readonly T[], weights: Partial<Record<T, number>>): T {
  const entries = items.map((it) => [it, weights[it] ?? 1] as const)
  const total = entries.reduce((s, [, w]) => s + Math.max(0, w), 0)
  if (total <= 0) return items[Math.floor(Math.random() * items.length)]
  let r = Math.random() * total
  for (const [it, w] of entries) {
    r -= Math.max(0, w)
    if (r <= 0) return it
  }
  return entries[entries.length - 1][0]
}
