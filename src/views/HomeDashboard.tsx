import { useEffect, useMemo, useState } from 'react'
import { ALL_WORDS, CORE_WORDS, TOTAL_CORE } from '../data'
import type { Level, Word } from '../data'
import {
  GRADE_RUNGS,
  LEVEL_RUNGS,
  activeGrades,
  type GradeRung,
  type Route,
} from '../data/levels'
import { getDueCount } from '../lib/study'
import { getSentenceMastered, subscribeSentenceProgress } from '../lib/sentenceProgress'
import { getTotalStars, subscribeChallengeProgress } from '../lib/challengeProgress'
import { CHALLENGE_GAMES } from '../lib/challenge'
import { getPhonicsStats, subscribePhonicsProgress } from '../lib/phonicsProgress'
import {
  BookOpenIcon,
  ChevronRightIcon,
  ListIcon,
  RotateCcwIcon,
  TargetIcon,
  WavesIcon,
} from '../components/icons'

interface Props {
  masteredSet: Set<string>
  masteredArr: string[]
  route: Route
  currentRung: GradeRung | (typeof LEVEL_RUNGS)[number]['id']
  activeLevels: Level[]
  canAdvance: boolean
  /** 是否还有下一级可晋级（顶层等级没有） */
  advanceAvailable?: boolean
  streak: number
  onOpenBrowse: () => void
  onOpenSentences: () => void
  onOpenStudy: () => void
  onStartQuiz: () => void
  onOpenChallenges: () => void
  onOpenPhonics: () => void
}

export default function HomeDashboard({
  masteredSet,
  route,
  currentRung,
  activeLevels,
  canAdvance,
  advanceAvailable = false,
  streak,
  onOpenBrowse,
  onOpenSentences,
  onOpenStudy,
  onStartQuiz,
  onOpenChallenges,
  onOpenPhonics,
}: Props) {
  // ── 激活窗口词 ──────────────────────────────────────────
  const activeGradesList = useMemo(
    () => activeGrades(route, currentRung),
    [route, currentRung],
  )
  // 进度只统计「课程词表」：词典扩展词可查可标，但不参与学习进度
  const activeWords = useMemo(() => {
    return ALL_WORDS.filter((w) => {
      if (w.tier === 'extra') return false
      if (route === 'level') return activeLevels.includes(w.level)
      return !!(w.grade && activeGradesList.includes(w.grade))
    })
  }, [route, activeLevels, activeGradesList])

  const currentDone = activeWords.filter((w) => masteredSet.has(w.word)).length
  const currentTotal = activeWords.length
  // 已掌握也按课程词表统计，避免「词典词」把总数撑大
  const overallDone = useMemo(
    () => CORE_WORDS.filter((w) => masteredSet.has(w.word)).length,
    [masteredSet],
  )
  const activeNew = currentTotal - currentDone
  // 到期复习只算「已掌握」的词（复习模块只练已掌握的词）
  const due = getDueCount(Date.now(), masteredSet)
  const dueText = due > 0 ? `${due} 词` : ''

  // 自然拼读 / 音标进度：在学习页标记后返回首页要立刻同步
  const [phonicsVersion, setPhonicsVersion] = useState(0)
  useEffect(() => subscribePhonicsProgress(() => setPhonicsVersion((v) => v + 1)), [])
  const phonics = useMemo(() => getPhonicsStats(), [phonicsVersion])

  // 短句掌握数：短句页标记后这里要同步刷新
  const [sentenceVersion, setSentenceVersion] = useState(0)
  useEffect(() => subscribeSentenceProgress(() => setSentenceVersion((v) => v + 1)), [])
  const sentenceMastered = useMemo(() => getSentenceMastered().size, [sentenceVersion])

  // 闯关星级：闯关页拿到新星级后首页同步刷新
  const [challengeVersion, setChallengeVersion] = useState(0)
  useEffect(() => subscribeChallengeProgress(() => setChallengeVersion((v) => v + 1)), [])
  const challengeStars = useMemo(() => {
    const maxLevels = CHALLENGE_GAMES.reduce((n, g) => n + g.levelCount, 0)
    const s = getTotalStars()
    return { stars: s.stars, cleared: s.cleared, maxLevels }
  }, [challengeVersion])

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

  /**
   * 入口卡统一样式。
   * 阴影用 shadow-soft（水平溢出仅 ~3px）而非 shadow-float（水平溢出 ~14px）：
   * 后者会在米色页面底色上、卡片左外侧压出一条明显的深色竖带，
   * 在两列网格的行间空隙处尤其显眼（看着像渲染色块）。
   */
  const ENTRY_CARD =
    'flex flex-col items-start rounded-[16px] border border-slate-900/[0.05] bg-white p-2.5 text-left shadow-soft transition hover:bg-slate-50 active:scale-[0.985] dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.06]'
  const ENTRY_ICON = 'flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px]'
  const ENTRY_TITLE = 'min-w-0 truncate text-[13px] font-bold leading-tight text-slate-900 dark:text-slate-50'
  const ENTRY_SUB = 'mt-1 text-[11px] leading-none text-slate-400'
  const ENTRY_GO = 'flex items-center gap-0.5 text-[11px] font-semibold text-brand-600 dark:text-brand-300'

  return (
    // 固定头 + 内部独立滚动：标题/统计卡不在滚动容器里，入口卡增减不会带着上方一起滚
    // 可用高度 = 100dvh - main顶 padding(safe+16) - main底 padding(safe+78 底导航)
    <div className="flex h-[calc(100dvh_-_env(safe-area-inset-top)_-_16px_-_env(safe-area-inset-bottom)_-_78px)] flex-col overflow-hidden">
      {/* 固定头：标题 + 统计卡 + 晋级入口 */}
      <div className="shrink-0">
      {/* 顶部标题：查词统一从「词库 · 查词」卡片进入，不再设重复入口 */}
      <div className="mb-4 flex items-center justify-between">
        <p className="font-display text-[18px] font-bold tracking-tight text-slate-900 dark:text-slate-50">
          词树
        </p>
      </div>

      {/* 主统计卡（用户设计图风格） */}
      <div className="mb-4 overflow-hidden rounded-[22px] bg-gradient-to-br from-teal-500 via-teal-600 to-emerald-600 p-4 text-white shadow-card dark:from-teal-600 dark:via-teal-700 dark:to-emerald-700">
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
                  等级总词汇量
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
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <div className="rounded-[14px] bg-white/15 px-3 py-2 backdrop-blur">
            <p className="text-[10px] font-medium uppercase tracking-wider text-white/65">
              当前等级已掌握
            </p>
            <p className="mt-0.5 text-[18px] font-bold text-white">{currentDone}</p>
          </div>
          <div className="rounded-[14px] bg-white/15 px-3 py-2 backdrop-blur">
            <p className="text-[10px] font-medium uppercase tracking-wider text-white/65">
              累计已掌握（全部）
            </p>
            <p className="mt-0.5 text-[18px] font-bold text-white">
              {overallDone}
              <span className="ml-1 text-[11px] font-normal text-white/55">/ {TOTAL_CORE}</span>
            </p>
          </div>
        </div>
      </div>

      {/* 晋级入口：只有达到门槛后才出现（未达标不展示进度卡） */}

      {/* 晋级 banner */}
      {advanceAvailable && canAdvance && (
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
      </div>

      {/* 入口卡区：只有这块内部滚动，上方固定头物理上不会位移 */}
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
      {/* 学习入口卡（2 列网格）：图标与名称同行 / 自然拼读 · 背词 · 短句 · 闯关 · 复习 */}
      <div className="grid grid-cols-2 gap-2.5">
        <button onClick={onOpenPhonics} className={ENTRY_CARD}>
          <div className="flex w-full items-center gap-2">
            <span className={`${ENTRY_ICON} bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300`}>
              <WavesIcon width={15} height={15} />
            </span>
            <p className={ENTRY_TITLE}>自然拼读 · 音标</p>
          </div>
          <p className={ENTRY_SUB}>
            {phonics.phonemeDone}/{phonics.phonemeTotal} 音标 · {phonics.ruleDone}/{phonics.ruleTotal} 规则
          </p>
          <div className="mt-auto flex w-full items-center justify-end pt-1.5">
            <span className={ENTRY_GO}>
              去学习 <ChevronRightIcon width={13} height={13} />
            </span>
          </div>
        </button>

        <button onClick={onOpenBrowse} className={ENTRY_CARD}>
          <div className="flex w-full items-center gap-2">
            <span className={`${ENTRY_ICON} bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300`}>
              <BookOpenIcon width={15} height={15} />
            </span>
            <p className={ENTRY_TITLE}>词库 · 查词</p>
          </div>
          <p className={ENTRY_SUB}>
            {activeNew > 0 ? `${activeNew} 个待学新词` : `激活窗口 ${currentTotal} 词`}
          </p>
          <div className="mt-auto flex w-full items-center justify-end pt-1.5">
            <span className={ENTRY_GO}>
              背词 / 查词 <ChevronRightIcon width={13} height={13} />
            </span>
          </div>
        </button>

        <button onClick={onOpenSentences} className={ENTRY_CARD}>
          <div className="flex w-full items-center gap-2">
            <span className={`${ENTRY_ICON} bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300`}>
              <ListIcon width={15} height={15} />
            </span>
            <p className={ENTRY_TITLE}>短句</p>
          </div>
          <p className={ENTRY_SUB}>
            600 句 · 已掌握 {sentenceMastered}
          </p>
          <div className="mt-auto flex w-full items-center justify-end pt-1.5">
            <span className={ENTRY_GO}>
              去学习 <ChevronRightIcon width={13} height={13} />
            </span>
          </div>
        </button>

        <button onClick={onOpenChallenges} className={ENTRY_CARD}>
          <div className="flex w-full items-center gap-2">
            <span className={`${ENTRY_ICON} bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300`}>
              <TargetIcon width={15} height={15} />
            </span>
            <p className={ENTRY_TITLE}>闯关</p>
          </div>
          <p className={ENTRY_SUB}>
            {challengeStars.stars > 0
              ? `${challengeStars.stars} 星 · ${challengeStars.cleared}/${challengeStars.maxLevels} 关`
              : `${CHALLENGE_GAMES.length} 种玩法 · ${challengeStars.maxLevels} 个关卡`}
          </p>
          <div className="mt-auto flex w-full items-center justify-end pt-1.5">
            <span className={`${ENTRY_GO} text-violet-600 dark:text-violet-300`}>
              去游戏 <ChevronRightIcon width={13} height={13} />
            </span>
          </div>
        </button>

        {/* 复习：与其它入口卡同尺寸（单列），保持网格整齐 */}
        <button onClick={onOpenStudy} className={ENTRY_CARD}>
          <div className="flex w-full items-center gap-2">
            <span className={`${ENTRY_ICON} bg-accent-lime/20 text-brand-700 dark:bg-accent-lime/15 dark:text-accent-lime`}>
              <RotateCcwIcon width={15} height={15} />
            </span>
            <p className={ENTRY_TITLE}>复习</p>
          </div>
          <p className={ENTRY_SUB}>
            {dueText ? `${dueText} 到期复习` : '只复习已掌握的词'}
          </p>
          <div className="mt-auto flex w-full items-center justify-end pt-1.5">
            <span className={ENTRY_GO}>
              去复习 <ChevronRightIcon width={13} height={13} />
            </span>
          </div>
        </button>
      </div>
      </div>
    </div>
  )
}

/* 未使用的 prop 占位（保持 Props 接口与 App.tsx 传参一致） */
export type { Word }
