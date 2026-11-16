/**
 * 自然拼读 + 音标模块的数据结构。
 *
 * 两条主线：
 *   1. 音标（IPA）：47 个美式音标，按「单元音 / 双元音 / 辅音 / 辅音连缀」分组，
 *      每个音标记录口型要诀、常见字母组合、例词，用于「看符号能读、听音能写」。
 *   2. 自然拼读（Phonics）：字母 / 字母组合 → 音 的对应规则，按学习顺序分成 7 个阶段，
 *      从 26 个字母音一路到词尾变化与不发音字母。
 */

/** 音标分组：前两组是元音（19），后两组是辅音（24 + 4 个连缀 = 28） */
export type PhonemeGroup = 'monophthong' | 'diphthong' | 'consonant' | 'cluster'

/** 例词：w=单词，zh=中文，hi=单词里要强调（发目标音）的字母组合 */
export interface PhonicsExample {
  w: string
  zh: string
  hi?: string
  /**
   * 完整音标。绝大多数例词直接取自课程词表（带音标），由 ipaLookup 自动补；
   * 只有屈折形式（cats / walked / hottest 等）不在词库里，才在这里写明。
   */
  ipa?: string
}

export interface Phoneme {
  /** 与音标符号一致（去掉斜杠），同时作为掌握记录的 key，如 `iː`、`tʃ` */
  id: string
  /** 展示用音标，含斜杠，如 `/iː/` */
  ipa: string
  group: PhonemeGroup
  /** 一句话中文听感提示，如「长『衣』」 */
  zh: string
  /** 发音要诀：口型、舌位、声带 */
  mouth: string
  /** 常见字母组合（拼写） */
  spellings: string[]
  examples: PhonicsExample[]
  /** 易混音（音标），点开可直接跳到对应音标对照 */
  contrast?: string[]
}

export type PhonicsStageId = 1 | 2 | 3 | 4 | 5 | 6 | 7

export interface PhonicsRule {
  id: string
  stage: PhonicsStageId
  /** 字母 / 字母组合，如 `a_e`、`sh`、`-tion` */
  grapheme: string
  /** 对应的音，单个或多个，如 `/eɪ/`、`/sp/ /st/` */
  sound: string
  /** 规则说明（一句话讲清为什么） */
  tip: string
  examples: PhonicsExample[]
}

export interface PhonicsStage {
  id: PhonicsStageId
  label: string
  hint: string
}

/** 音标分组顺序与说明 */
export const PHONEME_GROUPS: { id: PhonemeGroup; label: string; hint: string }[] = [
  { id: 'monophthong', label: '单元音', hint: '11 个 · 口型不变' },
  { id: 'diphthong', label: '双元音', hint: '8 个 · 两个音滑动' },
  { id: 'consonant', label: '辅音', hint: '24 个 · 清浊成对' },
  { id: 'cluster', label: '辅音连缀', hint: '4 个 · 组合发音' },
]

/** 自然拼读的 7 个学习阶段（按「先字母音、再拼读、最后词尾规则」的顺序） */
export const PHONICS_STAGES: PhonicsStage[] = [
  { id: 1, label: '字母音', hint: '26 个字母在单词里怎么读' },
  { id: 2, label: '短元音拼读', hint: 'CVC 三字母词，先拼后读' },
  { id: 3, label: '辅音组合', hint: 'bl / sh / th / ck 等连缀与二合字母' },
  { id: 4, label: '魔法 e', hint: 'a_e / i_e / o_e 让元音变字母名' },
  { id: 5, label: '元音组合', hint: 'ai / ee / oa / oo 等双元音拼写' },
  { id: 6, label: 'r 音节', hint: 'ar / or / er / air 卷舌组合' },
  { id: 7, label: '词尾与例外', hint: '-s / -ed / -tion、不发音字母' },
]
