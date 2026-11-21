import type {
  BookFile,
  BookFileLesson,
  BookFileSentence,
  BookFileToken,
  BookLesson,
  BookMeta,
  BookSentence,
  BookToken,
} from './bookTypes'

/**
 * 课文转换器：把 typewords 的原始文章数据转成 App 用的离线课文格式。
 *
 * 原始数据（public/dicts/en/article/NCE_x.json）形如：
 *   { id, title, titleTranslate, text, textTranslate, audioSrc, lrcPosition, question, nameList, quote }
 * 其中 text / textTranslate 用换行分隔句子（实测 NCE_1 用 \n\n，NCE_2/3/4 用 \n），
 * lrcPosition 是句级时间轴 [[start,end], ...]。
 *
 * 所有函数都是纯函数，便于 vitest 直接覆盖边界情况。
 */

/** 远端文章原始结构（只声明用到的字段） */
export interface RawArticle {
  id: number
  title: string
  titleTranslate: string
  text: string
  textTranslate: string
  audioSrc: string
  lrcPosition?: [number, number][] | null
  question?: { text?: string | null; translate?: string | null } | null
  nameList?: string[] | null
  quote?: { text?: string | null; translate?: string | null } | null
}

/** 远端书目原始结构 */
export interface RawBook {
  id: number
  enName: string
  name: string
  description: string
  url: string
  length: number
  cover: string
  tags?: string[]
}

/** 远端静态资源根地址 */
export const TYPEWORDS_FILE_HOST = 'https://files.typewords.cc'

/** 按换行切句（兼容 \n 与 \n\n 两种写法） */
export function splitLines(text: string): string[] {
  return (text || '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

/**
 * 把句子切成词（含标点），返回相对句子开头的偏移。
 * 词：字母（含连字符/撇号）、数字；其余非空白字符作为独立 token。
 */
export function tokenize(sentence: string): BookToken[] {
  const tokens: BookToken[] = []
  const re = /[A-Za-z]+(?:['’-][A-Za-z]+)*|\d+(?:[.,]\d+)?|[^\s]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(sentence)) !== null) {
    tokens.push({ text: m[0], start: m.index, end: m.index + m[0].length })
  }
  return tokens
}

/**
 * 中英句对齐：以英文句数为准，中文缺则补空串。
 * 实测 275 篇里 274 篇行数相等。
 */
export function alignSentences(
  text: string,
  textTranslate: string,
): { en: string[]; zh: string[] } {
  const en = splitLines(text)
  const zh = splitLines(textTranslate)
  const count = Math.max(en.length, zh.length)
  const enAligned: string[] = []
  const zhAligned: string[] = []
  for (let i = 0; i < count; i++) {
    enAligned.push(en[i] ?? '')
    zhAligned.push(zh[i] ?? '')
  }
  return { en: enAligned, zh: zhAligned }
}

/**
 * 句级时间轴对齐。
 * - 数量一致 → 直接 1:1 使用（实测约 95% 篇目）
 * - 数量偏差 ≤ 20% → 按比例线性插值（近似高亮）
 * - 偏差 > 20% 或缺失 → 返回空数组，该篇不做句级高亮
 */
export function alignTimeline(
  sentenceCount: number,
  lrc: [number, number][] | null | undefined,
): { start: number; end: number }[] {
  if (!lrc || lrc.length === 0 || sentenceCount <= 0) return []
  const pairs = lrc.filter(
    (p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]),
  )
  if (pairs.length === 0) return []

  if (pairs.length === sentenceCount) {
    return pairs.map((p) => ({ start: p[0], end: p[1] }))
  }

  // 偏差过大 → 放弃句级高亮，避免错位的高亮误导学习
  const deviation = Math.abs(pairs.length - sentenceCount) / sentenceCount
  if (deviation > 0.2) return []

  // 偏差在 20% 内 → 按句子中点在中位时间轴上插值（比等分整段更贴合实际语速）
  const globalStart = pairs[0][0]
  const globalEnd = pairs[pairs.length - 1][1]
  const globalSpan = globalEnd - globalStart
  if (!(globalSpan > 0)) return []
  const mids = pairs.map((p) => (p[0] + p[1]) / 2)

  const out: { start: number; end: number }[] = []
  for (let i = 0; i < sentenceCount; i++) {
    const t = globalStart + (globalSpan * (i + 0.5)) / sentenceCount
    let j = 0
    while (j < mids.length - 1 && mids[j + 1] < t) j++
    const a = pairs[j]
    const b = pairs[Math.min(j + 1, pairs.length - 1)]
    let start = a[0]
    let end = a[1]
    if (b !== a) {
      const denom = mids[Math.min(j + 1, mids.length - 1)] - mids[j]
      const ratio = denom > 0 ? (t - mids[j]) / denom : 0
      start = a[0] + (b[0] - a[0]) * ratio
      end = a[1] + (b[1] - a[1]) * ratio
    }
    out.push({ start: Number(start.toFixed(2)), end: Number(end.toFixed(2)) })
  }
  return out
}

/** 稳定短哈希（用于音频文件名），只依赖输入字符串 */
export function shortHash(input: string): string {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** 音频文件名：ASCII 安全，避免原名里的全角字符与空格 */
export function audioFileName(bookId: string, index: number, audioSrc: string): string {
  return `${bookId}-${String(index).padStart(3, '0')}-${shortHash(audioSrc)}.mp3`
}

/** 把一篇文章转成离线课文 */
export function buildLesson(bookId: string, index: number, raw: RawArticle): BookFileLesson {
  const { en, zh } = alignSentences(raw.text, raw.textTranslate)
  const timeline = alignTimeline(en.length, raw.lrcPosition)

  const sentences: BookFileSentence[] = en.map((line, i) => {
    const item: BookFileSentence = {
      en: line,
      zh: zh[i] ?? '',
      tk: tokenize(line).map((t) => [t.text, t.start, t.end] as BookFileToken),
    }
    const span = timeline[i]
    if (span) {
      item.s = span.start
      item.e = span.end
    }
    return item
  })

  const lesson: BookFileLesson = {
    id: `${bookId}-${String(index).padStart(3, '0')}`,
    i: index,
    t: (raw.title || '').trim(),
    tz: (raw.titleTranslate || '').trim(),
    s: sentences,
  }

  const qText = raw.question?.text?.trim()
  const qTrans = raw.question?.translate?.trim()
  if (qText) lesson.q = [qText, qTrans ?? '']

  const quoteText = raw.quote?.text?.trim()
  if (quoteText) lesson.q2 = [quoteText, raw.quote?.translate?.trim() ?? '']

  if (raw.nameList && raw.nameList.length > 0) lesson.p = raw.nameList

  if (raw.audioSrc) {
    lesson.a = [audioFileName(bookId, index, raw.audioSrc), TYPEWORDS_FILE_HOST + raw.audioSrc]
  }

  return lesson
}

/** 把一册书的原始文章转成离线课文文件 */
export function buildBookFile(bookId: string, articles: RawArticle[]): BookFile {
  return {
    id: bookId,
    lessons: articles.map((raw, i) => buildLesson(bookId, i + 1, raw)),
  }
}

/** 组装书目元数据 */
export function buildBookMeta(
  raw: RawBook,
  opts: { id: string; count: number; level: BookMeta['level']; lexiconId: string },
): BookMeta {
  return {
    id: opts.id,
    name: raw.name,
    description: (raw.description || '').trim(),
    cover: `books/covers/${opts.id}.png`,
    count: opts.count,
    level: opts.level,
    lexiconId: opts.lexiconId,
  }
}

/* ---------------- 磁盘格式 → 运行期结构 ---------------- */

export function expandSentence(sentence: BookFileSentence): BookSentence {
  const out: BookSentence = {
    en: sentence.en,
    zh: sentence.zh,
    tokens: sentence.tk.map((t) => ({ text: t[0], start: t[1], end: t[2] })),
  }
  if (typeof sentence.s === 'number' && typeof sentence.e === 'number') {
    out.start = sentence.s
    out.end = sentence.e
  }
  return out
}

export function expandLesson(lesson: BookFileLesson): BookLesson {
  const out: BookLesson = {
    id: lesson.id,
    index: lesson.i,
    title: lesson.t,
    titleZh: lesson.tz,
    sentences: lesson.s.map(expandSentence),
  }
  if (lesson.q) out.question = { en: lesson.q[0], zh: lesson.q[1] }
  if (lesson.q2) out.quote = { en: lesson.q2[0], zh: lesson.q2[1] }
  if (lesson.p && lesson.p.length > 0) out.people = lesson.p
  if (lesson.a) out.audio = { key: lesson.a[0], remote: lesson.a[1] }
  return out
}

export function expandBook(file: BookFile): BookLesson[] {
  return file.lessons.map(expandLesson)
}
