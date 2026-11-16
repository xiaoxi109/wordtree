import type { TopicId } from './cluster'
import type { LessonFormatChoice } from './prompt'

/**
 * AI 生成条件的「轻偏好」：题材 + 体裁。
 *
 * 只持久化这两项（难度跟随设置里的「我的等级」，模式是每次的临时意图），
 * 免得每次重开 App 都要重新选一遍。
 */

const STORAGE_KEY = 'lexicore-ai-prefs'

export interface AiPrefs {
  topic: TopicId
  format: LessonFormatChoice
}

export const DEFAULT_AI_PREFS: AiPrefs = { topic: 'random', format: 'auto' }

const TOPIC_IDS: TopicId[] = ['random', 'campus', 'travel', 'food', 'tech', 'work', 'daily', 'story']
const FORMAT_IDS: LessonFormatChoice[] = ['auto', 'story', 'dialogue', 'diary', 'email', 'article', 'poem']

function isTopic(v: unknown): v is TopicId {
  return typeof v === 'string' && (TOPIC_IDS as string[]).includes(v)
}

function isFormat(v: unknown): v is LessonFormatChoice {
  return typeof v === 'string' && (FORMAT_IDS as string[]).includes(v)
}

export function loadAiPrefs(): AiPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_AI_PREFS }
    const parsed = JSON.parse(raw) as Partial<AiPrefs>
    return {
      topic: isTopic(parsed.topic) ? parsed.topic : DEFAULT_AI_PREFS.topic,
      format: isFormat(parsed.format) ? parsed.format : DEFAULT_AI_PREFS.format,
    }
  } catch {
    return { ...DEFAULT_AI_PREFS }
  }
}

export function saveAiPrefs(patch: Partial<AiPrefs>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...loadAiPrefs(), ...patch }))
  } catch {
    /* 隐私模式忽略 */
  }
}
