import type { LessonContent, LessonSegment } from './lib/parse'
import type { LessonCondition, LessonKind } from './lib/prompt'
import type { PoolWord } from './lib/cluster'

/**
 * AI 教程本地存储（IndexedDB）。
 * 正文与翻译体积大（一套课程可达 MB 级），localStorage 的 5MB 配额不够用。
 */

const DB_NAME = 'lexicore-ai'
const DB_VERSION = 1
const SETS = 'sets'
const LESSONS = 'lessons'

export type MarkState = 'known' | 'fuzzy' | 'unknown'
export type LessonStatus = 'pending' | 'ready' | 'failed'
export type SetStatus = 'generating' | 'ready' | 'partial' | 'failed'

export interface AiLessonSet {
  id: string
  createdAt: number
  title: string
  condition: LessonCondition
  /** 计划篇数 = 聚类组数 */
  total: number
  /** 已生成成功篇数 */
  done: number
  failed: number
  wordsCount: number
  status: SetStatus
  /** 已读篇数（首次打开即记为已读） */
  readCount?: number
  /** 上次读到第几篇（0 基），用于「继续阅读」 */
  lastIndex?: number
}

export type VocabItem = Pick<PoolWord, 'key' | 'word' | 'ipa' | 'meaning'> & { isReview?: boolean }

export interface AiLesson {
  id: string
  setId: string
  index: number
  kind: LessonKind
  sceneLabel: string
  title: string
  status: LessonStatus
  /** 该篇重点词（pending/failed 时也已保存，用于单篇重试） */
  words: VocabItem[]
  segments: LessonSegment[]
  /** 词键 → 三态标记 */
  marks: Record<string, MarkState>
  error?: string
  /** 重点词覆盖率 + 用词（已掌握词）占比（生成后校验） */
  coverage?: {
    hit: number
    total: number
    missing: string[]
    /** 来自已掌握词表的实词数 / 实词总数 */
    known?: number
    realWords?: number
  }
  /** 首次打开时间 */
  readAt?: number
}

let dbPromise: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(SETS)) db.createObjectStore(SETS, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(LESSONS)) {
        const store = db.createObjectStore(LESSONS, { keyPath: 'id' })
        store.createIndex('setId', 'setId', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => {
      dbPromise = null
      reject(req.error)
    }
  })
  return dbPromise
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export function newId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8)
  return `${prefix}-${Date.now().toString(36)}-${rand}`
}

/* ------------------------------- sets ------------------------------- */

export async function putSet(set: AiLessonSet): Promise<void> {
  const db = await open()
  const tx = db.transaction(SETS, 'readwrite')
  tx.objectStore(SETS).put(set)
  await txDone(tx)
}

export async function listSets(): Promise<AiLessonSet[]> {
  const db = await open()
  const tx = db.transaction(SETS, 'readonly')
  const all = await requestToPromise(tx.objectStore(SETS).getAll() as IDBRequest<AiLessonSet[]>)
  return all.sort((a, b) => b.createdAt - a.createdAt)
}

export async function getSet(id: string): Promise<AiLessonSet | null> {
  const db = await open()
  const tx = db.transaction(SETS, 'readonly')
  const r = await requestToPromise(tx.objectStore(SETS).get(id) as IDBRequest<AiLessonSet | undefined>)
  return r ?? null
}

/** 删除课程集及其全部篇目。 */
export async function deleteSet(id: string): Promise<void> {
  const db = await open()
  const tx = db.transaction([SETS, LESSONS], 'readwrite')
  tx.objectStore(SETS).delete(id)
  const idx = tx.objectStore(LESSONS).index('setId')
  const cursorReq = idx.openCursor(IDBKeyRange.only(id))
  cursorReq.onsuccess = () => {
    const cursor = cursorReq.result
    if (cursor) {
      cursor.delete()
      cursor.continue()
    }
  }
  await txDone(tx)
}

/* ------------------------------ lessons ----------------------------- */

export async function putLesson(lesson: AiLesson): Promise<void> {
  const db = await open()
  const tx = db.transaction(LESSONS, 'readwrite')
  tx.objectStore(LESSONS).put(lesson)
  await txDone(tx)
}

export async function listLessons(setId: string): Promise<AiLesson[]> {
  const db = await open()
  const tx = db.transaction(LESSONS, 'readonly')
  const idx = tx.objectStore(LESSONS).index('setId')
  const all = await requestToPromise(idx.getAll(IDBKeyRange.only(setId)) as IDBRequest<AiLesson[]>)
  return all.sort((a, b) => a.index - b.index)
}

export async function getLesson(id: string): Promise<AiLesson | null> {
  const db = await open()
  const tx = db.transaction(LESSONS, 'readonly')
  const r = await requestToPromise(tx.objectStore(LESSONS).get(id) as IDBRequest<AiLesson | undefined>)
  return r ?? null
}

/** 保存教程正文（生成完成时调用）。 */
export async function saveLessonContent(
  id: string,
  content: LessonContent,
  words: VocabItem[],
  sceneLabel: string,
  coverage?: {
    hit: number
    total: number
    missing: string[]
    known?: number
    realWords?: number
  },
): Promise<void> {
  const lesson = await getLesson(id)
  if (!lesson) return
  await putLesson({
    ...lesson,
    title: content.title,
    kind: content.kind,
    segments: content.segments,
    words,
    sceneLabel,
    coverage,
    status: 'ready',
    error: undefined,
  })
}

export async function saveLessonError(id: string, message: string): Promise<void> {
  const lesson = await getLesson(id)
  if (!lesson) return
  await putLesson({ ...lesson, status: 'failed', error: message })
}

/** 更新单篇的点词三态标记。 */
export async function saveLessonMark(id: string, key: string, state: MarkState): Promise<void> {
  const lesson = await getLesson(id)
  if (!lesson) return
  await putLesson({ ...lesson, marks: { ...lesson.marks, [key]: state } })
}

/** 首次打开某篇时记为已读，并同步课程集的已读进度。 */
export async function markLessonRead(id: string): Promise<void> {
  const lesson = await getLesson(id)
  if (!lesson || lesson.readAt) return
  await putLesson({ ...lesson, readAt: Date.now() })
  const set = await getSet(lesson.setId)
  if (set) await putSet({ ...set, readCount: (set.readCount ?? 0) + 1 })
}

/** 记住课程集上次读到第几篇，用于「继续阅读」。 */
export async function saveSetPosition(setId: string, index: number): Promise<void> {
  const set = await getSet(setId)
  if (!set) return
  await putSet({ ...set, lastIndex: index })
}
