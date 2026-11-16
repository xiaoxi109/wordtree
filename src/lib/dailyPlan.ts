import { chatJSON } from './llm'
import { loadLlmConfig, isConfigReady } from '../config/llm'
import { listEvents } from '../db'
import { getDueCount } from './study'
import { getReviewWords } from './review'
import { getTotalStars } from './challengeProgress'

/**
 * 今日学习计划：把本地的学习数据汇总成一份「今天该做什么」，并可由模型给出更聪明的建议。
 *
 * 两层结构：
 *  - 本地层（永远可用、无需网络）：掌握数、到期复习、错词数、今日已练、闯关进度、正确率；
 *  - AI 层（可选）：把上面的摘要喂给模型，让它给出重点词、建议玩法与预计用时。
 *
 * AI 结果按天缓存（lexicore-daily-plan-YYYY-MM-DD），当天不重复请求。
 */

export interface DailyStats {
  masteredCount: number
  dueCount: number
  wrongCount: number
  todayStudied: number
  totalAnswered: number
  accuracy: number | null
  avgReactionMs: number | null
  stars: number
  clearedLevels: number
  /** 最近 7 天有学习记录的天数 */
  activeDays: number
}

export interface DailyAction {
  label: string
  detail: string
}

export interface DailyAdvice {
  headline: string
  actions: DailyAction[]
  minutes: number
  focusWords: string[]
  /** 来源：ai 表示模型生成，local 表示本地规则 */
  source: 'ai' | 'local'
}

/** 读取掌握词集合（与首页一致的口径）。 */
function readMastered(): Set<string> {
  try {
    const raw = localStorage.getItem('lexicore-mastered')
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((v): v is string => typeof v === 'string'))
  } catch {
    return new Set()
  }
}

function todayKey(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 汇总本地学习数据。 */
export async function collectDailyStats(): Promise<DailyStats> {
  const mastered = readMastered()
  const events = await listEvents()
  const now = Date.now()
  const dayStart = new Date().setHours(0, 0, 0, 0)

  const answered = events.filter((e) => e.grade === 'known' || e.grade === 'unknown')
  const todayEvents = answered.filter((e) => e.at >= dayStart)
  const known = answered.filter((e) => e.grade === 'known').length
  const reactions = answered
    .map((e) => e.reaction_ms)
    .filter((v): v is number => typeof v === 'number' && v > 0)

  const activeDays = new Set(
    events
      .filter((e) => e.at >= now - 7 * 86400000)
      .map((e) => new Date(e.at).toDateString()),
  ).size

  const stars = getTotalStars()

  return {
    masteredCount: mastered.size,
    dueCount: getDueCount(now, mastered),
    wrongCount: getReviewWords().length,
    todayStudied: todayEvents.length,
    totalAnswered: answered.length,
    accuracy: answered.length ? Math.round((known / answered.length) * 100) : null,
    avgReactionMs: reactions.length
      ? Math.round(reactions.reduce((a, b) => a + b, 0) / reactions.length)
      : null,
    stars: stars.stars,
    clearedLevels: stars.cleared,
    activeDays,
  }
}

/** 本地规则版建议：没有模型也能给出可执行的三条动作。 */
export function buildLocalAdvice(stats: DailyStats): DailyAdvice {
  const actions: DailyAction[] = []
  if (stats.dueCount > 0) {
    actions.push({ label: '先复习到期词', detail: `${stats.dueCount} 个已掌握的词到期了` })
  }
  if (stats.wrongCount > 0) {
    actions.push({ label: '清一清错词本', detail: `${stats.wrongCount} 个错词等你消灭` })
  }
  if (stats.clearedLevels > 0) {
    actions.push({ label: '继续闯关', detail: `已通关 ${stats.clearedLevels} 关，再刷一关试试` })
  }
  if (actions.length === 0) {
    actions.push({ label: '去背词', detail: '标记几个新词，复习队列就会自动排上' })
  }
  return {
    headline:
      stats.todayStudied > 0
        ? `今天已练 ${stats.todayStudied} 题，正确率 ${stats.accuracy ?? '-'}%`
        : '今天还没开始，先做一件小事',
    actions: actions.slice(0, 3),
    minutes: Math.max(5, Math.min(30, 5 + stats.dueCount * 1 + stats.wrongCount)),
    focusWords: [],
    source: 'local',
  }
}

/** 把统计摘要写成给模型看的文本。 */
function statsToPrompt(stats: DailyStats): string {
  return [
    `已掌握词：${stats.masteredCount}`,
    `到期复习词：${stats.dueCount}`,
    `错词本：${stats.wrongCount}`,
    `今天已练：${stats.todayStudied} 题`,
    `累计答题：${stats.totalAnswered} 题，正确率：${stats.accuracy ?? '暂无'}%`,
    stats.avgReactionMs ? `平均反应：${(stats.avgReactionMs / 1000).toFixed(1)} 秒` : '',
    `闯关：${stats.clearedLevels} 关通关，${stats.stars} 星`,
    `近 7 天活跃：${stats.activeDays} 天`,
  ].filter(Boolean).join('\n')
}

/** 让模型给出今日计划（失败时回退到本地规则）。 */
export async function generateDailyAdvice(stats: DailyStats): Promise<DailyAdvice> {
  const local = buildLocalAdvice(stats)
  const cfg = loadLlmConfig()
  if (!isConfigReady(cfg)) return local

  try {
    const json = await chatJSON(
      cfg,
      [
        {
          role: 'system',
          content:
            '你是英语学习教练。根据学习者数据给出今天的学习计划。只输出 JSON，不要解释。\n' +
            '格式：{"headline":"一句话总结今天的状态","actions":[{"label":"动作名(不超过 10 字)","detail":"具体说明(不超过 30 字)"}],"minutes":15,"focusWords":["建议重点练的单词，最多 5 个"]}\n' +
            '要求：actions 给 2-3 条，按优先级排序；minutes 是预计用时（分钟，5-30）；focusWords 只能来自学习者掌握或学过的词。',
        },
        { role: 'user', content: `学习数据：\n${statsToPrompt(stats)}` },
      ],
      { temperature: 0.5, maxTokens: 600, timeoutMs: 30000 },
    )

    const headline = typeof json.headline === 'string' ? json.headline.trim() : ''
    const rawActions = Array.isArray(json.actions) ? (json.actions as unknown[]) : []
    const actions: DailyAction[] = []
    for (const raw of rawActions) {
      if (!raw || typeof raw !== 'object') continue
      const o = raw as Record<string, unknown>
      const label = typeof o.label === 'string' ? o.label.trim() : ''
      const detail = typeof o.detail === 'string' ? o.detail.trim() : ''
      if (!label) continue
      actions.push({ label, detail })
      if (actions.length >= 3) break
    }
    if (!headline || actions.length === 0) return local

    const minutes = typeof json.minutes === 'number' && json.minutes > 0 ? Math.min(30, Math.round(json.minutes)) : local.minutes
    const rawFocus = Array.isArray(json.focusWords) ? (json.focusWords as unknown[]) : []
    const focusWords = rawFocus
      .filter((w): w is string => typeof w === 'string' && !!w.trim())
      .slice(0, 5)
      .map((w) => w.trim())

    return { headline, actions, minutes, focusWords, source: 'ai' }
  } catch {
    return local
  }
}

/* ── 当天缓存 ── */

const cacheKey = () => `lexicore-daily-plan-${todayKey()}`

export function getCachedAdvice(): DailyAdvice | undefined {
  try {
    const raw = localStorage.getItem(cacheKey())
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as DailyAdvice
    if (!parsed || typeof parsed.headline !== 'string') return undefined
    return parsed
  } catch {
    return undefined
  }
}

export function cacheAdvice(advice: DailyAdvice): void {
  try {
    localStorage.setItem(cacheKey(), JSON.stringify(advice))
  } catch {
    /* ignore */
  }
}
