import type { SpeechQueue } from '../hooks/useSpeechQueue'
import { PauseIcon, PlayIcon, RotateCcwIcon, SkipBackIcon, SkipForwardIcon } from './icons'

const RATES = [0.8, 0.9, 1.0]

/**
 * 连续朗读控制条：AI 听读 / AI 课程听单共用。
 * 中文开关由页面控制（阅读页与「显示翻译」共用同一个状态）。
 */
export function SpeechControls({
  queue,
  zh,
  onToggleZh,
  title = '连续朗读',
}: {
  queue: SpeechQueue
  zh: boolean
  onToggleZh: () => void
  title?: string
}) {
  const total = queue.lines.length
  const pct = total ? Math.round(((queue.index + 1) / total) * 100) : 0
  const active = queue.playing

  const chip = (on: boolean) =>
    `rounded-full border px-2.5 py-1 text-[11px] font-semibold transition active:scale-95 ${
      on
        ? 'border-brand-400/70 bg-brand-50 text-brand-700 shadow-sm dark:border-brand-400/45 dark:bg-brand-400/20 dark:text-brand-100'
        : 'border-transparent text-slate-500 hover:bg-slate-900/5 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-100'
    }`

  return (
    <div className="surface p-3">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="font-semibold text-slate-500 dark:text-slate-300">{title}</span>
        <span className="tabular-nums text-slate-400">
          {total ? queue.index + 1 : 0} / {total}
        </span>
      </div>

      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-900/[0.07] dark:bg-white/10">
        <div
          className="h-full rounded-full bg-brand-500 transition-all duration-300 ease-spring"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-3 flex items-center justify-center gap-5">
        <button
          onClick={queue.prev}
          disabled={!total}
          className="icon-btn"
          aria-label="上一句"
        >
          <SkipBackIcon width={18} height={18} />
        </button>
        <button
          onClick={queue.toggle}
          disabled={!total}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-ink transition duration-200 hover:bg-brand-700 active:scale-95 disabled:opacity-40 dark:border dark:border-brand-400/50 dark:bg-brand-500/15 dark:text-brand-200 dark:shadow-none dark:hover:bg-brand-500/25"
          aria-label={active ? '暂停' : '播放'}
        >
          {active ? <PauseIcon width={22} height={22} /> : <PlayIcon width={22} height={22} />}
        </button>
        <button
          onClick={queue.next}
          disabled={!total}
          className="icon-btn"
          aria-label="下一句"
        >
          <SkipForwardIcon width={18} height={18} />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-1">
        {RATES.map((r) => (
          <button
            key={r}
            onClick={() => queue.setRate(r)}
            className={chip(Math.abs(queue.rate - r) < 0.001)}
            aria-pressed={Math.abs(queue.rate - r) < 0.001}
          >
            {r.toFixed(1)}×
          </button>
        ))}
        <span className="mx-0.5 h-4 w-px bg-slate-200 dark:bg-slate-600" />
        <button onClick={onToggleZh} className={chip(zh)} aria-pressed={zh}>
          中文跟读
        </button>
        <button onClick={() => queue.setRepeat(!queue.repeat)} className={chip(queue.repeat)} aria-pressed={queue.repeat}>
          <RotateCcwIcon width={11} height={11} className="mr-1 inline -translate-y-px" />
          每句两遍
        </button>
      </div>
    </div>
  )
}
