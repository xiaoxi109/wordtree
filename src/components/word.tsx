import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ALL_WORDS, CATEGORIES, LEVELS, groupByCategory } from '../data'
import type { CategoryId, Level, Word } from '../data'
import { GRADE_RUNGS } from '../data/levels'
import { GRADE_STYLE, GRADES } from '../data/grades'
import { useSpeech } from '../hooks/useSpeech'
import { wordKey } from '../lib/cluster'
import { lookupWord } from '../lib/dict'
import { textTokens } from '../lib/parse'
import { POS_GROUPS, posLabel, posShort, type PosId } from '../lib/pos'
import { DisplayModeToggle, type DisplayMode } from './display'
import { CheckIcon, ChevronRightIcon, SearchIcon, SlidersIcon, SpeakerIcon, XIcon } from './icons'
import { Sheet } from './Sheet'

export const LEVEL_STYLE: Record<Level, { badge: string; dot: string }> = {
  'Pre-A1': {
    badge: 'bg-emerald-100/80 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
    dot: 'bg-emerald-500',
  },
  A1: { badge: 'bg-sky-100/80 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300', dot: 'bg-sky-500' },
  A2: { badge: 'bg-violet-100/80 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300', dot: 'bg-violet-500' },
  B1: { badge: 'bg-amber-100/80 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300', dot: 'bg-amber-500' },
  B2: { badge: 'bg-rose-100/80 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300', dot: 'bg-rose-500' },
}

// 年级徽标：人教词表显示「小学 / 初一 / 初二 …」而非 CEFR 等级。
const GRADE_LABEL: Record<string, string> = Object.fromEntries(GRADES.map((g) => [g.id, g.label]))

export function GradeBadge({ grade }: { grade: string }) {
  const s = GRADE_STYLE[grade as keyof typeof GRADE_STYLE]
  if (!s) return null
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border border-black/5 px-2 py-0.5 text-[11px] font-bold tracking-wide dark:border-white/10 ${s.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {GRADE_LABEL[grade] ?? grade}
    </span>
  )
}

// Scene category accent dots (used in grouped section headers).
export const CAT_DOT: Record<CategoryId, string> = {
  people: 'bg-pink-500',
  body: 'bg-rose-500',
  health: 'bg-red-400',
  clothes: 'bg-fuchsia-500',
  food: 'bg-orange-500',
  home: 'bg-indigo-500',
  animals: 'bg-amber-500',
  nature: 'bg-green-500',
  space: 'bg-cyan-500',
  time: 'bg-violet-500',
  numbers: 'bg-red-500',
  colors: 'bg-purple-500',
  size: 'bg-teal-500',
  actions: 'bg-lime-500',
  emotions: 'bg-rose-400',
  communication: 'bg-sky-400',
  education: 'bg-teal-400',
  work: 'bg-emerald-500',
  travel: 'bg-cyan-400',
  shopping: 'bg-amber-600',
  society: 'bg-slate-500',
  science: 'bg-emerald-600',
  media: 'bg-rose-500',
  arts: 'bg-fuchsia-600',
  thinking: 'bg-indigo-400',
  grammar: 'bg-slate-400',
  questions: 'bg-blue-500',
  toys: 'bg-yellow-500',
}

export function LevelBadge({ level }: { level: Level }) {
  const s = LEVEL_STYLE[level]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border border-black/5 px-2 py-0.5 text-[11px] font-bold tracking-wide dark:border-white/10 ${s.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {level}
    </span>
  )
}

export function SpeakerBtn({
  text,
  className = '',
  rate,
  iconSize = 18,
}: {
  text: string
  className?: string
  rate?: number
  iconSize?: number
}) {
  const { speak, speaking, loading, preload, downloadStatus } = useSpeech()
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation()
        // 模型未就绪时先初始化（首次点击可能加载中，第二次必响）
        if (downloadStatus !== 'ready') {
          try {
            await preload()
          } catch {
            /* ignore */
          }
        }
        speak(text, rate)
      }}
      title={loading ? '正在加载语音模型…' : '发音'}
      aria-label="朗读"
      className={`inline-flex items-center justify-center rounded-full p-2 text-brand-700 transition hover:bg-brand-50 hover:text-brand-800 active:scale-95 dark:text-brand-300 dark:hover:bg-brand-500/10 ${
        speaking || loading ? 'animate-pulse' : ''
      } ${className}`}
    >
      <SpeakerIcon width={iconSize} height={iconSize} />
    </button>
  )
}

/* ----------------------------- Progress summary ----------------------------- */
/**
 * 页头掌握进度条：掌握率 + 已掌握/总词数 + 细进度条。
 * 首页与人教主页面用它替代原来的深色进度卡，更轻、不抢内容。
 */
export function ProgressSummary({ done, total, pct }: { done: number; total: number; pct: number }) {
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="font-display text-[30px] font-semibold leading-none tracking-tight text-slate-900 dark:text-slate-50">
          {pct}
          <span className="ml-0.5 text-base font-normal text-slate-400">%</span>
        </span>
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">掌握率</span>
        <span className="ml-auto shrink-0 text-[12px] font-semibold text-slate-500 dark:text-slate-400">
          {done}
          <span className="font-normal text-slate-400"> / {total} 已掌握</span>
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-900/[0.07] dark:bg-white/10">
        <div
          className="h-full rounded-full bg-brand-500 transition-all duration-500 ease-spring"
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
    </div>
  )
}

/* ----------------------------- Browse card ----------------------------- */
export function WordCard({
  word,
  mastered,
  mode = 'both',
  onOpen,
  onToggleMastered,
}: {
  word: Word
  mastered: boolean
  /** 列表显示语言：只影响卡片本身，详情保持完整 */
  mode?: DisplayMode
  onOpen: () => void
  onToggleMastered: () => void
}) {
  const showEn = mode !== 'zh'
  const showZh = mode !== 'en'
  const pos = posShort(word)
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group relative flex flex-col items-start gap-1 overflow-hidden rounded-[16px] border p-3 text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-soft active:scale-[0.995] ${
        mastered
          ? 'border-brand-200/60 bg-brand-50/40 dark:border-brand-500/20 dark:bg-brand-500/5'
          : 'border-slate-200/60 bg-white/65 hover:border-brand-300/60 hover:bg-white dark:border-slate-700/50 dark:bg-slate-800/45 dark:hover:border-brand-500/35 dark:hover:bg-slate-800/70'
      }`}
    >
      <div className="relative flex w-full items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {word.grade ? <GradeBadge grade={word.grade} /> : <LevelBadge level={word.level} />}
          {word.common && (
            <span className="rounded-full border border-amber-200/60 bg-amber-100/70 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/15 dark:text-amber-300">
              常用
            </span>
          )}
          {pos && (
            <span className="rounded-full bg-slate-900/5 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">
              {pos}
            </span>
          )}
        </div>
        <span
          role="button"
          tabIndex={0}
          title={mastered ? '已掌握' : '标记为已掌握'}
          aria-label={mastered ? '已掌握' : '标记为已掌握'}
          onClick={(e) => {
            e.stopPropagation()
            onToggleMastered()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              e.stopPropagation()
              onToggleMastered()
            }
          }}
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition ${
            mastered
              ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
              : 'border-slate-300/70 bg-white/40 text-transparent hover:border-brand-400 hover:text-brand-400 dark:border-slate-600 dark:bg-slate-900/30'
          }`}
        >
          <CheckIcon width={14} height={14} />
        </span>
      </div>
      <div className="relative mt-1.5 flex w-full min-w-0 items-baseline justify-between gap-2">
        {showEn ? (
          <span className="min-w-0 break-words font-display text-[18px] font-semibold leading-tight tracking-tight text-slate-900 dark:text-slate-50">
            {word.word}
          </span>
        ) : (
          <span className="min-w-0 break-words text-base font-bold leading-snug text-slate-900 dark:text-slate-50">
            {word.meaning}
          </span>
        )}
        {showEn && <SpeakerBtn text={word.word} iconSize={16} className="-mr-1 shrink-0" />}
      </div>
      {showEn && <span className="relative text-[11px] text-slate-400 dark:text-slate-500">{word.ipa}</span>}
      {showZh && (
        <span
          className={`relative text-[12px] leading-relaxed text-slate-500 dark:text-slate-400 ${
            showEn ? 'line-clamp-1' : 'line-clamp-2'
          }`}
        >
          {word.meaning}
        </span>
      )}
    </button>
  )
}

/* ----------------------------- Detail body（整页展示） ----------------------------- */
export function WordDetailBody({
  word,
  mastered,
  onOpenWord,
}: {
  word: Word
  mastered: boolean
  /** 例句中点词回调，打开对应词的详情 */
  onOpenWord?: (w: Word) => void
}) {
  const pos = posShort(word)

  /** 词键 → Word 的快速索引：例句点词时查词用 */
  const wordMap = useMemo(() => {
    const m = new Map<string, Word>()
    for (const w of ALL_WORDS) m.set(wordKey(w.word), w)
    return m
  }, [])

  /** 从例句里的原文 token 找到对应的完整 Word（处理屈折变体） */
  const resolveWord = useMemo(() => {
    return (token: string): Word | null => {
      const entry = lookupWord(token)
      if (!entry) return null
      // entry.key 是 wordKey 格式（小写规范化），用它查 ALL_WORDS 索引拿完整 Word
      return wordMap.get(entry.key) ?? wordMap.get(wordKey(entry.word)) ?? null
    }
  }, [wordMap])

  /** 渲染可点击的英文文本：分词 + 每个英文词可点击查词 */
  const renderClickableEn = useMemo(() => {
    return (en: string) => {
      // textTokens 需要一个变体索引；传空 Map 会走简单分词——任意英文 token 都是 isWord
      const nodes = textTokens(en, new Map())
      return nodes.map((n, i) =>
        n.isWord
          ? (
            <button
              key={i}
              type="button"
              onClick={() => {
                if (!onOpenWord) return
                const hit = resolveWord(n.text)
                if (hit) onOpenWord(hit)
              }}
              className={`rounded px-0.5 transition ${
                onOpenWord
                  ? 'hover:bg-brand-100 hover:text-brand-700 active:bg-brand-500/25 dark:hover:bg-brand-500/20 dark:hover:text-brand-300'
                  : ''
              } ${resolveWord(n.text) ? 'text-brand-700 underline decoration-dotted underline-offset-2 dark:text-brand-300' : ''}`}
              title={resolveWord(n.text) ? '点击查词' : undefined}
            >
              {n.text}
            </button>
          )
          : (
            <span key={i}>{n.text}</span>
          ),
      )
    }
  }, [onOpenWord, resolveWord])

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">{word.grade ? '中式阶梯' : '西式阶梯'}</p>
          <h2 className="mt-1.5 break-words font-display text-[34px] font-semibold leading-none tracking-tight text-slate-900 dark:text-slate-50">
            {word.word}
          </h2>
          <p className="mt-2 text-[13px] text-slate-400">{word.ipa}</p>
        </div>
        <SpeakerBtn
          text={word.word}
          rate={0.85}
          iconSize={22}
          className="!h-12 !w-12 shrink-0 !bg-brand-50 !p-0 dark:!bg-brand-500/10"
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        {word.grade ? <GradeBadge grade={word.grade} /> : <LevelBadge level={word.level} />}
        {pos && (
          <span className="rounded-full border border-slate-200/60 bg-white/70 px-2 py-0.5 text-[11px] font-bold text-slate-500 dark:border-slate-700/60 dark:bg-slate-800/60 dark:text-slate-300">
            {pos}
          </span>
        )}
        {word.common && (
          <span className="rounded-full border border-amber-200/60 bg-amber-100/70 px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/15 dark:text-amber-300">
            常用词
          </span>
        )}
        {mastered && (
          <span className="inline-flex items-center gap-1 rounded-full border border-brand-200/70 bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-700 dark:border-brand-500/25 dark:bg-brand-500/10 dark:text-brand-300">
            <CheckIcon width={11} height={11} />
            已掌握
          </span>
        )}
      </div>

      <div className="surface-inset mt-4 p-4">
        <p className="text-lg font-semibold leading-relaxed text-slate-800 dark:text-slate-100">{word.meaning}</p>
      </div>

      <p className="mb-2.5 mt-6 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
        Examples · 例句{onOpenWord && <span className="ml-2 font-normal tracking-normal text-slate-300">（点词查卡）</span>}
      </p>
      {word.examples.length > 0 ? (
        <ul className="space-y-3">
          {word.examples.map((ex, i) => (
            <li key={i} className="surface px-4 py-3.5">
              <div className="flex items-start justify-between gap-2">
                <p className="font-display text-[15px] leading-relaxed text-slate-800 dark:text-slate-100">
                  {onOpenWord ? renderClickableEn(ex.en) : ex.en}
                </p>
                <SpeakerBtn text={ex.en} rate={0.9} iconSize={16} className="-mr-1 -mt-1 shrink-0" />
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">{ex.zh}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-[18px] border border-dashed border-slate-300/80 py-6 text-center text-sm text-slate-400 dark:border-slate-700/70">
          暂无例句（中式词源补充）
        </p>
      )}
    </div>
  )
}

/**
 * 单词详情弹层：点击词卡打开。移动端是底部弹层、桌面端居中浮层，
 * 底部固定「标记为已掌握」，不再跳转整页。
 */
export function WordModal({
  word,
  mastered,
  onClose,
  onPop,
  onToggleMastered,
  onOpenWord,
}: {
  word: Word
  mastered: boolean
  onClose: () => void
  /** 卡片栈回退按钮：传了说明栈里至少有两张，可以返回上一个词 */
  onPop?: () => void
  onToggleMastered: () => void
  /** 例句中点词打开新的 WordModal；不传则禁用点词交互 */
  onOpenWord?: (w: Word) => void
}) {
  return (
    <Sheet
      open
      onClose={onClose}
      title=""
      footer={
        <button
          onClick={onToggleMastered}
          className={`flex w-full items-center justify-center gap-2 rounded-[18px] py-3.5 text-sm font-semibold transition active:scale-[0.985] ${
            mastered
              ? 'bg-brand-600 text-white shadow-float hover:bg-brand-700'
              : 'bg-slate-900 text-white shadow-float hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100'
          }`}
        >
          <CheckIcon width={18} height={18} />
          {mastered ? '已掌握 · 点击取消' : '标记为已掌握'}
        </button>
      }
    >
      {/* 卡片栈返回按钮：当是从另一个词的例句点进来时显示 */}
      {onPop && (
        <button
          onClick={onPop}
          className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-[12px] font-semibold text-brand-700 transition hover:bg-brand-100 active:scale-[0.97] dark:bg-brand-500/10 dark:text-brand-300 dark:hover:bg-brand-500/15"
        >
          <ChevronRightIcon width={14} height={14} className="rotate-180" />
          返回上一个词
        </button>
      )}
      <WordDetailBody word={word} mastered={mastered} onOpenWord={onOpenWord} />
    </Sheet>
  )
}

export function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="surface p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className={`mt-1 font-display text-3xl font-semibold ${accent ? 'text-brand-700 dark:text-brand-300' : 'text-slate-900 dark:text-slate-100'}`}>
        {value}
      </p>
    </div>
  )
}

export function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition active:scale-[0.98] ${
        active
          ? 'border-slate-900 bg-slate-900 text-white shadow-sm dark:border-white dark:bg-white dark:text-slate-900'
          : 'border-slate-200/70 bg-white/70 text-slate-600 hover:border-slate-300 hover:bg-white dark:border-slate-700/60 dark:bg-slate-800/50 dark:text-slate-300 dark:hover:bg-slate-800'
      }`}
    >
      {children}
    </button>
  )
}

/* 词性筛选：多选（可组合）。放在筛选弹层里展示全部词性。 */
function PosFilterRow({
  value,
  onChange,
  counts,
}: {
  value: Set<PosId>
  onChange: (v: Set<PosId>) => void
  counts?: Record<PosId, number>
}) {
  const toggle = (id: PosId) => {
    const next = new Set(value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(next)
  }

  return (
    <div className="flex flex-wrap gap-2">
      <FilterChip active={value.size === 0} onClick={() => onChange(new Set())}>
        全部词性
      </FilterChip>
      {POS_GROUPS.map((p) => {
        const active = value.has(p.id)
        const n = counts?.[p.id]
        return (
          <FilterChip key={p.id} active={active} onClick={() => toggle(p.id)}>
            {posLabel(p.id)}
            {counts && (
              <span className={`ml-1 text-[11px] ${active ? 'text-white/60 dark:text-slate-500' : 'text-slate-400'}`}>{n}</span>
            )}
          </FilterChip>
        )
      })}
    </div>
  )
}

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section>
      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  )
}

/* Configurable filter bar reused by Home and Unmastered list views. */
export function FilterBar({
  route,
  levelFilter,
  setLevelFilter,
  gradeFilter,
  setGradeFilter,
  catFilter,
  setCatFilter,
  commonOnly,
  setCommonOnly,
  search,
  setSearch,
  showMasterChips = false,
  showUnmastered,
  setShowUnmastered,
  showMastered,
  setShowMastered,
  displayMode,
  setDisplayMode,
  hideLevel = false,
  hideCategory = false,
  posFilter,
  setPosFilter,
  posCounts,
}: {
  route?: 'grade' | 'level'
  levelFilter?: Level | 'all'
  setLevelFilter?: (v: Level | 'all') => void
  gradeFilter?: string | 'all'
  setGradeFilter?: (v: string | 'all') => void
  catFilter: CategoryId | 'all'
  setCatFilter: (v: CategoryId | 'all') => void
  commonOnly: boolean
  setCommonOnly: (v: boolean) => void
  search: string
  setSearch: (v: string) => void
  showMasterChips?: boolean
  showUnmastered?: boolean
  setShowUnmastered?: (v: boolean) => void
  showMastered?: boolean
  setShowMastered?: (v: boolean) => void
  /** 传了才显示「中英 / 英文 / 中文」切换（列表卡片显示语言） */
  displayMode?: DisplayMode
  setDisplayMode?: (m: DisplayMode) => void
  hideLevel?: boolean
  hideCategory?: boolean
  /** 传了才显示词性筛选（多选，可组合） */
  posFilter?: Set<PosId>
  setPosFilter?: (v: Set<PosId>) => void
  /** 各词性在当前其他筛选条件下的词数 */
  posCounts?: Record<PosId, number>
}) {
  const [open, setOpen] = useState(false)

  const reset = () => {
    setLevelFilter?.('all')
    setGradeFilter?.('all')
    setCatFilter('all')
    setCommonOnly(false)
    setShowUnmastered?.(true)
    setShowMastered?.(false)
    setPosFilter?.(new Set())
  }

  return (
    <div
      className="fixed inset-x-0 z-20 border-b border-slate-900/[0.06] bg-[#f6f3ea]/90 backdrop-blur-xl dark:border-white/10 dark:bg-[#0e100c]/90"
      style={{ top: 'calc(env(safe-area-inset-top) + 56px)' }}
    >
      <div className="mx-auto max-w-5xl px-4 py-2">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <SearchIcon
              width={17}
              height={17}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索单词 / 释义 / 音标"
              aria-label="搜索单词"
              className="field h-11 pl-11 pr-10 !py-0 text-[16px] sm:text-[13px]"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                aria-label="清除搜索"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-slate-400 transition hover:bg-slate-900/5 hover:text-slate-700 dark:hover:bg-white/10"
              >
                <XIcon width={15} height={15} />
              </button>
            )}
          </div>
          <button
            onClick={() => setOpen(true)}
            className="flex h-11 shrink-0 items-center gap-2 rounded-[18px] border border-slate-200/70 bg-white/70 px-3.5 text-[13px] font-semibold text-slate-700 transition hover:bg-white active:scale-[0.99] dark:border-slate-700/60 dark:bg-slate-800/50 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <SlidersIcon width={17} height={17} />
            <span className="hidden sm:inline">筛选</span>
          </button>
        </div>
      </div>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="筛选单词"
        subtitle="组合等级、场景、掌握状态与词性，快速缩小范围"
        footer={
          <div className="flex gap-2">
            <button
              onClick={reset}
              className="flex-1 rounded-[18px] border border-slate-200/70 bg-white/70 py-3 text-sm font-semibold text-slate-600 transition hover:bg-white dark:border-slate-700/60 dark:bg-slate-800/50 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              重置
            </button>
            <button
              onClick={() => setOpen(false)}
              className="flex-[1.4] rounded-[18px] bg-slate-900 py-3 text-sm font-semibold text-white shadow-float transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
            >
              查看结果
            </button>
          </div>
        }
      >
        <div className="space-y-5 pb-1">
          {!hideLevel && (route === 'grade' ? (
            <FilterGroup label="中式等级">
              <FilterChip active={gradeFilter === 'all'} onClick={() => setGradeFilter?.('all')}>
                全部
              </FilterChip>
              {GRADE_RUNGS.map((g) => (
                <FilterChip key={g.id} active={gradeFilter === g.id} onClick={() => setGradeFilter?.(g.id)}>
                  {g.label}
                </FilterChip>
              ))}
            </FilterGroup>
          ) : (
            <FilterGroup label="西式等级">
              <FilterChip active={levelFilter === 'all'} onClick={() => setLevelFilter?.('all')}>
                全部
              </FilterChip>
              {LEVELS.map((l) => (
                <FilterChip key={l.id} active={levelFilter === l.id} onClick={() => setLevelFilter?.(l.id)}>
                  {l.id}
                </FilterChip>
              ))}
            </FilterGroup>
          ))}

          {!hideCategory && (
            <FilterGroup label="场景">
              <FilterChip active={catFilter === 'all'} onClick={() => setCatFilter('all')}>
                全部场景
              </FilterChip>
              {CATEGORIES.map((c) => (
                <FilterChip key={c.id} active={catFilter === c.id} onClick={() => setCatFilter(c.id)}>
                  {c.label}
                </FilterChip>
              ))}
            </FilterGroup>
          )}

          <FilterGroup label="掌握状态">
            <FilterChip active={commonOnly} onClick={() => setCommonOnly(!commonOnly)}>
              ★ 只看常用
            </FilterChip>
            {showMasterChips && (
              <>
                <FilterChip active={!!showUnmastered} onClick={() => setShowUnmastered?.(!(showUnmastered ?? false))}>
                  未掌握
                </FilterChip>
                <FilterChip active={!!showMastered} onClick={() => setShowMastered?.(!(showMastered ?? false))}>
                  已掌握
                </FilterChip>
              </>
            )}
          </FilterGroup>

          {displayMode && setDisplayMode && (
            <FilterGroup label="卡片显示">
              <DisplayModeToggle value={displayMode} onChange={setDisplayMode} />
            </FilterGroup>
          )}

          {posFilter && setPosFilter && (
            <FilterGroup label="词性">
              <PosFilterRow value={posFilter} onChange={setPosFilter} counts={posCounts} />
            </FilterGroup>
          )}
        </div>
      </Sheet>
    </div>
  )
}

/* Grouped word grid with empty state, reused by all browse pages. */
const GRID_BATCH = 60

export function WordGrid({
  words,
  masteredSet,
  mode = 'both',
  onOpen,
  onToggleMastered,
}: {
  words: Word[]
  masteredSet: Set<string>
  mode?: DisplayMode
  onOpen: (w: Word) => void
  onToggleMastered: (w: Word) => void
}) {
  const groups = useMemo(() => groupByCategory(words), [words])
  const themeCount = useMemo(() => groups.reduce((s, g) => s + g.themes.length, 0), [groups])

  /** 渐进渲染：一次只挂载一批卡片，滚动到底自动追加。上千张卡片同时布局是切页卡顿的主因。 */
  const [limit, setLimit] = useState(GRID_BATCH)
  useEffect(() => setLimit(GRID_BATCH), [words])
  const shown = Math.min(limit, words.length)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const loadMore = () => setLimit((l) => l + GRID_BATCH)

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || shown >= words.length || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setLimit((l) => l + GRID_BATCH)
      },
      { rootMargin: '800px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [shown, words.length])

  // 按分类 / 主题顺序截取前 shown 个词，保持分组结构
  const sliced = useMemo(() => {
    let left = shown
    return groups
      .map((g) => {
        const themes: typeof g.themes = []
        let count = 0
        for (const t of g.themes) {
          if (left <= 0) break
          const items = t.items.slice(0, left)
          left -= items.length
          count += items.length
          if (items.length) themes.push({ ...t, items })
        }
        return { ...g, themes, count }
      })
      .filter((g) => g.themes.length > 0)
  }, [groups, shown])

  if (words.length === 0) {
    return (
      <div className="rounded-[26px] border border-dashed border-slate-300/70 bg-white/35 px-6 py-16 text-center dark:border-slate-700/70 dark:bg-slate-800/20">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-900/5 text-slate-400 dark:bg-white/5 dark:text-slate-500">
          <SearchIcon width={24} height={24} />
        </div>
        <p className="text-sm font-bold text-slate-600 dark:text-slate-300">没有找到匹配的单词</p>
        <p className="mt-1 text-xs text-slate-400">换个关键词，或调整筛选条件试试</p>
      </div>
    )
  }

  return (
    <>
      <div className="mb-4 flex items-end justify-between gap-3">
        <p className="eyebrow">Vocabulary</p>
        <p className="text-[11px] text-slate-400">
          {shown}/{words.length} 词 · {groups.length} 个场景 · {themeCount} 个分组
        </p>
      </div>
      <div className="space-y-5">
        {sliced.map((g) => (
          <section key={g.category.id}>
            <div className="mb-3 flex items-center gap-2.5">
              <span className={`h-2.5 w-2.5 rounded-full ${CAT_DOT[g.category.id]}`} />
              <h2 className="font-display text-[17px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                {g.category.label}
              </h2>
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                {g.category.en}
              </span>
              <span className="ml-auto rounded-full border border-slate-200/60 bg-white/60 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500 dark:border-slate-700/50 dark:bg-slate-800/40 dark:text-slate-400">
                {g.count}
              </span>
            </div>
            <div className="space-y-2.5">
              {g.themes.map((t) => (
                <div key={t.id}>
                  {t.label && (
                    <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                      <span className={`h-1.5 w-1.5 rounded-full ${CAT_DOT[g.category.id]} opacity-60`} />
                      {t.label}
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                    {t.items.map((w) => (
                      <WordCard
                        key={w.word}
                        word={w}
                        mastered={masteredSet.has(w.word)}
                        mode={mode}
                        onOpen={() => onOpen(w)}
                        onToggleMastered={() => onToggleMastered(w)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {shown < words.length && (
        <div ref={sentinelRef} className="mt-8 flex justify-center">
          <button onClick={loadMore} className="btn-soft">
            加载更多（{shown}/{words.length}）
          </button>
        </div>
      )}
    </>
  )
}
