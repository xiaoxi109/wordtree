import { PRE_A1 } from './preA1'
import { A1 } from './a1'
import { A2 } from './a2'
import { B1 } from './b1'
import { B2 } from './b2'
import { EXTENSION } from './extension'
import { CATEGORIES, categoryOf, isCommon } from './generated/categories'
import { CATEGORY_THEMES, WORD_THEME } from './themes'
import { PEP_GRADE_WORDS, type PepWord } from './pepGrades'
import { PEP_ENRICH } from './pepEnrich'
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
} as const

export { PRE_A1, A1, A2, B1, B2, EXTENSION, CATEGORIES }
export type { Level, LevelMeta, Word, CategoryId, GradeRung }

/* ----------------------------- 规范化键 ----------------------------- */
const norm = (s: string) => s.toLowerCase().normalize('NFKC').replace(/[^a-z0-9'-]/g, '')

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

// Step 1: CEFR 主库 + 扩展词，按规范化键去重
const CEFR_WORDS: Word[] = (() => {
  const raw: Word[] = [...PRE_A1, ...A1, ...A2, ...B1, ...B2, ...EXTENSION]
  const seen = new Set<string>()
  return raw.filter((w) => {
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
  return {
    ...w,
    grade,
    category: categoryOf(w.word),
    common: isCommon(w.word),
  }
})

// Step 4: PEP 专有词（不在 CEFR 库）补 level + 场景分类
const pepOnlyWords: Word[] = []
for (const g of PEP_GRADE_ORDER) {
  const list = PEP_GRADE_WORDS[g] as PepWord[]
  for (const pw of list) {
    const key = norm(pw.en)
    if (cefrKeys.has(key)) continue // CEFR 库已有，跳过
    if (pepWordToGrade.get(key) !== g) continue // 不是首次出现的年级
    const enrich = PEP_ENRICH[pw.en]
    pepOnlyWords.push({
      word: pw.en,
      level: GRADE_DEFAULT_LEVEL[g] ?? 'A1',
      ipa: enrich?.ipa || pw.phonetic,
      pos: '',
      meaning: pw.zh || pw.en,
      examples: enrich?.examples ?? [],
      category: categoryOf(pw.en),
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

/**
 * ALL_WORDS — 合并后的统一词库。
 * 每个词同时携带 grade（中式）和 level（西式），跨阶梯共享。
 * de-dup：CEFR 词优先（有完整释义/例句），PEP 专有词作为补充。
 */
export const ALL_WORDS: Word[] = [...cefrMerged, ...pepOnlyUnique]

// 注：扩展词已通过 `...EXTENSION` 全部并入，它们按各自的 level 归入对应分级，参与统计与浏览展示。
// PEP 专有词也已合并，pepOnly=true 可在 UI 上区分显示。

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
]

const COUNT: Record<Level, number> = { 'Pre-A1': 0, A1: 0, A2: 0, B1: 0, B2: 0 }
const GRADE_COUNT: Record<GradeRung, number> = {
  primary: 0, g7: 0, g8: 0, g9: 0, g10: 0, g11: 0, g12: 0,
  cet4: 0, cet6: 0, kaoyan: 0,
}
for (const w of ALL_WORDS) {
  COUNT[w.level]++
  if (w.grade) GRADE_COUNT[w.grade]++
}

export function countByLevel(level: Level): number {
  return COUNT[level]
}

export function countByGrade(grade: GradeRung): number {
  return GRADE_COUNT[grade] ?? 0
}

export const TOTAL = ALL_WORDS.length
