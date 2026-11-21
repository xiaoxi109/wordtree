/**
 * 富字典运行时加载器（例句 / 短语 / 近义词）。
 *
 * 数据来自 tools/gen-rich-dict.ts 生成的 public/dicts/rich/<0..15>.json：
 * 194 个 typewords 词库去重后的约 3 万个唯一单词，按词哈希分成 16 片。
 * 分片按需加载（打开词条详情时才拉对应那一片），内存里最多保留若干片。
 *
 * 加载范式照抄 src/data/dictLoader.ts：cache / pending 双表去重。
 */
import { RICH_SHARDS, richKeyOf, richShardOf } from '../lib/richHash'

/** 例句 / 短语：英文 + 中文 */
export interface RichPhrase {
  en: string
  zh: string
}

/** 近义词：词性 + 该词性下的中文释义 + 近义词列表 */
export interface RichSynonym {
  pos: string
  meaning: string
  words: string[]
}

/** 归一化后的富数据条目 */
export interface RichEntry {
  examples: RichPhrase[]
  phrases: RichPhrase[]
  synonyms: RichSynonym[]
}

/** 磁盘格式：s=例句 p=短语 y=近义词 */
type RawEntry = {
  s?: [string, string][]
  p?: [string, string][]
  y?: [string, string, string[]][]
}

const EMPTY: RichEntry = { examples: [], phrases: [], synonyms: [] }

/** 已加载的分片（LRU：超过上限时淘汰最久未用的） */
const shards = new Map<number, Record<string, RawEntry>>()
const pending = new Map<number, Promise<Record<string, RawEntry> | null>>()
/** 最多缓存的分片数（每片约 1MB，8 片约 8MB 原始数据） */
const MAX_CACHED_SHARDS = 8

function touch(shard: number) {
  const value = shards.get(shard)
  if (!value) return
  shards.delete(shard)
  shards.set(shard, value)
}

/** 加载某一片（幂等、并发去重） */
export function loadRichShard(shard: number): Promise<Record<string, RawEntry> | null> {
  const index = Math.max(0, Math.min(RICH_SHARDS - 1, shard))
  const hit = shards.get(index)
  if (hit) {
    touch(index)
    return Promise.resolve(hit)
  }
  const inFlight = pending.get(index)
  if (inFlight) return inFlight

  const task = (async () => {
    try {
      const url = `${import.meta.env.BASE_URL}dicts/rich/${index}.json`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as Record<string, RawEntry>
      shards.set(index, data)
      while (shards.size > MAX_CACHED_SHARDS) {
        const oldest = shards.keys().next()
        if (oldest.done) break
        shards.delete(oldest.value)
      }
      return data
    } catch (err) {
      console.error(`[rich-dict] 分片 ${index} 加载失败`, err)
      return null
    } finally {
      pending.delete(index)
    }
  })()

  pending.set(index, task)
  return task
}

/** 同步取一份富数据（只查已加载的分片） */
export function getRichSync(word: string): RichEntry | null {
  const key = richKeyOf(word)
  if (!key) return null
  const data = shards.get(richShardOf(word))
  if (!data) return null
  const raw = data[key]
  if (!raw) return null
  return toEntry(raw)
}

/** 异步取一份富数据（必要时加载对应分片） */
export async function ensureRich(word: string): Promise<RichEntry | null> {
  const key = richKeyOf(word)
  if (!key) return null
  const data = await loadRichShard(richShardOf(word))
  if (!data) return null
  const raw = data[key]
  if (!raw) return null
  return toEntry(raw)
}

function toEntry(raw: RawEntry): RichEntry {
  return {
    examples: (raw.s ?? []).map(([en, zh]) => ({ en, zh })),
    phrases: (raw.p ?? []).map(([en, zh]) => ({ en, zh })),
    synonyms: (raw.y ?? []).map(([pos, meaning, words]) => ({ pos, meaning, words })),
  }
}

export { EMPTY as EMPTY_RICH_ENTRY }
export { RICH_SHARDS, richKeyOf, richShardOf }
