/**
 * 富字典生成器（生成期脚本，不参与 App 运行时）
 *   npx tsx tools/gen-rich-dict.ts [选项]
 *   --concurrency=N   下载并发数（默认 6）
 *   --only=<enName>   只处理指定词库（调试用，可重复）
 *   --force           忽略本地缓存，重新下载
 *
 * 背景：scripts/gen-dict-bundles.mjs 导入 194 个 typewords 词库时只给
 * nce-new-1..4 保留了例句（且仅前 2 条），其余词库的 sentences / phrases /
 * synos 全部丢弃，导致 App 里点开单词几乎看不到例句。
 *
 * 产物：
 *   public/dicts/rich/<0..15>.json   富数据分片（按词哈希路由）
 *   src/data/generated/rich-stats.ts 统计信息（运行时用）
 *   .cache/rich-src/<enName>.json    上游整本词库缓存（gitignored，可断点续跑）
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { RICH_SHARDS, richKeyOf, richShardOf } from '../src/lib/richHash'

const ROOT = path.resolve(import.meta.dirname, '..')
const OUT_DIR = path.join(ROOT, 'public', 'dicts', 'rich')
const STATS_OUT = path.join(ROOT, 'src', 'data', 'generated', 'rich-stats.ts')
const CACHE_DIR = path.join(ROOT, '.cache', 'rich-src')
const LIST_URL = 'https://files.typewords.cc/list/word.json'
const DICT_BASE = 'https://files.typewords.cc/dicts'

const args = process.argv.slice(2)
const force = args.includes('--force')
const concurrency = Number(args.find((a) => a.startsWith('--concurrency='))?.split('=')[1] ?? 6)
const only = args.filter((a) => a.startsWith('--only=')).map((a) => a.split('=')[1])

const log = (m: string) => console.log(`[gen-rich] ${m}`)

interface RawEntry {
  word?: string
  sentences?: { c?: string; cn?: string }[]
  phrases?: { c?: string; cn?: string }[]
  synos?: { pos?: string; cn?: string; ws?: string[] | string }[]
}

interface DictItem {
  enName: string
  url: string
  language?: string
  length?: number
}

/** 分片内的一条富数据：s=例句 p=短语 y=近义词 */
type RichEntry = {
  s?: [string, string][]
  p?: [string, string][]
  y?: [string, string, string[]][]
}

const clean = (s: unknown): string => String(s ?? '').replace(/\s+/g, ' ').trim()

/** 上游的 ws 可能是数组，也可能是用 / 分隔的字符串。 */
function splitWs(ws: string[] | string | undefined): string[] {
  if (Array.isArray(ws)) return ws.map(clean).filter(Boolean)
  if (typeof ws === 'string') return ws.split('/').map(clean).filter(Boolean)
  return []
}

/** 抽出一条词条的富数据；缺字段就留空，不报错。 */
function extractRich(entry: RawEntry): RichEntry | null {
  const sentences = (entry.sentences ?? [])
    .map((s) => [clean(s.c), clean(s.cn)] as [string, string])
    .filter(([en, zh]) => en && zh)
  const phrases = (entry.phrases ?? [])
    .map((p) => [clean(p.c), clean(p.cn)] as [string, string])
    .filter(([en, zh]) => en && zh)
  const synos = (entry.synos ?? [])
    .map((y) => [clean(y.pos), clean(y.cn), splitWs(y.ws)] as [string, string, string[]])
    .filter(([pos, cn, ws]) => cn && ws.length > 0)
  if (!sentences.length && !phrases.length && !synos.length) return null
  const out: RichEntry = {}
  if (sentences.length) out.s = sentences
  if (phrases.length) out.p = phrases
  if (synos.length) out.y = synos
  return out
}

/** 同一单词跨词库合并时，取字段最全的一份（例句权重更高）。 */
function richScore(e: RichEntry): number {
  return (e.s?.length ?? 0) * 3 + (e.p?.length ?? 0) + (e.y?.length ?? 0)
}

/** 下载并缓存一本完整词库（整本 JSON，含 sentences/phrases/synos）。 */
async function loadDictFile(item: DictItem, retries = 3): Promise<RawEntry[] | null> {
  const dest = path.join(CACHE_DIR, `${item.enName}.json`)
  if (!force && existsSync(dest)) {
    try {
      return JSON.parse(await readFile(dest, 'utf8')) as RawEntry[]
    } catch {
      /* 缓存损坏则重新下载 */
    }
  }
  const url = `${DICT_BASE}/${item.language || 'en'}/word/${item.url}`
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const rows = (await res.json()) as RawEntry[]
      await mkdir(CACHE_DIR, { recursive: true })
      await writeFile(dest, JSON.stringify(rows), 'utf8')
      return rows
    } catch (err) {
      if (attempt === retries) {
        console.error(`[gen-rich] 下载失败 ${item.enName}：${String(err)}`)
        return null
      }
      await new Promise((r) => setTimeout(r, 800 * attempt))
    }
  }
  return null
}

async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let cursor = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const i = cursor++
        if (i >= items.length) return
        await worker(items[i])
      }
    }),
  )
}

async function main() {
  const listRes = await fetch(LIST_URL)
  if (!listRes.ok) throw new Error(`list: HTTP ${listRes.status}`)
  const catalog = (await listRes.json()) as DictItem[]
  const items = only.length ? catalog.filter((x) => only.includes(x.enName)) : catalog
  log(`词库目录 ${catalog.length} 个，本次处理 ${items.length} 个`)

  const rich = new Map<string, RichEntry>()
  let processed = 0
  let failed = 0

  await runPool(items, concurrency, async (item) => {
    const rows = await loadDictFile(item)
    if (!rows) {
      failed += 1
      return
    }
    for (const row of rows) {
      const key = richKeyOf(row.word ?? '')
      if (!key) continue
      const entry = extractRich(row)
      if (!entry) continue
      const prev = rich.get(key)
      if (!prev || richScore(entry) > richScore(prev)) rich.set(key, entry)
    }
    processed += 1
    if (processed % 10 === 0) log(`已处理 ${processed}/${items.length}，唯一词 ${rich.size}`)
  })

  log(`下载完成：成功 ${processed} 失败 ${failed}，唯一词 ${rich.size}`)

  // 分片输出
  const shards: Record<string, Record<string, RichEntry>> = {}
  for (let i = 0; i < RICH_SHARDS; i += 1) shards[String(i)] = {}
  for (const [key, entry] of rich) {
    shards[String(richShardOf(key))][key] = entry
  }

  await mkdir(OUT_DIR, { recursive: true })
  let totalBytes = 0
  let withExamples = 0
  let withPhrases = 0
  let withSynonyms = 0
  for (let i = 0; i < RICH_SHARDS; i += 1) {
    const body = JSON.stringify(shards[String(i)])
    totalBytes += Buffer.byteLength(body)
    await writeFile(path.join(OUT_DIR, `${i}.json`), body, 'utf8')
  }
  for (const entry of rich.values()) {
    if (entry.s?.length) withExamples += 1
    if (entry.p?.length) withPhrases += 1
    if (entry.y?.length) withSynonyms += 1
  }

  const stats = {
    words: rich.size,
    withExamples,
    withPhrases,
    withSynonyms,
    shards: RICH_SHARDS,
    bytes: totalBytes,
  }
  const statsTs = [
    '// AUTO-GENERATED by tools/gen-rich-dict.ts — 请勿手工编辑。',
    '',
    '/** 富字典统计：覆盖了多少词、各字段覆盖率、分片数与总体积（字节）。 */',
    'export const RICH_STATS = {',
    `  words: ${stats.words},`,
    `  withExamples: ${stats.withExamples},`,
    `  withPhrases: ${stats.withPhrases},`,
    `  withSynonyms: ${stats.withSynonyms},`,
    `  shards: ${stats.shards},`,
    `  bytes: ${stats.bytes},`,
    '} as const',
    '',
  ].join('\n')
  await writeFile(STATS_OUT, statsTs, 'utf8')

  log(
    `写出 ${RICH_SHARDS} 片，共 ${(totalBytes / 1024 / 1024).toFixed(1)}MB；` +
      `有例句 ${withExamples} / 有短语 ${withPhrases} / 有近义词 ${withSynonyms}`,
  )
}

await main()
