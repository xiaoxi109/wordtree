import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isConfigReady, loadLlmConfig, LLM_CONFIG_CHANGED_EVENT, type LlmConfig } from '../config/llm'
import { TOPICS, buildMasteredPool, sceneLabelText } from '../lib/cluster'
import { loadAiPrefs, saveAiPrefs } from '../lib/aiPrefs'
import {
  LESSON_FORMATS,
  difficultyForRung,
  difficultyOptions,
  difficultyText,
  recommendedOptionId,
  resolveDifficulty,
  formatMeta,
  type Difficulty,
  type LessonFormatChoice,
} from '../lib/prompt'
import { useAiLessons } from '../hooks/useAiLessons'
import { deleteLesson, listLessons, type Lesson } from '../db'
import { getReviewWords } from '../lib/review'
import { stripMarkup } from '../lib/parse'
import { usePlayback, type PlayMode } from '../lib/playback'
import { MODE_LABEL, type LearningMode, type GeneratedPlan } from '../lib/planner'
import {
  cacheAdvice,
  collectDailyStats,
  generateDailyAdvice,
  getCachedAdvice,
  type DailyAdvice,
} from '../lib/dailyPlan'
import type { Level, Word } from '../data'
import { GRADE_RUNGS, LEVEL_RUNGS, type GradeRung, type LevelRung, type Route } from '../data/levels'
import LessonReader from './LessonReader'
import { Sheet } from '../components/Sheet'
import {
  BookOpenIcon,
  ChevronRightIcon,
  GearIcon,
  SparklesIcon,
  SpinnerIcon,
  TrashIcon,
  XIcon,
  RotateCcwIcon,
} from '../components/icons'

/** 生成中轮换的进度文案：LLM 耗时不可预估，用状态说明代替假的百分比 */
const WRITING_HINTS = [
  '正在挑选你已掌握的词…',
  '正在构思情节与词句…',
  '正在写英文正文与中文对照…',
  '正在校对词汇难度…',
]

/**
 * AI 定制课程（单篇模式 + 因材施教）
 *
 * 顶部：
 *   - 推荐状态栏：系统基于你的画像算出的「模式 · 词数 · 难度」
 *   - 「生成一篇」按钮（disabled 在未配置 / 未掌握词时）
 *
 * 底部：
 *   - 实时生成进度
 *   - 单篇课程卡片列表
 *
 * 生成条件 Sheet：
 *   ① 三种模式大按钮（🎯巩固 / ✨日常 / 🚀拉伸）— 只覆盖词数/复习比/场景权重，不影响句式难度
 *   ② 句式难度（上方标「系统推荐 Y」）
 *   ③ 内容场景（决定重点词来自哪些场景，选中后下方给出命中场景反馈）
 *   ④ 文章形态（决定怎么写，不改变重点词来源；别扭组合给轻提示）
 *
 * 每篇重点词数完全由 src/lib/planner.ts 依据学习者画像动态推荐，不提供手动设置。
 */
export default function AiView({
  masteredSet,
  onOpenWord,
  onToast,
  active = true,
  readerLessonId,
  onOpenSpirits,
  onOpenReader,
  onSwitchReader,
  onBack,
  activeLevels,
  targetLevel,
  myLevel,
  route = 'level',
  currentRung,
}: {
  masteredSet: Set<string>
  /** 文章点词 → 打开全局统一的查词弹层 */
  onOpenWord: (w: Word) => void
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void
  active?: boolean
  readerLessonId: string | null
  /** 打开 AI 词灵图鉴 */
  onOpenSpirits: () => void
  onOpenReader: (lessonId: string) => void
  /** 列表连播切篇：替换栈顶，不增加返回栈深度 */
  onSwitchReader: (lessonId: string) => void
  onBack: () => void
  activeLevels?: Level[]
  targetLevel?: Level | null
  /** 设置里「我的等级」对应的 CEFR 等级（推荐难度的锚点） */
  myLevel?: Level | null
  /** 设置里的学习路线：决定句式难度按西式等级还是中式年级显示 */
  route?: Route
  /** 设置里的「我的等级」 */
  currentRung?: GradeRung | LevelRung
}) {
  const [lessons, setLessons] = useState<Lesson[] | null>(null)
  const [mode, setMode] = useState<LearningMode>('daily')
  // 题材 / 体裁沿用上次选择（只持久化这两项，其余跟随设置与画像）
  const [topic, setTopicState] = useState<(typeof TOPICS)[number]['id']>(() => loadAiPrefs().topic)
  const setTopic = useCallback((id: (typeof TOPICS)[number]['id']) => {
    setTopicState(id)
    saveAiPrefs({ topic: id })
  }, [])
  // 难度选择保存「选项 id」（中式路线=年级 id，西式=CEFR 档位 id），生成时再解析成内部难度
  const [difficultyId, setDifficultyId] = useState<string>('adaptive')
  const [format, setFormatState] = useState<LessonFormatChoice>(() => loadAiPrefs().format)
  const setFormat = useCallback((f: LessonFormatChoice) => {
    setFormatState(f)
    saveAiPrefs({ format: f })
  }, [])
  const [cfg, setCfg] = useState<LlmConfig>(loadLlmConfig())
  const [, setReviewCount] = useState(() => getReviewWords().length)

  // ============ 今日学习计划（本地统计 + 可选的模型建议） ============
  const [advice, setAdvice] = useState<DailyAdvice | null>(() => getCachedAdvice() ?? null)
  const [planLoading, setPlanLoading] = useState(false)

  const loadDailyPlan = useCallback(
    async (force: boolean) => {
      setPlanLoading(true)
      try {
        const stats = await collectDailyStats()
        if (!force) {
          const cached = getCachedAdvice()
          if (cached) {
            setAdvice(cached)
            return
          }
        }
        const next = await generateDailyAdvice(stats)
        cacheAdvice(next)
        setAdvice(next)
      } catch {
        /* 计划生成失败不影响主流程 */
      } finally {
        setPlanLoading(false)
      }
    },
    [],
  )

  // 进入页面时：有缓存直接用，没有则生成一次
  useEffect(() => {
    if (!active) return
    if (getCachedAdvice()) {
      setAdvice(getCachedAdvice() ?? null)
      return
    }
    void loadDailyPlan(false)
  }, [active, loadDailyPlan])

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Lesson | null>(null)

  const { progress, generate, resume, cancel, previewPlan } = useAiLessons()

  // ============ 预计算推荐计划（每次模式 / 词库变化时重算） ============
  const recommended: GeneratedPlan = previewPlan(
    masteredSet,
    mode,
    activeLevels,
    targetLevel ?? null,
    myLevel ?? null,
  )
  // 难度选项跟随设置里的阶梯模式：西式=CEFR 档位，中式=每个年级一档
  const difficultyChoices = useMemo(() => difficultyOptions(route), [route])
  // 当前选中项解析出的内部难度；推荐项对应的选项 id
  const selectedDifficulty = resolveDifficulty(route, difficultyId)
  const recOptionId = recommendedOptionId(route, recommended.difficulty, currentRung)
  // 用户是否手动覆盖了系统推荐难度（词数跟随 planner 动态推荐，无覆盖）
  const userOverrode = selectedDifficulty !== 'adaptive' && selectedDifficulty !== recommended.difficulty

  const refreshLessons = useCallback(async () => {
    try {
      setLessons(await listLessons())
    } catch {
      onToast('读取课程列表失败', 'error')
    }
  }, [onToast])

  useEffect(() => { void refreshLessons() }, [refreshLessons])

  // 从阅读器返回列表时刷新
  useEffect(() => {
    if (readerLessonId !== null) return
    setReviewCount(getReviewWords().length)
    void refreshLessons()
  }, [readerLessonId, refreshLessons])

  // 切回 AI 标签、或在设置里切换启用模型时，立即同步连接配置与启用状态。
  useEffect(() => {
    const sync = () => {
      setCfg(loadLlmConfig())
      setReviewCount(getReviewWords().length)
    }
    if (active) sync()
    window.addEventListener(LLM_CONFIG_CHANGED_EVENT, sync)
    return () => window.removeEventListener(LLM_CONFIG_CHANGED_EVENT, sync)
  }, [active])

  // 生成结束 / 错误提示
  const shownError = useRef<string | null>(null)
  const prevStatus = useRef(progress.status)
  useEffect(() => {
    if (progress.error && shownError.current !== progress.error) {
      shownError.current = progress.error
      onToast(progress.error, 'error')
    }
    if (prevStatus.current === 'generating' && progress.status === 'idle') {
      void refreshLessons()
    }
    prevStatus.current = progress.status
  }, [progress.error, progress.status, onToast, refreshLessons])

  const masteredCount = masteredSet.size
  const generating = progress.status === 'generating'
  const configReady = isConfigReady(cfg)

  const [hintIndex, setHintIndex] = useState(0)
  useEffect(() => {
    if (!generating) {
      setHintIndex(0)
      return
    }
    const timer = window.setInterval(
      () => setHintIndex((i) => (i + 1) % WRITING_HINTS.length),
      2600,
    )
    return () => window.clearInterval(timer)
  }, [generating])
  // 生成中的那篇由顶部进度卡单独展示，列表里不再重复出现一张「写作中…」卡
  const visibleLessons = useMemo(
    () => lessons?.filter((l) =>
      !(generating && (l.id === progress.lessonId || l.status === 'generating'))
    ) ?? null,
    [lessons, generating, progress.lessonId],
  )

  // 只有「我的等级 / 掌握情况」会改变推荐难度；切换学习模式不影响难度，因此不在依赖里
  useEffect(() => {
    if (!userOverrode) setDifficultyId(recOptionId)
  }, [recOptionId, userOverrode])

  const startGenerate = async () => {
    if (generating) return
    if (!configReady) {
      onToast('还没有配置大模型：请到「我」→「大模型设置」填写接口与 Key', 'info')
      return
    }
    try {
      // 词数完全交给 planner 的动态推荐；这里只可能覆盖用户手动选的难度。
      const overrides: { difficulty?: Difficulty } = {}
      if (userOverrode) overrides.difficulty = selectedDifficulty

      const lesson = await generate(
        masteredSet,
        cfg,
        { topic, difficulty: selectedDifficulty === 'adaptive' ? recommended.difficulty : selectedDifficulty, format },
        mode,
        overrides.difficulty !== undefined ? overrides : undefined,
        activeLevels,
        targetLevel ?? null,
        myLevel ?? null,
      )
      setLessons((prev) => (prev ? [lesson, ...prev] : [lesson]))
      onToast('开始写作中…', 'success')
    } catch (e) {
      onToast(e instanceof Error ? e.message : '生成失败', 'error')
    }
  }

  // ============ 播放模式 / 列表连播会话 ============
  const [playback] = usePlayback()
  /** 切篇后让阅读器自动开始播放的信号（每次 +1） */
  const [autoStartToken, setAutoStartToken] = useState(0)
  /** 列表随机播放：本轮已播过的篇目，避免重复 */
  const listPlayedRef = useRef<Set<string>>(new Set())

  // 切换模式即开始一轮新的列表连播会话，清掉旧的「已播」记录
  useEffect(() => {
    listPlayedRef.current.clear()
  }, [playback.mode])

  /** 本篇自然播完：按模式挑选下一篇并替换栈顶，随后由阅读器自动续播 */
  const handleLessonEnd = useCallback(
    (mode: PlayMode) => {
      const pool = (lessons ?? []).filter((l) => l.status === 'ready')
      const current = readerLessonId
      if (!current || pool.length === 0) return
      let nextId: string | null = null
      if (mode === 'listSequential') {
        const idx = pool.findIndex((l) => l.id === current)
        nextId = idx >= 0 && idx + 1 < pool.length ? pool[idx + 1].id : null
      } else {
        listPlayedRef.current.add(current)
        const candidates = pool.filter((l) => !listPlayedRef.current.has(l.id))
        nextId = candidates.length
          ? candidates[Math.floor(Math.random() * candidates.length)].id
          : null
      }
      if (!nextId) {
        onToast('列表已播完', 'info')
        return
      }
      // 先给自动播放信号，再切篇；两者在同一个事件里批量更新
      setAutoStartToken((t) => t + 1)
      onSwitchReader(nextId)
    },
    [lessons, readerLessonId, onSwitchReader, onToast],
  )

  const openLesson = (id: string) => {
    // 手动打开课程视为新一轮连播：清掉随机历史，并复位自动播放信号，
    // 否则上次列表连播留下的 token 会让新挂载的阅读器误以为要自动播放。
    listPlayedRef.current.clear()
    setAutoStartToken(0)
    onOpenReader(id)
  }

  /**
   * 以下三个 useMemo 必须放在「阅读器早退」之前。
   * 早退（打开文章时 return <LessonReader/>）之后的 Hook 不会被调用，
   * React 会抛 "Rendered fewer hooks than expected" 并导致整页白屏。
   */
  // 已掌握词按场景计数：用于「题材 → 命中场景」的即时反馈
  const masteredCatCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const w of buildMasteredPool(masteredSet)) {
      if (w.category) m.set(w.category, (m.get(w.category) ?? 0) + 1)
    }
    return m
  }, [masteredSet])

  /** 题材命中情况：让用户看到这次的重点词会从哪些场景抽，以及是否回退 */
  const topicFeedback = useMemo(() => {
    const meta = TOPICS.find((t) => t.id === topic)
    if (!meta || topic === 'random') {
      return { text: '不限定题材：按你的画像权重从全部已掌握词里挑场景。', tone: 'muted' as const }
    }
    const hits = meta.categories.filter((c) => (masteredCatCount.get(c) ?? 0) > 0)
    const total = hits.reduce((s, c) => s + (masteredCatCount.get(c) ?? 0), 0)
    if (hits.length === 0) {
      return {
        text: `已掌握词里暂时没有「${meta.label}」相关场景，会回退到其他场景；可先去词库多标记一些词。`,
        tone: 'warn' as const,
      }
    }
    return {
      text: `重点词来自：${hits.map((c) => sceneLabelText(c)).join(' / ')}（共 ${total} 个已掌握词）`,
      tone: 'muted' as const,
    }
  }, [topic, masteredCatCount])

  const formatTopicNote = useMemo(() => comboNote(topic, format), [topic, format])

  /* ------------------------------ 阅读器 ------------------------------ */
  if (readerLessonId) {
    return (
      <LessonReader
        key={readerLessonId}
        lessonId={readerLessonId}
        onBack={onBack}
        onOpenWord={onOpenWord}
        onRetrySingle={(id) => resume(id, cfg, masteredSet).then(() => void refreshLessons())}
        busy={generating}
        active={active}
        onToast={onToast}
        onLessonEnd={handleLessonEnd}
        autoStartToken={autoStartToken}
      />
    )
  }

  /* ------------------------------ 列表页 ------------------------------ */

  const modeMeta = MODE_LABEL[mode]
  const topicLabel = TOPICS.find((t) => t.id === topic)?.label ?? '随机'
  const difficultyLabel = difficultyText(route, difficultyId)
  const recommendedDifficultyLabel = difficultyText(route, recOptionId)
  const rungMetaLabel = route === 'grade'
    ? GRADE_RUNGS.find((g) => g.id === currentRung)?.label
    : LEVEL_RUNGS.find((l) => l.id === currentRung)?.label
  const myRungLabel = currentRung ? (rungMetaLabel ?? String(currentRung)) : null
  const myDifficulty = currentRung ? difficultyForRung(route, currentRung) : null

  return (
    // 固定头 + 内部独立滚动：标题/生成卡不在任何滚动容器里，物理上不会位移
    // 可用高度 = 100dvh - main顶 padding(safe+16) - main底 padding(safe+78 底导航)
    <div className="flex h-[calc(100dvh_-_env(safe-area-inset-top)_-_16px_-_env(safe-area-inset-bottom)_-_78px)] flex-col overflow-hidden">
      {/* 固定头：标题 + 今日计划 + 生成卡 */}
      <div className="shrink-0 pb-2">
        {/* 今日学习计划 */}
        {advice && (
          <section className="mb-2 rounded-[18px] border border-fuchsia-200/60 bg-gradient-to-br from-fuchsia-50 via-white to-white p-3.5 shadow-sm dark:border-fuchsia-500/25 dark:from-fuchsia-500/10 dark:via-slate-800/40 dark:to-slate-800/40">
            <div className="flex items-center gap-2">
              <SparklesIcon width={14} height={14} className="shrink-0 text-fuchsia-600 dark:text-fuchsia-300" />
              <p className="min-w-0 flex-1 text-[13px] font-bold leading-snug text-slate-800 dark:text-slate-100 line-clamp-2">
                {advice.headline}
              </p>
              <span className="shrink-0 rounded-full bg-slate-900/[0.05] px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-400">
                约 {advice.minutes} 分钟
              </span>
              <button
                onClick={() => void loadDailyPlan(true)}
                disabled={planLoading}
                aria-label="重新生成今日计划"
                className="shrink-0 rounded-[10px] p-1 text-slate-400 transition active:scale-95 disabled:opacity-40"
              >
                <RotateCcwIcon width={14} height={14} />
              </button>
            </div>
            <ul className="mt-2 space-y-1">
              {advice.actions.map((a) => (
                <li key={a.label} className="flex items-baseline gap-2 text-[12px] leading-relaxed">
                  <span className="shrink-0 rounded-[8px] bg-fuchsia-100 px-1.5 py-0.5 text-[10px] font-bold text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300">
                    {a.label}
                  </span>
                  <span className="min-w-0 flex-1 text-slate-500 dark:text-slate-400">{a.detail}</span>
                </li>
              ))}
            </ul>
            {advice.focusWords.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {advice.focusWords.map((w) => (
                  <span
                    key={w}
                    className="rounded-full border border-slate-900/[0.06] px-2 py-0.5 font-display text-[11px] font-semibold text-slate-600 dark:border-white/10 dark:text-slate-300"
                  >
                    {w}
                  </span>
                ))}
              </div>
            )}
            {advice.source === 'local' && (
              <p className="mt-1.5 text-[10px] text-slate-400">配置大模型后，这里会给出更贴合你的建议</p>
            )}

            {/* 词灵入口 */}
            <button
              onClick={onOpenSpirits}
              className="mt-2.5 flex w-full items-center gap-2 rounded-[12px] border border-fuchsia-200/70 bg-white/80 px-3 py-2 text-left transition active:scale-[0.99] dark:border-fuchsia-500/25 dark:bg-white/[0.04]"
            >
              <SparklesIcon width={15} height={15} className="shrink-0 text-fuchsia-600 dark:text-fuchsia-300" />
              <span className="min-w-0 flex-1 text-[12px] font-bold text-slate-700 dark:text-slate-200">
                我的词灵图鉴 · AI 给每个词创造一只角色
              </span>
              <ChevronRightIcon width={15} height={15} className="shrink-0 text-slate-300" />
            </button>
          </section>
        )}

        <div className="mb-2 flex items-end gap-2">
          <h2 className="font-display text-[18px] font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            AI 定制课程
          </h2>
          <span className="truncate text-[11px] text-slate-400">因材施教</span>
        </div>

        {/* 推荐状态 + 生成按钮 + 自定义条件：合并成一块 */}
        {!generating && (
        <section className="rounded-[18px] border border-brand-200/60 bg-gradient-to-br from-brand-50 via-white to-white p-3.5 shadow-sm dark:border-brand-500/25 dark:from-brand-500/10 dark:via-slate-800/40 dark:to-slate-800/40">
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
              mode === 'review' ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200'
              : mode === 'stretch' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200'
              : 'bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-200'
            }`}>
              {modeMeta.emoji} {modeMeta.label}
            </span>
            <span className="text-[13px] font-bold text-slate-800 dark:text-slate-100">
              {recommendedDifficultyLabel}
            </span>
          </div>
          <button
            onClick={startGenerate}
            disabled={masteredCount === 0}
            className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-[14px] bg-accent-lime px-3.5 py-2 text-[12px] font-bold text-slate-900 shadow-soft transition duration-200 hover:brightness-105 active:scale-[0.97] disabled:opacity-40"
          >
            {configReady ? (
              <SparklesIcon width={14} height={14} />
            ) : (
              <GearIcon width={14} height={14} />
            )}
            生成一篇
          </button>
        </div>
        {masteredCount === 0 && (
          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
            去「词库」标记「已掌握」，这里就能开写。
          </p>
        )}
        {!configReady && (
          <p className="mt-1.5 text-[11px] leading-relaxed text-amber-600 dark:text-amber-300">
            大模型还没配置：请到「我」→「大模型设置」填写接口与 Key。
          </p>
        )}

        <button
          onClick={() => setSettingsOpen(true)}
          className="mt-2 flex w-full items-center gap-2 rounded-[10px] bg-slate-900/[0.04] px-3 py-1.5 text-left transition hover:bg-slate-900/[0.07] active:scale-[0.995] dark:bg-white/[0.06] dark:hover:bg-white/10"
        >
          <span className="min-w-0 flex-1 truncate text-[11px] text-slate-500 dark:text-slate-400">
            自定义：{modeMeta.label} · 难度 {difficultyLabel} · {topicLabel}
          </span>
          <ChevronRightIcon width={14} height={14} className="shrink-0 text-slate-300" />
        </button>
      </section>
      )}

      {/* ③ 实时生成进度（生成中替换生成卡，同样固定） */}
      {generating && (
        <section className="mb-2 rounded-[18px] border border-brand-200/60 bg-gradient-to-br from-brand-50 via-white to-white p-3.5 shadow-sm dark:border-brand-500/25 dark:from-brand-500/10 dark:via-slate-800/40 dark:to-slate-800/40">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-white/85 text-brand-600 shadow-sm dark:bg-slate-800/70 dark:text-brand-300">
              <SparklesIcon width={19} height={19} className="animate-pulse" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold text-slate-800 dark:text-slate-100">正在为你写课文…</p>
              <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                {progress.sceneLabel || '准备词库'}
              </p>
            </div>
            <button
              onClick={cancel}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/70 text-slate-400 transition hover:bg-white hover:text-slate-700 active:scale-95 dark:bg-slate-800/60 dark:text-slate-300"
              aria-label="取消生成"
            >
              <XIcon width={15} height={15} />
            </button>
          </div>

          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-brand-100/70 dark:bg-white/10">
            <div className="progress-indeterminate h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600" />
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
            <SpinnerIcon width={12} height={12} className="shrink-0 animate-spin text-brand-500" />
            <span key={hintIndex} className="animate-fade-in truncate">
              {WRITING_HINTS[hintIndex]}
            </span>
          </div>
        </section>
      )}

      {/* ④ 列表标题行：固定，不随列表滚动 */}
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="eyebrow">我的课程</p>
        {visibleLessons && visibleLessons.length > 0 && (
          <span className="text-[11px] text-slate-400">{visibleLessons.length} 篇</span>
        )}
      </div>
      </div>

      {/* 滚动区：只有课程列表滚，且不显示原生滚动条 */}
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto pb-2">
      {!visibleLessons ? (
        <div className="flex justify-center py-10 text-slate-400">
          <SpinnerIcon width={22} height={22} className="animate-spin" />
        </div>
      ) : visibleLessons.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-slate-300/70 py-12 text-center text-sm text-slate-400 dark:border-slate-700/70">
          还没有 AI 课程
          <p className="mt-1 text-xs">点上面的「生成一篇」创建第一篇</p>
        </div>
      ) : (
        <div className="stagger space-y-2">
          {visibleLessons.map((l) => (
            <LessonCard
              key={l.id}
              lesson={l}
              onOpen={() => openLesson(l.id)}
              onDelete={() => setDeleteTarget(l)}
            />
          ))}
        </div>
      )}
      </div>

      {/* ----------------------------- 底部 Sheet ----------------------------- */}

      {/* 生成条件 Sheet（含三种模式大按钮） */}
      <Sheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="自定义生成条件"
        subtitle="三种模式覆盖全部偏好，下面可以细调"
      >
        {!configReady && (
          <div className="mb-4 rounded-[18px] border border-amber-200/60 bg-amber-50/70 px-4 py-3 text-[12px] leading-relaxed text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300">
            大模型还没配置。请到「我」→「大模型设置」填写接口地址与 Key，再回来生成。
          </div>
        )}

        <div className="space-y-5">
          {/* 模式大按钮组 */}
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
              学习模式
            </p>
            <div className="grid grid-cols-3 gap-2">
              {(['review', 'daily', 'stretch'] as LearningMode[]).map((m) => {
                const meta = MODE_LABEL[m]
                const active = mode === m
                return (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`flex flex-col items-start rounded-[14px] border p-3 text-left transition duration-200 active:scale-[0.98] ${
                      active
                        ? 'border-brand-400 bg-brand-50 dark:border-brand-500 dark:bg-brand-500/15'
                        : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800/50'
                    }`}
                  >
                    <span className="text-lg">{meta.emoji}</span>
                    <span className={`mt-0.5 text-[12px] font-bold ${
                      active ? 'text-brand-700 dark:text-brand-200' : 'text-slate-700 dark:text-slate-200'
                    }`}>
                      {meta.label}
                    </span>
                    <span className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-slate-400">
                      {meta.hint}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 句式难度（等级按设置里的阶梯模式显示，标注推荐值与我的等级） */}
          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
                句式难度
              </p>
              <p className="text-[10px] font-semibold text-brand-600 dark:text-brand-300">
                系统推荐 {recommendedDifficultyLabel}
                {userOverrode && ' · 已自定义'}
              </p>
            </div>
            {myRungLabel && (
              <p className="mb-1.5 text-[10px] text-slate-400 dark:text-slate-500">
                当前：{route === 'grade' ? '中式阶梯' : '西式阶梯'} · 我的等级 {myRungLabel}
              </p>
            )}
            <div className="no-scrollbar flex flex-wrap gap-1.5">
              {difficultyChoices.map((d) => {
                const rec = d.id === recOptionId
                return (
                  <button
                    key={d.id}
                    onClick={() => setDifficultyId(d.id)}
                    className={`chip-on ${difficultyId === d.id ? '' : 'chip-off'} ${rec ? 'ring-1 ring-brand-400/60' : ''}`}
                  >
                    {d.label}
                    {rec && <span className="ml-0.5 text-[9px] text-brand-500">✦</span>}
                    {myDifficulty !== null && d.difficulty === myDifficulty && !rec && (
                      <span className="ml-0.5 text-[9px] text-slate-400 dark:text-slate-500">· 我的等级</span>
                    )}
                  </button>
                )
              })}
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
              {route === 'grade'
                ? '按中式阶梯显示年级，与设置里的「我的等级」同一体系；选「自适应」让模型贴合你的实际水平。'
                : '选「自适应」让模型贴合你的实际水平；选具体等级会强制难度向上/向下对齐。'}
            </p>
          </div>

          <OptionGroup
            label="内容场景"
            value={topic}
            options={TOPICS.map((t) => ({ id: t.id, label: t.label }))}
            onChange={(id) => setTopic(id as (typeof TOPICS)[number]['id'])}
            hint="决定这一篇的重点词从哪些场景来，不改变文章写法。"
            note={topicFeedback.text}
            noteTone={topicFeedback.tone}
          />

          <OptionGroup
            label="文章形态"
            value={format}
            options={[
              { id: 'auto', label: '✨ 自动混搭' },
              ...LESSON_FORMATS.map((f) => ({ id: f.id, label: `${f.emoji} ${f.label}` })),
            ]}
            onChange={(id) => setFormat(id as LessonFormatChoice)}
            hint={format === 'auto' ? '自动混搭：每次换一种写法，并尽量不和上一篇重复。' : formatMeta(format).brief}
            note={formatTopicNote ?? '只改变写法，不改变重点词来源；重点词仍来自上面的「内容场景」。'}
            noteTone={formatTopicNote ? 'warn' : 'muted'}
          />
        </div>
      </Sheet>

      {/* 删除二次确认 */}
      {deleteTarget && (
        <Sheet
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          title="确认删除"
          subtitle={`「${deleteTarget.title || sceneLabelText(deleteTarget.scene_label)}」会被永久删除`}
          footer={
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setDeleteTarget(null)} className="btn-soft !py-2.5 text-sm">
                取消
              </button>
              <button
                onClick={async () => {
                  await deleteLesson(deleteTarget.id)
                  await refreshLessons()
                  setDeleteTarget(null)
                  onToast('已删除', 'success')
                }}
                className="rounded-[14px] bg-rose-500 py-2.5 text-sm font-bold text-white transition active:scale-[0.98]"
              >
                删除
              </button>
            </div>
          }
        >
          <p className="text-[12px] leading-relaxed text-rose-500/80 dark:text-rose-300/70">
            这篇的正文、重点词标记都一并清除；从中学到的词不会被撤回。
          </p>
        </Sheet>
      )}
    </div>
  )
}

/* ------------------------------ 子组件 ------------------------------ */

function LessonCard({
  lesson,
  onOpen,
  onDelete,
}: {
  lesson: Lesson
  onOpen: () => void
  onDelete?: () => void
}) {
  const fmt = formatMeta(lesson.kind)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      className="flex cursor-pointer items-start gap-2.5 rounded-[16px] border border-slate-200/60 bg-white/65 p-3 transition duration-200 hover:border-brand-300/50 hover:bg-white hover:shadow-soft active:scale-[0.995] dark:border-slate-700/50 dark:bg-slate-800/45 dark:hover:border-brand-500/30"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-brand-600 text-white">
        <BookOpenIcon width={18} height={18} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-bold text-slate-800 dark:text-slate-100">
            {stripMarkup(lesson.title) || '写作中…'}
          </span>
          {lesson.status !== 'ready' && <LessonStatusBadge status={lesson.status} />}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
          <span className={`rounded-full px-1.5 py-0.5 ${fmt.badge}`}>
            {fmt.emoji} {fmt.label}
          </span>
          {lesson.generation_mode && lesson.generation_mode !== 'daily' && (
            <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
              {MODE_LABEL[lesson.generation_mode].emoji} {MODE_LABEL[lesson.generation_mode].label}
            </span>
          )}
          {lesson.error && (
            <span className="text-rose-500 line-clamp-1">{lesson.error}</span>
          )}
        </div>
      </div>

      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          onKeyDown={(e) => e.stopPropagation()}
          className="shrink-0 rounded-full p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500 active:scale-95 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
          aria-label="删除这篇课程"
          title="删除"
        >
          <TrashIcon width={16} height={16} />
        </button>
      )}
    </div>
  )
}

function LessonStatusBadge({ status }: { status: Lesson['status'] }) {
  const map: Record<Lesson['status'], { label: string; cls: string }> = {
    generating: { label: '写作中', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300' },
    ready: { label: '已完成', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
    failed: { label: '失败', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' },
  }
  const s = map[status] ?? map.generating
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.cls}`}>{s.label}</span>
}

/**
 * 少数语义别扭的「内容场景 × 文章形态」组合：只提示，不禁用。
 * 系统仍会照常生成，用户可自行判断。
 */
function comboNote(topic: (typeof TOPICS)[number]['id'], format: LessonFormatChoice): string | null {
  if (format === 'auto' || topic === 'random') return null
  if (format === 'poem' && (topic === 'tech' || topic === 'work')) {
    return '韵律小诗更适合动物童趣 / 日常生活题材，这一组合读起来可能偏生硬。'
  }
  if (format === 'diary' && (topic === 'tech' || topic === 'work')) {
    return '日记体更适合日常生活 / 校园题材，这一组合可能略显别扭。'
  }
  if (format === 'email' && topic === 'story') {
    return '邮件便条更适合日常 / 职场题材，动物童趣题材不太好落笔。'
  }
  return null
}

function OptionGroup({
  label,
  value,
  options,
  onChange,
  hint,
  note,
  noteTone = 'muted',
}: {
  label: string
  value: string
  options: { id: string; label: string }[]
  onChange: (id: string) => void
  hint?: string
  /** 额外反馈行：题材命中场景 / 组合提示 */
  note?: string | null
  noteTone?: 'muted' | 'warn'
}) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <div className="no-scrollbar flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            className={value === o.id ? 'chip-on' : 'chip-off'}
          >
            {o.label}
          </button>
        ))}
      </div>
      {hint && <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{hint}</p>}
      {note && (
        <p
          className={`mt-1 text-[11px] leading-relaxed ${
            noteTone === 'warn'
              ? 'text-amber-600 dark:text-amber-300'
              : 'text-brand-600/85 dark:text-brand-300/85'
          }`}
        >
          {note}
        </p>
      )}
    </div>
  )
}
