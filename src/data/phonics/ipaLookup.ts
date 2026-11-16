import { CORE_WORDS } from '..'
import type { PhonicsExample } from './types'
import { AMERICAN_IPA } from './americanIpa'

/**
 * 例词音标：直接从课程词表补全，避免在拼读数据里手抄 400 多个音标（也避免抄错）。
 * 词表里没有的屈折形式（cats / walked / hottest…）在例词元组里显式写了 ipa。
 */
const IPA_BY_WORD = (() => {
  const map = new Map<string, string>()
  for (const w of CORE_WORDS) {
    if (!w.ipa) continue
    const key = w.word.toLowerCase()
    if (!map.has(key)) map.set(key, w.ipa)
  }
  return map
})()

/**
 * 词库里的音标写法不统一（`/siː/`、`miː; mi`、`dʒɪm` 都有），
 * 统一成 `/…/` 并把「; 备选读音」取第一个，避免界面上出现半个音标。
 */
export function formatIpa(raw: string): string {
  const first = raw.split(';')[0].trim()
  const body = first.replace(/^\/+|\/+$/g, '').trim()
  return body ? `/${body}/` : ''
}

/** 解析例词的完整音标：美式音标表优先，其次显式值，再退回课程词表；都没有返回 undefined */
export function exampleIpa(ex: PhonicsExample): string | undefined {
  const key = ex.w.toLowerCase()
  const raw = AMERICAN_IPA[key] ?? ex.ipa ?? IPA_BY_WORD.get(key)
  if (!raw) return undefined
  const formatted = formatIpa(raw)
  return formatted || undefined
}

/** 供测试与工具使用：某个单词在课程词表里的音标 */
export function lookupWordIpa(word: string): string | undefined {
  return IPA_BY_WORD.get(word.toLowerCase())
}
