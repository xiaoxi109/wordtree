import type { LessonFormatChoice, LessonKind, Difficulty } from './lib/prompt'
import type { TopicId } from './lib/cluster'
import type { CategoryId } from './data/types'
import type { LearningMode } from './lib/planner'

/**
 * AI 教程本地存储（IndexedDB）。
 *
 * 数据模型为 SQL 优先设计：四表归一化：
 *   lessons       — 主表（每篇一篇）
 *   lesson_segments — 段落表（一篇 N 段，position 有序）
 *   lesson_words    — 重点词表（AI 写作时要求覆盖的目标词）
 *   lesson_marks    — 点词三态标记表（word_key + lesson_id 联合唯一）
 *
 * IndexedDB 侧为减少查询次数采用「单文档嵌入」存法（lessons store 一条记录含完整 children），
 * 但对外导出的类型严格映射到四张 SQL 表的列定义，sql.ts 可直接遍历 Lesson + children 生成 DDL/INSERT。
 */

const DB_NAME = 'lexicore-ai'
const DB_VERSION = 3
const LESSONS = 'lessons'
const EVENTS = 'events'

// ========================= 类型（直接映射 SQL 列） =========================

export type WordMarkState = 'known' | 'fuzzy' | 'unknown'
export type LessonStatus = 'generating' | 'ready' | 'failed'

/** lessons 主表 */
export interface Lesson {
  id: string
  title: string
  kind: LessonKind
  generation_mode: LearningMode   // review | daily | stretch
  scene_label: string
  scene_category?: CategoryId
  condition_topic: TopicId
  condition_difficulty: Difficulty
  condition_format: LessonFormatChoice
  status: LessonStatus
  error?: string
  coverage_hit?: number
  coverage_total?: number
  coverage_known?: number
  coverage_real_words?: number
  /** 正文中「仅来自已掌握词」的实词数（区别于 coverage_known 的「已掌握+本篇重点词」） */
  coverage_mastered?: number
  read_at?: number
  created_at: number
  updated_at: number
  /** marks 从独立 LessonMark 表读，这里仅在 IndexedDB 文档里内嵌保存，不映射 SQL 列 */
  marks?: Record<string, WordMarkState>
}

/** lesson_segments 段落表 */
export interface LessonSegment {
  /** 入 IndexedDB 时可省略（由 lesson.id + position 拼接） */
  id?: string
  lesson_id?: string
  position: number
  speaker?: string
  en: string
  zh: string
}

/** lesson_words 重点词表 */
export interface LessonWord {
  id?: string
  lesson_id?: string
  position: number
  word_key: string
  word: string
  ipa: string
  meaning: string
  is_review: boolean
}

/** lesson_marks 点词标记表 */
export interface LessonMark {
  id?: string
  lesson_id?: string
  word_key: string
  state: WordMarkState
  updated_at: number
}

// ========================= 学习事件流 =========================

export type WordEventDirection = 'en→zh' | 'zh→en' | 'both'
export type WordEventGrade = 'known' | 'fuzzy' | 'unknown' | 'skipped'
export type WordEventSource = 'study' | 'ai_reader' | 'quiz' | 'import'

/**
 * 学习事件流（append-only）：StudyView 判级 / LessonReader 点词标记 / quiz 记录都写这里。
 * 聚合后得到 WordTrajectory（instability, known_rate_*_to_*, avg_reaction_ms 等）。
 */
export interface WordEvent {
  id?: number        // IndexedDB 自增主键
  word_key: string
  word: string
  direction: WordEventDirection
  source: WordEventSource
  grade: WordEventGrade
  reaction_ms?: number | null
  context_id?: string | null   // LessonReader: lessonId; StudyView: sessionId
  at: number                   // Unix ms
}

/**
 * IndexedDB 实际存储的文档结构：把四张 SQL 表的 children 嵌入主表一条记录里。
 * 读写函数对外仍暴露 Lesson + 三个数组，保证上层代码和 SQL 导出都走同一份模型。
 */
interface LessonDocument extends Lesson {
  segments: LessonSegment[]
  words: LessonWord[]
  marks: Record<string, WordMarkState>
}

// ========================= 底层 IndexedDB 封装 =========================

let dbPromise: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(LESSONS)) db.createObjectStore(LESSONS, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(EVENTS)) {
        const store = db.createObjectStore(EVENTS, { keyPath: 'id', autoIncrement: true })
        store.createIndex('word_key', 'word_key', { unique: false })
        store.createIndex('at', 'at', { unique: false })
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

// ========================= 公开 API =========================

/** 新建一篇课程（status='generating'，正文/段落稍后写入）。 */
export async function createLesson(input: Omit<
  Lesson,
  'id' | 'status' | 'created_at' | 'updated_at' | 'coverage_hit' | 'coverage_total' | 'coverage_known' | 'coverage_real_words'
> & { words: LessonWord[] }): Promise<Lesson> {
  const now = Date.now()
  const doc: LessonDocument = {
    ...input,
    id: newId('lesson'),
    status: 'generating',
    segments: [],
    words: input.words.map((w, i) => ({ ...w, position: w.position ?? i })),
    marks: {},
    created_at: now,
    updated_at: now,
  }
  const db = await open()
  const tx = db.transaction(LESSONS, 'readwrite')
  tx.objectStore(LESSONS).put(doc)
  await txDone(tx)
  return stripDoc(doc)
}

/** 列出全部课程，按 created_at 倒序（最新生成的在最上）。 */
export async function listLessons(): Promise<Lesson[]> {
  const db = await open()
  const tx = db.transaction(LESSONS, 'readonly')
  const all = await requestToPromise(tx.objectStore(LESSONS).getAll() as IDBRequest<LessonDocument[]>)
  return all.sort((a, b) => b.created_at - a.created_at).map(stripDoc)
}

export async function getLesson(id: string): Promise<Lesson | null> {
  const db = await open()
  const tx = db.transaction(LESSONS, 'readonly')
  const r = await requestToPromise(tx.objectStore(LESSONS).get(id) as IDBRequest<LessonDocument | undefined>)
  return r ? stripDoc(r) : null
}

/** 一次取全：Lesson + segments（按 position） + words（按 position） + marks 数组。 */
export interface FullLesson extends Omit<Lesson, 'marks'> {
  segments: LessonSegment[]
  words: LessonWord[]
  marks: LessonMark[]
}

export async function getLessonFull(id: string): Promise<FullLesson | null> {
  const doc = await getDoc(id)
  if (!doc) return null
  return {
    ...stripDoc(doc),
    segments: [...doc.segments].sort((a, b) => a.position - b.position),
    words: [...doc.words].sort((a, b) => a.position - b.position),
    marks: Object.entries(doc.marks).map(([word_key, state]) => ({
      word_key,
      state,
      updated_at: doc.updated_at,
    })),
  }
}

/** 取一篇的正文段落（按 position 排序）。 */
export async function getLessonSegments(id: string): Promise<LessonSegment[]> {
  const doc = await getDoc(id)
  if (!doc) return []
  return [...doc.segments].sort((a, b) => a.position - b.position)
}

/** 取一篇的重点词（按 position 排序）。 */
export async function getLessonWords(id: string): Promise<LessonWord[]> {
  const doc = await getDoc(id)
  if (!doc) return []
  return [...doc.words].sort((a, b) => a.position - b.position)
}

/** 取一篇的点词标记。 */
export async function getLessonMarks(id: string): Promise<LessonMark[]> {
  const doc = await getDoc(id)
  if (!doc) return []
  // 与 getLessonFull 保持同一时间口径：marks 内嵌在文档里，没有独立时间戳，
  // 不能用「读取时刻」伪造，否则 SQL 导出会把导出时间当成标记时间。
  return Object.entries(doc.marks).map(([word_key, state]) => ({
    word_key,
    state,
    updated_at: doc.updated_at,
  }))
}

/** 写入生成好的正文 + 段落 + 覆盖率，标记 ready。 */
export async function saveLessonContent(
  id: string,
  title: string,
  kind: LessonKind,
  segments: LessonSegment[],
  coverage: { hit: number; total: number; missing?: string[]; known?: number; realWords?: number; mastered?: number },
): Promise<void> {
  const sortedSegments = [...segments]
    .sort((a, b) => a.position - b.position)
    .map((seg, i) => ({ ...seg, position: i }))
  await updateDoc(id, (doc) => {
    doc.title = title
    doc.kind = kind
    doc.segments = sortedSegments
    doc.status = 'ready'
    doc.error = undefined
    doc.coverage_hit = coverage.hit
    doc.coverage_total = coverage.total
    doc.coverage_known = coverage.known
    doc.coverage_real_words = coverage.realWords
    doc.coverage_mastered = coverage.mastered
    doc.updated_at = Date.now()
  })
}

export async function saveLessonError(id: string, message: string): Promise<void> {
  await updateDoc(id, (doc) => {
    doc.status = 'failed'
    doc.error = message
    doc.updated_at = Date.now()
  })
}

export async function saveLessonMark(id: string, word_key: string, state: WordMarkState): Promise<void> {
  await updateDoc(id, (doc) => {
    doc.marks = { ...doc.marks, [word_key]: state }
    doc.updated_at = Date.now()
  })
}

export async function markLessonRead(id: string): Promise<void> {
  await updateDoc(id, (doc) => {
    if (doc.read_at) return
    doc.read_at = Date.now()
    doc.updated_at = Date.now()
  })
}

/** 删除单篇课程。 */
export async function deleteLesson(id: string): Promise<void> {
  const db = await open()
  const tx = db.transaction(LESSONS, 'readwrite')
  tx.objectStore(LESSONS).delete(id)
  await txDone(tx)
}

/** 删除全部课程（清理工具）。 */
export async function clearAllLessons(): Promise<void> {
  const db = await open()
  const tx = db.transaction(LESSONS, 'readwrite')
  tx.objectStore(LESSONS).clear()
  await txDone(tx)
}

// ========================= 内部：Document ↔ Lesson 转换 =========================

async function getDoc(id: string): Promise<LessonDocument | null> {
  const db = await open()
  const tx = db.transaction(LESSONS, 'readonly')
  const r = await requestToPromise(tx.objectStore(LESSONS).get(id) as IDBRequest<LessonDocument | undefined>)
  return r ?? null
}

/**
 * 单事务「读 → 改 → 写」，避免并发更新时后写者覆盖前写者。
 * IndexedDB 事务只在 request 成功的那个微任务内保持活跃，因此 mutate 必须同步，
 * 且 put 要紧跟 get 的 await（中间不能再 await 其他 Promise）。
 */
async function updateDoc(id: string, mutate: (doc: LessonDocument) => void): Promise<void> {
  const db = await open()
  const tx = db.transaction(LESSONS, 'readwrite')
  const store = tx.objectStore(LESSONS)
  const doc = await requestToPromise(store.get(id) as IDBRequest<LessonDocument | undefined>)
  if (!doc) return
  mutate(doc)
  store.put(doc)
  await txDone(tx)
}

/** 从 IndexedDB 文档裁出主表字段（children 通过独立 getter 取）。 */
function stripDoc(doc: LessonDocument): Lesson {
  const { segments: _s, words: _w, marks: _m, ...main } = doc
  return main
}

/** 从独立 getter 结果还原完整 LessonDocument（用于写回）。 */
export function assembleDoc(
  lesson: Lesson,
  segments: LessonSegment[],
  words: LessonWord[],
  marks: LessonMark[],
): LessonDocument {
  const markMap: Record<string, WordMarkState> = {}
  for (const m of marks) markMap[m.word_key] = m.state
  return {
    ...lesson,
    segments: segments.map((s, i) => ({ ...s, position: s.position ?? i })),
    words: words.map((w, i) => ({ ...w, position: w.position ?? i })),
    marks: markMap,
  }
}

// ========================= events store（学习事件流） =========================

/** 追加一条学习事件（append-only）。返回带 id 的完整事件。 */
export async function appendEvent(input: Omit<WordEvent, 'id'>): Promise<WordEvent> {
  const at = input.at ?? Date.now()
  const event: WordEvent = { ...input, at }
  delete (event as any).id
  const db = await open()
  const tx = db.transaction(EVENTS, 'readwrite')
  const id = await requestToPromise(tx.objectStore(EVENTS).add(event) as IDBRequest<number>)
  await txDone(tx)
  return { ...event, id }
}

/** 按 word_key 查询全部事件（按时间升序）。 */
export async function eventsByWord(wordKey: string): Promise<WordEvent[]> {
  const db = await open()
  const tx = db.transaction(EVENTS, 'readonly')
  const idx = tx.objectStore(EVENTS).index('word_key')
  const all = await requestToPromise(idx.getAll(wordKey) as IDBRequest<WordEvent[]>)
  return all.sort((a, b) => a.at - b.at)
}

/** 列出全部事件（按时间升序）。 */
export async function listEvents(): Promise<WordEvent[]> {
  const db = await open()
  const tx = db.transaction(EVENTS, 'readonly')
  const all = await requestToPromise(tx.objectStore(EVENTS).getAll() as IDBRequest<WordEvent[]>)
  return all.sort((a, b) => a.at - b.at)
}
