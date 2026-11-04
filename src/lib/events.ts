import { appendEvent, eventsByWord, type WordEvent, type WordEventDirection, type WordEventGrade, type WordEventSource } from '../db'
import type { WordTrajectory } from './__TODO__-auto-level-recommendation'

// ========================= 写入 =========================

/** 记录一次判级事件（StudyView / LessonReader / 未来 quiz 都走这里）。 */
export async function appendWordEvent(input: {
  word_key: string
  word: string
  direction?: WordEventDirection
  source: WordEventSource
  grade: WordEventGrade
  reaction_ms?: number
  context_id?: string
  at?: number
}): Promise<WordEvent> {
  return appendEvent({
    word_key: input.word_key,
    word: input.word,
    direction: input.direction ?? 'both',
    source: input.source,
    grade: input.grade,
    reaction_ms: input.reaction_ms ?? null,
    context_id: input.context_id ?? null,
    at: input.at ?? Date.now(),
  })
}

// ========================= 聚合 =========================

/** 从事件流算一个词的完整复习轨迹（WordTrajectory）。 */
export async function trajectoryOf(wordKey: string): Promise<WordTrajectory | null> {
  const events = await eventsByWord(wordKey)
  if (events.length === 0) return null
  return aggregate(events, wordKey)
}

/** 内存版聚合（已经有事件数组时用，省一次 IndexedDB 查询）。 */
export function aggregate(events: WordEvent[], wordKey?: string): WordTrajectory {
  const sorted = [...events].sort((a, b) => a.at - b.at)

  let flips = 0
  let prevState: WordEventGrade | null = null
  for (const e of sorted) {
    if (prevState && prevState !== e.grade && prevState !== 'skipped' && e.grade !== 'skipped') {
      flips++
    }
    prevState = e.grade
  }

  // 'both' 是默认显示模式（AI 阅读器也固定写 both），代表两个方向都练到了。
  // 必须同时计入 en→zh 与 zh→en，否则 known_rate_* 恒为 0，画像/薄弱项评估失真。
  const notSkipped = sorted.filter((e) => e.grade !== 'skipped')
  const dirEnZh = notSkipped.filter((e) => e.direction === 'en→zh' || e.direction === 'both')
  const dirZhEn = notSkipped.filter((e) => e.direction === 'zh→en' || e.direction === 'both')

  const knownCountEnZh = dirEnZh.filter((e) => e.grade === 'known').length
  const knownRateEnZh = dirEnZh.length > 0 ? knownCountEnZh / dirEnZh.length : 0

  let knownRateZhEn: number | null = null
  if (dirZhEn.length > 0) {
    const known = dirZhEn.filter((e) => e.grade === 'known').length
    knownRateZhEn = known / dirZhEn.length
  }

  const withReaction = sorted.filter((e) => typeof e.reaction_ms === 'number')
  const avgReaction =
    withReaction.length > 0
      ? withReaction.reduce((s, e) => s + (e.reaction_ms as number), 0) / withReaction.length
      : null

  const recent = sorted.slice(-10).map((e) => e.grade)

  // instability：state_flips 占比 + 低 known 率的综合
  const flipRatio = sorted.length > 1 ? flips / (sorted.length - 1) : 0
  const recentKnown = recent.filter((g) => g === 'known').length / Math.max(recent.filter((g) => g !== 'skipped').length, 1)
  const instability = Math.min(1, flipRatio * 0.6 + (1 - recentKnown) * 0.4)

  return {
    word_key: wordKey ?? sorted[0].word_key,
    word: sorted[sorted.length - 1].word,
    total_events: sorted.length,
    state_flips: flips,
    recent_sequence: recent,
    known_rate_en_to_zh: knownRateEnZh,
    known_rate_zh_to_en: knownRateZhEn,
    avg_reaction_ms: avgReaction,
    instability,
  }
}

// ========================= StudyView / LessonReader 工具 =========================

/** 从 displayMode 推 direction：StudyView 显示模式 → WordEventDirection。 */
export function directionFromDisplayMode(mode: 'zh' | 'en' | 'both'): WordEventDirection {
  // displayMode='zh' 时正面是中文 → 用户看中文想英文 → zh→en
  // displayMode='en' 时正面是英文 → 用户看英文想中文 → en→zh
  // displayMode='both' 时两者都有 → 记 both
  switch (mode) {
    case 'zh': return 'zh→en'
    case 'en': return 'en→zh'
    default:   return 'both'
  }
}
