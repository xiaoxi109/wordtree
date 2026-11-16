import { chatJSON } from './llm'
import { loadLlmConfig, isConfigReady } from '../config/llm'

/**
 * AI 词条讲解：答错时给一句「为什么是它 / 别和谁混」的话。
 *
 * 设计要点：
 *  - 讲解按词缓存（localStorage），同一个词只问模型一次，之后离线可用；
 *  - 模型不可用时静默降级（返回 undefined），绝不影响闯关流程；
 *  - 讲解内容与题目解析相互独立，即使解释不准也不会让题目出错。
 */
const NOTES_KEY = 'lexicore-ai-notes'

export type NoteMap = Record<string, string>

function readNotes(): NoteMap {
  try {
    const raw = localStorage.getItem(NOTES_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: NoteMap = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim()) out[k] = v.trim()
    }
    return out
  } catch {
    return {}
  }
}

function writeNotes(map: NoteMap): void {
  try {
    localStorage.setItem(NOTES_KEY, JSON.stringify(map))
  } catch {
    /* 配额满：忽略，本次会话仍可用 */
  }
}

/** 取某词的缓存讲解。 */
export function getNote(word: string): string | undefined {
  return readNotes()[word.toLowerCase()]
}

/** 缓存某词的讲解。 */
export function setNote(word: string, note: string): void {
  const map = readNotes()
  map[word.toLowerCase()] = note
  writeNotes(map)
}

/** 已缓存的讲解条数。 */
export function noteCount(): number {
  return Object.keys(readNotes()).length
}

/**
 * 取讲解：有缓存直接返回；没有则调用模型生成一句（最多请求一次，失败返回 undefined）。
 * 并发调用会复用同一个 Promise，避免同一题重复请求。
 */
const inflight = new Map<string, Promise<string | undefined>>()

export function ensureNote(word: string, meaning: string): Promise<string | undefined> {
  const cached = getNote(word)
  if (cached) return Promise.resolve(cached)
  const key = word.toLowerCase()
  const running = inflight.get(key)
  if (running) return running

  const cfg = loadLlmConfig()
  if (!isConfigReady(cfg)) return Promise.resolve(undefined)

  const p = (async () => {
    try {
      const json = await chatJSON(
        cfg,
        [
          {
            role: 'system',
            content:
              '你是英语学习助教。用一句不超过 30 个汉字的话，为学习者解释这个单词：说清核心含义，并提示一个易混点或记忆线索。只输出这一句话，不要解释、不要引号、不要换行。',
          },
          { role: 'user', content: `单词：${word}\n释义：${meaning}` },
        ],
        { temperature: 0.4, maxTokens: 200 },
      )
      const text = typeof json.explanation === 'string'
        ? json.explanation
        : typeof json.note === 'string'
          ? json.note
          : typeof json.text === 'string'
            ? json.text
            : ''
      const note = text.replace(/^["'\u201c\u300c\s]+|["'\u201d\u300d\s]+$/g, '').trim()
      if (!note) return undefined
      setNote(word, note)
      return note
    } catch {
      return undefined
    } finally {
      inflight.delete(key)
    }
  })()

  inflight.set(key, p)
  return p
}
