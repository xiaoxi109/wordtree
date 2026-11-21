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
    hint: '想多读一点 · 篇幅更长、复习词更少，多覆盖熟练场景',
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
  /** 当前词库推断出的 CEFR 等级（推荐难度的锚点） */
  currentLevel: Level | null
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

type Difficulty = 'adaptive' | 'Pre-A1' | 'A1' | 'A2' | 'B1' | 'B2' | 'C1'

const LEVEL_ORDER: Level[] = ['Pre-A1', 'A1', 'A2', 'B1', 'B2', 'C1']
const LEVEL_INDEX: Record<string, number> = Object.fromEntries(LEVEL_ORDER.map((l, i) => [l, i]))

/** 构建学习者画像（所有规则的原始信号来源）。 */
export function buildLearnerProfile(
  masteredPool: PoolWord[],
  reviewPool: ReviewWord[],
  targetLevel: Level | null,
  streakDays: number,
  currentLevel: Level | null = null,
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
    currentLevel,
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

/**
 * 全场景推荐 + 模式覆盖 → 最终生成计划。
 *
 * 注意：句式难度与学习模式**无关**，由当前词库等级 / 已掌握词水平决定（用户可在生成条件里自行覆盖）；
 * 模式只影响词数、复习词占比与场景权重，避免切换模式时难度跟着跳。
 */
export function recommend(profile: LearnerProfile, mode: LearningMode): GeneratedPlan {
  const baseWords = baseWordsPerLesson(profile)
  const difficulty = baseDifficulty(profile)
  const baseRatio = baseReviewRatio(profile)

  // 模式覆盖：只覆盖词数与复习占比
  let words = baseWords
  let ratio = baseRatio

  if (mode === 'review') {
    words = Math.max(12, baseWords - 4)
    ratio = Math.max(0.4, baseRatio) // 至少 40% 复习词
  } else if (mode === 'stretch') {
    words = Math.min(28, baseWords + 4)
    ratio = 0.15 // 少复习词，篇幅更长
  } else if (profile.reviewPressure === 'high') {
    // daily：错词多时略微提高复习占比
    ratio = Math.max(0.3, baseRatio)
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
  // 日常模式贴合当前词库推断等级，不自动上探到目标级；
  // 想要更有挑战请用「拉伸」模式（会瞄准下一级）。
  if (p.reviewPressure === 'high') return 'adaptive'
  return clampToDifficulty(p.currentLevel ?? p.averageLevel ?? 'A1')
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
  // Pre-A1 是独立难度档：极短句 + 最基础词汇，对应最低的词库难度
  if (level === 'Pre-A1') return 'Pre-A1'
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
