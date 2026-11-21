/**
 * 词条富数据 hook：把富字典（例句 / 短语 / 近义词）合并进当前词条。
 *
 * 合并口径：
 *   - 例句：课程词自带例句（已过积极语境过滤、质量更高）优先，
 *     不足时用富字典补齐；富字典例句同样过 positiveExamples 过滤。
 *   - 短语 / 近义词：只在富字典里有。
 *
 * 分片按需加载：打开词条详情时才拉对应那一片（约 1MB）。
 */
import { useEffect, useMemo, useState } from 'react'
import { ensureRich, type RichPhrase, type RichSynonym } from '../data/richDict'
import { positiveExamples } from '../lib/positiveExamples'
import type { Example } from '../data/types'

export interface RichEntryState {
  /** 合并后的例句（英文 + 中文） */
  examples: Example[]
  /** 短语搭配 */
  phrases: RichPhrase[]
  /** 近义词（按词性分组） */
  synonyms: RichSynonym[]
  /** 富数据是否还在加载 */
  loading: boolean
}

/** 例句去重合并：课程词例句在前，富字典例句补在后。 */
function mergeExamples(base: Example[], extra: RichPhrase[], meaning: string): Example[] {
  const seen = new Set<string>()
  const merged: Example[] = []
  for (const ex of [...base, ...extra]) {
    const key = (ex.en ?? '').trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    merged.push({ en: ex.en, zh: ex.zh })
  }
  return positiveExamples(merged, { meaning }).slice(0, 3)
}

/**
 * @param word 当前词条（可为 null）
 * @returns 合并后的例句 / 短语 / 近义词
 */
export function useRichEntry(
  word: { word: string; meaning: string; examples: Example[] } | null | undefined,
): RichEntryState {
  const wordKey = word?.word ?? ''
  const meaning = word?.meaning ?? ''
  const baseExamples = word?.examples ?? []

  const [rich, setRich] = useState<{ examples: RichPhrase[]; phrases: RichPhrase[]; synonyms: RichSynonym[] }>({
    examples: [],
    phrases: [],
    synonyms: [],
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!wordKey) {
      setRich({ examples: [], phrases: [], synonyms: [] })
      return
    }
    let alive = true
    setLoading(true)
    ensureRich(wordKey)
      .then((entry) => {
        if (!alive) return
        setRich(
          entry
            ? { examples: entry.examples, phrases: entry.phrases, synonyms: entry.synonyms }
            : { examples: [], phrases: [], synonyms: [] },
        )
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [wordKey])

  return useMemo(
    () => ({
      examples: mergeExamples(baseExamples, rich.examples, meaning),
      phrases: rich.phrases,
      synonyms: rich.synonyms,
      loading,
    }),
    [baseExamples, rich.examples, rich.phrases, rich.synonyms, meaning, loading],
  )
}
