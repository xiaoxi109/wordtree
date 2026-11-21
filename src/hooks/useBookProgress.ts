import { useCallback, useSyncExternalStore } from 'react'
import {
  getBookEntry,
  loadBookProgress,
  markLessonRead,
  saveBookProgress,
  toggleFavorite,
  type BookProgressEntry,
  type BookProgressMap,
} from '../lib/bookProgress'

/**
 * 书籍进度的全局 store（模块级单例）。
 * 列表页与书页共享同一份数据，任何一处标记立刻同步到另一处。
 */

let store: BookProgressMap = loadBookProgress()
const subscribers = new Set<() => void>()

function snapshot(): BookProgressMap {
  return store
}

function subscribe(fn: () => void): () => void {
  subscribers.add(fn)
  return () => {
    subscribers.delete(fn)
  }
}

function commit(next: BookProgressMap): void {
  store = next
  saveBookProgress(store)
  subscribers.forEach((fn) => fn())
}

/** 读取整份进度表（订阅式） */
export function useBookProgressMap(): BookProgressMap {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

/** 读取某册进度（订阅式） */
export function useBookEntry(bookId: string): BookProgressEntry {
  const map = useBookProgressMap()
  return getBookEntry(map, bookId)
}

/** 标记一篇已学 */
export function useMarkLessonRead(): (bookId: string, lessonId: string) => void {
  return useCallback((bookId: string, lessonId: string) => {
    commit(markLessonRead(store, bookId, lessonId))
  }, [])
}

/** 切换收藏 */
export function useToggleFavorite(): (bookId: string, lessonId: string) => void {
  return useCallback((bookId: string, lessonId: string) => {
    commit(toggleFavorite(store, bookId, lessonId))
  }, [])
}
