import { ALL_WORDS } from '../data'
import { CATEGORIES } from '../data/generated/categories'
import { WORD_THEME } from '../data/themes'
import { wordsByGrade } from '../data/grades'
import type { CategoryId, Level } from '../data/types'

/** 与 data/grades.ts 的 norm 保持一致，用于跨来源去重与标签匹配。 */
export function wordKey(s: string): string {
  return s.toLowerCase().normalize('NFKC').replace(/[^a-z0-9'-]/g, '')
}

/** 进入生成池的词（来自 CEFR 主库或人教词表）。 */
export interface PoolWord {
  /** 规范化键，用于去重、标记与回流匹配 */
  key: string
  /** 原始词形，与 localStorage 中的掌握记录一致 */
  word: string
  ipa: string
  meaning: string
  category: CategoryId
  /** 主题 id（如「season」），用于同主题词聚到同一篇 */
  theme: string | null
  /** 复习词（来自错词队列）：本文要求重复出现，便于强化记忆 */
  isReview?: boolean
  /** CEFR 等级，用于激活窗口过滤 */
  level?: Level
}

export type TopicId = 'random' | 'campus' | 'travel' | 'food' | 'tech' | 'work' | 'daily' | 'story'

export interface TopicMeta {
  id: TopicId
  label: string
  /** 题材=排序侧重：命中的场景优先编排，其余场景照常生成（保证 100% 覆盖） */
  categories: CategoryId[]
}

export const TOPICS: TopicMeta[] = [
  { id: 'random', label: '随机', categories: [] },
  { id: 'daily', label: '日常生活', categories: ['home', 'people', 'clothes', 'health', 'shopping', 'time', 'festival'] },
  { id: 'campus', label: '校园学习', categories: ['education', 'communication', 'grammar', 'questions'] },
  { id: 'food', label: '美食', categories: ['food'] },
  { id: 'travel', label: '旅行出行', categories: ['travel', 'space', 'nature', 'weather', 'city'] },
  { id: 'tech', label: '科技', categories: ['science', 'media', 'tech'] },
  { id: 'work', label: '职场', categories: ['work', 'society', 'law'] },
  { id: 'story', label: '动物与童趣', categories: ['animals', 'toys', 'arts', 'emotions', 'music'] },
]

export const TOPIC_LABEL: Record<TopicId, string> = Object.fromEntries(
  TOPICS.map((t) => [t.id, t.label]),
) as Record<TopicId, string>

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]))
const CATEGORY_ORDER: Record<string, number> = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.order]))

/** 词键 → 场景（查词/复习词没有场景信息时回填用）。 */
const CATEGORY_BY_KEY: Map<string, CategoryId> = (() => {
  const m = new Map<string, CategoryId>()
  for (const w of ALL_WORDS) m.set(wordKey(w.word), w.category ?? 'thinking')
  return m
})()

export function categoryOfKey(key: string): CategoryId | null {
  return CATEGORY_BY_KEY.get(key) ?? null
}

/** 构建已掌握词池：CEFR 主库 ∩ 掌握集，+ 人教词表 ∩ 掌握集，按规范化键去重。 */
export function buildMasteredPool(masteredSet: Set<string>): PoolWord[] {
  const out = new Map<string, PoolWord>()
  // 掌握记录来自多个入口（词库圆圈 / 文章点词），词形可能有大小写、
  // 空格或标点差异。统一转成规范化键再匹配，避免「明明标记了却匹配不到词条」。
  const masteredKeys = new Set<string>()
  for (const raw of masteredSet) {
    const key = wordKey(raw)
    if (key) masteredKeys.add(key)
  }
  const add = (
    word: string,
    ipa: string,
    meaning: string,
    category: CategoryId | undefined,
    level?: Level,
  ) => {
    if (!masteredKeys.has(wordKey(word)) || !meaning) return
    const key = wordKey(word)
    if (out.has(key)) return
    out.set(key, {
      key,
      word,
      ipa: ipa || '',
      meaning,
      category: category ?? 'thinking',
      theme: WORD_THEME[word] ?? null,
      level,
    })
  }
  for (const w of ALL_WORDS) add(w.word, w.ipa, w.meaning, w.category, w.level)

  // 人教专有词（不在 CEFR 主库中）补进词池；按首次出现年级去重逻辑复用 wordsByGrade()。
  const grades = gradeCache()
  for (const list of Object.values(grades)) {
    for (const w of list) if (w.pepOnly) add(w.word, w.ipa, w.meaning, w.category, w.level)
  }
  return Array.from(out.values())
}

let _grades: ReturnType<typeof wordsByGrade> | null = null
function gradeCache() {
  if (!_grades) _grades = wordsByGrade()
  return _grades
}

/** 一个「篇章组」→ 生成一篇教程。 */
export interface LessonGroup {
  id: string
  category: CategoryId | 'mixed'
  sceneLabel: string
  sceneEn: string
  words: PoolWord[]
}

export interface ClusterOptions {
  wordsPerLesson: number
  topic: TopicId
  /** 错词队列里的词：按每篇 ~25% 的预算编入（不占用已掌握词的位置） */
  review?: PoolWord[]
}

/**
 * 按场景聚类：
 * 1. 一级按 category 分桶；桶过大则按 theme 切块（同主题的词天然同篇，便于关联记忆）
 * 2. 余数（不足一篇）补进仍有容量的组
 * 3. 排序：随机题材全随机；指定题材则命中场景优先，其余照常编排（保证全部词被覆盖）
 *
 * 不变量：每个词恰好归属一组；单组容量 ≤ wordsPerLesson + 5。
 */
export function clusterWords(pool: PoolWord[], opts: ClusterOptions): LessonGroup[] {
  const per = Math.min(30, Math.max(8, Math.round(opts.wordsPerLesson)))
  const max = per + 5
  const min = Math.max(6, per - 5)

  const buckets = new Map<CategoryId, PoolWord[]>()
  for (const w of pool) {
    const b = buckets.get(w.category)
    if (b) b.push(w)
    else buckets.set(w.category, [w])
  }

  const groups: LessonGroup[] = []
  const leftovers: PoolWord[] = []

  const orderedCats = Array.from(buckets.keys()).sort(
    (a, b) => (CATEGORY_ORDER[a] ?? 99) - (CATEGORY_ORDER[b] ?? 99),
  )

  for (const cat of orderedCats) {
    const words = buckets.get(cat)!
    while (words.length > max) groups.push(makeGroup(cat, takeChunk(words, min, max)))
    if (words.length >= min) groups.push(makeGroup(cat, words))
    else leftovers.push(...words)
  }

  // 余数分配：优先塞进有空位的组，放不下就自成一组
  for (const w of leftovers) {
    const target = groups.find((g) => g.words.length < max)
    if (target) target.words.push(w)
    else groups.push(makeGroup(w.category, [w]))
  }

  injectReview(groups, opts.review ?? [], per)

  return orderGroups(groups, opts.topic)
}

/**
 * 把复习词按每篇预算编入各组（默认 per*25%，至少 2 个）。
 * 预算用尽后剩余复习词留到下次生成，避免单篇词量爆炸。
 */
function injectReview(groups: LessonGroup[], review: PoolWord[], per: number): void {
  if (!groups.length || !review.length) return
  const budget = Math.max(2, Math.round(per * 0.25))
  const present = new Set(groups.flatMap((g) => g.words.map((w) => w.key)))
  const queue = review.filter((w) => !present.has(w.key))
  if (!queue.length) return

  const added = new Map<LessonGroup, number>()
  let cursor = 0
  for (const w of queue) {
    let target: LessonGroup | null = null
    for (let k = 0; k < groups.length; k++) {
      const g = groups[(cursor + k) % groups.length]
      const used = added.get(g) ?? 0
      if (used < budget && !g.words.some((x) => x.key === w.key)) {
        target = g
        cursor = (cursor + k + 1) % groups.length
        break
      }
    }
    if (!target) break
    target.words.push({ ...w, isReview: true })
    added.set(target, (added.get(target) ?? 0) + 1)
  }
}

/**
 * 场景标签显示名：兼容早期直接把 category id（如 `people`）写进 lesson.scene_label 的数据，
 * 统一转成中文场景名，避免界面上冒出内部英文键。
 */
export function sceneLabelText(label: string): string {
  if (!label || label === 'mixed') return '综合场景'
  return CATEGORY_LABEL[label] ?? label
}

function makeGroup(cat: CategoryId | 'mixed', words: PoolWord[]): LessonGroup {
  return {
    id: `${cat}-${words.map((w) => w.key).join('_').slice(0, 40)}-${words.length}`,
    category: cat,
    sceneLabel: cat === 'mixed' ? '综合场景' : CATEGORY_LABEL[cat] ?? '综合场景',
    sceneEn: cat === 'mixed' ? 'Mixed everyday scenes' : '',
    words,
  }
}

/** 从桶里切出一个主题块：取首词所属主题的全部词，不足下限时补足后续词。 */
function takeChunk(words: PoolWord[], min: number, max: number): PoolWord[] {
  const chunk: PoolWord[] = []
  const theme = words[0]?.theme ?? null
  if (theme) {
    for (let i = words.length - 1; i >= 0 && chunk.length < max; i--) {
      if (words[i].theme === theme) chunk.push(words.splice(i, 1)[0])
    }
  }
  while (chunk.length < min && words.length) chunk.push(words.shift()!)
  return chunk
}

function orderGroups(groups: LessonGroup[], topic: TopicId): LessonGroup[] {
  if (topic === 'random') return shuffle(groups)
  const meta = TOPICS.find((t) => t.id === topic)
  if (!meta) return groups
  const preferred: LessonGroup[] = []
  const rest: LessonGroup[] = []
  for (const g of groups) {
    if (g.category !== 'mixed' && meta.categories.includes(g.category)) preferred.push(g)
    else rest.push(g)
  }
  preferred.sort((a, b) => meta.categories.indexOf(a.category as CategoryId) - meta.categories.indexOf(b.category as CategoryId))
  const restSorted = rest.sort(
    (a, b) =>
      (CATEGORY_ORDER[a.category] ?? 99) - (CATEGORY_ORDER[b.category] ?? 99),
  )
  return [...preferred, ...restSorted]
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
