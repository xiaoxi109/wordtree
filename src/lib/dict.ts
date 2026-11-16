import { ALL_WORDS } from '../data'
import { getLexiconVersion, ensureExtraLoaded } from '../data/lexicon'
import { wordsByGrade } from '../data/grades'
import { wordKey } from './cluster'
import { wordVariants } from './parse'
import { IRREGULAR } from './vocab'

/**
 * 阅读页「任意词查词」用的本地词典索引。
 * 覆盖课程词表 + 人教补充词 +（懒加载完成后）ECDICT 扩展词，
 * 并按词形变体（复数/时态）折叠，因此 ordered → order、studies → study 也能查到。
 */
export interface DictEntry {
  key: string
  word: string
  ipa: string
  meaning: string
  level?: string
}

let cache: Map<string, DictEntry> | null = null
/** 索引对应的词典版本：扩展词加载后版本 +1，索引据此重建 */
let builtVersion = -1

function normalize(token: string): string {
  return token.toLowerCase().replace(/’/g, "'").trim()
}

export function dictIndex(): Map<string, DictEntry> {
  const version = getLexiconVersion()
  if (cache && builtVersion === version) return cache
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
  builtVersion = version
  return map
}

function lookupIn(map: Map<string, DictEntry>, token: string): DictEntry | null {
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

/** 查词：token 可为原文词形（含大小写、屈折、撇号变体）。 */
export function lookupWord(token: string): DictEntry | null {
  const hit = lookupIn(dictIndex(), token)
  if (hit) return hit
  // 没查到可能是扩展词还没加载：触发一次后台加载，用户再点一次即可命中
  void ensureExtraLoaded()
  return null
}
