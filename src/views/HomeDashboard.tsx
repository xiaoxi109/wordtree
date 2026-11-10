import { useEffect, useMemo, useState } from 'react'
import { ALL_WORDS, TOTAL } from '../data'
import type { Level, Word } from '../data'
import {
  GRADE_RUNGS,
  LEVEL_RUNGS,
  activeGrades,
  type GradeRung,
  type Route,
} from '../data/levels'
import { getDueCount } from '../lib/study'
import { getSentenceProgress, subscribeSentenceProgress } from '../lib/sentenceProgress'
import {
  BookOpenIcon,
  ChevronRightIcon,
  ListIcon,
  RotateCcwIcon,
  SearchIcon,
  TargetIcon,
} from '../components/icons'

interface Props {
  masteredSet: Set<string>
  masteredArr: string[]
  route: Route
  currentRung: GradeRung | (typeof LEVEL_RUNGS)[number]['id']
  activeLevels: Level[]
  canAdvance: boolean
  streak: number
  onOpenBrowse: () => void
  onOpenSentences: () => void
  onOpenStudy: () => void
  onOpenSearch: () => void
  onStartQuiz: () => void
  onOpenChallenges: () => void
}

export default function HomeDashboard({
  masteredSet,
  masteredArr,
  route,
  currentRung,
  activeLevels,
  canAdvance,
  streak,
  onOpenBrowse,
  onOpenSentences,
  onOpenStudy,
  onOpenSearch,
  onStartQuiz,
  onOpenChallenges,
}: Props) {
  // ── 激活窗口词 ──────────────────────────────────────────
  const activeGradesList = useMemo(
    () => activeGrades(route, currentRung),
    [route, currentRung],
  )
  const activeWords = useMemo(() => {
    return ALL_WORDS.filter((w) => {
      if (route === 'level') return activeLevels.includes(w.level)
      return !!(w.grade && activeGradesList.includes(w.grade))
    })
  }, [route, activeLevels, activeGradesList])

  const currentDone = activeWords.filter((w) => masteredSet.has(w.word)).length
  const currentTotal = activeWords.length
  const overallDone = masteredArr.length
  const activeNew = currentTotal - currentDone
  const due = getDueCount()

  // 短句进度独立存储，短句页标记后这里要同步刷新统计
  const [sentenceVersion, setSentenceVersion] = useState(0)
  useEffect(() => subscribeSentenceProgress(() => setSentenceVersion((v) => v + 1)), [])
  const sentenceProgress = useMemo(() => getSentenceProgress(), [sentenceVersion])
  const dueText = [
    due > 0 ? `${due} 词` : '',
    sentenceProgress.due > 0 ? `${sentenceProgress.due} 句` : '',
  ].filter(Boolean).join(' · ')

  // ── 当前等级标签 ────────────────────────────────────────
  const rungLabel = useMemo(() => {
    if (route === 'grade') {
      const g = GRADE_RUNGS.find((r) => r.id === currentRung)
      return g?.label ?? '当前等级'
    }
    const l = LEVEL_RUNGS.find((r) => r.id === currentRung)
    return l?.label ?? '当前等级'
  }, [route, currentRung])

  // ── 进度环 ──────────────────────────────────────────────
  const pct = currentTotal > 0 ? Math.round((currentDone / currentTotal) * 100) : 0
  const RING_SIZE = 88
  const RING_STROKE = 7
  const RING_R = (RING_SIZE - RING_STROKE) / 2
  const RING_CIRC = 2 * Math.PI * RING_R
  const ringOffset = RING_CIRC * (1 - pct / 100)

  return (
    <div>
      {/* 顶部搜索行 */}
      <div className="mb-4 flex items-center justify-between">
        <p className="font-display text-[18px] font-bold tracking-tight text-slate-900 dark:text-slate-50">
          词树
        </p>
        <button
          onClick={onOpenSearch}
          className="flex items-center gap-1.5 rounded-[12px] border border-slate-200/60 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-500 transition hover:bg-slate-50 active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-400 dark:hover:bg-white/[0.06]"
        >
          <SearchIcon width={14} height={14} />
          搜索
        </button>
      </div>

      {/* 主统计卡（用户设计图风格） */}
      <div className="mb-4 overflow-hidden rounded-[24px] bg-gradient-to-br from-teal-500 via-teal-600 to-emerald-600 p-5 text-white shadow-float dark:from-teal-600 dark:via-teal-700 dark:to-emerald-700">
        {/* 上半：进度环 + 总词汇量 + 连续天数 */}
        <div className="flex items-center gap-5">
          {/* 进度环 */}
          <div className="relative shrink-0" style={{ width: RING_SIZE, height: RING_SIZE }}>
            <svg width={RING_SIZE} height={RING_SIZE} className="-rotate-90">
              <circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_R}
                fill="none"
                stroke="rgba(255,255,255,0.25)"
                strokeWidth={RING_STROKE}
              />
              <circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_R}
                fill="none"
                stroke="white"
                strokeWidth={RING_STROKE}
                strokeDasharray={RING_CIRC}
                strokeDashoffset={ringOffset}
                strokeLinecap="round"
                className="transition-all duration-700"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-[22px] font-bold leading-none text-white">{currentDone}</p>
              <p className="mt-0.5 text-[9px] font-medium uppercase tracking-wider text-white/70">已掌握</p>
            </div>
          </div>

          {/* 右侧文字 */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/75">
                  当前等级总词汇量
                </p>
                <p className="mt-1 text-[26px] font-bold leading-none text-white">
                  {currentTotal}
                </p>
              </div>
              {streak >= 2 && (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur">
                  🔥 连续 {streak} 天
                </span>
              )}
            </div>
            <p className="mt-2 text-[12px] font-medium text-white/80">
              当前等级 · {rungLabel}
            </p>
          </div>
        </div>

        {/* 下半：两个小统计块 */}
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <div className="rounded-[14px] bg-white/15 px-3 py-2.5 backdrop-blur">
            <p className="text-[10px] font-medium uppercase tracking-wider text-white/65">
              当前等级已掌握
            </p>
            <p className="mt-1 text-[18px] font-bold text-white">{currentDone}</p>
          </div>
          <div className="rounded-[14px] bg-white/15 px-3 py-2.5 backdrop-blur">
            <p className="text-[10px] font-medium uppercase tracking-wider text-white/65">
              累计已掌握（全部）
            </p>
            <p className="mt-1 text-[18px] font-bold text-white">
              {overallDone}
              <span className="ml-1 text-[11px] font-normal text-white/55">/ {TOTAL}</span>
            </p>
          </div>
        </div>
      </div>

      {/* 晋级 banner */}
      {canAdvance && (
        <button
          onClick={onStartQuiz}
          className="mb-4 flex w-full items-center justify-between gap-3 rounded-[20px] border border-accent-lime/60 bg-accent-lime/20 px-4 py-3 text-left transition hover:bg-accent-lime/30 active:scale-[0.995] dark:bg-accent-lime/15 dark:hover:bg-accent-lime/25"
        >
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brand-700 dark:text-accent-lime">
              🎉 可以晋级了
            </p>
            <p className="mt-0.5 text-[13px] font-semibold text-slate-800 dark:text-slate-100">
              闯 10 道抽检题，晋级到下一级
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-brand-600 px-3 py-1 text-[12px] font-bold text-white shadow-sm">
            去闯关
          </span>
        </button>
      )}

      {/* 背词 / 短句 / 闯关 / 复习 入口卡（2×2） */}
      <div className="mb-5 grid grid-cols-2 gap-3">
        <button
          onClick={onOpenBrowse}
          className="flex flex-col items-start gap-2 rounded-[20px] border border-slate-900/[0.04] bg-white p-3.5 text-left shadow-float transition hover:bg-slate-50 active:scale-[0.985] dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.06]"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
            <BookOpenIcon width={18} height={18} />
          </span>
          <div className="min-w-0">
            <p className="text-[14px] font-bold text-slate-900 dark:text-slate-50">背词</p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              {activeNew > 0 ? `${activeNew} 个待学新词` : `激活窗口 ${currentTotal} 词`}
            </p>
          </div>
          <div className="mt-auto flex w-full items-center justify-between">
            <span />
            <span className="flex items-center gap-0.5 text-[12px] font-semibold text-brand-600 dark:text-brand-300">
              开始学习 <ChevronRightIcon width={14} height={14} />
            </span>
          </div>
        </button>

        <button
          onClick={onOpenSentences}
          className="flex flex-col items-start gap-2 rounded-[20px] border border-slate-900/[0.04] bg-white p-3.5 text-left shadow-float transition hover:bg-slate-50 active:scale-[0.985] dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.06]"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
            <ListIcon width={18} height={18} />
          </span>
          <div className="min-w-0">
            <p className="text-[14px] font-bold text-slate-900 dark:text-slate-50">短句</p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              600 句 · 已掌握 {sentenceProgress.mastered}
            </p>
          </div>
          <div className="mt-auto flex w-full items-center justify-between">
            <span />
            <span className="flex items-center gap-0.5 text-[12px] font-semibold text-brand-600 dark:text-brand-300">
              去学习 <ChevronRightIcon width={14} height={14} />
            </span>
          </div>
        </button>

        <button
          onClick={onOpenChallenges}
          className="flex flex-col items-start gap-2 rounded-[20px] border border-slate-900/[0.04] bg-white p-3.5 text-left shadow-float transition hover:bg-slate-50 active:scale-[0.985] dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.06]"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
            <TargetIcon width={18} height={18} />
          </span>
          <div className="min-w-0">
            <p className="text-[14px] font-bold text-slate-900 dark:text-slate-50">闯关</p>
            <p className="mt-0.5 text-[11px] text-slate-400">互动小游戏 · 边玩边记</p>
          </div>
          <div className="mt-auto flex w-full items-center justify-between">
            <span />
            <span className="flex items-center gap-0.5 text-[12px] font-semibold text-violet-600 dark:text-violet-300">
              去游戏 <ChevronRightIcon width={14} height={14} />
            </span>
          </div>
        </button>

        <button
          onClick={onOpenStudy}
          className="flex flex-col items-start gap-2 rounded-[20px] border border-slate-900/[0.04] bg-white p-3.5 text-left shadow-float transition hover:bg-slate-50 active:scale-[0.985] dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.06]"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-accent-lime/20 text-brand-700 dark:bg-accent-lime/15 dark:text-accent-lime">
            <RotateCcwIcon width={18} height={18} />
          </span>
          <div className="min-w-0">
            <p className="text-[14px] font-bold text-slate-900 dark:text-slate-50">复习</p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              {dueText ? `${dueText} 到期复习` : '单词 + 短句 · 暂无到期内容'}
            </p>
          </div>
          <div className="mt-auto flex w-full items-center justify-between">
            <span />
            <span className="flex items-center gap-0.5 text-[12px] font-semibold text-brand-600 dark:text-brand-300">
              去复习 <ChevronRightIcon width={14} height={14} />
            </span>
          </div>
        </button>
      </div>
    </div>
  )
}

/* 未使用的 prop 占位（保持 Props 接口与 App.tsx 传参一致） */
export type { Word }
