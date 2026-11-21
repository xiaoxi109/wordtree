/**
 * 书籍课程数据生成器（生成期脚本，不参与 App 运行时）
 *   npx tsx tools/gen-book-bundles.ts [选项]
 *   --only-text / --audio-only / --dry-run / --force / --concurrency=N
 *
 * 产物：
 *   public/books/<bookId>.json          每册课文
 *   public/books/covers/<bookId>.png     书本封面
 *   src/data/generated/book-catalog.ts   书目目录（运行时用）
 *   .cache/book-audio/<bookId>/*.mp3     原书录音缓存（gitignored，构建期拷进 dist）
 */
import { createWriteStream } from 'node:fs'
import { existsSync } from 'node:fs'
import { mkdir, stat, writeFile, copyFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import path from 'node:path'
import {
  buildBookFile,
  buildBookMeta,
  TYPEWORDS_FILE_HOST,
  type RawArticle,
  type RawBook,
} from '../src/lib/bookTransform'
import type { BookMeta } from '../src/lib/bookTypes'

const ROOT = path.resolve(import.meta.dirname, '..')
const OUT_DIR = path.join(ROOT, 'public', 'books')
const COVER_OUT_DIR = path.join(OUT_DIR, 'covers')
const CATALOG_OUT = path.join(ROOT, 'src', 'data', 'generated', 'book-catalog.ts')
const AUDIO_CACHE_DIR = path.join(ROOT, '.cache', 'book-audio')
const COVER_SRC_DIR = process.env.TYPEWORDS_REPO
  ? path.join(process.env.TYPEWORDS_REPO, 'public', 'imgs', 'covers')
  : 'E:/gitHub/records/TypeWords/public/imgs/covers'

const BOOK_MAP: Record<string, { id: string; lexiconId: string; level: BookMeta['level'] }> = {
  nce1: { id: 'nce-1', lexiconId: 'nce-new-1', level: 'A1' },
  nce2: { id: 'nce-2', lexiconId: 'nce-new-2', level: 'A2' },
  nce3: { id: 'nce-3', lexiconId: 'nce-new-3', level: 'B1' },
  nce4: { id: 'nce-4', lexiconId: 'nce-new-4', level: 'B2' },
}

const args = process.argv.slice(2)
const onlyText = args.includes('--only-text')
const audioOnly = args.includes('--audio-only')
const dryRun = args.includes('--dry-run')
const force = args.includes('--force')
const concurrency = Number(args.find((a) => a.startsWith('--concurrency='))?.split('=')[1] ?? 12)

const log = (m: string) => console.log(`[gen-books] ${m}`)

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    console.error(`[gen-books] 请求失败 ${res.status} ${url}`)
    throw new Error(`fetch failed: ${url}`)
  }
  return (await res.json()) as T
}

async function downloadAudio(
  bookId: string,
  fileName: string,
  url: string,
  retries = 3,
): Promise<'ok' | 'skip' | 'fail'> {
  const dir = path.join(AUDIO_CACHE_DIR, bookId)
  const dest = path.join(dir, fileName)
  try {
    const head = await fetch(url, { method: 'HEAD' })
    const remoteSize = Number(head.headers.get('content-length') ?? 0)
    if (!force && existsSync(dest)) {
      const local = await stat(dest)
      if (!remoteSize || local.size === remoteSize) return 'skip'
    }
    await mkdir(dir, { recursive: true })
    const res = await fetch(url)
    if (!res.ok || !res.body) {
      console.error(`[gen-books] 音频下载失败 ${res.status} ${url}`)
      return 'fail'
    }
    await pipeline(Readable.fromWeb(res.body as never), createWriteStream(dest))
    return 'ok'
  } catch (err) {
    if (retries > 1) {
      await new Promise((r) => setTimeout(r, 800))
      return downloadAudio(bookId, fileName, url, retries - 1)
    }
    console.error(`[gen-books] 音频下载异常 ${url}：${String(err)}`)
    return 'fail'
  }
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

function catalogSource(metas: BookMeta[]): string {
  const body = metas
    .map(
      (m) =>
        `  {\n` +
        `    id: ${JSON.stringify(m.id)},\n` +
        `    name: ${JSON.stringify(m.name)},\n` +
        `    description: ${JSON.stringify(m.description)},\n` +
        `    cover: ${JSON.stringify(m.cover)},\n` +
        `    count: ${m.count},\n` +
        `    level: ${JSON.stringify(m.level)},\n` +
        `    lexiconId: ${JSON.stringify(m.lexiconId)},\n` +
        `  },`,
    )
    .join('\n')
  return [
    '/**',
    ' * 书籍课程目录（自动生成，勿手改）',
    ' *   由 tools/gen-book-bundles.ts 生成，数据源：typewords.cc 的「文章学习」资源',
    ' *   重新生成：npm run gen:books',
    ' */',
    "import type { BookMeta } from '../../lib/bookTypes'",
    '',
    'export const BOOK_CATALOG: BookMeta[] = [',
    body,
    ']',
    '',
  ].join('\n')
}

async function main() {
  log('拉取书目…')
  const rawBooks = await fetchJson<RawBook[]>(`${TYPEWORDS_FILE_HOST}/list/article.json`)
  const books = rawBooks.filter((b) => BOOK_MAP[b.enName])
  if (books.length === 0) {
    console.error('[gen-books] 远端书目里没有可识别的教材，终止')
    return
  }
  log(`识别到 ${books.length} 册：${books.map((b) => b.enName).join(', ')}`)

  const metas: BookMeta[] = []
  const audioJobs: { bookId: string; fileName: string; url: string }[] = []

  for (const raw of books) {
    const map = BOOK_MAP[raw.enName]
    const bookId = map.id
    log(`处理 ${raw.name}（${bookId}）…`)
    const articles = await fetchJson<RawArticle[]>(
      `${TYPEWORDS_FILE_HOST}/dicts/en/article/${raw.url}`,
    )
    log(`  课文 ${articles.length} 篇`)

    const file = buildBookFile(bookId, articles)
    const json = JSON.stringify(file)
    if (!dryRun && !audioOnly) {
      await mkdir(OUT_DIR, { recursive: true })
      await writeFile(path.join(OUT_DIR, `${bookId}.json`), json, 'utf-8')
      log(`  写入 public/books/${bookId}.json（${(json.length / 1024).toFixed(0)} KB）`)
    }

    if (!dryRun && !audioOnly) {
      const src = path.join(COVER_SRC_DIR, `${bookId}.png`)
      await mkdir(COVER_OUT_DIR, { recursive: true })
      if (existsSync(src)) {
        await copyFile(src, path.join(COVER_OUT_DIR, `${bookId}.png`))
        log(`  封面 ${bookId}.png`)
      } else {
        console.error(`[gen-books] 缺少封面素材：${src}`)
      }
    }

    metas.push(buildBookMeta(raw, { id: bookId, count: articles.length, ...map }))
    for (const lesson of file.lessons) {
      if (lesson.a) audioJobs.push({ bookId, fileName: lesson.a[0], url: lesson.a[1] })
    }
  }

  if (!dryRun && !audioOnly) {
    await writeFile(CATALOG_OUT, catalogSource(metas), 'utf-8')
    log(`写入 ${path.relative(ROOT, CATALOG_OUT)}`)
  }

  if (onlyText) {
    log('--only-text：跳过音频下载')
    return
  }

  log(`下载音频 ${audioJobs.length} 个（并发 ${concurrency}）…`)
  let ok = 0
  let skip = 0
  let fail = 0
  const t0 = Date.now()
  await runPool(audioJobs, concurrency, async (job) => {
    const r = await downloadAudio(job.bookId, job.fileName, job.url)
    if (r === 'ok') ok++
    else if (r === 'skip') skip++
    else fail++
    const done = ok + skip + fail
    if (done % 20 === 0 || done === audioJobs.length) {
      const pct = ((done / audioJobs.length) * 100).toFixed(0)
      const mb = ((ok * 2.2) / 1024).toFixed(0)
      log(`  ${done}/${audioJobs.length}（${pct}%） 新增约 ${mb}MB 用时 ${((Date.now() - t0) / 1000).toFixed(0)}s`)
    }
  })
  log(`音频完成：新增 ${ok} / 跳过 ${skip} / 失败 ${fail}`)
  if (fail > 0) console.error(`[gen-books] 有 ${fail} 个音频缺失，重新运行可断点续传`)
}

main().catch((err) => {
  console.error('[gen-books] 执行失败：', err)
  process.exitCode = 1
})
