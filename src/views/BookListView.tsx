import { useEffect, useMemo, useState } from 'react'
import { BOOK_CATALOG } from '../data/generated/book-catalog'
import { loadBookLessons } from '../data/bookLoader'
import { useBookProgressMap } from '../hooks/useBookProgress'
import { computeStreak, getBookEntry } from '../lib/bookProgress'
import type { BookMeta } from '../lib/bookTypes'
import { ChevronRightIcon, PlayIcon } from '../components/icons'

/** 进度环：已学比例 */
function ProgressRing({ value, total, size = 36 }: { value: number; total: number; size?: number }) {
  const pct = total > 0 ? Math.min(1, value / total) : 0
  const r = size / 2 - 3.2
  const c = 2 * Math.PI * r
  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      aria-label={`已学 ${value}/${total} 篇`}
    >
      <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" strokeWidth="3.2" className="stroke-brand-100 dark:stroke-white/10" />
        <circle cx="18" cy="18" r={r} fill="none" strokeWidth="3.2" strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} className="stroke-brand-500" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold tabular-nums text-brand-700 dark:text-brand-300">
        {Math.round(pct * 100)}%
      </span>
    </div>
  )
}

/**
 * 一张书卡。
 * 窄屏用「左封面 + 右信息」的横排（省高度），宽屏才用竖排大封面。
 */
function BookCard({ meta, readCount, onOpen }: { meta: BookMeta; readCount: number; onOpen: () => void }) {
  const coverUrl = `${import.meta.env.BASE_URL}${meta.cover}`
  const nce = meta.lexiconId.replace('nce-new-', '')
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full items-center gap-3 rounded-[18px] border border-slate-200/70 bg-white/75 p-2.5 text-left shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-soft active:scale-[0.995] sm:flex-col sm:items-stretch sm:p-3 dark:border-slate-700/55 dark:bg-slate-800/50"
    >
      <div className="relative h-[72px] w-[54px] shrink-0 overflow-hidden rounded-[10px] bg-gradient-to-br from-brand-100 via-brand-50 to-accent-sand/60 dark:from-brand-900/60 dark:via-slate-800/60 dark:to-slate-800/60 sm:h-auto sm:w-full sm:aspect-[16/10] sm:rounded-[14px]">
        <img
          src={coverUrl}
          alt={`${meta.name} 封面`}
          loading="lazy"
          className="h-full w-full object-cover object-top transition duration-300 group-hover:scale-[1.03]"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
        />
        <div className="absolute left-1 top-1 rounded-full bg-white/85 px-1.5 py-0.5 text-[9px] font-bold text-brand-700 backdrop-blur dark:bg-slate-900/70 dark:text-brand-300 sm:left-2 sm:top-2 sm:px-2 sm:text-[10px]">
          {meta.level}
        </div>
      </div>
      <div className="min-w-0 flex-1 sm:mt-2">
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 flex-1 truncate font-display text-[15px] font-semibold tracking-tight text-slate-900 dark:text-slate-50 sm:text-[16px]">
            {meta.name}
          </h3>
          <ChevronRightIcon width={15} height={15} className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500" />
        </div>
        <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-relaxed text-slate-500 dark:text-slate-400 sm:mt-1 sm:text-[12px]">
          {meta.description}
        </p>
        <div className="mt-1.5 flex items-center gap-2 sm:mt-2">
          <ProgressRing value={readCount} total={meta.count} size={28} />
          <p className="min-w-0 flex-1 truncate text-[11px] text-slate-400">
            共 {meta.count} 篇 · 已学 {readCount} 篇 · 词表 NCE{nce}
          </p>
        </div>
      </div>
    </button>
  )
}

export default function BookListView({ onOpenBook }: { onOpenBook: (bookId: string, lessonId?: string) => void }) {
  const progressMap = useBookProgressMap()
  const [resumeTitle, setResumeTitle] = useState<string | null>(null)

  /** 最近学习：取最后一次学习的册子与篇目 */
  const resume = useMemo(() => {
    let best: { bookId: string; lessonId: string; at: string } | null = null
    for (const meta of BOOK_CATALOG) {
      const entry = getBookEntry(progressMap, meta.id)
      if (!entry.lastId) continue
      const at = entry.days.length ? entry.days[entry.days.length - 1] : ''
      if (!best || at > best.at) best = { bookId: meta.id, lessonId: entry.lastId, at }
    }
    return best
  }, [progressMap])

  // 取回上次那篇的标题（只加载这一册的课文）
  useEffect(() => {
    if (!resume) {
      setResumeTitle(null)
      return
    }
    let alive = true
    loadBookLessons(resume.bookId)
      .then((lessons) => {
        if (!alive) return
        setResumeTitle(lessons.find((l) => l.id === resume.lessonId)?.title ?? null)
      })
      .catch(() => setResumeTitle(null))
    return () => {
      alive = false
    }
  }, [resume])

  const streak = useMemo(() => {
    const days = new Set<string>()
    for (const meta of BOOK_CATALOG) {
      for (const d of getBookEntry(progressMap, meta.id).days) days.add(d)
    }
    return computeStreak([...days])
  }, [progressMap])

  const resumeMeta = resume ? BOOK_CATALOG.find((m) => m.id === resume.bookId) : undefined

  return (
    <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto pb-2">
      {resume && resumeMeta && (
        <button
          type="button"
          onClick={() => onOpenBook(resume.bookId, resume.lessonId)}
          className="mb-3 flex w-full items-center gap-3 rounded-[20px] border border-brand-200/70 bg-gradient-to-r from-brand-50 via-white to-white p-3 text-left shadow-soft transition hover:shadow-card active:scale-[0.995] dark:border-brand-500/25 dark:from-brand-500/10 dark:via-slate-800/50 dark:to-slate-800/50"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-brand-600 text-white shadow-soft dark:bg-brand-500/25 dark:text-brand-200 dark:shadow-none">
            <PlayIcon width={16} height={16} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-bold uppercase tracking-[0.16em] text-brand-600 dark:text-brand-300">继续上次</span>
            <span className="mt-0.5 block truncate text-[13.5px] font-semibold text-slate-800 dark:text-slate-100">
              {resumeMeta.name} · {resumeTitle ?? '继续学习'}
            </span>
            <span className="mt-0.5 block text-[11px] text-slate-400">已连续学习 {streak} 天</span>
          </span>
          <ChevronRightIcon width={16} height={16} className="shrink-0 text-slate-300" />
        </button>
      )}

      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="eyebrow">教材书架</p>
        <span className="text-[11px] text-slate-400">{BOOK_CATALOG.length} 册 · 课文与原书录音全部离线</span>
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {BOOK_CATALOG.map((meta) => (
          <BookCard
            key={meta.id}
            meta={meta}
            readCount={getBookEntry(progressMap, meta.id).readIds.length}
            onOpen={() => onOpenBook(meta.id)}
          />
        ))}
      </div>
    </div>
  )
}
