import { chatJSON } from './llm'
import { loadLlmConfig, isConfigReady } from '../config/llm'

/**
 * AI 闯关剧情：把一个玩法的 5 关串成一条故事线，每关有引子与通关台词。
 * 让「刷关卡」变成「推剧情」，给数字进度一个情感目标。
 * 按 gameId 缓存到 localStorage，同一个玩法只创作一次。
 */
const STORY_KEY = 'lexicore-challenge-stories'

export interface Chapter {
  /** 关卡序号（0 起） */
  level: number
  /** 开场引子 */
  intro: string
  /** Boss / 对手台词 */
  rival: string
  /** 通关后台词 */
  clear: string
}

export interface ChallengeStory {
  game: string
  title: string
  premise: string
  heroName: string
  rivalName: string
  chapters: Chapter[]
  createdAt: number
}

function read(): Record<string, ChallengeStory> {
  try {
    const raw = localStorage.getItem(STORY_KEY)
    if (!raw) return {}
    const p = JSON.parse(raw) as unknown
    return p && typeof p === 'object' && !Array.isArray(p) ? (p as Record<string, ChallengeStory>) : {}
  } catch {
    return {}
  }
}

function write(map: Record<string, ChallengeStory>): void {
  try {
    localStorage.setItem(STORY_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

export function getChallengeStory(game: string): ChallengeStory | undefined {
  return read()[game]
}

function s(v: unknown, fallback = ''): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fallback
}

/** 本地兜底剧情：模型不可用时也有一个故事框架。 */
function localStory(game: string, levelCount: number): ChallengeStory {
  return {
    game,
    title: '词灵试炼',
    premise: '词灵们要闯过五道试炼，才能唤醒沉睡的词树。',
    heroName: '词灵小队',
    rivalName: '遗忘之影',
    chapters: Array.from({ length: levelCount }, (_, i) => ({
      level: i,
      intro: `第 ${i + 1} 道试炼开启，词灵们列队入场。`,
      rival: '遗忘之影：你能记住多少？',
      clear: '试炼通过，词树又亮起一片叶子。',
    })),
    createdAt: Date.now(),
  }
}

/** 生成（或读缓存）某个玩法的剧情。 */
export async function ensureChallengeStory(game: string, levelCount = 5): Promise<ChallengeStory> {
  const cached = read()[game]
  if (cached) return cached

  const fallback = localStory(game, levelCount)
  const cfg = loadLlmConfig()
  if (!isConfigReady(cfg)) return fallback

  try {
    const json = await chatJSON(
      cfg,
      [
        {
          role: 'system',
          content:
            '你是儿童向英语闯关游戏的剧情编剧。为一个单词闯关玩法写一条 5 关连续故事线，只输出 JSON。\n' +
            '格式：{"title":"12字以内标题","premise":"40字以内故事背景","heroName":"主角名","rivalName":"对手名",\n' +
            '"chapters":[{"intro":"30字以内开场引子","rival":"对手台词20字内","clear":"通关台词20字内"}]}\n' +
            '要求：五关剧情层层递进、有起承转合；对手台词要有挑战感但不吓人；通关台词要认真回应；中文口语化、有趣。',
        },
        { role: 'user', content: `玩法名称：${game}\n关卡数：${levelCount}` },
      ],
      { temperature: 1.0, maxTokens: 1200, timeoutMs: 40000 },
    )

    const rawChapters = Array.isArray(json.chapters) ? (json.chapters as unknown[]) : []
    const chapters: Chapter[] = []
    for (let i = 0; i < levelCount; i++) {
      const raw = rawChapters[i]
      const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
      chapters.push({
        level: i,
        intro: s(o.intro, fallback.chapters[i].intro),
        rival: s(o.rival, fallback.chapters[i].rival),
        clear: s(o.clear, fallback.chapters[i].clear),
      })
    }

    const story: ChallengeStory = {
      game,
      title: s(json.title, fallback.title),
      premise: s(json.premise, fallback.premise),
      heroName: s(json.heroName, fallback.heroName),
      rivalName: s(json.rivalName, fallback.rivalName),
      chapters,
      createdAt: Date.now(),
    }
    write({ ...read(), [game]: story })
    return story
  } catch {
    return fallback
  }
}
