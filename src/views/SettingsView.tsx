import { useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { useSpeech } from '../hooks/useSpeech'
import { AiSettingsFields } from '../components/AiSettings'
import { ActionSheet } from '../components/Sheet'
import {
  ChevronRightIcon,
  DownloadIcon,
  GearIcon,
  MoonIcon,
  SpeakerIcon,
  SpinnerIcon,
  SunIcon,
  TrashIcon,
  UploadIcon,
} from '../components/icons'

type Theme = 'light' | 'dark'
type Toast = { id: number; msg: string; type: 'success' | 'error' | 'info' }
type OnToast = (msg: string, type?: Toast['type']) => void

/* ----------------------------- Model download ----------------------------- */
function ModelDownloadBtn({ onToast }: { onToast: OnToast }) {
  const { downloadStatus, downloadProgress, speak, speaking, preload } = useSpeech()
  const ready = downloadStatus === 'ready'
  const downloading = downloadStatus === 'downloading'

  const handle = async () => {
    if (ready) {
      // 模型已就绪：直接试听（在用户手势内播放，避免自动播放拦截）
      try {
        await speak('Hello, this is a test.', 0.95)
      } catch {
        onToast('播放失败', 'error')
      }
      return
    }
    if (downloading) return
    // 未就绪：仅初始化模型（不播放，避免异步加载后 play 失去手势被拦）
    try {
      onToast('开始初始化语音模型（约 60MB，首次较慢）…', 'info')
      await preload()
      onToast('语音模型已就绪 🎉 点击可试听', 'success')
    } catch {
      onToast('语音模型加载失败，请检查资源是否完整', 'error')
    }
  }

  return (
    <button
      onClick={handle}
      disabled={downloading}
      title={ready ? '点击试听' : '点击初始化语音模型'}
      className={`w-full ${
        ready
          ? 'inline-flex items-center justify-center gap-2 rounded-[18px] border border-brand-200/70 bg-brand-50/80 px-3 py-3 text-sm font-semibold text-brand-700 transition active:scale-[0.99] dark:border-brand-500/25 dark:bg-brand-500/10 dark:text-brand-300'
          : 'btn-ink'
      } disabled:opacity-60`}
    >
      {downloading ? (
        <>
          <SpinnerIcon width={16} height={16} className="animate-spin" />
          下载中 {downloadProgress.pct}%
        </>
      ) : ready ? (
        <>
          <SpeakerIcon width={16} height={16} />
          发音已就绪 · 点击试听
        </>
      ) : (
        <>
          <DownloadIcon width={16} height={16} />
          下载发音模型
        </>
      )}
      {speaking && <span className="ml-1 h-2 w-2 animate-pulse rounded-full bg-amber-400" />}
    </button>
  )
}

/* ----------------------------- Sync progress ----------------------------- */
function SyncProgressActions({
  onToast,
  onImported,
}: {
  onToast: OnToast
  onImported: (arr: string[]) => void
}) {
  const exportProgress = () => {
    try {
      const data = localStorage.getItem('lexicore-mastered') || '[]'
      const blob = new Blob([JSON.stringify(JSON.parse(data), null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'lexicore-progress.json'
      a.click()
      URL.revokeObjectURL(url)
      onToast('已导出掌握进度', 'success')
    } catch {
      onToast('导出失败', 'error')
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
        if (!Array.isArray(arr)) throw new Error('格式错误')
        onImported(arr)
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
        <UploadIcon width={15} height={15} />
        导出进度
      </button>
      <button onClick={importProgress} className="btn-soft !text-[13px]">
        <DownloadIcon width={15} height={15} />
        导入进度
      </button>
    </div>
  )
}

/** 设置（底部「我」标签的一级页）：外观、发音、学习数据、大模型入口与数据说明。 */
export default function SettingsView({
  theme,
  aiEnabled,
  onToggleTheme,
  onOpenLlm,
  onToast,
  onImport,
}: {
  theme: Theme
  aiEnabled: boolean
  onToggleTheme: () => void
  onOpenLlm: () => void
  onToast: OnToast
  onImport: (words: string[]) => void
}) {
  const [confirmClear, setConfirmClear] = useState(false)

  // 清除本地学习数据：掌握进度 + 复习计划 + 错词队列，保留外观设置。
  const clearProgress = () => {
    localStorage.removeItem('lexicore-mastered')
    localStorage.removeItem('lexicore-study')
    localStorage.removeItem('lexicore-ai-review')
    onToast('已清除学习进度', 'success')
    setTimeout(() => location.reload(), 700)
  }

  return (
    <div className="pb-6">
      <div className="space-y-3">
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
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-slate-900/5 text-slate-600 dark:bg-white/10 dark:text-slate-300">
              <SpeakerIcon width={18} height={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">离线发音</p>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-400">
                首次下载约 60MB，之后无需联网也能朗读单词和例句。
              </p>
            </div>
          </div>
          <div className="mt-3">
            <ModelDownloadBtn onToast={onToast} />
          </div>
        </section>

        <section className="surface p-3">
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100">学习进度</p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-400">
            导出 JSON 备份，或从备份恢复；导入会与现有进度合并。
          </p>
          <div className="mt-3">
            <SyncProgressActions onToast={onToast} onImported={onImport} />
          </div>
          <button
            onClick={() => setConfirmClear(true)}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-[14px] border border-rose-200/70 bg-rose-50/70 px-3 py-2.5 text-[13px] font-semibold text-rose-600 transition hover:bg-rose-100 active:scale-[0.99] dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300"
          >
            <TrashIcon width={15} height={15} />
            清除学习进度
          </button>
        </section>

        <section className="surface-flat px-3 py-2.5">
          <p className="eyebrow">数据来源</p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
            分级词表依据人教版教材整理（cyforkk/pep-english-words, MIT）；释义、音标与例句来自公开词典接口，仅供个人学习使用。
          </p>
        </section>

        <p className="pt-1 text-center text-[11px] text-slate-400">
          LexiCore v{__APP_VERSION__} · 本地优先 · 不上传学习记录
        </p>
      </div>

      <ActionSheet
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="清除学习进度？"
        message="已掌握标记、复习计划与错词本都会被清空，且无法恢复。"
        actions={[
          {
            label: '确认清除',
            description: '建议先导出备份',
            tone: 'danger',
            icon: <TrashIcon width={17} height={17} />,
            onClick: clearProgress,
          },
        ]}
      />
    </div>
  )
}

/** 大模型设置（三级页）：从设置进入，整页编辑 API 配置。 */
export function LlmSettingsView({ onToast }: { onToast: OnToast }) {
  const isWeb = !Capacitor.isNativePlatform()
  return (
    <div className="pb-8">
      <section className="surface-flat mb-4 px-4 py-3">
        <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
          支持 OpenAI 兼容接口（含中转站）。配置只写入本机 localStorage，Key 不会上传到任何服务器。
          {isWeb && ' 网页版受浏览器跨域限制，接口需返回 CORS 允许头才能请求成功；安卓 App 走原生请求，无此限制。'}
        </p>
      </section>
      <AiSettingsFields onToast={onToast} />
    </div>
  )
}
