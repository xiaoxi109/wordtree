import { useSyncExternalStore } from 'react'
import { getLexiconVersion, subscribeLexicon } from '../data/lexicon'

/**
 * 订阅词典层的加载版本：
 * 扩展词加载完成后 +1，依赖它的列表 / 搜索结果随之刷新。
 */
export function useLexiconVersion(): number {
  return useSyncExternalStore(subscribeLexicon, getLexiconVersion, getLexiconVersion)
}
