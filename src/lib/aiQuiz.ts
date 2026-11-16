import { chatJSON } from './llm'
import { loadLlmConfig, isConfigReady } from '../config/llm'

/**
 * AI 出题：让模型从「候选词池」里挑出易混干扰项，并为每个题配一句讲解。
 *
 * 安全设计（关键）：
 *  - 模型只负责「挑选」与「解释」，**不负责给出正确答案**；
 *  - 正确答案与选项释义一律取自本地词库，所以 AI 出题不会把题做错；
 *  - 模型返回的词若不在候选池内，整题丢弃并回退到本地规则出题。
 *
 * 生成结果按「玩法 + 关卡 + 词池签名」缓存到 localStorage，避免重复请求与重复付费。
 */

export interface AiCandidate {
  word: string
  meaning: string
  pos?: string
}

/** 一道 AI 题的规划结果（词都在候选池内）。 */
export interface AiItem {
  /** 目标词 */
  word: string
  /** 3 个易混干扰词 */
  distractors: string[]
  /** 一句话讲解（答错时展示） */
  note?: string
}

const QUIZ_KEY = 'lexicore-ai-quiz'

/** 候选池签名：同一个池子才复用同一批题。 */
export function poolSignature(candidates: AiCandidate[]): string {
  const words = candidates.map((c) => c.word).sort()
  let h = 5381
  const s = words.join('|')
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0
  return `${words.length}-${h.toString(36)}`
}

function readCache(): Record<string, AiItem[]> {
  try {
    const raw = localStorage.getItem(QUIZ_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, AiItem[]> = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(v)) out[k] = v as AiItem[]
    }
    return out
  } catch {
    return {}
  }
}

function writeCache(map: Record<string, AiItem[]>): void {
  try {
    localStorage.setItem(QUIZ_KEY, JSON.stringify(map))
  } catch {
    /* 配额满：忽略 */
  }
}

export function getCachedAiItems(cacheKey: string): AiItem[] | undefined {
  return readCache()[cacheKey]
}

export function clearAiQuizCache(): void {
  try {
    localStorage.removeItem(QUIZ_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * 让模型挑干扰项 + 写讲解。
 * 返回的每一项都经过「词必须在候选池内」的校验，不合法的项直接丢弃。
 */
export async function generateAiItems(opts: {
  candidates: AiCandidate[]
  count: number
  /** 学习者水平描述，用于控制讲解难度 */
  level?: string
  /** 玩法提示（词义闪电选 / 听音辨词…） */
  game?: string
}): Promise<AiItem[]> {
  const cfg = loadLlmConfig()
  if (!isConfigReady(cfg)) return []
  const { candidates, count, level, game } = opts
  if (candidates.length < 8) return []

  const list = candidates
    .slice(0, 120)
    .map((c) => `${c.word}｜${c.pos ?? ''}｜${c.meaning}`)
    .join('\n')

  const json = await chatJSON(
    cfg,
    [
      {
        role: 'system',
        content:
          '你是英语出题助手。只输出一个 JSON 对象，不要解释、不要代码块围栏。\n' +
          '格式：{"items":[{"word":"目标词","distractors":["易混词1","易混词2","易混词3"],"note":"一句话讲解"}]}\n' +
          '硬性要求：\n' +
          '1. word 必须是候选表里的词；\n' +
          '2. distractors 必须是候选表里另外 3 个不同的词，尽量与目标词易混（同词性、近义、用法相近）；\n' +
          '3. 不得编造候选表之外的词；\n' +
          '4. note 用中文一句话（不超过 30 字）说明这个词的含义或用法要点；\n' +
          '5. items 数量按要求给出。',
      },
      {
        role: 'user',
        content:
          `玩法：${game ?? '词义闪电选'}\n` +
          `学习者水平：${level ?? 'A2 左右'}\n` +
          `请出 ${count} 道题。候选词表（格式：词｜词性｜释义）：\n${list}`,
      },
    ],
    { temperature: 0.6, maxTokens: 2000, timeoutMs: 45000 },
  )

  const rawItems = Array.isArray(json.items) ? (json.items as unknown[]) : []
  const wordSet = new Map(candidates.map((c) => [c.word.toLowerCase(), c.word]))
  const out: AiItem[] = []
  const seen = new Set<string>()

  for (const raw of rawItems) {
    if (!raw || typeof raw !== 'object') continue
    const o = raw as Record<string, unknown>
    const target = typeof o.word === 'string' ? wordSet.get(o.word.trim().toLowerCase()) : undefined
    if (!target) continue
    const key = target.toLowerCase()
    if (seen.has(key)) continue

    const distractors: string[] = []
    const rawDistractors = Array.isArray(o.distractors) ? o.distractors : []
    for (const d of rawDistractors) {
      if (typeof d !== 'string') continue
      const hit = wordSet.get(d.trim().toLowerCase())
      if (!hit || hit.toLowerCase() === key) continue
      if (distractors.includes(hit)) continue
      distractors.push(hit)
      if (distractors.length >= 3) break
    }
    if (distractors.length < 3) continue

    seen.add(key)
    const note = typeof o.note === 'string' ? o.note.trim() : ''
    out.push({ word: target, distractors, note: note || undefined })
    if (out.length >= count) break
  }
  return out
}

/** 生成并缓存（同一池子只问一次）。 */
export async function generateAndCacheAiItems(opts: {
  cacheKey: string
  candidates: AiCandidate[]
  count: number
  level?: string
  game?: string
}): Promise<AiItem[]> {
  const cached = getCachedAiItems(opts.cacheKey)
  if (cached && cached.length >= Math.min(3, opts.count)) return cached

  const items = await generateAiItems(opts)
  if (items.length > 0) {
    const map = readCache()
    map[opts.cacheKey] = items
    writeCache(map)
  }
  return items
}
