import type { ReactNode } from 'react'

/**
 * 通用分段控件（药丸式）。
 * 选中态用品牌浅底 + 品牌字，未选中态保持中性；切换时只换底色不改变高度，避免页面跳动。
 */
export interface SegmentedOption<T extends string> {
  value: T
  label: string
  icon?: ReactNode
}

export default function Segmented<T extends string>({
  options,
  value,
  onChange,
  className = '',
  size = 'md',
}: {
  options: SegmentedOption<T>[]
  value: T
  onChange: (v: T) => void
  className?: string
  size?: 'sm' | 'md'
}) {
  const pad = size === 'sm' ? 'px-3 py-1.5 text-[12px]' : 'px-3.5 py-2 text-[13px]'
  return (
    <div
      role="tablist"
      className={`flex items-center gap-1 rounded-full border border-slate-200/70 bg-white/60 p-1 dark:border-slate-700/55 dark:bg-slate-800/45 ${className}`}
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-full font-semibold transition duration-200 active:scale-[0.98] ${pad} ${
              active
                ? 'bg-brand-50 text-brand-700 shadow-sm dark:bg-brand-500/15 dark:text-brand-200'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            {opt.icon}
            <span className="truncate">{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}
