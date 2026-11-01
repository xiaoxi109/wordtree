import { ALL_WORDS } from '../data'
import { wordsByGrade } from '../data/grades'
import { wordKey } from './cluster'
import { wordVariants } from './parse'
import { IRREGULAR } from './vocab'

/**
 * 阅读页「任意词查词」用的本地词典索引。
 * 覆盖 CEFR 主库 + 人教补充词，并按词形变体（复数/时态）折叠，
 * 因此 ordered → order、studies → study 也能查到。
 */
export interface DictEntry {
  key: string
  word: string
  ipa: string
  meaning: string
  level?: string
}

/** 常见不规则变化 → 原形（故事里过去式密集，缺了会大量查不到）。 */

let cache: Map<string, DictEntry> | null = null

function normalize(token: string): string {
  return token.toLowerCase().replace(/’/g, "'").trim()
}

export function dictIndex(): Map<string, DictEntry> {
  if (cache) return cache
  const map = new Map<string, DictEntry>()

  const add = (word: string, ipa: string, meaning: string, level?: string) => {
    if (!word || !meaning) return
    const key = wordKey(word)
    const entry: DictEntry = { key, word, ipa, meaning, level }
    // 原形键优先（保证 buildWordIndex 之外的直接查词可用）
    if (!map.has(key)) map.set(key, entry)
    for (const v of wordVariants(word.toLowerCase())) {
      if (!map.has(v)) map.set(v, entry)
    }
  }

  for (const w of ALL_WORDS) add(w.word, w.ipa, w.meaning, w.level)
  for (const list of Object.values(wordsByGrade())) {
    for (const w of list) if (w.pepOnly) add(w.word, w.ipa, w.meaning)
  }

  cache = map
  return map
}

/** 查词：token 可为原文词形（含大小写、屈折、撇号变体）。 */
export function lookupWord(token: string): DictEntry | null {
  const map = dictIndex()
  const t = normalize(token)
  if (!t) return null
  const direct = map.get(t) ?? map.get(wordKey(t))
  if (direct) return direct
  const lemma = IRREGULAR[t]
  if (lemma) return map.get(wordKey(lemma)) ?? null
  // 简单去尾尝试：orders → order、running → run
  for (const suffix of ['s', 'es', 'ed', 'ing', 'd']) {
    if (t.length > suffix.length + 2 && t.endsWith(suffix)) {
      const base = t.slice(0, -suffix.length)
      const hit = map.get(wordKey(base)) ?? map.get(wordKey(base + 'e'))
      if (hit) return hit
    }
  }
  return null
}
