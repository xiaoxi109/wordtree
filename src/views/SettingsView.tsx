import { useMemo } from 'react'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { AiSettingsFields } from '../components/AiSettings'
import {
  CheckIcon,
  ChevronRightIcon,
  DownloadIcon,
  GearIcon,
  MoonIcon,
  SparklesIcon,
  SunIcon,
  TargetIcon,
  UploadIcon,
} from '../components/icons'
import {
  GRADE_RUNGS,
  LEVEL_RUNGS,
  gradeToLevel,
  levelToGrades,
  type Route,
  type GradeRung,
  type LevelRung,
} from '../data/levels'

type Theme = 'light' | 'dark'
type Toast = { id: number; msg: string; type: 'success' | 'error' | 'info' }
type OnToast = (msg: string, type?: Toast['type']) => void

/* ----------------------------- Sync progress ----------------------------- */
function SyncProgressActions({
  onToast,
  onImported,
}: {
  onToast: OnToast
  onImported: (arr: string[]) => void
}) {
  const exportProgress = async () => {
    try {
      const data = localStorage.getItem('lexicore-mastered') || '[]'
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

/** 设置（底部「我」标签的一级页）：学习路线、外观、学习数据、大模型入口。 */
export default function SettingsView({
  theme,
  aiEnabled,
  masteredCount: _masteredCount,
  onToggleTheme,
  onOpenLlm,
  onOpenRung,
  onToast,
  onImport,
  route,
  setRoute,
  currentRung,
  setCurrentRung,
}: {
  theme: Theme
  aiEnabled: boolean
  masteredCount?: number
  onToggleTheme: () => void
  onOpenLlm: () => void
  onOpenRung: () => void
  onToast: OnToast
  onImport: (words: string[]) => void
  route: Route
  setRoute: (r: Route) => void
  currentRung: GradeRung | LevelRung
  setCurrentRung: (r: GradeRung | LevelRung) => void
}) {
  // 切换路线时，如果当前 rung 在新路线中不兼容，自动对齐：
  //   - grade→level: 当前 rung 是 GradeRung，映射到对应的 LevelRung
  //   - level→grade: 当前 rung 是 LevelRung，取对应的最低 GradeRung
  const switchRoute = (next: Route) => {
    if (next === route) return
    if (next === 'level') {
      // 从 grade 路线切到 level：当前 rung 是 GradeRung
      setCurrentRung(gradeToLevel(currentRung as GradeRung))
    } else {
      // 从 level 路线切到 grade：当前 rung 是 LevelRung
      const grades = levelToGrades(currentRung as LevelRung)
      setCurrentRung(grades[0] ?? 'primary')
    }
    setRoute(next)
  }

  const rungLabel = useMemo(() => {
    if (route === 'grade') {
      const g = GRADE_RUNGS.find((r) => r.id === currentRung)
      return g ? `${g.label}（${g.desc}）` : String(currentRung)
    }
    const l = LEVEL_RUNGS.find((r) => r.id === currentRung)
    return l ? `${l.label}（${l.desc}）` : String(currentRung)
  }, [route, currentRung])

  return (
    <div className="pb-6">
      <div className="space-y-3">
        {/* 学习路线 + 我的等级 */}
        <section className="surface p-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
              <TargetIcon width={18} height={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">学习路线</p>
              <p className="mt-0.5 text-xs text-slate-400">选择中式年级或西式等级，不影响已掌握的词</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-1 rounded-[14px] bg-slate-900/[0.04] p-1 dark:bg-white/[0.06]">
            {(
              [
                { id: 'level' as const, label: '西式阶梯', hint: 'Pre-A1 / B2' },
                { id: 'grade' as const, label: '中式阶梯', hint: '小学 / 初三' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => switchRoute(t.id)}
                aria-pressed={route === t.id}
                className={`rounded-[11px] px-2 py-2 text-xs font-bold transition duration-200 ${
                  route === t.id
                    ? 'bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-900'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                {t.label}
                <span className={`ml-1 text-[10px] font-normal ${route === t.id ? 'text-white/70 dark:text-slate-500' : 'text-slate-400'}`}>
                  {t.hint}
                </span>
              </button>
            ))}
          </div>
          <button
            onClick={onOpenRung}
            className="mt-3 flex w-full items-center justify-between rounded-[14px] border border-slate-200/60 bg-white/70 px-3 py-2.5 text-left transition hover:bg-white dark:border-slate-700/60 dark:bg-slate-800/50 dark:hover:bg-slate-800"
          >
            <div className="min-w-0 flex items-center gap-2">
              <SparklesIcon width={14} height={14} className="text-brand-500" />
              <span className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">我的等级</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[12px] text-slate-500 dark:text-slate-400">{rungLabel}</span>
              <ChevronRightIcon width={14} height={14} className="shrink-0 text-slate-300" />
            </div>
          </button>
        </section>

        <section className="surface flex items-center justify-between gap-3 px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-slate-900/5 text-slate-600 dark:bg-white/10 dark:text-slate-300">
              {theme === 'dark' ? <MoonIcon width={18} height={18} /> : <SunIcon width={18} height={18} />}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">深色模式</p>
              <p className="mt-0.5 text-xs text-slate-400">切换浅色 / 深色外观</p>
            </div>
          </div>
          <button
            onClick={onToggleTheme}
            role="switch"
            aria-checked={theme === 'dark'}
            aria-label="深色模式"
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-300 ${
              theme === 'dark' ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-600'
            }`}
          >
            <span
              className={`absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform duration-300 ease-spring ${
                theme === 'dark' ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </section>

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
            <SyncProgressActions onToast={onToast} onImported={onImport} />
          </div>
        </section>

        <p className="pt-1 text-center text-[11px] text-slate-400">
          词树 v{__APP_VERSION__} · 用你的词，AI 生文
        </p>
      </div>

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

/** 我的等级（二级页）：按当前学习路线列出阶梯，选中即返回设置页。 */
export function RungPickerView({
  route,
  currentRung,
  setCurrentRung,
  onDone,
}: {
  route: Route
  currentRung: GradeRung | LevelRung
  setCurrentRung: (r: GradeRung | LevelRung) => void
  onDone: () => void
}) {
  // C2 为预留档，暂不提供选择
  const options = (route === 'grade' ? GRADE_RUNGS : LEVEL_RUNGS).filter((r) => r.id !== 'C2')
  return (
    <div className="pb-8">
      <p className="mb-2.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
        {route === 'grade' ? '中式阶梯' : '西式阶梯'} · 词表默认显示当前等级及以下的词
      </p>
      <div className="space-y-1.5">
        {options.map((r) => {
          const selected = r.id === currentRung
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                setCurrentRung(r.id as GradeRung | LevelRung)
                onDone()
              }}
              className={`surface flex w-full items-center gap-3 px-3 py-2.5 text-left transition active:scale-[0.995] ${
                selected ? 'ring-1 ring-brand-400/60' : ''
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition ${
                  selected
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-slate-300 bg-transparent dark:border-slate-600'
                }`}
              >
                {selected && <CheckIcon width={12} height={12} />}
              </span>
              <span className="flex min-w-0 flex-1 items-baseline gap-2">
                <span className="shrink-0 text-sm font-bold text-slate-800 dark:text-slate-100">{r.label}</span>
                <span className="min-w-0 truncate text-xs text-slate-400">{r.desc}</span>
              </span>
              {selected && (
                <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                  使用中
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
