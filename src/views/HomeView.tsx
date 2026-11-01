import { useMemo } from 'react'
import { ALL_WORDS, LEVELS, TOTAL } from '../data'
import type { Level } from '../data'
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
 */
export default function HomeView({
  masteredSet,
  onOpenLevel,
  onOpenSearch,
}: {
  masteredSet: Set<string>
  onOpenLevel: (level: Level) => void
  onOpenSearch: () => void
}) {
  const masteredCount = useMemo(
    () => ALL_WORDS.filter((w) => masteredSet.has(w.word)).length,
    [masteredSet],
  )
  const overallPct = TOTAL ? Math.round((masteredCount / TOTAL) * 100) : 0

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
        }
      }),
    [masteredSet],
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
        <p className="eyebrow">按 CEFR 等级</p>
        <p className="text-[11px] text-slate-400">点进等级看词表</p>
      </div>
      <div className="space-y-2">
        {levels.map((l) => {
          const s = LEVEL_STYLE[l.id]
          return (
            <button
              key={l.id}
              onClick={() => onOpenLevel(l.id)}
              className="surface flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition active:scale-[0.995]"
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
