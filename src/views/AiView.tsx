import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isConfigReady, loadLlmConfig, LLM_CONFIG_CHANGED_EVENT, type LlmConfig } from '../config/llm'
import { TOPICS } from '../lib/cluster'
import {
  LESSON_FORMATS,
  difficultyForRung,
  difficultyOptions,
  difficultyText,
  formatMeta,
  type Difficulty,
  type LessonFormatChoice,
} from '../lib/prompt'
import { useAiLessons } from '../hooks/useAiLessons'
import { deleteLesson, listLessons, type Lesson } from '../db'
import { getReviewWords } from '../lib/review'
import { MODE_LABEL, type LearningMode, type GeneratedPlan } from '../lib/planner'
import type { Level } from '../data'
import { GRADE_RUNGS, LEVEL_RUNGS, type GradeRung, type LevelRung, type Route } from '../data/levels'
import LessonReader from './LessonReader'
import { Sheet, ActionSheet } from '../components/Sheet'
import {
  BookOpenIcon,
  ChevronRightIcon,
  GearIcon,
  MoreIcon,
  PlayIcon,
  SparklesIcon,
  SpinnerIcon,
  TrashIcon,
  XIcon,
} from '../components/icons'

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
 *   ① 三种模式大按钮（🎯巩固 / ✨日常 / 🚀拉伸）— 选了自动覆盖词数/难度/复习比
 *   ② 句式难度（上方标「系统推荐 Y」）
 *   ③ 题材侧重
 *   ④ 课程体裁
 *
 * 每篇重点词数完全由 src/lib/planner.ts 依据学习者画像动态推荐，不提供手动设置。
 */
export default function AiView({
  masteredSet,
  onApplyMark,
  onToast,
  active = true,
  readerLessonId,
  onOpenReader,
  onBack,
  activeLevels,
  targetLevel,
  route = 'level',
  currentRung,
}: {
  masteredSet: Set<string>
  onApplyMark: (word: string[], mode: 'add' | 'remove') => void
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void
  active?: boolean
  readerLessonId: string | null
  onOpenReader: (lessonId: string) => void
  onBack: () => void
  activeLevels?: Level[]
  targetLevel?: Level | null
  /** 设置里的学习路线：决定句式难度按西式等级还是中式年级显示 */
  route?: Route
  /** 设置里的「我的等级」 */
  currentRung?: GradeRung | LevelRung
}) {
  const [lessons, setLessons] = useState<Lesson[] | null>(null)
  const [mode, setMode] = useState<LearningMode>('daily')
  const [topic, setTopic] = useState<(typeof TOPICS)[number]['id']>('random')
  const [difficulty, setDifficulty] = useState<Difficulty>('adaptive')
  const [format, setFormat] = useState<LessonFormatChoice>('auto')
  const [cfg, setCfg] = useState<LlmConfig>(loadLlmConfig())
  const [reviewCount, setReviewCount] = useState(() => getReviewWords().length)

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [moreFor, setMoreFor] = useState<Lesson | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Lesson | null>(null)

  const { progress, generate, resume, cancel, previewPlan } = useAiLessons()

  // ============ 预计算推荐计划（每次模式 / 词库变化时重算） ============
  const recommended: GeneratedPlan = previewPlan(
    masteredSet,
    mode,
    activeLevels,
    targetLevel ?? null,
  )
  // 难度选项的显示名跟随设置里的阶梯模式（内部值仍是 CEFR 档位）
  const difficultyChoices = useMemo(
    () => difficultyOptions(route, currentRung),
    [route, currentRung],
  )
  // 用户是否手动覆盖了系统推荐难度（词数跟随 planner 动态推荐，无覆盖）
  const userOverrode = difficulty !== 'adaptive' && difficulty !== recommended.difficulty

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

  // 模式切换 / 掌握词数 / 目标等级变化都会改变推荐难度（除非用户手动 override 过）
  useEffect(() => {
    if (!userOverrode) setDifficulty(recommended.difficulty)
  }, [mode, recommended.difficulty, userOverrode])

  const startGenerate = async () => {
    if (generating) return
    if (!configReady) {
      onToast('还没有配置大模型：请到「我」→「大模型设置」填写接口与 Key', 'info')
      return
    }
    try {
      // 词数完全交给 planner 的动态推荐；这里只可能覆盖用户手动选的难度。
      const overrides: { difficulty?: Difficulty } = {}
      if (difficulty !== 'adaptive' && difficulty !== recommended.difficulty) overrides.difficulty = difficulty

      const lesson = await generate(
        masteredSet,
        cfg,
        { topic, difficulty: difficulty === 'adaptive' ? recommended.difficulty : difficulty, format },
        mode,
        overrides.difficulty !== undefined ? overrides : undefined,
        activeLevels,
        targetLevel ?? null,
      )
      setLessons((prev) => (prev ? [lesson, ...prev] : [lesson]))
      onToast('开始写作中…', 'success')
    } catch (e) {
      onToast(e instanceof Error ? e.message : '生成失败', 'error')
    }
  }

  const handleMark = useCallback(
    (word: string, mode: 'add' | 'remove') => {
      onApplyMark([word], mode)
      setReviewCount(getReviewWords().length)
    },
    [onApplyMark],
  )

  /* ------------------------------ 阅读器 ------------------------------ */
  if (readerLessonId) {
    return (
      <LessonReader
        lessonId={readerLessonId}
        onBack={onBack}
        onApplyMark={handleMark}
        onRetrySingle={(id) => resume(id, cfg).then(() => void refreshLessons())}
        busy={generating}
        active={active}
        onToast={onToast}
      />
    )
  }

  /* ------------------------------ 列表页 ------------------------------ */

  const modeMeta = MODE_LABEL[mode]
  const topicLabel = TOPICS.find((t) => t.id === topic)?.label ?? '随机'
  const difficultyLabel = difficultyText(route, difficulty, currentRung)
  const recommendedDifficultyLabel = difficultyText(route, recommended.difficulty, currentRung)
  const rungMetaLabel = route === 'grade'
    ? GRADE_RUNGS.find((g) => g.id === currentRung)?.label
    : LEVEL_RUNGS.find((l) => l.id === currentRung)?.label
  const myRungLabel = currentRung ? (rungMetaLabel ?? String(currentRung)) : null
  const myDifficulty = currentRung ? difficultyForRung(route, currentRung) : null
  const formatLabel = format === 'auto' ? '自动混搭' : formatMeta(format).label

  return (
    <div className="pb-2">
      <div className="mb-3 flex items-end gap-2">
        <h2 className="font-display text-[18px] font-semibold tracking-tight text-slate-900 dark:text-slate-50">
          AI 定制课程
        </h2>
        <span className="truncate text-[11px] text-slate-400">一次一篇 · 因材施教</span>
      </div>

      {/* ① 推荐状态栏（顶部，始终可见） */}
      <section className="mb-3 rounded-[18px] border border-brand-200/60 bg-gradient-to-br from-brand-50 via-white to-white p-3.5 dark:border-brand-500/25 dark:from-brand-500/10 dark:via-slate-800/40 dark:to-slate-800/40">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
            mode === 'review' ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200'
            : mode === 'stretch' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200'
            : 'bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-200'
          }`}>
            {modeMeta.emoji} {modeMeta.label}
          </span>
          <span className="text-[13px] font-bold text-slate-800 dark:text-slate-100">
            {recommended.wordsPerLesson} 词 · {recommendedDifficultyLabel}
          </span>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
          {recommended.reason}
        </p>
      </section>

      {/* ② 主按钮 + 条件 Sheet 触发器 */}
      <section className="surface mb-3 p-3">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold text-slate-800 dark:text-slate-100">
              {masteredCount === 0 ? '先标记已掌握的词' : `已掌握 ${masteredCount} 词 · 复习 ${reviewCount}`}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-slate-400">
              {topicLabel} · {formatLabel} · {difficultyLabel}
            </p>
          </div>
          <button
            onClick={startGenerate}
            disabled={generating || masteredCount === 0}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-[14px] bg-accent-lime px-4 py-2 text-[13px] font-bold text-slate-900 shadow-soft transition duration-200 hover:brightness-105 active:scale-[0.97] disabled:opacity-40"
          >
            {generating ? (
              <SpinnerIcon width={15} height={15} className="animate-spin" />
            ) : configReady ? (
              <SparklesIcon width={15} height={15} />
            ) : (
              <GearIcon width={15} height={15} />
            )}
            {generating ? progress.sceneLabel || '写作中' : '生成一篇'}
          </button>
        </div>

        {masteredCount === 0 && (
          <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
            去「词库」标记「已掌握」，这里就能开写。
          </p>
        )}
        {!configReady && (
          <p className="mt-2 text-[11px] leading-relaxed text-amber-600 dark:text-amber-300">
            大模型还没配置：请到「我」→「大模型设置」填写接口与 Key。
          </p>
        )}

        <button
          onClick={() => setSettingsOpen(true)}
          className="mt-2 flex w-full items-center gap-2 rounded-[10px] bg-slate-900/[0.04] px-3 py-1.5 text-left transition hover:bg-slate-900/[0.07] active:scale-[0.995] dark:bg-white/[0.06] dark:hover:bg-white/10"
        >
          <span className="min-w-0 flex-1 truncate text-[11px] text-slate-500 dark:text-slate-400">
            自定义：{modeMeta.label} · 词数 {recommended.wordsPerLesson}（自动） · 难度 {difficultyLabel} · {topicLabel}
          </span>
          <ChevronRightIcon width={14} height={14} className="shrink-0 text-slate-300" />
        </button>
      </section>

      {/* ③ 实时生成进度 */}
      {generating && (
        <section className="surface mt-4 p-4">
          <div className="mb-2 flex items-center gap-2">
            <SpinnerIcon width={14} height={14} className="animate-spin text-brand-500" />
            <p className="text-sm font-bold text-slate-700 dark:text-slate-100">
              正在写作 · {progress.sceneLabel}
            </p>
            <button
              onClick={cancel}
              className="ml-auto rounded-full p-1.5 text-slate-400 transition hover:bg-slate-900/5 dark:hover:bg-white/10"
              aria-label="取消生成"
            >
              <XIcon width={16} height={16} />
            </button>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-slate-900/[0.07] dark:bg-white/10">
            <div className="h-full w-2/3 rounded-full bg-brand-500 animate-pulse" />
          </div>
          <p className="mt-2 text-[11px] text-slate-400">可离开本页；写作完成后自动更新到列表。</p>
        </section>
      )}

      {/* ④ 列表 */}
      <div className="mb-2 mt-3 flex items-center justify-between">
        <p className="eyebrow">我的课程</p>
        {lessons && lessons.length > 0 && (
          <span className="text-[11px] text-slate-400">{lessons.length} 篇</span>
        )}
      </div>

      {!lessons ? (
        <div className="flex justify-center py-10 text-slate-400">
          <SpinnerIcon width={22} height={22} className="animate-spin" />
        </div>
      ) : lessons.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-slate-300/70 py-12 text-center text-sm text-slate-400 dark:border-slate-700/70">
          还没有 AI 课程
          <p className="mt-1 text-xs">点上面的「生成一篇」创建第一篇</p>
        </div>
      ) : (
        <div className="stagger space-y-2">
          {lessons.map((l) => (
            <LessonCard
              key={l.id}
              lesson={l}
              onOpen={() => onOpenReader(l.id)}
              onMore={() => setMoreFor(l)}
            />
          ))}
        </div>
      )}

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
                {difficulty !== 'adaptive' && difficulty !== recommended.difficulty && ' · 已自定义'}
              </p>
            </div>
            {myRungLabel && (
              <p className="mb-1.5 text-[10px] text-slate-400 dark:text-slate-500">
                当前：{route === 'grade' ? '中式阶梯' : '西式阶梯'} · 我的等级 {myRungLabel}
              </p>
            )}
            <div className="no-scrollbar flex flex-wrap gap-1.5">
              {difficultyChoices.map((d) => {
                const rec = d.id === recommended.difficulty
                return (
                  <button
                    key={d.id}
                    onClick={() => setDifficulty(d.id as Difficulty)}
                    className={`chip-on ${difficulty === d.id ? '' : 'chip-off'} ${rec ? 'ring-1 ring-brand-400/60' : ''}`}
                  >
                    {d.label}
                    {rec && <span className="ml-0.5 text-[9px] text-brand-500">✦</span>}
                    {d.id === myDifficulty && (
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
            label="题材侧重"
            value={topic}
            options={TOPICS.map((t) => ({ id: t.id, label: t.label }))}
            onChange={(id) => setTopic(id as (typeof TOPICS)[number]['id'])}
            hint="指定题材时加权挑选该题材下的场景；随机则按你的画像自适应。"
          />

          <OptionGroup
            label="课程体裁"
            value={format}
            options={[
              { id: 'auto', label: '✨ 自动混搭' },
              ...LESSON_FORMATS.map((f) => ({ id: f.id, label: `${f.emoji} ${f.label}` })),
            ]}
            onChange={(id) => setFormat(id as LessonFormatChoice)}
            hint={format === 'auto' ? '每次生成随机挑一种体裁' : formatMeta(format).brief}
          />
        </div>
      </Sheet>

      {/* 卡片操作 ActionSheet */}
      {moreFor && (
        <ActionSheet
          open={!!moreFor}
          onClose={() => setMoreFor(null)}
          title={moreFor.title || moreFor.scene_label}
          message={statusMessage(moreFor)}
          actions={[
            ...(moreFor.status === 'failed' || moreFor.status === 'generating'
              ? [
                  {
                    label: moreFor.status === 'failed' ? '重新生成' : '继续等待',
                    description: moreFor.status === 'failed' ? '用相同的词再调一次大模型' : '回到列表等它完成',
                    icon: <SparklesIcon width={18} height={18} />,
                    onClick: () => {
                      if (moreFor.status === 'failed') {
                        resume(moreFor.id, cfg).then(() => void refreshLessons()).catch(() => {})
                        onToast('重新生成中…', 'info')
                      }
                      setMoreFor(null)
                    },
                  },
                ]
              : []),
            {
              label: '删除',
              description: '删除后无法恢复',
              icon: <TrashIcon width={18} height={18} />,
              tone: 'danger' as const,
              onClick: () => setDeleteTarget(moreFor),
            },
          ]}
        />
      )}

      {/* 删除二次确认 */}
      {deleteTarget && (
        <Sheet
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          title="确认删除"
          subtitle={`「${deleteTarget.title || deleteTarget.scene_label}」会被永久删除`}
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
                  setMoreFor(null)
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

function statusMessage(l: Lesson): string {
  const s = statusLabel(l.status)
  if (l.status === 'ready' && l.read_at) return `${s} · 已读`
  if (l.coverage_total && l.coverage_total > 0) {
    const covered = l.coverage_hit ?? 0
    return `${s} · 覆盖 ${covered}/${l.coverage_total}`
  }
  return s
}

function statusLabel(s: Lesson['status']): string {
  return s === 'ready' ? '已完成' : s === 'failed' ? '生成失败' : '写作中'
}

/* ------------------------------ 子组件 ------------------------------ */

function LessonCard({
  lesson,
  onOpen,
  onMore,
}: {
  lesson: Lesson
  onOpen: () => void
  onMore?: () => void
}) {
  const fmt = formatMeta(lesson.kind)
  const generating = lesson.status === 'generating'
  const failed = lesson.status === 'failed'
  const canRead = lesson.status === 'ready'

  return (
    <div className="rounded-[16px] border border-slate-200/60 bg-white/65 p-3 transition duration-200 hover:border-brand-300/50 hover:bg-white hover:shadow-soft dark:border-slate-700/50 dark:bg-slate-800/45 dark:hover:border-brand-500/30">
      <div className="flex items-start gap-2.5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-brand-600 text-white">
          <BookOpenIcon width={18} height={18} />
        </div>

        <button onClick={onOpen} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] font-bold text-slate-800 dark:text-slate-100">
              {lesson.title || '写作中…'}
            </span>
            <LessonStatusBadge status={lesson.status} />
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
            <span className={`rounded-full px-1.5 py-0.5 ${fmt.badge}`}>
              {fmt.emoji} {fmt.label}
            </span>
            <span className="rounded-full bg-slate-900/5 px-1.5 py-0.5 text-slate-500 dark:bg-white/10 dark:text-slate-300">
              {lesson.scene_label}
            </span>
            {lesson.generation_mode && lesson.generation_mode !== 'daily' && (
              <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                {MODE_LABEL[lesson.generation_mode].emoji} {MODE_LABEL[lesson.generation_mode].label}
              </span>
            )}
            {lesson.read_at && (
              <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                已读
              </span>
            )}
            {lesson.error && (
              <span className="text-rose-500 line-clamp-1">{lesson.error}</span>
            )}
          </div>
          {lesson.coverage_total && lesson.coverage_total > 0 && (
            <p className="mt-1 text-[11px] text-slate-400">
              覆盖 {lesson.coverage_hit}/{lesson.coverage_total}
              {lesson.coverage_real_words
                ? ` · 用词 ${Math.round(((lesson.coverage_known ?? 0) / lesson.coverage_real_words) * 100)}% 来自你的词库`
                : ''}
            </p>
          )}
        </button>

        {onMore && (
          <button
            onClick={onMore}
            className="shrink-0 rounded-full p-1 text-slate-400 transition hover:bg-slate-900/5 hover:text-slate-600 dark:hover:bg-white/10"
            aria-label="操作"
          >
            <MoreIcon width={16} height={16} />
          </button>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-900/[0.07] dark:bg-white/10">
          <div
            className={`h-full rounded-full bg-brand-500 transition-all duration-500 ${generating ? 'animate-pulse w-2/3' : canRead ? 'w-full' : failed ? 'w-1/3 bg-rose-400' : 'w-0'}`}
          />
        </div>
        <button
          onClick={onOpen}
          disabled={!canRead}
          className="inline-flex shrink-0 items-center gap-1 rounded-[12px] bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-700 transition duration-200 active:scale-[0.99] disabled:opacity-45 dark:bg-brand-500/15 dark:text-brand-300"
        >
          {generating ? (
            <><SpinnerIcon width={11} height={11} className="animate-spin" />等待</>
          ) : failed ? (
            <><XIcon width={11} height={11} />失败</>
          ) : (
            <><PlayIcon width={11} height={11} />{lesson.read_at ? '再读' : '开始'}</>
          )}
        </button>
      </div>
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

function OptionGroup({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string
  value: string
  options: { id: string; label: string }[]
  onChange: (id: string) => void
  hint?: string
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
    </div>
  )
}
