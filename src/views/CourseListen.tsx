import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getSet, listLessons, listSets, type AiLesson, type AiLessonSet } from '../db'
import { formatMeta, type LessonKind } from '../lib/prompt'
import { stripWTags } from '../lib/parse'
import { useSpeechQueue, type QueueLine } from '../hooks/useSpeechQueue'
import { SpeechControls } from '../components/SpeechControls'
import { registerBack } from '../lib/back'
import {
  BookOpenIcon,
  HeadphonesIcon,
  PlayIcon,
  SkipBackIcon,
  SpinnerIcon,
} from '../components/icons'

interface CourseLine extends QueueLine {
  lessonId: string
  lessonIndex: number
  lessonTitle: string
  lessonKind: LessonKind
  sceneLabel: string
}

/**
 * AI 标签内的课程听单：
 * 选一套生成好的课程 → 把所有篇目的句子串成听力列表，逐句连听。
 * 与 AI 阅读器的「听读」共用 useSpeechQueue。
 */
export default function AiCourseSource({
  setId,
  onSetId,
  active,
}: {
  setId: string | null
  onSetId: (id: string | null) => void
  active: boolean
}) {
  const [sets, setSets] = useState<AiLessonSet[] | null>(null)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      setSets(await listSets())
      setError('')
    } catch {
      setError('读取课程集失败')
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // 有课程集正在生成时自动刷新进度（4s 一次），生成结束自动停止
  useEffect(() => {
    if (!sets?.some((s) => s.status === 'generating')) return
    const t = window.setInterval(() => void refresh(), 4000)
    return () => window.clearInterval(t)
  }, [sets, refresh])

  if (setId) {
    return (
      <CoursePlayer
        setId={setId}
        active={active}
        onBack={() => {
          onSetId(null)
          void refresh()
        }}
      />
    )
  }

  return (
    <div>
      <div className="mb-4">
        <p className="eyebrow">AI Listening</p>
        <h2 className="mt-1 flex items-center gap-2 font-display text-[22px] font-semibold tracking-tight text-slate-900 dark:text-slate-50">
          <HeadphonesIcon width={20} height={20} className="text-brand-600 dark:text-brand-300" />
          AI 课程听单
        </h2>
        <p className="mt-0.5 text-[11px] text-slate-400">把生成好的课程当听力材料，逐句连听、可开中文</p>
      </div>

      {error && (
        <div className="mb-3 rounded-[16px] bg-rose-50 px-3 py-2 text-xs text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </div>
      )}

      {!sets ? (
        <div className="flex justify-center py-12 text-slate-400">
          <SpinnerIcon width={24} height={24} className="animate-spin" />
        </div>
      ) : sets.length === 0 ? (
        <div className="rounded-[26px] border border-dashed border-slate-300/70 py-12 text-center dark:border-slate-700/70">
          <p className="text-sm text-slate-400">还没有 AI 课程</p>
          <p className="mt-1 text-xs text-slate-400">回到 AI 课程列表，按已掌握的词生成一套课程，就能在这里听</p>
        </div>
      ) : (
        <div className="stagger space-y-2.5">
          {sets.map((set) => {
            const fmt = set.condition.format
            const meta = fmt && fmt !== 'auto' ? formatMeta(fmt) : null
            const ready = set.done > 0
            const pct = set.total ? Math.round((set.done / set.total) * 100) : 0
            return (
              <button
                key={set.id}
                onClick={() => ready && onSetId(set.id)}
                disabled={!ready}
                className="block w-full rounded-[22px] border border-slate-200/60 bg-white/65 p-4 text-left transition duration-200 hover:border-brand-300/60 hover:bg-white hover:shadow-soft active:scale-[0.995] disabled:opacity-60 dark:border-slate-700/50 dark:bg-slate-800/45 dark:hover:border-brand-500/35"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-brand-600 text-white shadow-soft">
                    <HeadphonesIcon width={20} height={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">{set.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
                      {meta ? (
                        <span className={`rounded-full px-1.5 py-0.5 ${meta.badge}`}>
                          {meta.emoji} {meta.label}
                        </span>
                      ) : (
                        <span className="rounded-full bg-fuchsia-100 px-1.5 py-0.5 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300">
                          ✨ 多体裁
                        </span>
                      )}
                      <span className="rounded-full bg-slate-900/5 px-1.5 py-0.5 text-slate-500 dark:bg-white/10 dark:text-slate-300">
                        已生成 {set.done}/{set.total}
                      </span>
                    </div>
                    <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-slate-900/[0.07] dark:bg-white/10">
                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  {ready ? (
                    <PlayIcon width={16} height={16} className="mt-2 shrink-0 text-brand-500" />
                  ) : (
                    <span className="mt-2 shrink-0 text-[11px] text-slate-400">生成中</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      <p className="mt-4 text-center text-[11px] leading-relaxed text-slate-400">
        AI 课程与单词听练在同一个「听词」页：想听单词点上方「单词」，想听整段课程就选一套课程。
      </p>
    </div>
  )
}

function CoursePlayer({
  setId,
  active,
  onBack,
}: {
  setId: string
  active: boolean
  onBack: () => void
}) {
  const [set, setSet] = useState<AiLessonSet | null>(null)
  const [lessons, setLessons] = useState<AiLesson[] | null>(null)
  const [error, setError] = useState('')
  const [showZh, setShowZh] = useState(true)
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  useEffect(() => {
    let alive = true
    Promise.all([getSet(setId), listLessons(setId)])
      .then(([s, ls]) => {
        if (!alive) return
        setSet(s)
        setLessons(ls.filter((l) => l.status === 'ready' && l.segments.length > 0))
      })
      .catch(() => alive && setError('读取课程失败'))
    return () => {
      alive = false
    }
  }, [setId])

  const lines = useMemo<CourseLine[]>(
    () =>
      (lessons ?? []).flatMap((l) =>
        l.segments.map((seg, i) => ({
          id: `${l.id}:${i}`,
          en: seg.en,
          zh: seg.zh,
          speaker: seg.speaker,
          lessonId: l.id,
          lessonIndex: l.index,
          lessonTitle: l.title,
          lessonKind: l.kind,
          sceneLabel: l.sceneLabel,
        })),
      ),
    [lessons],
  )

  const lineIndex = useMemo(() => new Map(lines.map((l, i) => [l.id, i])), [lines])
  const queue = useSpeechQueue(lines)
  const current = lines[queue.index]

  useEffect(() => {
    queue.setIncludeZh(showZh)
  }, [showZh, queue.setIncludeZh])

  useEffect(() => {
    if (!active) queue.pause()
  }, [active, queue.pause])

  // 安卓返回键：先退出课程播放器，回到课程听单
  const onBackRef = useRef(onBack)
  onBackRef.current = onBack
  useEffect(() => {
    if (!active) return
    return registerBack(() => onBackRef.current())
  }, [active])

  useEffect(() => {
    if (!queue.playing) return
    const line = lines[queue.index]
    if (!line) return
    rowRefs.current.get(line.id)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [queue.index, queue.playing, lines])

  if (error) {
    return (
      <div className="surface border-rose-200/70 p-6 text-center text-sm text-rose-600 dark:border-rose-500/25 dark:text-rose-300">
        {error}
        <button onClick={onBack} className="mt-3 block w-full text-xs font-semibold underline underline-offset-4">
          返回课程集
        </button>
      </div>
    )
  }

  if (!lessons) {
    return (
      <div className="flex justify-center py-16 text-slate-400">
        <SpinnerIcon width={24} height={24} className="animate-spin" />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-3">
        <p className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">{set?.title ?? 'AI 课程'}</p>
        <p className="text-[11px] text-slate-400">
          {lessons.length} 篇 · {lines.length} 句 · 点击任意句从那里开始
        </p>
      </div>

      {lessons.length === 0 ? (
        <div className="rounded-[26px] border border-dashed border-slate-300/70 py-12 text-center dark:border-slate-700/70">
          <p className="text-sm text-slate-400">这套课程还没有生成好的篇目</p>
          <p className="mt-1 text-xs text-slate-400">回 AI 课程页补齐后再来听</p>
          <button onClick={onBack} className="mt-4 text-sm font-semibold text-brand-600 underline underline-offset-4">
            返回课程集
          </button>
        </div>
      ) : (
        <>
          <SpeechControls
            queue={queue}
            zh={showZh}
            onToggleZh={() => setShowZh((v) => !v)}
            title={
              current && queue.started
                ? `正在听 · 第 ${current.lessonIndex + 1} 篇 · ${formatMeta(current.lessonKind).label}`
                : `课程听单 · ${lessons.length} 篇 ${lines.length} 句`
            }
          />

          <div className="mt-4 space-y-5">
            {lessons.map((l) => {
              const meta = formatMeta(l.kind)
              return (
                <section key={l.id}>
                  <div className="mb-2 flex items-start gap-2">
                    <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.badge}`}>
                      {meta.emoji} {meta.label}
                    </span>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">{l.title}</h3>
                      <p className="text-[11px] text-slate-400">
                        {l.sceneLabel} · {l.segments.length} 句
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    {l.segments.map((seg, i) => {
                      const id = `${l.id}:${i}`
                      const globalIdx = lineIndex.get(id) ?? -1
                      const isCurrent = queue.index === globalIdx
                      return (
                        <div
                          key={id}
                          ref={(el) => {
                            if (el) rowRefs.current.set(id, el)
                            else rowRefs.current.delete(id)
                          }}
                          onClick={() => globalIdx >= 0 && queue.playFrom(globalIdx)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if ((e.key === 'Enter' || e.key === ' ') && globalIdx >= 0) {
                              e.preventDefault()
                              queue.playFrom(globalIdx)
                            }
                          }}
                          className={`cursor-pointer rounded-[16px] border p-2.5 transition duration-200 active:scale-[0.995] ${
                            isCurrent
                              ? 'border-brand-300/70 bg-brand-50/70 dark:border-brand-500/40 dark:bg-brand-500/10'
                              : 'border-slate-200/50 bg-white/55 hover:border-brand-200/70 hover:bg-white dark:border-slate-700/45 dark:bg-slate-800/35 dark:hover:bg-slate-800/60'
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            {seg.speaker && (
                              <span className="mt-0.5 shrink-0 rounded-md bg-slate-900/5 px-1.5 py-0.5 text-[11px] font-bold text-slate-500 dark:bg-white/10 dark:text-slate-300">
                                {seg.speaker}
                              </span>
                            )}
                            <p
                              className={`min-w-0 flex-1 text-sm leading-relaxed ${
                                isCurrent
                                  ? 'font-semibold text-slate-900 dark:text-white'
                                  : 'text-slate-700 dark:text-slate-200'
                              }`}
                            >
                              {stripWTags(seg.en)}
                            </p>
                            {isCurrent && queue.playing && (
                              <span className="mt-1 flex shrink-0 items-end gap-0.5" aria-label="正在朗读">
                                <span className="h-2 w-0.5 animate-pulse rounded-full bg-brand-500" />
                                <span className="h-3 w-0.5 animate-pulse rounded-full bg-brand-500 [animation-delay:120ms]" />
                                <span className="h-1.5 w-0.5 animate-pulse rounded-full bg-brand-500 [animation-delay:240ms]" />
                              </span>
                            )}
                          </div>
                          {showZh && seg.zh && (
                            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{stripWTags(seg.zh)}</p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </div>

          <div className="mt-5 flex items-center justify-center gap-2 text-[11px] text-slate-400">
            <BookOpenIcon width={13} height={13} />
            整套课程按篇目顺序连播，跨篇自动继续
          </div>

          <p className="mt-2 flex items-center justify-center gap-1 text-[11px] text-slate-400">
            <SkipBackIcon width={12} height={12} />
            想重听某一句，直接点它即可
          </p>
        </>
      )}
    </div>
  )
}
