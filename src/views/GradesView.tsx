import { useMemo } from 'react'
import { GRADES, GRADE_STYLE, getWordsByGrade, type GradeId } from '../data/grades'
import { ProgressSummary } from '../components/word'
import { ChevronRightIcon } from '../components/icons'

/**
 * 人教教材主页面：只展示总体进度与年级入口。
 * 具体词条进入年级二级页，避免一屏塞满 3000 张卡片。
 */
export default function GradesView({
  masteredSet,
  onOpenGrade,
}: {
  masteredSet: Set<string>
  onOpenGrade: (grade: GradeId) => void
}) {
  const byGrade = getWordsByGrade()

  const stats = useMemo(
    () =>
      GRADES.map((g) => {
        const words = byGrade[g.id]
        const done = words.filter((w) => masteredSet.has(w.word)).length
        return { ...g, total: words.length, done, pct: words.length ? Math.round((done / words.length) * 100) : 0 }
      }),
    [byGrade, masteredSet],
  )

  const pepTotal = useMemo(() => stats.reduce((s, g) => s + g.total, 0), [stats])
  const masteredCount = useMemo(() => stats.reduce((s, g) => s + g.done, 0), [stats])
  const overallPct = pepTotal ? Math.round((masteredCount / pepTotal) * 100) : 0

  return (
    <>
      {/* 紧凑标题：来源 eyebrow 跟主标题同一行，砍成 18px */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0 flex items-end gap-2">
          <span className="rounded-full bg-slate-900/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:bg-white/[0.06] dark:text-slate-400">
            中式阶梯
          </span>
          <h2 className="font-display text-[18px] font-semibold leading-tight tracking-tight text-slate-900 dark:text-slate-50">
            跟着课本背单词
          </h2>
        </div>
      </div>

      <div className="mb-4">
        <ProgressSummary done={masteredCount} total={pepTotal} pct={overallPct} />
      </div>

      <div className="mb-1.5 flex items-center justify-between gap-3">
        <p className="eyebrow">按年级进入</p>
        <p className="text-[11px] text-slate-400">小学 → 高三</p>
      </div>
      <div className="space-y-2">
        {stats.map((g) => {
          const s = GRADE_STYLE[g.id]
          return (
            <button
              key={g.id}
              onClick={() => onOpenGrade(g.id)}
              className="surface flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition active:scale-[0.995]"
            >
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] text-[13px] font-bold ${s.badge}`}
              >
                {g.label}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-[12px] font-semibold text-slate-800 dark:text-slate-100">{g.desc}</span>
                  <span className="shrink-0 text-[11px] font-semibold text-slate-400">
                    {g.done}/{g.total}
                  </span>
                </span>
                <span className="mt-1.5 flex items-center gap-2">
                  <span className="h-1 flex-1 overflow-hidden rounded-full bg-slate-900/[0.07] dark:bg-white/10">
                    <span
                      className={`block h-full rounded-full transition-all duration-500 ease-spring ${s.bar}`}
                      style={{ width: `${g.pct}%` }}
                    />
                  </span>
                  <span className="w-7 shrink-0 text-right text-[10px] font-semibold text-slate-400">
                    {g.pct}%
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
