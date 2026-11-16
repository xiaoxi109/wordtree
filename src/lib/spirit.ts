import { chatJSON } from './llm'
import { loadLlmConfig, isConfigReady } from '../config/llm'
import { wordKey } from './cluster'

/**
 * AI 词灵养成
 * ============
 * 每个「已掌握 / 正在学」的词都是一只词灵，设定由 AI 生成（不是模板拼装）：
 * 名字、种族、属性、稀有度、外观、性格、技能、口头禅都由模型创作并缓存。
 *
 * 养成数据来自真实学习行为：
 *  - 复习 / 闯关答对 → 获得经验、回血、胜场 +1
 *  - 答错 → 掉血、负场 +1
 *  - 等级达标后可让 AI 生成「进化形态」；连续答对与连胜会给战斗台词
 *
 * 存储独立（lexicore-spirits / lexicore-spirit-stories），与 SRS、掌握度互不干扰。
 */

export type SpiritRarity = 'N' | 'R' | 'SR' | 'SSR'

export interface SpiritSkill {
  /** 招式名（呼应词义） */
  name: string
  /** 招式效果（幽默、具体） */
  desc: string
}

export interface SpiritForm {
  name: string
  appearance: string
  skillName: string
}

export interface Spirit {
  key: string
  word: string
  meaning: string
  /** AI 创作的角色设定 */
  name: string
  species: string
  element: string
  rarity: SpiritRarity
  appearance: string
  personality: string
  skill: SpiritSkill
  catchphrase: string
  /** 养成数值 */
  level: number
  exp: number
  hp: number
  wins: number
  losses: number
  evolved: boolean
  evolution?: SpiritForm
  bornAt: number
  lastBattleAt?: number
}

export interface SpiritStory {
  id: string
  title: string
  text: string
  heroes: string[]
  createdAt: number
}

const SPIRITS_KEY = 'lexicore-spirits'
const STORIES_KEY = 'lexicore-spirit-stories'
const LINES_KEY = 'lexicore-spirit-lines'

const spiritListeners = new Set<() => void>()

export function subscribeSpirits(fn: () => void): () => void {
  spiritListeners.add(fn)
  return () => {
    spiritListeners.delete(fn)
  }
}

function emit(): void {
  spiritListeners.forEach((fn) => fn())
}

function readMap<T>(key: string): Record<string, T> {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, T>
  } catch {
    return {}
  }
}

function writeMap<T>(key: string, map: Record<string, T>): void {
  try {
    localStorage.setItem(key, JSON.stringify(map))
  } catch {
    /* 配额满：忽略 */
  }
}

export function getSpirits(): Record<string, Spirit> {
  return readMap<Spirit>(SPIRITS_KEY)
}

export function getSpirit(word: string): Spirit | undefined {
  return getSpirits()[wordKey(word)]
}

export function spiritCount(): number {
  return Object.keys(getSpirits()).length
}

function saveSpirit(spirit: Spirit): void {
  const map = getSpirits()
  map[spirit.key] = spirit
  writeMap(SPIRITS_KEY, map)
  emit()
}

export function clearSpirits(): void {
  try {
    localStorage.removeItem(SPIRITS_KEY)
    localStorage.removeItem(STORIES_KEY)
    localStorage.removeItem(LINES_KEY)
  } catch {
    /* ignore */
  }
  emit()
}

/* ───────────────────── 养成数值规则 ───────────────────── */

export const MAX_LEVEL = 10
export const MAX_HP = 100

/** 升到下一级所需累计经验。 */
export function expToLevel(level: number): number {
  return Math.round(35 * Math.pow(level, 1.35))
}

/** 由累计经验算出等级（1..MAX_LEVEL）。 */
export function levelFromExp(exp: number): number {
  let lv = 1
  while (lv < MAX_LEVEL && exp >= expToLevel(lv)) lv += 1
  return lv
}

/** 当前等级内的经验进度（0..1）。 */
export function expProgress(spirit: Spirit): number {
  if (spirit.level >= MAX_LEVEL) return 1
  const base = expToLevel(spirit.level - 1)
  const next = expToLevel(spirit.level)
  return Math.max(0, Math.min(1, (spirit.exp - base) / Math.max(1, next - base)))
}

/** 战斗结算：答对涨经验回血、答错掉血；返回更新后的词灵。 */
export function applyBattleResult(word: string, correct: boolean, bonus = 0): Spirit | undefined {
  const s = getSpirit(word)
  if (!s) return undefined
  const exp = s.exp + (correct ? 12 + bonus : 3)
  const level = levelFromExp(exp)
  const leveled = level > s.level
  const hp = Math.max(0, Math.min(MAX_HP, s.hp + (correct ? 8 : -25)))
  const next: Spirit = {
    ...s,
    exp,
    level,
    hp: leveled ? MAX_HP : hp,
    wins: s.wins + (correct ? 1 : 0),
    losses: s.losses + (correct ? 0 : 1),
    lastBattleAt: Date.now(),
  }
  saveSpirit(next)
  return next
}

/* ───────────────────── AI 创作 ───────────────────── */

/** 从模型返回的 JSON 里安全取字符串字段。 */
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fallback
}

/**
 * 收服词灵：让 AI 为这个词创作完整角色设定，然后落盘缓存。
 * 已收服的直接返回缓存；模型不可用时用「朴素形态」兜底，保证玩法不中断。
 */
const inflight = new Map<string, Promise<Spirit | undefined>>()

export function ensureSpirit(word: string, meaning: string, pos?: string): Promise<Spirit | undefined> {
  const key = wordKey(word)
  const cached = getSpirits()[key]
  if (cached) return Promise.resolve(cached)

  const running = inflight.get(key)
  if (running) return running

  const cfg = loadLlmConfig()
  if (!isConfigReady(cfg)) {
    const basic: Spirit = {
      key, word, meaning,
      name: word.length > 6 ? `${word.slice(0, 4)}酱` : `${word}灵`,
      species: '待命名者',
      element: '光',
      rarity: 'N',
      appearance: `一只还没被 AI 赋予形象的小家伙，胸前写着「${word}」。`,
      personality: '有点害羞，但很努力',
      skill: { name: `${word}之力`, desc: `使用「${meaning}」的能量。` },
      catchphrase: '一起去学习吧！',
      level: 1, exp: 0, hp: MAX_HP, wins: 0, losses: 0, evolved: false,
      bornAt: Date.now(),
    }
    saveSpirit(basic)
    return Promise.resolve(basic)
  }

  const p = (async () => {
    try {
      const json = await chatJSON(
        cfg,
        [
          {
            role: 'system',
            content:
              '你是「词灵世界」的设定师，风格像宝可梦 + 百科全书的混血，既有想象力又贴近词义。' +
              '为一个英语单词创作一只词灵，只输出 JSON，不要解释、不要代码块。\n' +
              '格式：{\n' +
              '  "name":"2-4字中文名，音译或意象，要有记忆点",\n' +
              '  "species":"种族/职业，如 果园守卫、时光信使",\n' +
              '  "element":"从 火/水/木/光/影/雷/风/土 中选一个最贴切的",\n' +
              '  "rarity":"N/R/SR/SSR 之一，按词义有趣程度与学习难度给",\n' +
              '  "appearance":"50字以内中文外观描写，要具体、有画面感",\n' +
              '  "personality":"20字以内性格，要有一点小脾气或小怪癖",\n' +
              '  "skill":{"name":"4-6字招式名，必须呼应词义","desc":"30字以内招式效果，可以幽默"},\n' +
              '  "catchphrase":"15字以内口头禅，体现性格"\n' +
              '}\n' +
              '硬性要求：招式必须能让学习者联想到这个词的意思；名字不要直接使用中文释义。\n' +
              '参考示例：apple → 名字「红衣阿波」，种族「果园守卫」，技能「脆响冲击」；\n' +
              'transport → 名字「跨港队长」，种族「物流骑士」，技能「货物瞬移」；\n' +
              'friend → 名字「暖暖同路人」，种族「羁绊术士」，技能「并肩结界」。',
          },
          {
            role: 'user',
            content: `单词：${word}\n词性：${pos ?? '未标注'}\n中文释义：${meaning}`,
          },
        ],
        { temperature: 0.85, maxTokens: 700, timeoutMs: 40000 },
      )

      const skill = json.skill && typeof json.skill === 'object'
        ? (json.skill as Record<string, unknown>)
        : {}
      const rarityRaw = str(json.rarity, 'N').toUpperCase()
      const rarity: SpiritRarity =
        rarityRaw === 'SSR' || rarityRaw === 'SR' || rarityRaw === 'R' ? rarityRaw : 'N'
      const element = str(json.element, '光')
      const spirit: Spirit = {
        key, word, meaning,
        name: str(json.name, word),
        species: str(json.species, '未知种族'),
        element: element.slice(0, 4),
        rarity,
        appearance: str(json.appearance, `一只围着「${word}」光环的小生物。`),
        personality: str(json.personality, '安静但可靠'),
        skill: {
          name: str(skill.name, `${word}之力`),
          desc: str(skill.desc, `释放出「${meaning}」的力量。`),
        },
        catchphrase: str(json.catchphrase, '交给我吧！'),
        level: 1, exp: 0, hp: MAX_HP, wins: 0, losses: 0, evolved: false,
        bornAt: Date.now(),
      }
      saveSpirit(spirit)
      return spirit
    } catch {
      // 生成失败：留一只「未命名」词灵，下次可重试
      return undefined
    } finally {
      inflight.delete(key)
    }
  })()

  inflight.set(key, p)
  return p
}

/** 进化条件：等级 >= 5、未进化。 */
export function canEvolve(spirit: Spirit): boolean {
  return !spirit.evolved && spirit.level >= 5
}

/** 让 AI 为词灵创作进化形态。 */
export async function evolveSpirit(word: string): Promise<Spirit | undefined> {
  const s = getSpirit(word)
  if (!s || !canEvolve(s)) return undefined
  const cfg = loadLlmConfig()
  if (!isConfigReady(cfg)) return undefined

  try {
    const json = await chatJSON(
      cfg,
      [
        {
          role: 'system',
          content:
            '你是词灵世界的进化设计师。为一只词灵设计进化后的新形态，只输出 JSON。\n' +
            '格式：{"name":"进化后的中文名","appearance":"50字以内外观变化描写","skillName":"4-6字新招式名"}\n' +
            '要求：进化形态要明显更强、更贴合词义；不要丢掉原形态的气质。',
        },
        {
          role: 'user',
          content:
            `词灵：${s.name}（${s.word} / ${s.meaning}）\n` +
            `种族：${s.species} · 属性：${s.element}\n` +
            `当前形态：${s.appearance}\n` +
            `原招式：${s.skill.name}\n` +
            `性格：${s.personality}`,
        },
      ],
      { temperature: 0.9, maxTokens: 400, timeoutMs: 30000 },
    )
    const evolution: SpiritForm = {
      name: str(json.name, s.name),
      appearance: str(json.appearance, s.appearance),
      skillName: str(json.skillName, s.skill.name),
    }
    const next: Spirit = {
      ...s,
      evolved: true,
      evolution,
      name: evolution.name,
      appearance: evolution.appearance,
      skill: { ...s.skill, name: evolution.skillName },
      level: s.level + 1,
      hp: MAX_HP,
    }
    saveSpirit(next)
    return next
  } catch {
    return undefined
  }
}

/* ───────────────────── 战斗台词 / 羁绊剧场 ───────────────────── */

export type LineSituation = 'attack' | 'hurt' | 'victory' | 'levelup' | 'evolve'

function readLines(): Record<string, string> {
  return readMap<string>(LINES_KEY)
}

/** 取台词：按「词灵 + 情境」缓存，同一句不会重复问模型。 */
export function getLine(word: string, situation: LineSituation): string | undefined {
  return readLines()[`${wordKey(word)}:${situation}`]
}

/**
 * 让 AI 按词灵的性格与当前处境说一句话（20 字以内）。
 * 模型不可用时回退到它的口头禅，永远有台词。
 */
export async function getSpiritLine(word: string, situation: LineSituation): Promise<string> {
  const cacheKey = `${wordKey(word)}:${situation}`
  const cached = readLines()[cacheKey]
  if (cached) return cached

  const s = getSpirit(word)
  if (!s) return '...'
  const fallback =
    situation === 'hurt' ? `${s.catchphrase}（受了点伤）`
    : situation === 'victory' ? s.catchphrase
    : situation === 'levelup' ? `升级了！${s.catchphrase}`
    : situation === 'evolve' ? `进化完成！${s.catchphrase}`
    : s.catchphrase

  const cfg = loadLlmConfig()
  if (!isConfigReady(cfg)) return fallback

  const scene: Record<LineSituation, string> = {
    attack: '刚成功使用招式击中对手',
    hurt: '刚被答错反噬、掉了血',
    victory: '赢下了一场战斗',
    levelup: '刚刚升级',
    evolve: '刚刚进化成新形态',
  }

  try {
    const json = await chatJSON(
      cfg,
      [
        {
          role: 'system',
          content:
            '你是词灵的台词 writer。只输出一个 JSON：{"line":"一句话中文台词"}。\n' +
            '要求：20 字以内；必须贴合这只词灵的性格与口头禅风格；' +
            '像游戏里的战斗语音，简短、有画面感、可以俏皮，不要解释。',
        },
        {
          role: 'user',
          content:
            `词灵：${s.name}（${s.word} / ${s.meaning}）\n` +
            `性格：${s.personality}\n口头禅：${s.catchphrase}\n` +
            `属性：${s.element} · 稀有度：${s.rarity} · 等级：Lv.${s.level}\n` +
            `当前情境：${scene[situation]}`,
        },
      ],
      { temperature: 1.0, maxTokens: 160, timeoutMs: 20000 },
    )
    const line = str(json.line, '').slice(0, 40)
    if (!line) return fallback
    const map = readLines()
    map[cacheKey] = line
    writeMap(LINES_KEY, map)
    return line
  } catch {
    return fallback
  }
}

/** 最近谈论过的词灵（按上次战斗时间取前 N 只）。 */
export function recentSpirits(limit = 6): Spirit[] {
  return Object.values(getSpirits())
    .sort((a, b) => (b.lastBattleAt ?? b.bornAt) - (a.lastBattleAt ?? a.bornAt))
    .slice(0, limit)
}

export function getStories(): SpiritStory[] {
  const raw = readMap<SpiritStory>(STORIES_KEY)
  return Object.values(raw).sort((a, b) => b.createdAt - a.createdAt)
}

/**
 * 让 AI 把最近练过的词灵编成一段小剧场（羁绊故事）。
 * 每只词灵都要开口说一句，剧情里自然带出它们的词义与性格。
 */
export async function generateSpiritStory(words: string[]): Promise<SpiritStory | undefined> {
  const heroes = words
    .map((w) => getSpirit(w))
    .filter((s): s is Spirit => !!s)
    .slice(0, 5)
  if (heroes.length < 2) return undefined

  const cfg = loadLlmConfig()
  if (!isConfigReady(cfg)) return undefined

  const cast = heroes
    .map((s) =>
      `- ${s.name}（${s.word}＝${s.meaning}）：${s.species}，属性${s.element}，性格「${s.personality}」，口头禅「${s.catchphrase}」`,
    )
    .join('\n')

  try {
    const json = await chatJSON(
      cfg,
      [
        {
          role: 'system',
          content:
            '你是儿童向英语学习剧场的编剧。把出场词灵编成一段有起承转合的小故事，只输出 JSON。\n' +
            '格式：{"title":"12字以内标题","text":"正文"}\n' +
            '要求：\n' +
            '1. 每只词灵至少说一句话，台词要用「名字：台词」格式；\n' +
            '2. 剧情必须让每个词的意思自然出现，能帮学习者记住；\n' +
            '3. 150 字以内，轻松、温暖、有一点点小冲突；\n' +
            '4. 不要出现英文单词以外的生僻词，中文叙述要口语化。',
        },
        { role: 'user', content: `出场词灵：\n${cast}` },
      ],
      { temperature: 1.0, maxTokens: 900, timeoutMs: 45000 },
    )
    const title = str(json.title, '词灵小剧场')
    const text = str(json.text, '')
    if (!text) return undefined

    const story: SpiritStory = {
      id: `${Date.now()}`,
      title,
      text,
      heroes: heroes.map((s) => s.word),
      createdAt: Date.now(),
    }
    const map = readMap<SpiritStory>(STORIES_KEY)
    map[story.id] = story
    writeMap(STORIES_KEY, map)
    return story
  } catch {
    return undefined
  }
}
