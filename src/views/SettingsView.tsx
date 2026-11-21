import { useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { AiSettingsFields } from '../components/AiSettings'
import {
  BookOpenIcon,
  CheckIcon,
  ChevronRightIcon,
  DownloadIcon,
  GearIcon,
  PaletteIcon,
  UploadIcon,
} from '../components/icons'
import { Sheet } from '../components/Sheet'
import { masteredKey } from '../data/lexicons'
import { THEME_OPTIONS, themePreferenceLabel, type ThemePreference } from '../lib/theme'

type Toast = { id: number; msg: string; type: 'success' | 'error' | 'info' }
type OnToast = (msg: string, type?: Toast['type']) => void

/* ----------------------------- Sync progress ----------------------------- */
function SyncProgressActions({
  lexiconId,
  onToast,
  onImported,
}: {
  lexiconId: string
  onToast: OnToast
  onImported: (arr: string[]) => void
}) {
  const exportProgress = async () => {
    try {
      const data = localStorage.getItem(masteredKey(lexiconId)) || '[]'
      const text = JSON.stringify(JSON.parse(data), null, 2)
      const filename = `lexicore-progress-${new Date().toISOString().slice(0, 10)}.json`

      if (Capacitor.isNativePlatform()) {
        // Android WebView 不处理 blob: 下载，必须走原生 Filesystem 真正落盘，
        // 否则界面报「成功」而用户拿不到任何文件。
        await Filesystem.writeFile({
          path: filename,
          data: text,
          directory: Directory.Documents,
          encoding: Encoding.UTF8,
        })
        onToast(`已导出到 文档/${filename}`, 'success')
        return
      }

      // 本地 vite 预览：保留浏览器下载，但等 click 完成后再 revoke。
      const blob = new Blob([text], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      onToast('已导出掌握进度', 'success')
    } catch (err) {
      console.error('导出进度失败:', err)
      onToast('导出失败，请检查存储权限', 'error')
    }
  }

  const importProgress = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const arr = JSON.parse(text)
        if (!Array.isArray(arr) || !arr.every((x) => typeof x === 'string')) {
          throw new Error('格式错误')
        }
        onImported(arr as string[])
        onToast(`已导入 ${arr.length} 个进度`, 'success')
      } catch {
        onToast('导入失败：文件格式不正确', 'error')
      }
    }
    input.click()
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <button onClick={exportProgress} className="btn-soft !text-[13px]">
        <DownloadIcon width={15} height={15} />
        导出进度
      </button>
      <button onClick={importProgress} className="btn-soft !text-[13px]">
        <UploadIcon width={15} height={15} />
        导入进度
      </button>
    </div>
  )
}

/** 设置（底部「我」标签的一级页）：词库管理、外观、学习数据、大模型入口。 */
export default function SettingsView({
  themePref,
  aiEnabled,
  masteredCount: _masteredCount,
  lexiconId,
  currentLexiconName,
  onOpenLexicons,
  onThemeChange,
  onOpenLlm,
  onToast,
  onImport,
}: {
  themePref: ThemePreference
  aiEnabled: boolean
  masteredCount?: number
  lexiconId: string
  currentLexiconName: string
  onOpenLexicons: () => void
  onThemeChange: (theme: ThemePreference) => void
  onOpenLlm: () => void
  onToast: OnToast
  onImport: (words: string[]) => void
}) {
  const [themeSheetOpen, setThemeSheetOpen] = useState(false)
  return (
    <div className="pb-6">
      <div className="space-y-3">
        {/* 词库入口：当前选择显示在这里，实际选择在二级页完成 */}
        <button
          type="button"
          onClick={onOpenLexicons}
          className="surface flex w-full items-center gap-3 px-3 py-3 text-left transition active:scale-[0.995]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
            <BookOpenIcon width={18} height={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-slate-800 dark:text-slate-100">词库</span>
            <span className="mt-0.5 block truncate text-xs text-slate-400">
              当前：{currentLexiconName} · 点击进入选择
            </span>
          </span>
          <ChevronRightIcon width={16} height={16} className="shrink-0 text-slate-300" />
        </button>

        <button
          type="button"
          onClick={() => setThemeSheetOpen(true)}
          aria-haspopup="dialog"
          className="surface flex w-full items-center gap-3 px-3 py-2.5 text-left transition active:scale-[0.995]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-slate-900/5 text-slate-600 dark:bg-white/10 dark:text-slate-300">
            <PaletteIcon width={18} height={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-slate-800 dark:text-slate-100">主题色</span>
            <span className="mt-0.5 block text-xs text-slate-400">跟随系统、深色或浅色外观</span>
          </span>
          <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-slate-400 dark:text-slate-300">
            {themePreferenceLabel(themePref)}
            <ChevronRightIcon width={16} height={16} className="text-slate-300" />
          </span>
        </button>

        {aiEnabled && (
          <button
            onClick={onOpenLlm}
            className="surface flex w-full items-center gap-3 px-3 py-2.5 text-left transition active:scale-[0.995]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
              <GearIcon width={18} height={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-slate-800 dark:text-slate-100">大模型设置</span>
              <span className="mt-0.5 block text-xs text-slate-400">AI 定制课程的 API 配置</span>
            </span>
            <ChevronRightIcon width={16} height={16} className="shrink-0 text-slate-300" />
          </button>
        )}

        <section className="surface p-3">
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100">学习进度</p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-400">
            导出 JSON 备份，或从备份恢复；导入会与现有进度合并。
          </p>
          <div className="mt-3">
            <SyncProgressActions lexiconId={lexiconId} onToast={onToast} onImported={onImport} />
          </div>
        </section>

        <p className="pt-1 text-center text-[11px] text-slate-400">
          词树 v{__APP_VERSION__} · 用你的词，AI 生文
        </p>
      </div>

      <Sheet
        open={themeSheetOpen}
        onClose={() => setThemeSheetOpen(false)}
        title="主题色"
        subtitle="选择应用的外观偏好"
      >
        <div className="space-y-2 pb-1">
          {THEME_OPTIONS.map((opt) => {
            const active = themePref === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  onThemeChange(opt.id)
                  setThemeSheetOpen(false)
                }}
                className={`flex w-full items-center gap-3 rounded-[18px] border px-4 py-3 text-left transition active:scale-[0.995] ${
                  active
                    ? 'border-brand-400/70 bg-brand-50 text-brand-700 shadow-sm dark:border-brand-400/45 dark:bg-brand-400/15 dark:text-brand-100'
                    : 'border-slate-200/70 bg-white/70 text-slate-700 hover:bg-white dark:border-slate-700/60 dark:bg-slate-800/50 dark:text-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{opt.label}</span>
                  <span className="mt-0.5 block text-xs opacity-70">{opt.description}</span>
                </span>
                {active && (
                  <CheckIcon width={18} height={18} className="shrink-0 text-brand-600 dark:text-brand-300" />
                )}
              </button>
            )
          })}
        </div>
      </Sheet>
    </div>
  )
}

/** 大模型设置（二级页）：从设置进入，管理可用模型与当前启用项。 */
export function LlmSettingsView({ onToast }: { onToast: OnToast }) {
  return (
    <div className="pb-8">
      <AiSettingsFields onToast={onToast} />
    </div>
  )
}
