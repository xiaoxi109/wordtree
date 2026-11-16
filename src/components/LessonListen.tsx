import { useEffect, useRef } from 'react'
import { SpeechControls } from './SpeechControls'
import { useSpeechQueue, type QueueLine } from '../hooks/useSpeechQueue'
import { stripMarkup, stripWTags } from '../lib/parse'

/**
 * AI 课程「听读」模式：逐句朗读、当前句高亮、自动滚动。
 * 与听词页共享同一套队列播放逻辑。
 */
export default function LessonListen({
  lines,
  active,
  showZh,
  onToggleZh,
  title = '听读本篇',
}: {
  lines: QueueLine[]
  active: boolean
  showZh: boolean
  onToggleZh: () => void
  title?: string
}) {
  const queue = useSpeechQueue(lines)
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  // 中文显示与「中文跟读」共用同一个开关
  useEffect(() => {
    queue.setIncludeZh(showZh)
  }, [showZh, queue.setIncludeZh])

  // 离开 AI 课程页时停止播放
  useEffect(() => {
    if (!active) queue.pause()
  }, [active, queue.pause])

  // 自动滚动到当前句
  useEffect(() => {
    if (!queue.playing) return
    rowRefs.current.get(queue.index)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [queue.index, queue.playing])

  return (
    <div>
      <SpeechControls queue={queue} zh={showZh} onToggleZh={onToggleZh} title={title} />

      <div className="mt-3 space-y-2">
        {lines.map((line, i) => {
          const current = i === queue.index
          return (
            <div
              key={line.id}
              ref={(el) => {
                if (el) rowRefs.current.set(i, el)
                else rowRefs.current.delete(i)
              }}
              onClick={() => queue.playFrom(i)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  queue.playFrom(i)
                }
              }}
              className={`cursor-pointer rounded-[16px] border p-3 transition duration-200 active:scale-[0.995] ${
                current
                  ? 'border-brand-300/70 bg-brand-50/70 dark:border-brand-500/40 dark:bg-brand-500/10'
                  : 'border-slate-200/50 bg-white/55 hover:border-brand-200/70 hover:bg-white dark:border-slate-700/45 dark:bg-slate-800/35 dark:hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-start gap-2">
                {line.speaker && (
                  <span className="mt-0.5 shrink-0 rounded-md bg-slate-900/5 px-1.5 py-0.5 text-[11px] font-bold text-slate-500 dark:bg-white/10 dark:text-slate-300">
                    {line.speaker}
                  </span>
                )}
                <p
                  className={`min-w-0 flex-1 text-[15px] leading-relaxed ${
                    current
                      ? 'font-semibold text-slate-900 dark:text-white'
                      : 'text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {stripWTags(line.en)}
                </p>
                {current && queue.playing && (
                  <span className="mt-1 flex shrink-0 items-end gap-0.5" aria-label="正在朗读">
                    <span className="h-2 w-0.5 animate-pulse rounded-full bg-brand-500" />
                    <span className="h-3 w-0.5 animate-pulse rounded-full bg-brand-500 [animation-delay:120ms]" />
                    <span className="h-1.5 w-0.5 animate-pulse rounded-full bg-brand-500 [animation-delay:240ms]" />
                  </span>
                )}
              </div>
              {showZh && line.zh && (
                <p className="mt-1 text-xs leading-relaxed text-slate-400">{stripMarkup(line.zh)}</p>
              )}
            </div>
          )
        })}
      </div>

      <p className="mt-3 text-center text-[11px] text-slate-400">
        点任意一句从该句开始播放 · 听读模式专注磨耳朵
      </p>
    </div>
  )
}
