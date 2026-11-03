import type { UserProfile, WeakPoint } from './__TODO__-auto-level-recommendation'
import type { TopicId } from './cluster'
import type { Difficulty, LessonFormatChoice } from './prompt'
import { TOPICS } from './cluster'
import { LESSON_FORMATS } from './prompt'

/**
 * RecommendEngine：把 UserProfile + WeakPoint[] 转成 generate() 的参数。
 *
 * 输出的对象可以直接拆进 AiView 顶部「自动选（推荐）」按钮的回调。
 */
export interface RecommendResult {
  topic: TopicId
  difficulty: Difficulty
  format: LessonFormatChoice
  wordsPerLesson: number
  reason: string   // 展示给用户看的一句话："推荐原因：你在 food 场景下有 3 个不稳定词"
}

/** 从 level 数值映射到 Difficulty 枚举。 */
function difficultyFromLevel(level: number): Difficulty {
  if (level < 1.5) return 'A1'
  if (level < 2.3) return 'A2'
  if (level < 3.3) return 'B1'
  return 'B2'
}

/** 根据 vocabulary score 动态调整每篇重点词数。 */
function wordsPerLessonFromVocab(vocabularyScore: number): number {
  if (vocabularyScore < 0.3) return 12
  if (vocabularyScore < 0.5) return 16
  if (vocabularyScore < 0.7) return 20
  return 24
}

/** 找 weaknesses 里最严重的 category 类 → 映射到 TopicId。 */
function pickTopic(weaknesses: WeakPoint[]): TopicId {
  const cat = weaknesses.find((w) => w.type === 'category')
  if (!cat || !cat.id) return 'random'
  // scene_label → TOPICS 里匹配 label（简化：先匹配 scene_label，匹配不上走 random）
  for (const t of TOPICS) {
    if (t.label.includes(cat.id) || cat.id.includes(t.label)) return t.id
  }
  return 'random'
}

/** 避开体裁类薄弱点。 */
function pickFormat(weaknesses: WeakPoint[]): LessonFormatChoice {
  const weakKinds = new Set(weaknesses.filter((w) => w.type === 'kind').map((w) => w.id))
  if (weakKinds.size === 0) return 'auto'
  const safe = LESSON_FORMATS.filter((f) => !weakKinds.has(f.id))
  if (safe.length === 0) return 'auto'
  return safe[Math.floor(Math.random() * safe.length)].id
}

/** 把 level_label 带小数 → level 整数级，供 Difficulty 用。 */
function roundLevel(level: number): Difficulty {
  return difficultyFromLevel(level)
}

export function recommend(profile: UserProfile, weaknesses: WeakPoint[]): RecommendResult {
  const topic = pickTopic(weaknesses)
  const difficulty = roundLevel(profile.level)
  const format = pickFormat(weaknesses)
  const wordsPerLesson = wordsPerLessonFromVocab(profile.scores.vocabulary)

  // 组装一句话 reason：薄弱点里最严重的那条
  const top = weaknesses[0]
  let reason = `根据你的水平 ${profile.level_label}${profile.level.toFixed(1).slice(1)}`
  if (top) {
    reason += `；薄弱：${top.label}`
  }

  return { topic, difficulty, format, wordsPerLesson, reason }
}
