import { chatJSON } from './llm'
import { loadLlmConfig, isConfigReady } from '../config/llm'

/**
 * AI 闯关战报：把一局的战绩写成有个性的点评，替代干巴巴的数字结算。
 * 按「战绩签名」缓存，同样的成绩不重复调用模型。
 */
const REPORT_KEY = 'lexicore-ai-battle-reports'

export interface BattleReportInput {
  game: string
  level: number
  score: number
  total: number
  stars: number
  avgMs: number
  bestStreak: number
  wrongWords: string[]
}

function keyOf(i: BattleReportInput): string {
  return [i.game, i.level, i.score, i.total, i.stars, i.bestStreak, i.wrongWords.slice(0, 3).join(',')].join('|')
}

function read(): Record<string, string> {
  try {
    const raw = localStorage.getItem(REPORT_KEY)
    if (!raw) return {}
    const p = JSON.parse(raw) as unknown
    return p && typeof p === 'object' && !Array.isArray(p) ? (p as Record<string, string>) : {}
  } catch {
    return {}
  }
}

function write(map: Record<string, string>): void {
  try {
    localStorage.setItem(REPORT_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

export function getBattleReport(input: BattleReportInput): string | undefined {
  return read()[keyOf(input)]
}

const FALLBACKS = [
  '稳扎稳打，词灵们都在看着你呢。',
  '有失手也有高光，再来一局会更顺。',
  '这一局像坐过山车，刺激但值得。',
]

/** 生成本局战报；失败时按星级给一句兜底文案。 */
export async function generateBattleReport(input: BattleReportInput): Promise<string> {
  const key = keyOf(input)
  const cached = read()[key]
  if (cached) return cached

  const fallback =
    input.stars >= 3 ? '完美通关，词灵们集体起立鼓掌！'
    : input.stars === 2 ? FALLBACKS[0]
    : input.stars === 1 ? FALLBACKS[1]
    : FALLBACKS[2]

  const cfg = loadLlmConfig()
  if (!isConfigReady(cfg)) return fallback

  const pct = Math.round((input.score / Math.max(1, input.total)) * 100)
  try {
    const json = await chatJSON(
      cfg,
      [
        {
          role: 'system',
          content:
            '你是游戏战报解说员，语气像体育解说 + 好友吐槽的混合体。只输出 JSON：{"report":"一段中文战报"}。\n' +
            '要求：50 字以内；必须提到具体数据（正确率/用时/连对中的至少两个）；\n' +
            '有画面感、有情绪，赢要夸得具体，输要损得可爱；不要客套话、不要总结陈词。',
        },
        {
          role: 'user',
          content:
            `玩法：${input.game} 第 ${input.level + 1} 关\n` +
            `答对 ${input.score}/${input.total}（${pct}%）· ${input.stars} 星\n` +
            `平均每题 ${(input.avgMs / 1000).toFixed(1)} 秒 · 最高连对 ${input.bestStreak}\n` +
            `错题：${input.wrongWords.slice(0, 4).join('、') || '无'}`,
        },
      ],
      { temperature: 1.0, maxTokens: 250, timeoutMs: 20000 },
    )
    const report = typeof json.report === 'string' ? json.report.trim().slice(0, 120) : ''
    if (!report) return fallback
    const map = read()
    map[key] = report
    write(map)
    return report
  } catch {
    return fallback
  }
}
