/**
 * 本地数据库层（Dexie / IndexedDB）。
 *
 * 与「20k 词库」分离：词库是随 app 发布的只读静态资源；本库只存
 * 「用户数据 + 学习进度」，即后期云端同步要交换的部分。
 *
 * 设计要点：
 * - 两个表：word_progress（按词进度，可同步）+ user_settings（设置，可同步）。
 * - 字段与云端 schema 对齐（见对话中的同步契约），云端接入时零改动。
 * - 引擎为 Web 标准 IndexedDB，Android / iOS / 鸿蒙 WebView 全兼容。
 */

import Dexie, { type Table } from 'dexie'
import { SEED, DAY, gapOf } from './spaced'

/** 每个词的掌握与间隔重复状态（云端同步的最小单元）。 */
export interface WordProgressRow {
  wordId: string
  mastered: 0 | 1
  streak: number
  dueAt: number
  lastReview: number
  reviewCount: number
  updatedAt: number
}

/** 用户设置（单例行，id 固定为 1）。 */
export interface UserSettingsRow {
  id: 1
  ladder: 'cn' | 'en'
  myLevel: string
  display: 'both' | 'en' | 'zh'
  updatedAt: number
}

class LexiDB extends Dexie {
  wordProgress!: Table<WordProgressRow, string>
  userSettings!: Table<UserSettingsRow, number>

  constructor() {
    super('lexicore-user')
    this.version(1).stores({
      // 主键 wordId；mastered / dueAt / updatedAt 建索引便于查询与同步
      wordProgress: 'wordId, mastered, dueAt, updatedAt',
      userSettings: 'id',
    })
  }
}

export const db = new LexiDB()

/* ----------------------------- 读取 ----------------------------- */

export async function loadSettings(): Promise<UserSettingsRow | undefined> {
  return db.userSettings.get(1)
}

export async function loadAllProgress(): Promise<WordProgressRow[]> {
  return db.wordProgress.toArray()
}

/* ----------------------------- 写入 ----------------------------- */

/** 设置/取消某词掌握；取消掌握会重置连对并把该词置为「现在可复习」。 */
export async function setMasteredFlag(
  id: string,
  mastered: boolean,
  now = Date.now(),
): Promise<WordProgressRow> {
  const cur = await db.wordProgress.get(id)
  const base: WordProgressRow =
    cur ?? { wordId: id, mastered: 0, streak: 0, dueAt: now, lastReview: 0, reviewCount: 0, updatedAt: now }
  const next: WordProgressRow = {
    ...base,
    mastered: mastered ? 1 : 0,
    streak: mastered ? base.streak : 0,
    dueAt: mastered ? base.dueAt : now,
    updatedAt: now,
  }
  await db.wordProgress.put(next)
  return next
}

/** 记录一次复习作答，返回更新后的进度行（含新连对次数与下次到期时间）。 */
export async function recordReview(
  id: string,
  correct: boolean,
  now = Date.now(),
): Promise<WordProgressRow> {
  const cur = await db.wordProgress.get(id)
  const base: WordProgressRow =
    cur ?? { wordId: id, mastered: 0, streak: 0, dueAt: now, lastReview: 0, reviewCount: 0, updatedAt: now }
  const nextStreak = correct ? base.streak + 1 : 0
  const next: WordProgressRow = {
    ...base,
    mastered: correct ? base.mastered : 0,
    streak: nextStreak,
    dueAt: now + gapOf(nextStreak) * DAY,
    lastReview: now,
    reviewCount: base.reviewCount + 1,
    updatedAt: now,
  }
  await db.wordProgress.put(next)
  return next
}

/** 首次运行播种演示数据，让复习页一进入就有内容（已有数据则跳过）。 */
export async function seedUserDbIfEmpty(): Promise<void> {
  const count = await db.wordProgress.count()
  if (count > 0) return
  const now = Date.now()
  const rows: WordProgressRow[] = SEED.map(([id, s]) => ({
    wordId: id,
    mastered: 0,
    streak: s,
    dueAt: now - 3600e3, // 全部设为已到期
    lastReview: 0,
    reviewCount: 0,
    updatedAt: now,
  }))
  await db.wordProgress.bulkPut(rows)
}

/* --------------------- 未来云端同步（引擎无关 JSON） --------------------- */

/** 导出与云端 schema 对齐的同步负载；云端接入时直接 POST 此结构即可。 */
export async function exportSyncPayload() {
  const settings = await db.userSettings.get(1)
  const progress = await db.wordProgress.toArray()
  return { settings: settings ?? null, progress }
}
