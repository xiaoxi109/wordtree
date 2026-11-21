import type { Level } from '../data/types'

/**
 * 书籍课程（typewords.cc 的「文章学习」资源）离线数据契约。
 *
 * 磁盘上的 JSON 用紧凑键名（见 BookFile*），运行时展开为下面这些结构。
 * 详见 tools/gen-book-bundles.ts（生成期）与 src/data/bookLoader.ts（运行期）。
 */

/** 句子里的一个词（含起止偏移，偏移相对句子英文原文） */
export interface BookToken {
  text: string
  start: number
  end: number
}

/** 课文中的一句（英文 + 中文对照 + 预切词 + 原书录音时间轴） */
export interface BookSentence {
  en: string
  zh: string
  tokens: BookToken[]
  /** 原书录音里这句话的开始时间（秒）；缺失表示这篇不做句级高亮 */
  start?: number
  /** 原书录音里这句话的结束时间（秒） */
  end?: number
}

/** 课文自带练习题 */
export interface BookQuestion {
  en: string
  zh: string
}

/** 原书录音引用 */
export interface BookAudioRef {
  /** 本地文件名（不含目录），运行时拼成 `${BASE_URL}books/audio/<bookId>/<key>` */
  key: string
  /** 远程兜底地址（typewords 静态资源） */
  remote: string
}

/** 一篇课文 */
export interface BookLesson {
  id: string
  /** 篇序号，从 1 开始 */
  index: number
  title: string
  titleZh: string
  question?: BookQuestion
  sentences: BookSentence[]
  /** NCE_4 等册的课文引用段落 */
  quote?: BookQuestion
  /** 课文出现的人物名 */
  people?: string[]
  audio?: BookAudioRef
}

/** 一册书 */
export interface BookMeta {
  id: string
  name: string
  description: string
  /** BASE_URL 相对路径，如 'books/covers/nce-1.png' */
  cover: string
  /** 篇数 */
  count: number
  level: Level
  /** 对应的词库 id（掌握进度互通用），如 'nce-new-1' */
  lexiconId: string
}

/* ---------------- 磁盘格式（紧凑） ---------------- */

export type BookFileToken = [text: string, start: number, end: number]

export interface BookFileSentence {
  /** 英文 */
  en: string
  /** 中文译文 */
  zh: string
  /** 预切词 [文本, 起, 止] */
  tk: BookFileToken[]
  /** 录音开始时间（秒） */
  s?: number
  /** 录音结束时间（秒） */
  e?: number
}

export interface BookFileLesson {
  id: string
  /** index */
  i: number
  /** title */
  t: string
  /** titleTranslate */
  tz: string
  /** question [英文, 中文] */
  q?: [string, string]
  /** sentences */
  s: BookFileSentence[]
  /** audio [本地文件名, 远程地址] */
  a?: [string, string]
  /** people */
  p?: string[]
  /** quote [英文, 中文] */
  q2?: [string, string]
}

export interface BookFile {
  id: string
  lessons: BookFileLesson[]
}
