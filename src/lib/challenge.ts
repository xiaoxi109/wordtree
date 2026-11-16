import { wordKey } from './cluster'
import { applyStudyGrade } from './study'
import { pushReviewWord } from './review'
import { appendWordEvent } from './events'

/**
 * 闯关只需要词条的最小字段集：词形 / 释义 / 音标 / 词性。
 * 词库词条（Word）与词典查词结果（DictEntry）都满足这个结构。
 */
export interface ChallengeWord {
  word: string
  meaning: string
  ipa?: string
  pos?: string
}

/**
 * 闯关模块的核心规则：玩法定义、关卡难度、出题、星级判定、结果回流。
 *
 * 关键约定（与学习体系打通）：
 *  - 答对 → SRS 记 good，下一次复习间隔按 Leitner 盒拉长；
 *  - 答错 → SRS 记 again（1 天后重来）+ 进错词本（背词页会重点复现）；
 *  - 每题都写一条事件流（source = 'quiz'），供画像 / 薄弱项诊断使用。
 */

/* ───────────────────────── 玩法定义 ───────────────────────── */

export type ChallengeGameId = 'word-pick' | 'listen-pick' | 'spell' | 'ai-smart'

export interface ChallengeGameDef {
  id: ChallengeGameId
  title: string
  emoji: string
  tagline: string
  desc: string
  /** 图标底色 / 字色（tailwind 类） */
  accent: string
  /** 每关题数 */
  perLevel: number
  /** 关卡总数 */
  levelCount: number
  /** 选项目的是「释义」还是「单词」 */
  optionKind: 'meaning' | 'word'
  /** 是否为拼写输入型玩法 */
  input: boolean
  /** 是否需要配置大模型（AI 出题） */
  requiresLlm?: boolean
}

export const CHALLENGE_GAMES: ChallengeGameDef[] = [
  {
    id: 'word-pick',
    title: '词义闪电选',
    emoji: '⚡',
    tagline: '看词选义',
    desc: '给出一个单词，四选一选出正确的中文释义。',
    accent: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
    perLevel: 10,
    levelCount: 5,
    optionKind: 'meaning',
    input: false,
  },
  {
    id: 'listen-pick',
    title: '听音辨词',
    emoji: '🎧',
    tagline: '听声选词',
    desc: '只听发音（不看字），四选一选出正确的单词。',
    accent: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
    perLevel: 10,
    levelCount: 5,
    optionKind: 'word',
    input: false,
  },
  {
    id: 'spell',
    title: '拼写挑战',
    emoji: '✍️',
    tagline: '看义拼写',
    desc: '给出中文释义与首字母提示，拼出完整的英文单词。',
    accent: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    perLevel: 8,
    levelCount: 5,
    optionKind: 'meaning',
    input: true,
  },
  {
    id: 'ai-smart',
    title: 'AI 智囊',
    emoji: '🤖',
    tagline: 'AI 挑易混词',
    desc: 'AI 从你的薄弱词里挑出最容易混淆的干扰项，并附一句讲解。',
    accent: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300',
    perLevel: 8,
    levelCount: 5,
    optionKind: 'meaning',
    input: false,
    requiresLlm: true,
  },
]

const CHALLENGES_BY_ID: Record<string, ChallengeGameDef> = Object.fromEntries(
  CHALLENGE_GAMES.map((g) => [g.id, g]),
)

export function getGameDef(id: string): ChallengeGameDef | undefined {
  return CHALLENGES_BY_ID[id]
}

/* ───────────────────────── 关卡难度 ───────────────────────── */

export interface LevelPlan {
  /** 关卡序号，从 0 开始 */
  index: number
  /** 干扰项挑选：0=随机 1=同词性优先 2=同词性 + 释义相近优先 */
  similarity: 0 | 1 | 2
  /** 出题取材：all=全部激活词 learned=优先已掌握/到期 weak=优先错题本 */
  focus: 'all' | 'learned' | 'weak'
}

/** 关卡曲线：前两关轻松入门，中间加难度，最后两关打薄弱词。 */
export function levelPlan(level: number): LevelPlan {
  switch (level) {
    case 0:
      return { index: 0, similarity: 0, focus: 'all' }
    case 1:
      return { index: 1, similarity: 1, focus: 'all' }
    case 2:
      return { index: 2, similarity: 1, focus: 'learned' }
    case 3:
      return { index: 3, similarity: 2, focus: 'learned' }
    default:
      return { index: level, similarity: 2, focus: 'weak' }
  }
}

/* ───────────────────────── 出题 ───────────────────────── */

export interface ChallengeQuestion {
  target: ChallengeWord
  /** 选项文本（word-pick 为中文释义，listen-pick 为英文单词） */
  options: string[]
  /** 拼写题：首字母提示 */
  hint?: string
  /** AI 讲解：答错时展示 */
  note?: string
}

/** Fisher–Yates 洗牌（不改原数组）。 */
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** 释义重叠字数：中文释义里共同汉字越多越可能是「易混项」。 */
function sharedChars(a: string, b: string): number {
  const set = new Set(a.split(''))
  let n = 0
  for (const ch of b.split('')) if (set.has(ch)) n++
  return n
}

/** 干扰项与目标词的相似度评分：同词性 + 2，释义重叠字加分。 */
function similarityScore(target: ChallengeWord, other: ChallengeWord): number {
  let s = 0
  if (target.pos && other.pos && target.pos === other.pos) s += 3
  const overlap = sharedChars(target.meaning, other.meaning)
  if (overlap >= 2) s += 2
  else if (overlap === 1) s += 1
  // 释义长度接近的更易混
  const lenDiff = Math.abs(target.meaning.length - other.meaning.length)
  if (lenDiff <= 2) s += 1
  return s
}

/** 出题：target 不与本局已出现过的词重复；干扰项按关卡难度挑选。 */
export function buildQuestion(opts: {
  def: ChallengeGameDef
  pool: ChallengeWord[]
  plan: LevelPlan
  /** 本局已用过的词（key），避免重复 */
  used: Set<string>
}): ChallengeQuestion | null {
  const { def, pool, plan, used } = opts
  if (pool.length === 0) return null

  const fresh = pool.filter((w) => !used.has(wordKey(w.word)))
  const candidates = fresh.length > 0 ? fresh : pool
  const target = candidates[Math.floor(Math.random() * candidates.length)]
  if (!target) return null

  const others = pool.filter((w) => wordKey(w.word) !== wordKey(target.word) && w.meaning !== target.meaning)
  let distractors: ChallengeWord[]
  if (plan.similarity === 0) {
    distractors = shuffle(others).slice(0, 3)
  } else {
    // 先按相似度取前若干候选，再随机挑 3 个，保证「难但不至于无解」
    const ranked = [...others].sort((a, b) => similarityScore(target, b) - similarityScore(target, a))
    const top = ranked.slice(0, Math.min(ranked.length, 8))
    distractors = shuffle(top).slice(0, 3)
    while (distractors.length < 3) {
      const extra = others.find((w) => !distractors.includes(w))
      if (!extra) break
      distractors.push(extra)
    }
  }
  if (distractors.length === 0) return null

  const optionTexts =
    def.optionKind === 'meaning'
      ? [target.meaning, ...distractors.map((d) => d.meaning)]
      : [target.word, ...distractors.map((d) => d.word)]

  return {
    target,
    options: shuffle(optionTexts),
    hint: def.input ? `${target.word[0]?.toUpperCase() ?? ''}${'·'.repeat(Math.max(0, target.word.length - 1))}` : undefined,
  }
}

/* ───────────────────────── 星级 ───────────────────────── */

/** 星级：≥90% 三星，≥70% 两星，≥50% 一星。 */
export function starsFor(score: number, total: number): number {
  if (total <= 0) return 0
  const ratio = score / total
  if (ratio >= 0.9) return 3
  if (ratio >= 0.7) return 2
  if (ratio >= 0.5) return 1
  return 0
}

export const STAR_LABELS = ['未通关', '已通关', '表现不错', '完美通关']

/* ───────────────────────── 结果回流 ───────────────────────── */

export interface ChallengeOutcome {
  word: ChallengeWord
  correct: boolean
  /** 本题用时（毫秒） */
  reactionMs: number
}

/**
 * 闯关结果回流学习体系：
 *  - 答对 → SRS 推进盒号（复习间隔变长）
 *  - 答错 → SRS 归零 + 进错词本
 *  - 两种情况都写事件流（source='quiz'），让画像/薄弱项诊断拿得到数据
 */
export function recordChallengeResult(outcome: ChallengeOutcome, gameId: string): void {
  const key = wordKey(outcome.word.word)
  if (outcome.correct) {
    applyStudyGrade(key, 'good')
  } else {
    applyStudyGrade(key, 'again')
    pushReviewWord(
      {
        key,
        word: outcome.word.word,
        ipa: outcome.word.ipa || '',
        meaning: outcome.word.meaning || '',
      },
      'unknown',
    )
  }
  void appendWordEvent({
    word_key: key,
    word: outcome.word.word,
    source: 'quiz',
    grade: outcome.correct ? 'known' : 'unknown',
    reaction_ms: Math.max(0, Math.round(outcome.reactionMs)),
    context_id: gameId,
  }).catch((err) => console.error('写入闯关事件失败:', err))
}

/** 拼写题判分：忽略大小写与空格、连字符。 */
export function spellCorrect(input: string, answer: string): boolean {
  const norm = (s: string) => s.trim().toLowerCase().replace(/[\s'-]/g, '')
  return norm(input) === norm(answer)
}
