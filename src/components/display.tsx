import { useCallback, useState } from 'react'

/**
 * 列表卡片显示语言：
 * - both：中英对照（默认）
 * - en：只显示英文（词形 + 音标），用于「英 → 中」回忆
 * - zh：只显示中文（释义），用于「中 → 英」回忆
 *
 * 仅影响列表卡片；点开卡片后的详情页保持原样。
 */
export type DisplayMode = 'both' | 'en' | 'zh'

const STORAGE_KEY = 'lexicore-display-mode'

export const DISPLAY_OPTIONS: { id: DisplayMode; label: string; title: string }[] = [
  { id: 'both', label: '中英', title: '中英文都显示' },
  { id: 'en', label: '英文', title: '只显示英文' },
  { id: 'zh', label: '中文', title: '只显示中文' },
]

function isDisplayMode(v: unknown): v is DisplayMode {
  return v === 'both' || v === 'en' || v === 'zh'
}

export function loadDisplayMode(): DisplayMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return isDisplayMode(raw) ? raw : 'both'
  } catch {
    return 'both'
  }
}

/** 读取并持久化显示语言（跨页面共用同一份偏好）。 */
export function useDisplayMode(): [DisplayMode, (m: DisplayMode) => void] {
  const [mode, setMode] = useState<DisplayMode>(loadDisplayMode)
  const update = useCallback((m: DisplayMode) => {
    setMode(m)
    try {
      localStorage.setItem(STORAGE_KEY, m)
    } catch {
      /* 隐私模式等场景忽略 */
    }
  }, [])
  return [mode, update]
}

/** 分段控件：中英 / 英文 / 中文。 */
export function DisplayModeToggle({
  value,
  onChange,
  className = '',
}: {
  value: DisplayMode
  onChange: (m: DisplayMode) => void
  className?: string
}) {
  return (
    <div
      role="group"
      aria-label="列表显示语言"
      className={`inline-flex shrink-0 items-center rounded-full border border-slate-200/60 bg-slate-100/80 p-0.5 dark:border-slate-700/60 dark:bg-slate-800/70 ${className}`}
    >
      {DISPLAY_OPTIONS.map((o) => {
        const active = value === o.id
        return (
          <button
            key={o.id}
            type="button"
            title={o.title}
            aria-pressed={active}
            onClick={() => onChange(o.id)}
            className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
              active
                ? 'bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-900'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
