/**
 * 日常短句库的数据结构。
 *
 * 编排原则：按「中国人心里先冒出一句中文」的场景分类，而不是按英语语法/词性分类。
 * 每条只存「想说的中文 → 直接出口的英文短句」，零基础、短、可独立使用。
 */
export type SentenceSceneId =
  | 'greet'
  | 'chat'
  | 'polite'
  | 'ask'
  | 'food'
  | 'shop'
  | 'traffic'
  | 'home'
  | 'work'
  | 'time'
  | 'phone'
  | 'health'
  | 'weather'
  | 'mood'
  | 'learn'

export interface SentenceScene {
  id: SentenceSceneId
  label: string
  hint: string
}

/** 使用场景：按「什么时候会想说这句话」排列 */
export const SENTENCE_SCENES: SentenceScene[] = [
  { id: 'greet', label: '打招呼', hint: '见面、寒暄、道别' },
  { id: 'chat', label: '介绍自己', hint: '姓名、来历、近况' },
  { id: 'polite', label: '客气话', hint: '道谢、道歉、回应' },
  { id: 'ask', label: '求人帮忙', hint: '开口请求、答应与婉拒' },
  { id: 'food', label: '吃饭点餐', hint: '点菜、口味、结账' },
  { id: 'shop', label: '买东西', hint: '挑选、讲价、付款' },
  { id: 'traffic', label: '出门问路', hint: '公交、打车、指路' },
  { id: 'home', label: '在家里', hint: '起居、家务、随手说' },
  { id: 'work', label: '上班那些事', hint: '打卡、开会、交接' },
  { id: 'time', label: '约时间', hint: '几点、改期、等候' },
  { id: 'phone', label: '打电话发消息', hint: '接电话、微信、网络' },
  { id: 'health', label: '身体不舒服', hint: '症状、看医生、吃药' },
  { id: 'weather', label: '天气和穿衣', hint: '冷热、雨雪、加减衣' },
  { id: 'mood', label: '心情和感受', hint: '开心、担心、喜欢讨厌' },
  { id: 'learn', label: '学习和孩子', hint: '背书、作业、鼓励' },
]

/** 源数据用元组，避免 600 条里重复写 id / 场景字段。 */
export type SentenceRaw = readonly [zh: string, en: string]
export type SceneData = Record<SentenceSceneId, SentenceRaw[]>

/** 一条短句（带稳定 id 与场景），id 形如 `food-01`。 */
export interface ShortSentence {
  id: string
  /** 心里想说的中文 */
  zh: string
  /** 直接说出口的英文短句 */
  en: string
  scene: SentenceSceneId
}
