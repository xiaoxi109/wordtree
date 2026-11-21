import { useMemo, useState } from 'react'
import type { BookLesson } from '../lib/bookTypes'
import { SearchIcon, StarIcon, XIcon } from '../components/icons'

/**
 * 篇目目录：搜索 + 收藏筛选 + 已学标记 + 当前篇高亮。
 * 宽屏常驻左栏，窄屏作为抽屉覆盖正文。
 */
export default function BookCatalogPanel({
  lessons,
  currentId,
  readIds,
  favIds,
  onSelect,
  onToggleFav,
  onClose,
}: {
  lessons: BookLesson[]
  currentId: string | null
  readIds: Set<string>
  favIds: Set<string>
  onSelect: (id: string) => void
  onToggleFav: (id: string) => void
  /** 窄屏抽屉：关闭按钮 */
  onClose?: () => void
}) {
  const [query, setQuery] = useState('')
  const [favOnly, setFavOnly] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return lessons.filter((l) => {
      if (favOnly && !favIds.has(l.id)) return false
      if (!q) return true
      return (
        l.title.toLowerCase().includes(q) ||
        l.titleZh.toLowerCase().includes(q) ||
        String(l.index).includes(q)
      )
    })
  }, [lessons, query, favOnly, favIds])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-2 px-3 pb-2 pt-3">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <SearchIcon width={14} height={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              placeholder="搜索篇目"
              className="field !rounded-[14px] !py-2 !pl-8 !text-[13px]"
            />
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭目录"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200/70 bg-white/70 text-slate-500 transition active:scale-95 dark:border-slate-700/55 dark:bg-slate-800/50"
            >
              <XIcon width={15} height={15} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFavOnly(false)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
              !favOnly
                ? 'bg-brand-50 text-brand-700 dark:bg-brand-400/20 dark:text-brand-100'
                : 'bg-slate-100/70 text-slate-500 dark:bg-white/5 dark:text-slate-400'
            }`}
          >
            全部 {lessons.length}
          </button>
          <button
            type="button"
            onClick={() => setFavOnly(true)}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
              favOnly
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200'
                : 'bg-slate-100/70 text-slate-500 dark:bg-white/5 dark:text-slate-400'
            }`}
          >
            <StarIcon width={11} height={11} />
            收藏 {favIds.size}
          </button>
          <span className="ml-auto text-[11px] text-slate-400">已学 {readIds.size}</span>
        </div>
      </div>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {filtered.length === 0 ? (
          <p className="px-3 py-8 text-center text-[12px] text-slate-400">没有匹配的篇目</p>
        ) : (
          <ul className="space-y-0.5">
            {filtered.map((l) => {
              const active = l.id === currentId
              const read = readIds.has(l.id)
              const fav = favIds.has(l.id)
              return (
                <li key={l.id}>
                  <div
                    className={`flex items-center gap-1 rounded-[12px] pl-2 pr-1 transition ${
                      active
                        ? 'bg-brand-50/80 dark:bg-brand-400/15'
                        : 'hover:bg-slate-900/[0.04] dark:hover:bg-white/5'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(l.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left"
                    >
                      <span
                        className={`w-4 shrink-0 text-[10px] font-bold tabular-nums ${
                          active ? 'text-brand-600 dark:text-brand-300' : 'text-slate-300 dark:text-slate-600'
                        }`}
                      >
                        {l.index}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block truncate text-[13px] font-semibold ${
                            active ? 'text-brand-700 dark:text-brand-100' : 'text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          {l.title}
                        </span>
                        <span className="block truncate text-[11px] text-slate-400">{l.titleZh}</span>
                      </span>
                      {read && (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" aria-label="已学" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleFav(l.id)}
                      aria-label={fav ? '取消收藏' : '收藏'}
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition active:scale-90 ${
                        fav ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400 dark:text-slate-600'
                      }`}
                    >
                      <StarIcon width={14} height={14} />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
