import { Sheet } from './Sheet'
import { BookOpenIcon, CheckIcon, ListIcon, RotateCcwIcon, ShuffleIcon, PlayIcon } from './icons'
import {
  PLAY_MODES,
  SENTENCE_REPEAT_OPTIONS,
  usePlayback,
  type PlayMode,
} from '../lib/playback'

const MODE_ICON: Record<PlayMode, typeof PlayIcon> = {
  off: PlayIcon,
  sentence: RotateCcwIcon,
  lesson: BookOpenIcon,
  listSequential: ListIcon,
  listShuffle: ShuffleIcon,
}

/**
 * 播放模式选择面板。阅读页播放器与「我的课程」列表页共用同一份全局设置，
 * 因此两边切换都会同步，且模式说明/触发条件只维护一处。
 */
export function PlayModeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [settings, update] = usePlayback()

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="播放模式"
      subtitle="切换后立即生效，并同步到所有课程；设置会记住"
    >
      <div className="space-y-2 pb-1">
        {PLAY_MODES.map((m) => {
          const Icon = MODE_ICON[m.id]
          const active = settings.mode === m.id
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => update({ mode: m.id })}
              aria-pressed={active}
              className={`flex w-full items-start gap-3 rounded-[18px] border px-3.5 py-3 text-left transition active:scale-[0.995] ${
                active
                  ? 'border-brand-400 bg-brand-50/80 shadow-soft dark:border-brand-500/60 dark:bg-brand-500/10'
                  : 'border-slate-200/70 bg-white/70 hover:border-brand-300 dark:border-slate-700/60 dark:bg-slate-800/40'
              }`}
            >
              <span
                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px] ${
                  active
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300'
                }`}
              >
                <Icon width={15} height={15} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="text-[13px] font-bold text-slate-800 dark:text-slate-100">{m.label}</span>
                  {active && <CheckIcon width={14} height={14} className="text-brand-600 dark:text-brand-300" />}
                </span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                  {m.desc}
                </span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
                  触发：{m.trigger}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      {/* 单句循环次数：只有选中单句循环时才出现，避免无关选项干扰 */}
      {settings.mode === 'sentence' && (
        <div className="mt-4 rounded-[18px] border border-slate-200/70 bg-white/60 p-3.5 dark:border-slate-700/60 dark:bg-slate-800/40">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
            单句循环次数
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {SENTENCE_REPEAT_OPTIONS.map((opt) => {
              const on = settings.sentenceRepeat === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => update({ sentenceRepeat: opt.value })}
                  aria-pressed={on}
                  className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition active:scale-95 ${
                    on
                      ? 'border-brand-500 bg-brand-600 text-white'
                      : 'border-slate-200/70 bg-white/70 text-slate-600 hover:border-brand-300 dark:border-slate-600 dark:bg-white/5 dark:text-slate-300'
                  }`}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
            每句播满次数后自动进入下一句，整篇读完才停止。播放中改次数会从当前遍继续计算；
            点句子 / 上一句 / 下一句会重新从第 1 遍开始。
          </p>
        </div>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-slate-400">
        提示：单句循环与单篇循环只作用于当前这一篇；列表顺序/随机会在本篇播完后自动切换到下一篇并继续播放。
      </p>
    </Sheet>
  )
}
