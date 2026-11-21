/**
 * 富字典（例句 / 短语 / 近义词）的分片路由。
 *
 * 194 个 typewords 词库共 27 万条词条，去重后只有约 3.2 万个唯一单词；
 * 同一单词在不同词库里的例句、短语、近义词完全一致，因此富数据按「词」去重、
 * 跨词库共享，再按词哈希切成若干片，运行时按需加载其中一片。
 *
 * 生成脚本（tools/gen-rich-dict.ts）与运行时（src/data/richDict.ts）
 * 必须使用同一套分片规则，这里是唯一实现。
 */
import { normWord } from './normalize'

/** 分片数量：16 片 ≈ 每片 1.2MB（31,972 词全量时）。 */
export const RICH_SHARDS = 16

/** FNV-1a 32 位哈希。 */
export function fnv1a(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

/** 富字典里的词键（归一化后的小写词形）。 */
export function richKeyOf(word: string): string {
  return normWord(word)
}

/** 某个词落在哪一片。 */
export function richShardOf(word: string): number {
  return fnv1a(richKeyOf(word)) % RICH_SHARDS
}
