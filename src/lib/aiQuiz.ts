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

/**
 * AI 题型：不再只有「看词选义」，让模型根据关卡创作不同考法。
 *  - meaning  看英文选中文释义（经典）
 *  - cloze    中文情境句填空，选英文词（考用法）
 *  - synonym  看词选最接近的近义词（考辨析）
 *  - antonym  看词选反义词（考对立）
 *  - root     给词根/词缀线索猜词（考构词）
 */
export type AiQuestionKind = 'meaning' | 'cloze' | 'synonym' | 'antonym' | 'root'

/** 一道 AI 题的规划结果（词都在候选池内）。 */
export interface AiItem {
  /** 目标词 */
  word: string
  /** 3 个干扰词 */
  distractors: string[]
  /** 一句话讲解（答错时展示） */
  note?: string
  /** 题型 */
  kind: AiQuestionKind
  /** cloze 题的中文情境句（用 ____ 占位）；root 题的词根提示 */
  promptText?: string
}

const QUIZ_KEY = 'lexicore-ai-quiz'

/** 模型字段安全取字符串。 */
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fallback
}

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
          '你是英语闯关出题官，擅长把单词考出花样。只输出一个 JSON 对象，不要解释、不要代码块围栏。\n' +
          '格式：{"items":[{"word":"目标词","kind":"meaning|cloze|synonym|antonym|root","promptText":"情境句或词根提示","distractors":["词1","词2","词3"],"note":"一句话讲解"}]}\n' +
          '硬性要求：\n' +
          '1. word 必须是候选表里的词；\n' +
          '2. distractors 必须是候选表里另外 3 个不同的词，不得编造；\n' +
          '3. 题型按题目顺序循环安排：meaning → cloze → synonym → antonym → root，每 5 题一轮；\n' +
          '4. cloze 题：promptText 写一句中文日常情境句，用「____」占位（答案是 word）；distractors 选词性相同、能塞进句子但语义不对的词；\n' +
          '5. synonym 题：distractors 选与目标词意思相近但不同的词；\n' +
          '6. antonym 题：distractors 选与目标词相关但并非反义的词（要有一个真反义词作答案）；\n' +
          '7. root 题：promptText 用中文拆解词根词缀给出线索（如「trans=横跨，port=港口」），不能直接说出词义；\n' +
          '8. meaning 题：promptText 留空；\n' +
          '9. note 用中文一句话（不超过 30 字）说明词义或易混点；\n' +
          '10. items 数量按要求给出。',
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

    const kindRaw = str(o.kind, 'meaning')
    const kind: AiQuestionKind =
      kindRaw === 'cloze' || kindRaw === 'synonym' || kindRaw === 'antonym' || kindRaw === 'root'
        ? kindRaw
        : 'meaning'
    const promptText = str(o.promptText, '').slice(0, 80)
    // cloze / root 必须有提示文本才成立，否则降级为经典题型
    seen.add(key)
    if ((kind === 'cloze' || kind === 'root') && !promptText) {
      out.push({ word: target, distractors, note: str(o.note, '') || undefined, kind: 'meaning' })
    } else {
      const note = str(o.note, '')
      out.push({
        word: target,
        distractors,
        note: note || undefined,
        kind,
        promptText: kind === 'meaning' ? undefined : promptText || undefined,
      })
    }
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
