import { expandBook } from '../lib/bookTransform'
import type { BookFile, BookLesson } from '../lib/bookTypes'

/**
 * 书籍课文加载器（public/books/<id>.json）。
 *
 * 数据随 App 一起打包在 assets/public 下，完全离线；沿用 dictLoader 的
 * cache / pending 模式，避免同一册重复解析大 JSON。
 */

const cache = new Map<string, BookLesson[]>()
const pending = new Map<string, Promise<BookLesson[]>>()

/** 读取一册书的课文。 */
export function loadBookLessons(bookId: string): Promise<BookLesson[]> {
  const hit = cache.get(bookId)
  if (hit) return Promise.resolve(hit)
  const inFlight = pending.get(bookId)
  if (inFlight) return inFlight

  const task = (async () => {
    const url = `${import.meta.env.BASE_URL}books/${encodeURIComponent(bookId)}.json`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`课文 ${bookId} 加载失败: HTTP ${res.status}`)
    const file = (await res.json()) as BookFile
    const lessons = expandBook(file)
    cache.set(bookId, lessons)
    pending.delete(bookId)
    return lessons
  })()

  pending.set(bookId, task)
  task.catch(() => pending.delete(bookId))
  return task
}

/** 某册课文是否已加载（用于避免重复渲染骨架屏）。 */
export function isBookLoaded(bookId: string): boolean {
  return cache.has(bookId)
}
