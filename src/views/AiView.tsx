import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isConfigReady, loadLlmConfig, saveLlmConfig, type LlmConfig } from '../config/llm'
import { TOPICS, type TopicId } from '../lib/cluster'
import {
  DIFFICULTIES,
  LESSON_FORMATS,
  formatMeta,
  type Difficulty,
  type LessonFormatChoice,
} from '../lib/prompt'
import { useAiLessons } from '../hooks/useAiLessons'
import { deleteSet, listSets, type AiLessonSet } from '../db'
import { getReviewWords } from '../lib/review'
import type { Level } from '../data'
import LessonReader from './LessonReader'
import { Sheet, ActionSheet } from '../components/Sheet'
import {
  BookOpenIcon,
  CheckIcon,
  ChevronRightIcon,
  GearIcon,
  MoreIcon,
  PlayIcon,
  SpinnerIcon,
  SparklesIcon,
  TrashIcon,
  XIcon,
} from '../components/icons'

/**
 * AI 定制课程：列表 → 阅读（走全局页面栈）。
 * 列表页上卡片主按钮直达阅读，补齐/删除收进三点 ActionSheet，生成条件收进底部 Sheet。
 * 听单不再从列表直达：阅读器内自带 listen 模式（mode: read|listen），无需独立的全屏听单页。
 */
export default function AiView({
  masteredSet,
  onApplyMark,
  onToast,
  active = true,
  readerSetId,
  onOpenReader,
  onBack,
  activeLevels,
}: {
  masteredSet: Set<string>
  onApplyMark: (word: string[], mode: 'add' | 'remove') => void
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void
  /** 当前是否停在 AI 标签；切走时暂停朗读 */
  active?: boolean
  /** 全局页面栈里正在展示阅读的课程集 id（null 则显示列表） */
  readerSetId: string | null
  /** 打开某套课程的阅读器（压栈） */
  onOpenReader: (setId: string) => void
  /** 阅读页顶部返回按钮 */
  onBack: () => void
  /** 激活窗口范围，用于 AI 词表围栏 */
  activeLevels?: Level[]
}) {
  const [sets, setSets] = useState<AiLessonSet[] | null>(null)
  const [topic, setTopic] = useState<TopicId>('random')
  const [difficulty, setDifficulty] = useState<Difficulty>('adaptive')
  const [format, setFormat] = useState<LessonFormatChoice>('auto')
  const [cfg, setCfg] = useState<LlmConfig>(loadLlmConfig)
  const [reviewCount, setReviewCount] = useState(() => getReviewWords().length)

  /** 轻量交互：底部 Sheet / ActionSheet */
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [moreFor, setMoreFor] = useState<AiLessonSet | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AiLessonSet | null>(null)

  const { progress, generate, resume, cancel } = useAiLessons()

  const refreshSets = useCallback(async () => {
    try {
      setSets(await listSets())
    } catch {
      onToast('读取课程列表失败', 'error')
    }
  }, [onToast])

  useEffect(() => {
    void refreshSets()
  }, [refreshSets])

  // 阅读完成回到列表时刷新已读数与生成进度
  useEffect(() => {
    if (readerSetId !== null) return
    setReviewCount(getReviewWords().length)
    void refreshSets()
  }, [readerSetId, refreshSets])

  // 切回 AI 标签时重新读取配置
  useEffect(() => {
    if (active) {
      setCfg(loadLlmConfig())
      setReviewCount(getReviewWords().length)
    }
  }, [active])

  // 生成结束 → 刷新课程列表；错误提示一次
  const shownError = useRef<string | null>(null)
  const prevStatus = useRef(progress.status)
  useEffect(() => {
    if (progress.error && shownError.current !== progress.error) {
      shownError.current = progress.error
      onToast(progress.error, 'error')
    }
    if (prevStatus.current === 'generating' && progress.status === 'idle') {
      void refreshSets()
    }
    prevStatus.current = progress.status
  }, [progress.error, progress.status, onToast, refreshSets])

  const masteredCount = masteredSet.size
  const estimatedLessons = useMemo(() => {
    if (masteredCount === 0) return 0
    return Math.max(1, Math.ceil(masteredCount / (cfg.wordsPerLesson + 5)))
  }, [masteredCount, cfg.wordsPerLesson])

  const generating = progress.status === 'generating'
  const configReady = isConfigReady(cfg)

  const startGenerate = async () => {
    if (generating) return
    if (!configReady) {
      onToast('还没有配置大模型：请到「我」→「大模型设置」填写接口与 Key', 'info')
      return
    }
    try {
      const set = await generate(masteredSet, cfg, { topic, difficulty, format }, activeLevels)
      await refreshSets()
      onToast(`开始生成 ${set.total} 篇教程，按场景分组`, 'success')
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

  const handleRetrySingle = useCallback(
    (lessonId: string) => {
      if (!readerSetId) return
      resume(readerSetId, cfg, [lessonId])
    },
    [readerSetId, resume, cfg],
  )

  const updateWordsPerLesson = (n: number) => {
    const next = { ...cfg, wordsPerLesson: n }
    setCfg(next)
    saveLlmConfig(next)
  }

  /* ------------------------------- 阅读页 ------------------------------- */
  if (readerSetId) {
    return (
      <LessonReader
        setId={readerSetId}
        onBack={onBack}
        onApplyMark={handleMark}
        onRetrySingle={handleRetrySingle}
        busy={generating}
        active={active}
        onToast={onToast}
      />
    )
  }

  /* ------------------------------- 列表页 ------------------------------- */
  const topicLabel = TOPICS.find((t) => t.id === topic)?.label ?? '随机'
  const difficultyLabel = DIFFICULTIES.find((d) => d.id === difficulty)?.label ?? '自适应'
  const formatLabel = format === 'auto' ? '自动混搭' : formatMeta(format).label

  return (
    <div className="pb-2">
      {/* 顶部标题（砍成紧凑两行） */}
      <div className="mb-3 flex items-end gap-2">
        <h2 className="font-display text-[18px] font-semibold tracking-tight text-slate-900 dark:text-slate-50">
          AI 定制课程
        </h2>
        <span className="truncate text-[11px] text-slate-400">用你会的词，写能读能听的课程</span>
      </div>

      {/* 主操作：一行摘要 + 生成按钮，条件收进一条细行 */}
      <section className="surface mb-3 p-3">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold text-slate-800 dark:text-slate-100">
              {masteredCount === 0 ? '先标记已掌握的词' : `生成 ${estimatedLessons} 篇专属课程`}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-slate-400">
              已掌握 {masteredCount} 词{reviewCount > 0 ? ` · 复习词 ${reviewCount}` : ''}
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
            {generating ? `${progress.done + progress.failed}/${progress.total}` : '开始生成'}
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
            {topicLabel} · {formatLabel} · {difficultyLabel} · 每篇 {cfg.wordsPerLesson} 词
          </span>
          <ChevronRightIcon width={14} height={14} className="shrink-0 text-slate-300" />
        </button>
      </section>

      {/* 实时生成进度 */}
      {generating && (
        <section className="surface mt-4 p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-slate-700 dark:text-slate-100">
              正在写作
              <span className="ml-1.5 text-xs font-medium text-slate-400">
                {progress.done + progress.failed} / {progress.total}
              </span>
            </p>
            <button
              onClick={cancel}
              className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-900/5 dark:hover:bg-white/10"
              aria-label="取消生成"
            >
              <XIcon width={16} height={16} />
            </button>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-slate-900/[0.07] dark:bg-white/10">
            <div
              className="h-full rounded-full bg-brand-500 transition-all duration-500"
              style={{
                width: `${progress.total ? Math.round(((progress.done + progress.failed) / progress.total) * 100) : 0}%`,
              }}
            />
          </div>
          <div className="mt-3 max-h-56 space-y-1 overflow-y-auto pr-1">
            {progress.lessons.map((l) => (
              <div key={l.id} className="flex items-center gap-2 text-xs">
                <span className="w-5 shrink-0 text-right tabular-nums text-slate-400">{l.index + 1}</span>
                {l.status === 'ready' ? (
                  <CheckIcon width={13} height={13} className="shrink-0 text-emerald-500" />
                ) : l.status === 'failed' ? (
                  <XIcon width={13} height={13} className="shrink-0 text-rose-500" />
                ) : l.running ? (
                  <SpinnerIcon width={13} height={13} className="shrink-0 animate-spin text-brand-500" />
                ) : (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300 dark:bg-slate-600" />
                )}
                <span
                  className={`min-w-0 flex-1 truncate ${
                    l.running
                      ? 'font-semibold text-brand-600 dark:text-brand-300'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {l.sceneLabel}
                </span>
                <span className="shrink-0 text-[11px] text-slate-400">
                  {l.status === 'ready' ? '完成' : l.status === 'failed' ? '失败' : l.running ? '写作中' : '排队'}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            可离开本页，回来自动接着看；未完成的篇目在课程集里可一键补齐。
          </p>
        </section>
      )}

      {/* 课程集列表 */}
      <div className="mb-2 mt-3 flex items-center justify-between">
        <p className="eyebrow">我的课程集</p>
        {sets && sets.length > 0 && <span className="text-[11px] text-slate-400">{sets.length} 个</span>}
      </div>

      {!sets ? (
        <div className="flex justify-center py-10 text-slate-400">
          <SpinnerIcon width={22} height={22} className="animate-spin" />
        </div>
      ) : sets.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-slate-300/70 py-12 text-center text-sm text-slate-400 dark:border-slate-700/70">
          还没有课程集
          <p className="mt-1 text-xs">点上面的「开始生成」创建第一套</p>
        </div>
      ) : (
        <div className="stagger space-y-2">
          {sets.map((set) => (
            <SetCard
              key={set.id}
              set={set}
              onOpen={() => onOpenReader(set.id)}
              onMore={() => setMoreFor(set)}
            />
          ))}
        </div>
      )}

      {/* ----------------------------- 底部弹层 ----------------------------- */}

      {/* 生成条件 Sheet */}
      <Sheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="生成条件"
        subtitle="题材、体裁、难度与每篇词数"
      >
        {!configReady && (
          <div className="mb-4 rounded-[18px] border border-amber-200/60 bg-amber-50/70 px-4 py-3 text-[12px] leading-relaxed text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300">
            大模型还没配置。请到「我」→「大模型设置」填写接口地址与 Key，再回来生成。
          </div>
        )}
        <div className="space-y-4">
          <OptionGroup
            label="课程体裁"
            value={format}
            options={[
              { id: 'auto', label: '✨ 自动混搭' },
              ...LESSON_FORMATS.map((f) => ({ id: f.id, label: `${f.emoji} ${f.label}` })),
            ]}
            onChange={(id) => setFormat(id as LessonFormatChoice)}
            hint={
              format === 'auto'
                ? '按 故事 → 对话 → 日记 → 邮件 → 科普 → 小诗 循环，一套课程里体验多种体裁。'
                : formatMeta(format).brief
            }
          />
          <OptionGroup
            label="题材侧重"
            value={topic}
            options={TOPICS.map((t) => ({ id: t.id, label: t.label }))}
            onChange={(id) => setTopic(id as TopicId)}
            hint="题材只影响排序侧重，所有场景都会生成，确保覆盖全部词。"
          />
          <OptionGroup
            label="句式难度"
            value={difficulty}
            options={DIFFICULTIES.map((d) => ({ id: d.id, label: d.label }))}
            onChange={(id) => setDifficulty(id as Difficulty)}
            hint={DIFFICULTIES.find((d) => d.id === difficulty)?.hint}
          />
          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">每篇重点词数</p>
            <div className="flex gap-1.5">
              {[12, 16, 20, 24, 28].map((n) => (
                <button
                  key={n}
                  onClick={() => updateWordsPerLesson(n)}
                  className={`flex-1 rounded-[14px] py-2.5 text-sm font-semibold transition duration-200 active:scale-95 ${
                    cfg.wordsPerLesson === n
                      ? 'bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-900'
                      : 'bg-slate-900/5 text-slate-600 hover:bg-slate-900/10 dark:bg-white/10 dark:text-slate-300'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
              词数越少篇数越多、单篇更短；会按场景自动合并，保证全部已掌握词都进课程。
            </p>
          </div>
        </div>
      </Sheet>

      {/* 课程集操作 ActionSheet：只保留补齐 + 删除，读/听入口由卡片主按钮承载 */}
      {moreFor && (
        <ActionSheet
          open={!!moreFor}
          onClose={() => setMoreFor(null)}
          title={moreFor.title}
          message={`${moreFor.total} 篇 · 已生成 ${moreFor.done}${moreFor.failed ? ` · 失败 ${moreFor.failed}` : ''}`}
          actions={[
            ...(moreFor.done < moreFor.total
              ? [
                  {
                    label: moreFor.done > 0 ? '补齐未完成篇目' : '重新生成',
                    description: '失败或未生成的篇目会自动重试',
                    icon: <SparklesIcon width={18} height={18} />,
                    onClick: () => {
                      resume(moreFor.id, cfg)
                      onToast('继续生成中…', 'info')
                    },
                  },
                ]
              : []),
            {
              label: '删除课程集',
              description: '正文与标记记录将一并删除',
              icon: <TrashIcon width={18} height={18} />,
              tone: 'danger' as const,
              onClick: () => setDeleteTarget(moreFor),
            },
          ]}
        />
      )}

      {/* 删除二次确认 Sheet —— 独立于 ActionSheet，用 deleteTarget 保存目标以绕开 onClose 先清 moreFor 的时序 */}
      {deleteTarget && (
        <Sheet
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          title="确认删除"
          subtitle={`「${deleteTarget.title}」的正文与标记记录会一并删除，无法恢复`}
          footer={
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setDeleteTarget(null)} className="btn-soft !py-2.5 text-sm">
                取消
              </button>
              <button
                onClick={async () => {
                  await deleteSet(deleteTarget.id)
                  await refreshSets()
                  setDeleteTarget(null)
                  setMoreFor(null)
                  onToast('已删除课程集', 'success')
                }}
                className="rounded-[14px] bg-rose-500 py-2.5 text-sm font-bold text-white transition active:scale-[0.98]"
              >
                删除
              </button>
            </div>
          }
        >
          <p className="text-[12px] leading-relaxed text-rose-500/80 dark:text-rose-300/70">
            删除后，这套课程集的所有文章、重点词标记、阅读进度都会清除；已同步到「已掌握词表」的词不会撤回。
          </p>
        </Sheet>
      )}

    </div>
  )
}

/* ------------------------------ 子组件 ------------------------------ */

function SetCard({
  set,
  onOpen,
  onMore,
}: {
  set: AiLessonSet
  onOpen: () => void
  onMore?: () => void
}) {
  const readCount = Math.min(set.readCount ?? 0, set.total)
  const readPct = set.total ? Math.round((readCount / set.total) * 100) : 0
  const generated = set.done ?? 0
  const canRead = generated > 0
  const continueLabel = readCount === 0 ? '开始' : readCount >= set.total ? '再读' : '继续'
  const fmtChoice = set.condition.format ?? 'auto'
  const fmt = fmtChoice === 'auto' ? null : formatMeta(fmtChoice)

  return (
    <div className="rounded-[16px] border border-slate-200/60 bg-white/65 p-3 transition duration-200 hover:border-brand-300/50 hover:bg-white hover:shadow-soft dark:border-slate-700/50 dark:bg-slate-800/45 dark:hover:border-brand-500/30">
      <div className="flex items-start gap-2.5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-brand-600 text-white">
          <BookOpenIcon width={18} height={18} />
        </div>

        <button onClick={onOpen} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] font-bold text-slate-800 dark:text-slate-100">{set.title}</span>
            <StatusBadge status={set.status} />
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
            {fmt ? (
              <span className={`rounded-full px-1.5 py-0.5 ${fmt.badge}`}>
                {fmt.emoji} {fmt.label}
              </span>
            ) : (
              <span className="rounded-full bg-fuchsia-100 px-1.5 py-0.5 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300">
                ✨ 多体裁
              </span>
            )}
            <span className="rounded-full bg-slate-900/5 px-1.5 py-0.5 text-slate-500 dark:bg-white/10 dark:text-slate-300">
              {set.total} 篇
            </span>
            <span className="text-[11px] text-slate-400">
              已读 {readCount}/{set.total} · {set.wordsCount} 词
              {set.failed > 0 && <span className="text-rose-500"> · 失败 {set.failed}</span>}
            </span>
          </div>
        </button>

        {onMore && (
          <button
            onClick={onMore}
            className="shrink-0 rounded-full p-1 text-slate-400 transition hover:bg-slate-900/5 hover:text-slate-600 dark:hover:bg-white/10"
            aria-label="课程集操作"
          >
            <MoreIcon width={16} height={16} />
          </button>
        )}
      </div>

      {/* 进度条 + 主按钮同一行，省一整行高度 */}
      <div className="mt-2 flex items-center gap-2">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-900/[0.07] dark:bg-white/10">
          <div className="h-full rounded-full bg-brand-500 transition-all duration-500" style={{ width: `${readPct}%` }} />
        </div>
        <button
          onClick={onOpen}
          disabled={!canRead}
          className="inline-flex shrink-0 items-center gap-1 rounded-[12px] bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-700 transition duration-200 active:scale-[0.99] disabled:opacity-45 dark:bg-brand-500/15 dark:text-brand-300"
        >
          <PlayIcon width={11} height={11} />
          {canRead ? continueLabel : '等待'}
        </button>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: AiLessonSet['status'] }) {
  const map: Record<AiLessonSet['status'], { label: string; cls: string }> = {
    generating: { label: '生成中', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300' },
    ready: { label: '已完成', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
    partial: { label: '未完成', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
    failed: { label: '失败', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' },
  }
  const s = map[status] ?? map.partial
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
