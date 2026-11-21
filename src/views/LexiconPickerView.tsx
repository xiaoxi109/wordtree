import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DICT_CATEGORY_LIST,
  DICT_TAGS,
  LEXICONS,
  type LexiconMeta,
} from '../data/lexicons'
import { CheckIcon, SearchIcon } from '../components/icons'

interface Props {
  lexiconId: string
  onSelect: (id: string) => Promise<void>
  onDone: () => void
}

export default function LexiconPickerView({ lexiconId, onSelect, onDone }: Props) {
  /** 当前正在使用的词库：进入页面时默认定位到它所属的分类与卡片 */
  const currentMeta = useMemo(() => LEXICONS.find((l) => l.id === lexiconId), [lexiconId])
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState(currentMeta?.category ?? '全部')
  const [tagByCategory, setTagByCategory] = useState<Record<string, string>>({})
  /** 进入定位高亮：滚动到当前词库后呼吸两次，随后恢复普通选中态 */
  const [locating, setLocating] = useState(true)
  const selectedRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    const el = selectedRef.current
    if (el) {
      // 等首帧布局完成再滚，避免移动端拿到未稳定的位置；behavior:auto 直接就位不做长滚动
      const raf = requestAnimationFrame(() =>
        el.scrollIntoView({ block: 'center', behavior: 'auto' }),
      )
      const timer = window.setTimeout(() => setLocating(false), 2000)
      return () => {
        cancelAnimationFrame(raf)
        window.clearTimeout(timer)
      }
    }
    setLocating(false)
  }, [])

  const q = search.trim().toLowerCase()
  const searched = useMemo(
    () => LEXICONS.filter((l) =>
      !q || l.name.toLowerCase().includes(q) || l.description.toLowerCase().includes(q) || l.id.toLowerCase().includes(q),
    ),
    [q],
  )

  const choose = async (id: string) => {
    if (id !== lexiconId) await onSelect(id)
    onDone()
  }

  const renderCategory = (category: string) => {
    const tags = DICT_TAGS[category] ?? []
    const activeTag = tagByCategory[category] ?? '全部'
    const items = searched.filter((l) =>
      l.category === category && (activeTag === '全部' || l.tags.includes(activeTag)),
    )
    if (!items.length && q) return null

    return (
      <section key={category} className="mb-4">
        <div className="mb-2 flex items-baseline gap-1.5 px-1">
          <p className="shrink-0 text-[12px] font-bold text-slate-700 dark:text-slate-200">{category}</p>
          <p className="min-w-0 truncate text-[10px] text-slate-400">{items.length} 个词库</p>
        </div>
        <div className="mb-2 flex flex-wrap gap-1.5 px-1">
          {tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setTagByCategory((prev) => ({
                ...prev,
                [category]: (prev[category] ?? '全部') === tag ? '全部' : tag,
              }))}
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                activeTag === tag
                  ? 'bg-brand-600 text-white dark:bg-brand-500/15 dark:text-brand-200'
                  : 'bg-slate-900/[0.05] text-slate-500 dark:bg-white/[0.07] dark:text-slate-400'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 px-1 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((l: LexiconMeta) => {
            const selected = l.id === lexiconId
            return (
              <button
                key={l.id}
                type="button"
                ref={selected ? selectedRef : undefined}
                onClick={() => void choose(l.id)}
                title={l.name}
                className={`relative flex min-h-[76px] min-w-0 flex-col justify-between gap-1 rounded-[12px] border p-2.5 text-left transition active:scale-[0.985] ${
                  selected
                    ? `border-brand-400 bg-brand-50 ring-2 ring-brand-400/30 dark:border-brand-400/40 dark:bg-brand-500/10 dark:ring-brand-400/20 ${
                        locating ? 'animate-locate-glow' : ''
                      }`
                    : 'border-slate-200/70 bg-slate-100/80 hover:bg-slate-200/70 dark:border-white/10 dark:bg-white/[0.05] dark:hover:bg-white/[0.09]'
                }`}
              >
                {selected && (
                  <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand-600 text-white dark:bg-brand-500/30 dark:text-brand-200">
                    <CheckIcon width={10} height={10} />
                  </span>
                )}
                <span className={`min-w-0 break-words pr-4 text-[12px] font-bold leading-snug ${selected ? 'text-brand-800 dark:text-brand-200' : 'text-slate-700 dark:text-slate-200'}`}>
                  {l.name}
                </span>
                <span className="shrink-0 text-[10px] font-semibold text-slate-400">{l.count} 词</span>
              </button>
            )
          })}
        </div>
      </section>
    )
  }

  return (
    <div className="pb-6">
      <div className="sticky top-0 z-20 -mx-4 mb-3 bg-[#f6f3ea] px-4 pb-2 pt-1 dark:bg-slate-950">
        <div className="flex items-center gap-2 rounded-[14px] border border-slate-200/70 bg-white/80 px-3 dark:border-white/10 dark:bg-white/[0.06]">
          <SearchIcon width={15} height={15} className="shrink-0 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索词库名称 / 关键词"
            className="h-10 min-w-0 flex-1 bg-transparent text-[12px] text-slate-700 outline-none placeholder:text-slate-400 dark:text-slate-200"
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {['全部', ...DICT_CATEGORY_LIST].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setActiveCategory(c)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                activeCategory === c
                  ? 'bg-brand-600 text-white dark:bg-brand-500/15 dark:text-brand-200'
                  : 'bg-white/80 text-slate-500 dark:bg-white/[0.07] dark:text-slate-400'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {DICT_CATEGORY_LIST
        .filter((c) => activeCategory === '全部' || c === activeCategory)
        .map(renderCategory)}

      {q && searched.length === 0 && (
        <p className="py-10 text-center text-[12px] text-slate-400">没有匹配的词库</p>
      )}
    </div>
  )
}
