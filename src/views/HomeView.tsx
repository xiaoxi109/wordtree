import { useMemo } from 'react'
import { ALL_WORDS, LEVELS, TOTAL } from '../data'
import type { Level } from '../data'
import { GRADE_RUNGS, LEVEL_RUNGS, type Route, type GradeRung, type LevelRung } from '../data/levels'
import { LEVEL_STYLE, ProgressSummary } from '../components/word'
import { ChevronRightIcon, SearchIcon } from '../components/icons'

const TODAY = new Intl.DateTimeFormat('zh-CN', {
  month: 'long',
  day: 'numeric',
  weekday: 'long',
}).format(new Date())

/**
 * 首页仪表盘：只放「今天要做什么」与入口。
 * 词表浏览、筛选、搜索都收进二级页，首页不再堆 3000 张卡片。
 *
 * 激活窗口（软默认 B）：
 *   - 显示当前等级及以下的总体进度（而非全部词库）
 *   - 但下方等级列表仍展示完整进度，让用户了解全貌
 */
export default function HomeView({
  masteredSet,
  onOpenLevel,
  onOpenSearch,
  route = 'level',
  currentRung,
  activeLevels,
  canAdvance,
  onStartQuiz,
}: {
  masteredSet: Set<string>
  onOpenLevel: (level: Level) => void
  onOpenSearch: () => void
  /** 当前学习路线 */
  route?: Route
  /** 当前等级（用于头部显示和进度计算） */
  currentRung?: GradeRung | LevelRung
  /** 激活窗口范围内的 CEFR 等级 */
  activeLevels?: Level[]
  /** 激活窗口内全部掌握 + 有下一级可去 */
  canAdvance?: boolean
  /** 点击开启闯关 */
  onStartQuiz?: () => void
}) {
  // 全部词库进度（始终显示，让用户了解全貌）
  const masteredCount = useMemo(
    () => ALL_WORDS.filter((w) => masteredSet.has(w.word)).length,
    [masteredSet],
  )
  const overallPct = TOTAL ? Math.round((masteredCount / TOTAL) * 100) : 0

  // 激活窗口范围内的进度（软默认筛选）
  const windowStats = useMemo(() => {
    if (!activeLevels || activeLevels.length === 0) return null
    const scope = ALL_WORDS.filter((w) => activeLevels.includes(w.level))
    const done = scope.filter((w) => masteredSet.has(w.word)).length
    return { total: scope.length, done, pct: scope.length ? Math.round((done / scope.length) * 100) : 0 }
  }, [activeLevels, masteredSet])

  const currentRungLabel = useMemo(() => {
    if (!currentRung) return null
    if (route === 'grade') {
      const g = GRADE_RUNGS.find((r) => r.id === currentRung)
      return g?.label ?? String(currentRung)
    }
    const l = LEVEL_RUNGS.find((r) => r.id === currentRung)
    return l?.label ?? String(currentRung)
  }, [route, currentRung])

  const levels = useMemo(
    () =>
      LEVELS.map((l) => {
        const words = ALL_WORDS.filter((w) => w.level === l.id)
        const done = words.filter((w) => masteredSet.has(w.word)).length
        return {
          ...l,
          total: words.length,
          done,
          pct: words.length ? Math.round((done / words.length) * 100) : 0,
          inWindow: activeLevels ? activeLevels.includes(l.id) : true,
        }
      }),
    [masteredSet, activeLevels],
  )

  return (
    <>
      {/* 紧凑标题：日期 eyebrow 跟主标题同一行，砍成 18px */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0 flex items-end gap-2">
          <span className="rounded-full bg-slate-900/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:bg-white/[0.06] dark:text-slate-400">
            {TODAY}
          </span>
          <h2 className="font-display text-[18px] font-semibold leading-tight tracking-tight text-slate-900 dark:text-slate-50">
            今天想学点什么？
          </h2>
        </div>
      </div>

      {/* 激活窗口范围进度（如有） */}
      {windowStats && (
        <div className="mb-3 rounded-[20px] border border-brand-200/60 bg-brand-50/50 p-3 dark:border-brand-500/20 dark:bg-brand-500/5">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-brand-600 dark:text-brand-300">
            激活窗口 · {currentRungLabel} 及以下
          </p>
          <p className="mt-1 text-[13px] font-semibold text-slate-800 dark:text-slate-200">
            {windowStats.done} / {windowStats.total} 已掌握
            <span className="ml-1 text-brand-600 dark:text-brand-300">· {windowStats.pct}%</span>
          </p>
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-brand-200/70 dark:bg-brand-500/20">
            <div
              className="h-full rounded-full bg-brand-500 transition-all duration-500 ease-spring"
              style={{ width: `${windowStats.pct}%` }}
            />
          </div>
        </div>
      )}

      {/* 晋级闯关入口：激活窗口全掌握后解锁 */}
      {canAdvance && onStartQuiz && (
        <button
          onClick={onStartQuiz}
          className="mb-3 flex w-full items-center justify-between gap-3 rounded-[20px] border border-accent-lime/60 bg-accent-lime/20 px-4 py-3 text-left transition hover:bg-accent-lime/30 active:scale-[0.995] dark:bg-accent-lime/15 dark:hover:bg-accent-lime/25"
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

      <div className="mb-4">
        <ProgressSummary done={masteredCount} total={TOTAL} pct={overallPct} />
      </div>

      <button
        onClick={onOpenSearch}
        className="surface mb-4 flex w-full items-center gap-3 px-3 py-2.5 text-left transition active:scale-[0.995]"
        aria-label="搜索全部单词"
      >
        <SearchIcon width={16} height={16} className="shrink-0 text-slate-400" />
        <span className="min-w-0 flex-1 text-[12px] text-slate-400">搜索全部单词 / 释义 / 音标</span>
        <ChevronRightIcon width={14} height={14} className="shrink-0 text-slate-300" />
      </button>

      <div className="mb-1.5 flex items-center justify-between gap-3">
        <p className="eyebrow">按西式等级</p>
        <p className="text-[11px] text-slate-400">点进等级看词表 · 高亮为当前窗口</p>
      </div>
      <div className="space-y-2">
        {levels.map((l) => {
          const s = LEVEL_STYLE[l.id]
          const inWindow = l.inWindow
          return (
            <button
              key={l.id}
              onClick={() => onOpenLevel(l.id)}
              className={`surface flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition active:scale-[0.995] ${
                !inWindow ? 'opacity-55' : ''
              }`}
            >
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-black/5 font-display text-[13px] font-bold dark:border-white/10 ${s.badge}`}
              >
                {l.label}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-[12px] font-semibold text-slate-800 dark:text-slate-100">
                    {l.desc}
                  </span>
                  <span className="shrink-0 text-[11px] font-semibold text-slate-400">
                    {l.done}/{l.total}
                  </span>
                </span>
                <span className="mt-1.5 flex items-center gap-2">
                  <span className="h-1 flex-1 overflow-hidden rounded-full bg-slate-900/[0.07] dark:bg-white/10">
                    <span
                      className={`block h-full rounded-full transition-all duration-500 ease-spring ${s.dot}`}
                      style={{ width: `${l.pct}%` }}
                    />
                  </span>
                  <span className="w-7 shrink-0 text-right text-[10px] font-semibold text-slate-400">
                    {l.pct}%
                  </span>
                </span>
              </span>
              <ChevronRightIcon width={14} height={14} className="shrink-0 text-slate-300" />
            </button>
          )
        })}
      </div>
    </>
  )
}
