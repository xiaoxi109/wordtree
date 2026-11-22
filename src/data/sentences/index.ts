import { SENTENCE_SCENES, type SceneData, type SentenceSceneId, type ShortSentence } from './types'
import { PART1 } from './part1'
import { PART2 } from './part2'
import { PART3 } from './part3'
import { PART4 } from './part4'
import { PART5 } from './part5'

export { SENTENCE_SCENES } from './types'
export type { SentenceScene, SentenceSceneId, ShortSentence } from './types'

/** 三组场景数据合并成一份完整场景表。 */
const RAW: SceneData = { ...PART1, ...PART2, ...PART3, ...PART4, ...PART5 } as SceneData

/**
 * 890 条短句。id 由「场景 + 场景内序号」生成（`food-01`），
 * 数据里增删句子不会影响其他场景的 id，掌握记录因此不会串位。
 */
export const SHORT_SENTENCES: ShortSentence[] = SENTENCE_SCENES.flatMap((scene) =>
  (RAW[scene.id] ?? []).map(([zh, en], i) => ({
    id: `${scene.id}-${String(i + 1).padStart(2, '0')}`,
    zh,
    en,
    scene: scene.id,
  })),
)

export const SHORT_SENTENCE_TOTAL = SHORT_SENTENCES.length

/** 按场景分组，供「短句」页分类展示。 */
export const SENTENCES_BY_SCENE: Record<SentenceSceneId, ShortSentence[]> = (() => {
  const out = {} as Record<SentenceSceneId, ShortSentence[]>
  for (const scene of SENTENCE_SCENES) out[scene.id] = []
  for (const sentence of SHORT_SENTENCES) out[sentence.scene].push(sentence)
  return out
})()

export function getScene(id: SentenceSceneId) {
  return SENTENCE_SCENES.find((s) => s.id === id)
}

/** 中文或英文模糊搜索（不区分大小写）。 */
export function searchSentences(query: string, list: ShortSentence[] = SHORT_SENTENCES): ShortSentence[] {
  const q = query.trim().toLowerCase()
  if (!q) return list
  return list.filter((s) => s.zh.includes(q) || s.en.toLowerCase().includes(q))
}

if (SHORT_SENTENCE_TOTAL !== 890) {
  console.warn(`[短句库] 期望 890 条，实际 ${SHORT_SENTENCE_TOTAL} 条`)
}
