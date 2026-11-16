import type { LessonGroup, TopicId } from './cluster'
import { TOPIC_LABEL } from './cluster'
import { FUNCTION_WORD_LIST } from './vocab'
import type { ChatMessage } from './llm'
import {
  GRADE_RUNGS,
  LEVEL_RUNGS,
  gradeToLevel,
  type GradeRung,
  type LevelRung,
  type Route,
} from '../data/levels'

export type Difficulty = 'adaptive' | 'Pre-A1' | 'A1' | 'A2' | 'B1' | 'B2' | 'C1'
export type LessonKind = 'story' | 'dialogue' | 'diary' | 'email' | 'article' | 'poem'
export type LessonFormatChoice = 'auto' | LessonKind

export interface LessonFormatMeta {
  id: LessonKind
  label: string
  emoji: string
  /** 课程卡片 / 阅读页徽标（Tailwind 字面类） */
  badge: string
  /** 给模型的体裁描述 */
  brief: string
  /** 长度要求（写进 prompt） */
  length: string
}

/** 六种课程体裁：同一套重点词可以写成完全不同的内容形态。 */
export const LESSON_FORMATS: LessonFormatMeta[] = [
  {
    id: 'story',
    label: '小故事',
    emoji: '📖',
    badge: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
    brief: '英文小短故事（有情节、有画面感，按 4-7 段分段）',
    length: '约 150-300 个英文单词',
  },
  {
    id: 'dialogue',
    label: '对话',
    emoji: '💬',
    badge: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
    brief: '英文对话场景（2-4 个角色，10-16 轮来回，贴近真实交流）',
    length: '约 150-300 个英文单词',
  },
  {
    id: 'diary',
    label: '日记',
    emoji: '📔',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    brief: '第一人称英文日记（开头交代日期/天气，记录当天一件小事和感受，4-6 段）',
    length: '约 140-260 个英文单词',
  },
  {
    id: 'email',
    label: '邮件便条',
    emoji: '✉️',
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    brief: '一封英文邮件或便条（title 是主题，正文含称呼、2-4 段内容和落款）',
    length: '约 120-240 个英文单词',
  },
  {
    id: 'article',
    label: '科普短文',
    emoji: '📰',
    badge: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
    brief: '一篇英文小科普（介绍一个有趣的现象或知识，3-5 段，结尾给一句启发）',
    length: '约 180-320 个英文单词',
  },
  {
    id: 'poem',
    label: '韵律小诗',
    emoji: '🎵',
    badge: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
    brief: '一首简单的英文小诗（4-8 行，分 2-3 小节，注意节奏和押韵；每行一个 segment）',
    length: '约 50-140 个英文单词',
  },
]

/** 自动混搭顺序：相邻篇目体裁不同，一套课程里尽量覆盖多种形态。 */
export const AUTO_FORMAT_ORDER: LessonKind[] = ['story', 'dialogue', 'diary', 'email', 'article', 'poem']

export function formatMeta(kind: LessonKind | undefined): LessonFormatMeta {
  return LESSON_FORMATS.find((f) => f.id === kind) ?? LESSON_FORMATS[0]
}

/** 按篇目序号规划体裁：「自动」循环 6 种，指定则固定。 */
export function planKind(index: number, format: LessonFormatChoice = 'auto'): LessonKind {
  if (format === 'auto') return AUTO_FORMAT_ORDER[index % AUTO_FORMAT_ORDER.length]
  return format
}

export interface LessonCondition {
  topic: TopicId
  difficulty: Difficulty
  /** 课程体裁：auto = 六种循环混搭（旧数据没有该字段时按 auto 处理） */
  format?: LessonFormatChoice
}

export const DIFFICULTIES: { id: Difficulty; label: string; hint: string }[] = [
  { id: 'adaptive', label: '自适应', hint: '句式难度贴合所选词汇的整体水平，自然流畅即可' },
  { id: 'Pre-A1', label: 'Pre-A1', hint: 'Pre-A1 级句式：极短句，一次只表达一个信息，全部用一般现在时，只用最基础的词（I have a cat. / It is big. / I go to school.）' },
  { id: 'A1', label: 'A1', hint: 'A1 级句式：短句、现在时为主、结构简单（My name is… / I like…）' },
  { id: 'A2', label: 'A2', hint: 'A2 级句式：日常简单句与少量复合句，过去时和将来时可少量出现' },
  { id: 'B1', label: 'B1', hint: 'B1 级句式：中等复杂度，使用从句、连接词与更丰富的表达' },
  { id: 'B2', label: 'B2', hint: 'B2 级句式：更地道复杂的表达，允许习语与抽象论述' },
  { id: 'C1', label: 'C1', hint: 'C1 级句式：长难句、从句嵌套、被动与虚拟语气、抽象与学术表达（词库上限为 B2，句子按 C1 复杂度组织，词汇仍取自已掌握词）' },
]

export function difficultyHint(d: Difficulty): string {
  return (DIFFICULTIES.find((x) => x.id === d) ?? DIFFICULTIES[0]).hint
}

/* ------------------- 难度档 × 设置里的阶梯等级模式 ------------------- */
/**
 * 内部难度值始终是 CEFR 档位（planner / prompt / 数据库都用它），
 * 只有显示标签跟随设置里的「学习路线」：西式显示 A1…，中式显示年级。
 */

type ConcreteDifficulty = Exclude<Difficulty, 'adaptive'>

function levelToDifficulty(level: LevelRung): ConcreteDifficulty {
  if (level === 'Pre-A1') return 'Pre-A1'
  if (level === 'A1') return 'A1'
  if (level === 'A2') return 'A2'
  if (level === 'B1') return 'B1'
  if (level === 'C1') return 'C1'
  // 词库无 C2 词：回落到 B2
  return 'B2'
}

function rungLevel(route: Route, rung: GradeRung | LevelRung): LevelRung | null {
  if (route === 'grade') {
    return GRADE_RUNGS.some((g) => g.id === rung) ? gradeToLevel(rung as GradeRung) : null
  }
  return LEVEL_RUNGS.some((l) => l.id === rung) ? (rung as LevelRung) : null
}

/** 设置里的「我的等级」落在哪一档，用于生成条件里标注对应关系。 */
export function difficultyForRung(
  route: Route,
  rung: GradeRung | LevelRung,
): ConcreteDifficulty | null {
  const level = rungLevel(route, rung)
  return level ? levelToDifficulty(level) : null
}

/** 难度选项：id 是选项唯一标识（CEFR 档位或年级 id），difficulty 是解析后的内部难度。 */
export interface DifficultyOption {
  id: string
  difficulty: Difficulty
  label: string
}

/** 按阶梯模式生成难度选项：西式每档一个 CEFR 等级；中式每个年级一档，与「我的等级」页一一对应。 */
export function difficultyOptions(route: Route): DifficultyOption[] {
  if (route !== 'grade') {
    return DIFFICULTIES.map((d) => ({ id: d.id, difficulty: d.id, label: d.label }))
  }
  const opts: DifficultyOption[] = [{ id: 'adaptive', difficulty: 'adaptive', label: '自适应' }]
  // 每个年级一档，与「我的等级」页完全一致（C2 不是年级，无需处理）
  for (const g of GRADE_RUNGS) {
    opts.push({ id: g.id, difficulty: levelToDifficulty(g.level), label: g.label })
  }
  return opts
}

/** 选项 id → 内部难度（自适应 / CEFR 档位）。 */
export function resolveDifficulty(route: Route, id: string): Difficulty {
  return difficultyOptions(route).find((d) => d.id === id)?.difficulty ?? 'adaptive'
}

/** 难度选项 id 在界面上的显示名（自适应 / CEFR 等级 / 中式年级）。 */
export function difficultyText(route: Route, id: string): string {
  return difficultyOptions(route).find((d) => d.id === id)?.label ?? '自适应'
}

/** 推荐难度对应的选项 id：中式路线推荐档覆盖多个年级时，优先取「我的等级」所在年级。 */
export function recommendedOptionId(
  route: Route,
  rec: Difficulty,
  currentRung?: GradeRung | LevelRung,
): string {
  if (route !== 'grade') return rec
  const hits = difficultyOptions(route).filter((d) => d.difficulty === rec && d.id !== 'adaptive')
  if (hits.length === 0) return 'adaptive'
  return hits.find((d) => d.id === currentRung)?.id ?? hits[0].id
}

export function outputFormat(kind: LessonKind): string {
  return `输出要求：只输出一个 JSON 对象，不要任何解释、前言或代码块围栏。
{
  "title": "教程英文标题（简短）",
  "type": "${kind}",
  "segments": [
    { "speaker": "对话角色名，非对话体裁留空字符串", "en": "英文正文", "zh": "纯中文翻译，不含任何标签或尖括号" }
  ]
}`
}

/** 允许不限量使用的功能词/高频骨架词（不占用「已掌握词汇」预算）。 */
const FUNCTION_WORDS = FUNCTION_WORD_LIST.split(' ').join(', ')

export interface LessonPromptOptions {
  /** 学习者已掌握的词（作为允许词汇表，保证文章可读、词汇随掌握量增长） */
  allowedWords?: string[]
  /** 覆盖率重试时告知模型上一稿遗漏的词 */
  missingWords?: string[]
  /** 上一稿用到的超纲词：重试时要求避免 */
  bannedWords?: string[]
}

/** 为一个场景组构建生成一篇教程的 messages。 */
export function buildLessonMessages(
  group: LessonGroup,
  condition: LessonCondition,
  kind: LessonKind,
  opts: LessonPromptOptions = {},
): ChatMessage[] {
  const words = group.words
    .map((w, i) => `${i + 1}. ${w.word} — ${w.meaning}${w.isReview ? '（复习词）' : ''}`)
    .join('\n')

  const reviewWords = group.words.filter((w) => w.isReview).map((w) => w.word)
  const meta = formatMeta(kind)
  const typeDesc = meta.brief

  const formatRules: string[] = []
  if (kind === 'dialogue') {
    formatRules.push('每段是一轮对话，speaker 写角色名（2-4 个角色），对话来回自然。')
  }
  if (kind === 'diary') {
    formatRules.push('title 写成带日期/天气的日记标题；用第一人称，语气像真的在记录生活。')
  }
  if (kind === 'email') {
    formatRules.push('title 写邮件主题；第一段以 Dear … 开头，最后一段以落款（如 Best, Li Hua）结束。')
  }
  if (kind === 'article') {
    formatRules.push('title 是文章标题；用说明性语言介绍知识，结尾给读者一句启发。')
  }
  if (kind === 'poem') {
    formatRules.push('每个 segment 是一行诗句或一个小节；zh 是逐行翻译，保持简洁；押韵自然，不要为押韵牺牲意思。')
  }

  const topicDesc =
    condition.topic === 'random'
      ? '题材随机，贴合场景即可'
      : `优先围绕题材「${TOPIC_LABEL[condition.topic]}」展开`

  const allowed = (opts.allowedWords ?? []).filter(Boolean)
  const allowedBlock = allowed.length
    ? `\n【可用词汇表（学习者已掌握，共 ${allowed.length} 个）】\n${allowed.join(', ')}\n`
    : ''

  const missingBlock =
    opts.missingWords && opts.missingWords.length
      ? `\n注意：上一稿遗漏了这些重点词，这一稿必须全部写到：${opts.missingWords.join(', ')}。\n`
      : ''

  const bannedBlock =
    opts.bannedWords && opts.bannedWords.length
      ? `\n【禁用词】上一稿用了这些不在学习者词库里的词，请换用可用词汇表中的表达或改写句子，不要再用：${opts.bannedWords.join(', ')}。\n`
      : ''

  const system =
    '你是一位面向中小学英语学习者的教材作者。你写的课文自然、地道、有趣，' +
    '并且严格控制词汇难度：只使用学习者已经掌握的词（外加强制允许的功能词），' +
    '让学习者能顺畅读懂整篇文章。严格遵守 JSON 输出格式，不输出任何额外文字。'

  const user = `请用下面这组「${group.sceneLabel}」主题词写一篇${typeDesc}，要求：

1. ${topicDesc}，但不要偏离场景太远。
2. 难度要求：${difficultyHint(condition.difficulty)}
3. 正文长度${meta.length}（不含中文翻译）；若可用词汇较少可缩短，但不要空泛注水。
4. 【词汇约束 · 最重要】正文中的实词（名词、动词、形容词、副词）必须优先从下面的「可用词汇表」中选取。
   - 以下功能词/骨架词可以无限使用：${FUNCTION_WORDS}，以及数字、星期、月份。
   - 如果可用词汇不足以把内容写通顺，可以少量补充 A1 级常见词，但一篇最多 8 个，且不得使用生僻词、习语或高级表达。
   - 不要为了凑重点词而堆砌：同一个句子里最多出现 2 个重点词。
   - 学习者掌握的词汇越多，可用词汇表越大，文章就应越丰富（这是刻意设计）。
5. 【重点词】下面每个词至少出现一次，并用 <w>标签</w> 包裹原文，例如：He <w>ordered</w> a salad。标签内保留实际词形（时态、单复数变化可以），其余正文不要出现任何标签。
6. ${reviewWords.length ? `【复习词】${reviewWords.join(', ')} 请各重复出现 2-3 次（自然分布在不同段落/对话轮次）。` : '【复习词】无。'}
7. 每个 segment 的 en 是英文原文，zh 是该段/该句的准确中文翻译（对话逐句翻译）。
   【译文格式】zh 必须是纯中文文字，禁止出现任何标签、尖括号或重点词标记（不要写 <哥哥>、<w>哥哥</w> 之类）；
   标签只允许出现在 en 字段里，用来标记英文重点词。
8. type 必须是 "${kind}"。
${formatRules.map((r, i) => `${9 + i}. ${r}`).join('\n')}${formatRules.length ? '\n' : ''}
重点词（${group.words.length} 个）：
${words}
${allowedBlock}${missingBlock}${bannedBlock}
${outputFormat(kind)}`

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}

/**
 * 「测试连接」用的轻量请求。仍要求模型真正生成一段 JSON（而不是只回一个固定短串），
 * 这样「推理型模型把正文留在思考里 / 输出被截断 / 不认 JSON 参数」能在测试阶段就暴露，
 * 而不是等到生成课程时才报「内容为空」。
 */
export function buildTestMessages(): ChatMessage[] {
  return [
    { role: 'system', content: '你是接口连通性检测器，只输出一个 JSON 对象，不要解释、前言或代码块。' },
    {
      role: 'user',
      content:
        '请输出形如 {"ok": true, "sample": "..."} 的 JSON 对象，sample 里写一个不超过 12 个英文单词、关于猫的句子。只输出 JSON。',
    },
  ]
}
