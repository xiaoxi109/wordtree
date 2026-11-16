import { PRE_A1 } from './preA1'
import { A1 } from './a1'
import { A2 } from './a2'
import { B1 } from './b1'
import { B2 } from './b2'
import { IDIOMS } from './idioms'
import { ECDICT_CORE } from './generated/ecdict-core'
import { ECDICT_EXAMPLES } from './generated/ecdict-examples'
import { MANUAL_EXAMPLES } from './generated/manual-examples'
import { guessScene } from './sceneRules'
import { isJunkWord, POS_OVERRIDE } from './lexiconQuality'
import { CATEGORIES, categoryOf, isCommon } from './generated/categories'
import { CATEGORY_THEMES, WORD_THEME } from './themes'
import { PEP_GRADE_WORDS, type PepWord } from './pepGrades'
import { PEP_ENRICH } from './pepEnrich'
import { positiveExamples } from '../lib/positiveExamples'
import type { Level, LevelMeta, Word, CategoryId, CategoryMeta, GradeRung } from './types'
import type { GradeId } from './grades'

/**
 * 数据来源与合规声明
 * -------------------
 * 1. 分级词汇（小学/初一/…/高三）：整理自开源词库 cyforkk/pep-english-words（MIT License，
 *    见 src/data/pepGrades.ts 头部声明），仅收录"人教版教材中出现过的单词"这一事实性词表，
 *    表述为"依据人教版教材整理"，不代表人教社官方授权。
 * 2. 下方单词主库（preA1/a1/a2/b1/b2 + 扩展包）的级别划分参考了 Oxford 3000 词汇表，
 *    实际释义/音标/例句数据由本项目通过公开词典接口整理，仅用于个人学习用途。
 *    若本应用转为公开/商业分发，建议将本部分替换为完全自由来源（如 CC 协议词典、有道公开接口），
 *    以避免对"Oxford 3000"名称及释义汇编的权利主张。
 */
export const DATA_DISCLAIMER = {
  grades: '分级词表依据人教版教材整理，来源：cyforkk/pep-english-words (MIT)',
  dictionary: '单词释义/音标/例句用于个人学习，来源非牛津官方授权',
  ecdict: '补充词层的释义/音标/考纲分级来源于 ECDICT (MIT, Copyright © 2025 Linwei)',
} as const

export { PRE_A1, A1, A2, B1, B2, CATEGORIES }
export type { Level, LevelMeta, Word, CategoryId, GradeRung }

/* ----------------------------- 规范化键 ----------------------------- */
const norm = (s: string) => s.toLowerCase().normalize('NFKC').replace(/[^a-z0-9'-]/g, '')

/**
 * 生成例句文件（ecdict-examples.ts）的键在生成时被规范化过：空格等符号会被去掉，
 * 因此 "in fact" 存成 "infact"。这里按同样的规范化建索引，保证短语词也能取到例句。
 */
const ECDICT_EXAMPLES_BY_NORM = new Map(
  Object.entries(ECDICT_EXAMPLES).map(([k, v]) => [norm(k), v] as const),
)

/* ----------------------------- PEP 词 → 年级 字典 ----------------------------- */
/**
 * 从 PEP 教材逐册词汇构建「规范化单词键 → 首次出现年级」字典。
 * 同一词出现在多册时取最低年级（小学 → 高三 顺序），作为该词的中式 rung。
 */
const PEP_GRADE_ORDER: GradeId[] = ['primary', 'g7', 'g8', 'g9', 'g10', 'g11', 'g12']
const pepWordToGrade = new Map<string, GradeRung>()
for (const g of PEP_GRADE_ORDER) {
  const list = PEP_GRADE_WORDS[g] as PepWord[]
  for (const pw of list) {
    const key = norm(pw.en)
    if (!pepWordToGrade.has(key)) pepWordToGrade.set(key, g as GradeRung)
  }
}

/* ----------------------------- 双阶梯默认映射 ----------------------------- */
/** CEFR 词不在 PEP 词表时，用 level → 默认 grade 兜底 */
const LEVEL_DEFAULT_GRADE: Record<Level, GradeRung> = {
  'Pre-A1': 'primary',
  'A1': 'g7',
  'A2': 'g8',
  'B1': 'g10',
  'B2': 'g12',
  'C1': 'cet6',
}

/** PEP 专有词（不在 CEFR 库）用 grade → 默认 level 兜底 */
const GRADE_DEFAULT_LEVEL: Record<string, Level> = {
  primary: 'Pre-A1',
  g7: 'A1',
  g8: 'A2',
  g9: 'A2',
  g10: 'B1',
  g11: 'B1',
  g12: 'B2',
  cet4: 'B2',
  cet6: 'B2',
  kaoyan: 'B2',
}

/* ----------------------------- 合并词库 ----------------------------- */
/**
 * 单一 20k 策展通用词层（v3 架构核心）：
 *   - CEFR 主库词 + 扩展词 → 补 PEP 年级（优先用 pepWordToGrade，否则 level→grade 兜底）
 *   - PEP 专有词（不在 CEFR 库）→ 补 CEFR level（grade→level 兜底）
 *   - 按规范化键去重：CEFR 词优先（有完整释义/例句）
 *   - 每个词同时携带 grade（中式 rung）和 level（西式 rung）
 */

// Step 1: CEFR 主库，按规范化键去重
//         同时过滤多词短语（含空格/逗号）—— 短语归到 idioms 场景单独管理
// 注：旧 COCA 扩展包质量不达标（含屈折变体、空释义、等级错标），已删除；
//     补充词层改由 ECDICT 生成（见 scripts/gen-ecdict.cjs → generated/ecdict.ts）。
const CEFR_WORDS: Word[] = (() => {
  const raw: Word[] = [...PRE_A1, ...A1, ...A2, ...B1, ...B2]
  const seen = new Set<string>()
  return raw.filter((w) => {
    if (/\s|,/.test(w.word)) return false               // 过滤 "have to" / "a, an" 等
    const k = norm(w.word)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
})()

// Step 2: 构建 CEFR 词键集合，用于判断 PEP 词是否为专有词
const cefrKeys = new Set<string>()
for (const w of CEFR_WORDS) cefrKeys.add(norm(w.word))

// Step 3: CEFR 词补 grade + 场景分类
const cefrMerged: Word[] = CEFR_WORDS.map((w) => {
  const key = norm(w.word)
  const grade = pepWordToGrade.get(key) ?? LEVEL_DEFAULT_GRADE[w.level]
  const word: Word = {
    ...w,
    grade,
    category: categoryOf(w.word),
    common: isCommon(w.word),
  }
  return word
})

// Step 4: PEP 专有词（不在 CEFR 库）补 level + 场景分类
const pepOnlyWords: Word[] = []
for (const g of PEP_GRADE_ORDER) {
  const list = PEP_GRADE_WORDS[g] as PepWord[]
  for (const pw of list) {
    const key = norm(pw.en)
    if (cefrKeys.has(key)) continue // CEFR 库已有，跳过
    if (pepWordToGrade.get(key) !== g) continue // 不是首次出现的年级
    if (/\s|,/.test(pw.en)) continue // 过滤 PEP 教材中的多词短语
    // 缩写、缩略形式、屈折变体、专有名词不进课程词表（查词仍可命中词典层）
    if (isJunkWord(pw.en, pw.zh || '')) continue

    const enrich = PEP_ENRICH[pw.en]
    // 主词库映射查不到时会落到 thinking 兜底，这时用中文释义再猜一次场景
    const baseCat = categoryOf(pw.en)
    const cat = baseCat === 'thinking' ? (guessScene(pw.zh || '', '') ?? baseCat) : baseCat
    pepOnlyWords.push({
      word: pw.en,
      level: GRADE_DEFAULT_LEVEL[g] ?? 'A1',
      ipa: enrich?.ipa || pw.phonetic,
      pos: POS_OVERRIDE[norm(pw.en)] ?? '',
      meaning: pw.zh || pw.en,
      examples: enrich?.examples ?? [],
      category: cat,
      pepOnly: true,
      grade: g,
    })
  }
}

// Step 5: 合并去重（双重保险：pepOnlyWords 之间也去重）
const pepSeen = new Set<string>()
const pepOnlyUnique = pepOnlyWords.filter((w) => {
  const k = norm(w.word)
  if (pepSeen.has(k)) return false
  pepSeen.add(k)
  return true
})

// Step 6: IDIOMS 短语 — 补 grade，直接合并（不会与单词层冲突）
const idiomsWithGrade: Word[] = IDIOMS.map((w) => ({
  ...w,
  grade: w.grade || LEVEL_DEFAULT_GRADE[w.level],
  category: w.category || 'idioms',
  common: isCommon(w.word),
}))

// Step 7: ECDICT 核心词（牛津 / 考纲词）——随主包加载，参与学习与晋级
const ecdictCore: Word[] = (() => {
  const seen = new Set<string>([...cefrKeys, ...pepOnlyUnique.map((w) => norm(w.word))])
  const out: Word[] = []
  for (const w of ECDICT_CORE) {
    const k = norm(w.word)
    if (!k || seen.has(k)) continue
    // 缩写 / 符号 / 人名地名 / 屈折变体不进课程词表
    if (isJunkWord(w.word, w.meaning)) continue
    seen.add(k)
    out.push({
      ...w,
      // 缺词性的正常词用覆盖表补上
      pos: POS_OVERRIDE[k] ?? w.pos,
      // ECDICT 词没有场景分类：先按释义规则猜，猜不到再回退到默认兜底
      category: w.category ?? guessScene(w.meaning, w.pos) ?? categoryOf(w.word),
      common: isCommon(w.word),
      examples: ECDICT_EXAMPLES[w.word] ?? ECDICT_EXAMPLES_BY_NORM.get(k) ?? w.examples ?? [],
    })
  }
  return out
})()

/**
 * CORE_WORDS — 课程词表（CEFR 主库 + PEP 教材专有词 + ECDICT 核心词 + 常用短语）。
 * 每个词同时携带 grade（中式）与 level（西式）；这是学习 / 进度 / 晋级的口径。
 *
 * 例句在此统一过滤消极语境并按积极度排序（见 lib/positiveExamples.ts）：
 * 这样词卡、词详情、点词弹层、复习闪卡、闯关提示拿到的都是同一份积极向上的例句，
 * 也无需改动上游自动生成的大量词库源文件。
 */
export const CORE_WORDS: Word[] = [...cefrMerged, ...pepOnlyUnique, ...ecdictCore, ...idiomsWithGrade].map((w) => {
  // 手写例句（batch-me-*）已逐条人工审核语义与语境，直接采用，不再走消极过滤。
  // 对原本就手写过的词：用它整体替换源例句；对只补了第 2 条的词：与源例句合并去重。
  const manual = MANUAL_EXAMPLES[norm(w.word)]
  if (manual && manual.length) {
    // 手写例句已逐条人工审核，直接采用；若不足 2 条，用过滤后的源例句补齐
    const source = positiveExamples(w.examples, { meaning: w.meaning })
    const seen = new Set<string>()
    const merged: typeof manual = []
    for (const e of [...manual, ...source]) {
      const key = e.en.trim().toLowerCase()
      if (!key || seen.has(key)) continue
      seen.add(key)
      merged.push(e)
    }
    return { ...w, examples: merged.slice(0, 3) }
  }
  return {
    ...w,
    examples: positiveExamples(w.examples, { meaning: w.meaning }),
  }
})

/**
 * ALL_WORDS — 词典全量（课程词表 + 词典扩展词）。
 *
 * 扩展词（ECDICT 按词频补充的约 1.9 万词）不打包进首屏，由 data/lexicon.ts
 * 在空闲时动态 import 后 **原地追加** 到这个数组里，因此查词 / 搜索会自动覆盖它们，
 * 而学习、进度、晋级始终只看 CORE_WORDS。
 */
export const ALL_WORDS: Word[] = [...CORE_WORDS]

/* ----------------------------- 场景分组 ----------------------------- */

export interface ThemeGroup {
  id: string
  label: string
  items: Word[]
}

export interface CategoryGroup {
  category: CategoryMeta
  themes: ThemeGroup[]
  count: number
}

function sortWords(arr: Word[]): Word[] {
  return arr.sort((a, b) => {
    if (!!a.common !== !!b.common) return a.common ? -1 : 1
    return a.word.localeCompare(b.word)
  })
}

/** Group words by scene category, preserving the canonical category order. */
export function groupByCategory(words: Word[]): CategoryGroup[] {
  const map = new Map<CategoryId, Word[]>()
  for (const w of words) {
    const id = w.category ?? 'thinking'
    if (!map.has(id)) map.set(id, [])
    map.get(id)!.push(w)
  }

  const result: CategoryGroup[] = []
  for (const c of CATEGORIES) {
    const items = map.get(c.id)
    if (!items || items.length === 0) continue

    const defs = CATEGORY_THEMES[c.id] ?? []
    const buckets = new Map<string, Word[]>()
    for (const d of defs) buckets.set(d.id, [])
    const other: Word[] = []

    for (const w of items) {
      const th = WORD_THEME[w.word]
      if (th && buckets.has(th)) buckets.get(th)!.push(w)
      else other.push(w)
    }

    const themes: ThemeGroup[] = []
    for (const d of defs) {
      const arr = buckets.get(d.id)!
      if (arr.length) themes.push({ id: d.id, label: d.label, items: sortWords(arr) })
    }
    if (other.length) {
      themes.push({ id: 'other', label: defs.length ? '其他' : '', items: sortWords(other) })
    }

    result.push({ category: c, themes, count: items.length })
  }
  return result
}

/* ----------------------------- 等级元数据 ----------------------------- */

export const LEVELS: LevelMeta[] = [
  { id: 'Pre-A1', label: 'Pre-A1', desc: '最基础 · 起步词汇', accent: 'emerald' },
  { id: 'A1', label: 'A1', desc: '基础 · 日常必备', accent: 'sky' },
  { id: 'A2', label: 'A2', desc: '进阶 · 表达更丰富', accent: 'violet' },
  { id: 'B1', label: 'B1', desc: '中级 · 独立运用', accent: 'amber' },
  { id: 'B2', label: 'B2', desc: '中高级 · 流利表达', accent: 'rose' },
  { id: 'C1', label: 'C1', desc: '高级 · 熟练驾驭', accent: 'indigo' },
]

const COUNT: Record<Level, number> = { 'Pre-A1': 0, A1: 0, A2: 0, B1: 0, B2: 0, C1: 0 }
const COUNT_CORE: Record<Level, number> = { 'Pre-A1': 0, A1: 0, A2: 0, B1: 0, B2: 0, C1: 0 }
const GRADE_COUNT: Record<GradeRung, number> = {
  primary: 0, g7: 0, g8: 0, g9: 0, g10: 0, g11: 0, g12: 0,
  cet4: 0, cet6: 0, kaoyan: 0,
}
const GRADE_COUNT_CORE: Record<GradeRung, number> = {
  primary: 0, g7: 0, g8: 0, g9: 0, g10: 0, g11: 0, g12: 0,
  cet4: 0, cet6: 0, kaoyan: 0,
}
// 计数只统计课程词表；扩展词由 data/lexicon.ts 动态加载，不参与学习口径
for (const w of CORE_WORDS) {
  COUNT[w.level]++
  COUNT_CORE[w.level]++
  if (w.grade) {
    GRADE_COUNT[w.grade]++
    GRADE_COUNT_CORE[w.grade]++
  }
}

export function countByLevel(level: Level, scope: 'all' | 'core' = 'all'): number {
  // 两个口径目前都只含课程词表（扩展词是词典层，不计入任何学习统计）
  return scope === 'core' ? COUNT_CORE[level] : COUNT[level]
}

export function countByGrade(grade: GradeRung, scope: 'all' | 'core' = 'all'): number {
  return (scope === 'core' ? GRADE_COUNT_CORE[grade] : GRADE_COUNT[grade]) ?? 0
}

/** 课程词表词数（学习 / 进度 / 晋级口径）；ALL_WORDS 会在扩展词加载后变大，故不用它 */
export const TOTAL = CORE_WORDS.length
export const TOTAL_CORE = CORE_WORDS.length
