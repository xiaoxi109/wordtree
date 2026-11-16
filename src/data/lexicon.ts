import { ALL_WORDS, CORE_WORDS } from './index'
import { ECDICT_EXAMPLES } from './generated/ecdict-examples'
import { guessScene } from './sceneRules'
import { categoryOf, isCommon } from './generated/categories'
import type { Word } from './types'

/**
 * 词典层（懒加载）
 * ================
 * 课程词表（CORE_WORDS，约 4.6k）随主包同步加载；
 * ECDICT 补充的约 1.9 万词（含 ~1.5 万 C1）只在空闲时动态 import，
 * 加载完成后**原地追加**到 ALL_WORDS，查词 / 搜索自动覆盖，
 * 而学习、进度、晋级始终只读 CORE_WORDS，口径不受影响。
 */

const norm = (s: string) => s.toLowerCase().normalize('NFKC').replace(/[^a-z0-9'-]/g, '')

let loading: Promise<void> | null = null
let loaded = false
let version = 0
const listeners = new Set<() => void>()

export function getLexiconVersion(): number {
  return version
}

export function isLexiconLoaded(): boolean {
  return loaded
}

export function subscribeLexicon(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** 当前可查的全部词（加载完成后即包含扩展词）。 */
export function getLexicon(): Word[] {
  return ALL_WORDS
}

export function getLexiconTotal(): number {
  return ALL_WORDS.length
}

/** 空闲时调用：把扩展词并入 ALL_WORDS（幂等，可重复调用）。 */
export function ensureExtraLoaded(): Promise<void> {
  if (loaded) return Promise.resolve()
  if (loading) return loading
  loading = (async () => {
    try {
      const { ECDICT_EXTRA } = await import('./generated/ecdict-extra')
      const seen = new Set(CORE_WORDS.map((w) => norm(w.word)))
      for (const w of ECDICT_EXTRA) {
        const k = norm(w.word)
        if (!k || seen.has(k)) continue
        seen.add(k)
        ALL_WORDS.push({
          ...w,
          category: w.category ?? guessScene(w.meaning, w.pos) ?? categoryOf(w.word),
          common: isCommon(w.word),
          examples: ECDICT_EXAMPLES[w.word] ?? w.examples ?? [],
        })
      }
      loaded = true
      version += 1
      listeners.forEach((fn) => fn())
    } catch {
      // 加载失败不影响主体功能：查词暂时只覆盖课程词表
      loaded = false
    } finally {
      loading = null
    }
  })()
  return loading
}
