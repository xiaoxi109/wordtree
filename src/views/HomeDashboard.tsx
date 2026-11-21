import { useEffect, useMemo, useState } from 'react'
import { CORE_WORDS } from '../data'
import { getDueCount } from '../lib/study'
import { getSentenceMastered, subscribeSentenceProgress } from '../lib/sentenceProgress'
import {
  BookOpenIcon,
  ChevronRightIcon,
  ListIcon,
  RotateCcwIcon,
  SpeakerIcon,
} from '../components/icons'

interface Props {
  /** 外部词库词池；core 传 undefined，统计用 CORE_WORDS。 */
  pool?: typeof CORE_WORDS
  lexiconName?: string
  /** 全部词库累计已掌握次数（各词库掌握数之和）。 */
  totalMastered?: number
  masteredSet: Set<string>
  masteredArr: string[]
  streak: number
  onOpenBrowse: () => void
  onOpenSentences: () => void
  onOpenStudy: () => void
  onOpenPhonetics: () => void
}

export default function HomeDashboard({
  pool,
  lexiconName = '词库',
  totalMastered = 0,
  masteredSet,
  streak,
  onOpenBrowse,
  onOpenSentences,
  onOpenStudy,
  onOpenPhonetics,
}: Props) {
  // ── 当前词库统计 ────────────────────────────────────────
  const sourceWords = pool ?? CORE_WORDS
  const currentDone = sourceWords.filter((w) => masteredSet.has(w.word)).length
  const currentTotal = sourceWords.length
  const activeNew = currentTotal - currentDone
  // 到期复习只算「已掌握」的词（复习模块只练已掌握的词）
  const due = getDueCount(Date.now(), masteredSet)
  const dueText = due > 0 ? `${due} 词` : ''

  // 短句掌握数：短句页标记后这里要同步刷新
  const [sentenceVersion, setSentenceVersion] = useState(0)
  useEffect(() => subscribeSentenceProgress(() => setSentenceVersion((v) => v + 1)), [])
  const sentenceMastered = useMemo(() => getSentenceMastered().size, [sentenceVersion])

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
      {/* 固定头：标题 + 统计卡 */}
      <div className="shrink-0">
      {/* 顶部标题：查词统一从「词库 · 查词」卡片进入，不再设重复入口 */}
      <div className="mb-4 flex items-center justify-between">
        <p className="font-display text-[18px] font-bold tracking-tight text-slate-900 dark:text-slate-50">
          词树
        </p>
      </div>

      {/* 主统计卡：浅色保留品牌绿渐变；深色走中性夜面（800→900 层级），
          品牌绿只留在进度环上作点缀，避免大面积高饱和色块破坏夜间沉浸感 */}
      <div className="mb-4 overflow-hidden rounded-[22px] border border-transparent bg-gradient-to-br from-teal-500 via-teal-600 to-emerald-600 p-4 text-white shadow-card dark:border-white/10 dark:from-slate-800 dark:via-slate-900 dark:to-slate-900">
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
                strokeWidth={RING_STROKE}
                className="stroke-white/25 dark:stroke-white/15"
              />
              <circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_R}
                fill="none"
                strokeWidth={RING_STROKE}
                strokeDasharray={RING_CIRC}
                strokeDashoffset={ringOffset}
                strokeLinecap="round"
                className="stroke-white transition-all duration-700 dark:stroke-brand-300"
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
                  当前词库总词汇量
                </p>
                <p className="mt-1 text-[26px] font-bold leading-none text-white">
                  {currentTotal}
                </p>
              </div>
              {streak >= 2 && (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur dark:bg-white/10">
                  🔥 连续 {streak} 天
                </span>
              )}
            </div>
            <p className="mt-2 text-[12px] font-medium text-white/80">
              当前词库 · {lexiconName}
            </p>
          </div>
        </div>

        {/* 下半：两个小统计块 */}
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <div className="rounded-[14px] bg-white/15 px-3 py-2 backdrop-blur dark:bg-white/[0.07]">
            <p className="text-[10px] font-medium uppercase tracking-wider text-white/65">
              当前词库已掌握
            </p>
            <p className="mt-0.5 text-[18px] font-bold text-white">{currentDone}</p>
          </div>
          <div className="rounded-[14px] bg-white/15 px-3 py-2 backdrop-blur dark:bg-white/[0.07]">
            <p className="text-[10px] font-medium uppercase tracking-wider text-white/65">
              累计已掌握（全部词库）
            </p>
            <p className="mt-0.5 text-[18px] font-bold text-white">{totalMastered}</p>
          </div>
        </div>
      </div>

      </div>

      {/* 入口卡区：只有这块内部滚动，上方固定头物理上不会位移 */}
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
      {/* 学习入口卡（2 列网格）：词库 · 短句 · 复习 · 音标 */}
      <div className="grid grid-cols-2 gap-2.5">
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

        <button onClick={onOpenPhonetics} className={ENTRY_CARD}>
          <div className="flex w-full items-center gap-2">
            <span className={`${ENTRY_ICON} bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300`}>
              <SpeakerIcon width={15} height={15} />
            </span>
            <p className={ENTRY_TITLE}>音标</p>
          </div>
          <p className={ENTRY_SUB}>48 音标 · 离线发音</p>
          <div className="mt-auto flex w-full items-center justify-end pt-1.5">
            <span className={ENTRY_GO}>
              去练习 <ChevronRightIcon width={13} height={13} />
            </span>
          </div>
        </button>
      </div>
      </div>
    </div>
  )
}
