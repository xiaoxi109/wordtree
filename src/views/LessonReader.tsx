import { Fragment, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type MouseEvent } from 'react'
import {
  getLesson,
  getLessonSegments,
  getLessonWords,
  markLessonRead,
  type Lesson,
  type LessonSegment,
  type LessonWord,
} from '../db'
import { ALL_WORDS, type Word } from '../data'
import { buildWordIndex, stripMarkup, stripWTags, textTokens } from '../lib/parse'
import { PLAY_MODES, SENTENCE_REPEAT_OPTIONS, usePlayback, type PlayMode } from '../lib/playback'
import { sceneLabelText, wordKey } from '../lib/cluster'
import { formatMeta } from '../lib/prompt'
import { lookupWord } from '../lib/dict'
import { useSpeech } from '../hooks/useSpeech'
import { useSpeechQueue, type QueueLine } from '../hooks/useSpeechQueue'
import { registerBack } from '../lib/back'
import {
  CheckIcon,
  ChevronRightIcon,
  EyeIcon,
  EyeOffIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  SkipBackIcon,
  SkipForwardIcon,
  SpinnerIcon,
} from '../components/icons'

const RATES = [0.8, 0.9, 1.0, 1.2, 1.5]

const fmtTime = (sec: number) => {
  const s = Math.max(0, Math.floor(Number.isFinite(sec) ? sec : 0))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** 一段长文拆成短句：单句合成更快（首句秒出声），进度条也有足够多的刻度。 */
function splitSentences(text: string): string[] {
  return stripWTags(text)
    .replace(/([.!?])([ \t]+)/g, '$1\n')
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** 词键 → 完整词条（含例句），点词弹层用它展示背词详情同款内容。 */
let fullWordMapCache: Map<string, Word> | null = null
function fullWordMap(): Map<string, Word> {
  if (fullWordMapCache) return fullWordMapCache
  const m = new Map<string, Word>()
  for (const w of ALL_WORDS) m.set(wordKey(w.word), w)
  fullWordMapCache = m
  return m
}

export default function LessonReader({
  lessonId,
  onBack,
  onOpenWord,
  onRetrySingle,
  onToast,
  busy = false,
  active = true,
  onLessonEnd,
  autoStartToken = 0,
}: {
  lessonId: string
  onBack: () => void
  /** 长按任意词 → 交给全局统一的查词弹层 */
  onOpenWord: (w: Word) => void
  onRetrySingle: (lessonId: string) => void
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void
  busy?: boolean
  active?: boolean
  /** 列表模式：本篇自然播完时通知上层切篇 */
  onLessonEnd?: (mode: PlayMode) => void
  /** 列表连播切篇后的自动播放信号，>0 表示本次需要从第一句自动开始 */
  autoStartToken?: number
}) {
  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [segments, setSegments] = useState<LessonSegment[]>([])
  const [words, setWords] = useState<LessonWord[]>([])
  const [showZh, setShowZh] = useState(true)
  const [modeOpen, setModeOpen] = useState(false)
  const [playback, setPlayback] = usePlayback()
  const [rateOpen, setRateOpen] = useState(false)
  const rateMenuRef = useRef<HTMLDivElement>(null)
  const modeMenuRef = useRef<HTMLDivElement>(null)

  const { stop } = useSpeech()

  // 点播放器其它区域 / 页面空白处收起倍速与播放模式下拉
  useEffect(() => {
    if (!rateOpen && !modeOpen) return
    const onPointerDown = (e: PointerEvent) => {
      const targetNode = e.target as Node
      if (rateMenuRef.current && !rateMenuRef.current.contains(targetNode)) setRateOpen(false)
      if (modeMenuRef.current && !modeMenuRef.current.contains(targetNode)) setModeOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [rateOpen, modeOpen])

  // 连续朗读队列：长段落拆成短句，底部播放器按「媒体秒」显示连续进度。
  const { lines, segmentStarts, segmentSentences } = useMemo(() => {
    const items: QueueLine[] = []
    const starts: number[] = []
    const perSegment: string[][] = []
    segments.forEach((seg, si) => {
      starts.push(items.length)
      const parts = splitSentences(seg.en)
      const safe = parts.length ? parts : [stripWTags(seg.en).trim()].filter(Boolean)
      // 渲染与队列共用同一份句子，保证「第 j 句」在两边是同一个索引
      perSegment.push(safe)
      safe.forEach((en, pi) => items.push({ id: `${lessonId}-${si}-${pi}`, en, speaker: seg.speaker }))
    })
    return { lines: items, segmentStarts: starts, segmentSentences: perSegment }
  }, [segments, lessonId])
  // 阅读页只朗读英文：不加载中文模型、不在播放器里放「中文朗读」开关。
  const queue = useSpeechQueue(lines, { includeZh: false, playback, onLessonEnd })

  /**
   * 列表连播切篇后的自动续播：等新篇的句子加载出来再从第一句开始，
   * 避免在旧 lines 上误播。用 ref 记住已处理的信号，防止重复触发。
   */
  const handledAutoStart = useRef(0)
  useEffect(() => {
    if (!autoStartToken || autoStartToken === handledAutoStart.current) return
    if (!lines.length || !lesson || lesson.status !== 'ready') return
    handledAutoStart.current = autoStartToken
    queue.playFrom(0)
  }, [autoStartToken, lines, lesson, queue.playFrom])

  // 载入
  useEffect(() => {
    let alive = true
    Promise.all([getLesson(lessonId), getLessonSegments(lessonId), getLessonWords(lessonId)])
      .then(([l, segs, w]) => {
        if (!alive) return
        setLesson(l)
        setSegments(segs)
        setWords(w)
      })
      .catch(() => alive && onToast('读取教程失败', 'error'))
    return () => { alive = false; stop() }
  }, [lessonId, onToast, stop])

  const wordIndex = useMemo(
    () => buildWordIndex(words.map((w) => ({ key: w.word_key, word: w.word }))),
    [words],
  )

  // 打开即记为已读
  useEffect(() => {
    if (lesson && lesson.status === 'ready' && !lesson.read_at) {
      void markLessonRead(lesson.id).then(() => {
        setLesson((prev) => prev ? { ...prev, read_at: Date.now() } : prev)
      })
    }
  }, [lesson])

  // 切走页面停止朗读
  useEffect(() => { if (!active) stop() }, [active, stop])

  // 安卓返回键
  const onBackRef = useRef(onBack)
  onBackRef.current = onBack
  useEffect(() => {
    if (!active) return
    return registerBack(() => onBackRef.current())
  }, [active])

  // ========= 长按查词：统一交给全局 WordModal =========
  /** 文章里任意 token（含屈折变体）解析成完整词条；查不到时构造最小词条。 */
  const openWordFromText = (text: string) => {
    const entry = lookupWord(text)
    const full = entry
      ? fullWordMap().get(entry.key) ?? fullWordMap().get(wordKey(entry.word)) ?? null
      : null
    if (full) {
      onOpenWord(full)
      return
    }
    onOpenWord({
      word: entry?.word ?? text,
      level: 'A1',
      ipa: entry?.ipa ?? '',
      pos: '',
      meaning: entry?.meaning ?? '本地词典未收录这个词',
      examples: [],
    })
  }

  const pressTimer = useRef<number | null>(null)
  const longPressed = useRef(false)
  const endPress = () => {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }
  const startPress = (text: string) => {
    longPressed.current = false
    endPress()
    pressTimer.current = window.setTimeout(() => {
      longPressed.current = true
      openWordFromText(text)
    }, 420)
  }
  /**
   * 长按已弹查词弹层，松手后浏览器补发的 click 必须吞掉，
   * 否则会冒泡到句子 span 又触发一次播放。短按则不做处理，
   * 让 click 冒泡到句子 → 从该句播放。
   */
  const swallowLongPressClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (!longPressed.current) return
    longPressed.current = false
    e.stopPropagation()
  }
  useEffect(() => endPress, [])

  // ========= 状态页 =========
  if (!lesson) {
    return (
      <div className="flex justify-center py-16 text-slate-400">
        <SpinnerIcon width={24} height={24} className="animate-spin" />
      </div>
    )
  }

  // 已生成但没有正文：不要一直转圈（页面上只剩白底 + 小圈，很像"白屏"）
  if (lesson.status === 'ready' && segments.length === 0) {
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center">
        <p className="text-[15px] font-bold text-slate-800 dark:text-slate-100">这篇文章没有内容</p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-slate-400">
          可能是生成过程中断，或数据没有完整保存。可以删除后重新生成一篇。
        </p>
        <button onClick={() => onRetrySingle(lesson.id)} className="btn-ink mt-5 !px-6 !py-2.5 text-sm">
          重新生成
        </button>
      </div>
    )
  }

  const pendingLesson = lesson.status !== 'ready'
  const fmt = formatMeta(lesson.kind)

  /**
   * 正文不标记重点词：所有词视觉一致，不加下划线或颜色，保持阅读纯净。
   * 悬停 / 按下底色统一由 .word-token 控制（悬停只在桌面鼠标设备生效），
   * 避免触屏 WebView 的 :hover 粘在被点过的词上留下洗不掉的方块。
   */
  const wordClass = 'word-token select-none rounded px-0.5 transition [-webkit-touch-callout:none] focus:outline-none'

  const renderNodes = (en: string) =>
    textTokens(en, wordIndex).map((n, i) =>
      n.isWord ? (
        <button
          key={i}
          type="button"
          onPointerDown={() => startPress(n.text)}
          onPointerUp={endPress}
          onPointerCancel={endPress}
          onPointerLeave={endPress}
          onContextMenu={(e) => e.preventDefault()}
          onClick={(e) => {
            swallowLongPressClick(e)
            // 点完立即释放焦点：按钮保持键盘焦点会让部分 WebView 保留高亮态
            e.currentTarget.blur()
          }}
          className={wordClass}
        >
          {n.text}
        </button>
      ) : (
        <span key={i}>{n.text}</span>
      ),
    )

  /**
   * 逐句渲染：与播放队列共用同一份句子数组，段落内第 j 句的队列下标 = segmentStarts[段] + j。
   * - 当前播放的那一句：只用浅底标记，不改字重/字号、不加下划线，
   *   否则字体宽度变化会让整段重排，box-decoration-clone 的下划线还会在词间画出小短线；
   * - 点那一句（不是点词按钮）就从该句重新播放。
   * 注意：本文件有 `if (!lesson) return ...` 提前返回，其后不能再调用 Hook；
   * 这里只有纯计算与普通函数，不含 Hook。
   */
  const renderSentences = (segIndex: number) =>
    (segmentSentences[segIndex] ?? []).map((sentence, j) => {
      const lineIndex = (segmentStarts[segIndex] ?? 0) + j
      const current = queue.started && queue.index === lineIndex
      return (
        <Fragment key={j}>
          <span
            onClick={() => queue.playFrom(lineIndex)}
            className={`box-decoration-clone cursor-pointer rounded-[5px] transition-colors ${
              current
                ? 'bg-brand-100/70 text-slate-900 dark:bg-brand-500/20 dark:text-slate-50'
                : 'hover:bg-brand-50/50 dark:hover:bg-brand-500/10'
            }`}
          >
            {renderNodes(sentence)}
          </span>
          {/* 句子之间只留一个空格，同段落内连续成文；分段由段落容器负责 */}
          {' '}
        </Fragment>
      )
    })

  /** 正文统一样式：无卡片底色、字号更大、行距舒适，同段落内连续排布。 */
  const prose = 'text-[17px] leading-[1.8] text-slate-800 dark:text-slate-100'
  const zhLine = 'mt-1.5 text-[13px] leading-relaxed text-slate-400 dark:text-slate-400'

  const renderBody = () => {
    if (lesson.kind === 'dialogue') return (
      <div className="space-y-5">
        {segments.map((seg, i) => (
          <div key={i}>
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[11px] font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                {seg.speaker || (i % 2 === 0 ? 'A' : 'B')}
              </span>
            </div>
            <p className={prose}>{renderSentences(i)}</p>
            {showZh && seg.zh && <p className={zhLine}>{stripMarkup(seg.zh)}</p>}
          </div>
        ))}
      </div>
    )
    if (lesson.kind === 'poem') return (
      <div className="space-y-5 font-display">
        {segments.map((seg, i) => (
          <div key={i}>
            <p className={prose}>{renderSentences(i)}</p>
            {showZh && seg.zh && <p className={zhLine}>{stripMarkup(seg.zh)}</p>}
          </div>
        ))}
      </div>
    )
    if (lesson.kind === 'email') return (
      <div className="space-y-5 font-display">
        {segments.map((seg, i) => (
          <div key={i}>
            <p className={prose}>{renderSentences(i)}</p>
            {showZh && seg.zh && <p className={zhLine}>{stripMarkup(seg.zh)}</p>}
          </div>
        ))}
      </div>
    )
    if (lesson.kind === 'diary') return (
      <div className="space-y-5 border-l-[3px] border-amber-300 pl-4 font-display dark:border-amber-500/40">
        {segments.map((seg, i) => (
          <div key={i}>
            <p className={prose}>{renderSentences(i)}</p>
            {showZh && seg.zh && <p className={zhLine}>{stripMarkup(seg.zh)}</p>}
          </div>
        ))}
      </div>
    )
    if (lesson.kind === 'article') return (
      <div className="space-y-5 font-display">
        {segments.map((seg, i) => (
          <div key={i}>
            <p className={`${prose} ${
              i === 0 ? 'first-letter:float-left first-letter:mr-1.5 first-letter:text-5xl first-letter:font-black first-letter:leading-[3.2rem]' : ''
            }`}>
              {renderSentences(i)}
            </p>
            {showZh && seg.zh && <p className={zhLine}>{stripMarkup(seg.zh)}</p>}
          </div>
        ))}
      </div>
    )
    // story default
    return (
      <div className="space-y-5">
        {segments.map((seg, i) => (
          <div key={i}>
            <p className={prose}>{renderSentences(i)}</p>
            {showZh && seg.zh && (
              <p className={`${zhLine} border-l-2 border-slate-200 pl-2 dark:border-slate-700`}>
                {stripMarkup(seg.zh)}
              </p>
            )}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div
      className="-mx-4 flex flex-col overflow-hidden"
      style={{ height: 'calc(100dvh - env(safe-area-inset-top) - 72px)' }}
    >
      <div className="mb-3 flex shrink-0 items-start justify-between gap-2 px-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${fmt.badge}`}>
              {fmt.emoji} {fmt.label}
            </span>
            <span className="text-xs text-slate-400">{sceneLabelText(lesson.scene_label)}</span>
            {lesson.read_at && (
              <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                已读
              </span>
            )}
            {typeof lesson.coverage_mastered === 'number' && lesson.coverage_real_words ? (
              <span
                title="本篇实词中有多少来自你已掌握的词汇"
                className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
              >
                {Math.round((lesson.coverage_mastered / lesson.coverage_real_words) * 100)}% 来自已掌握
              </span>
            ) : null}
          </div>
          <h2 className="mt-1.5 break-words font-display text-[24px] font-semibold leading-snug text-slate-800 dark:text-slate-100">
            {stripMarkup(lesson.title)}
          </h2>
        </div>

        <button
          onClick={() => setShowZh((v) => !v)}
          title={showZh ? '隐藏中文' : '显示中文'}
          className="rounded-full border border-slate-200/60 bg-white/60 p-2 text-slate-500 transition hover:bg-white dark:border-slate-700/50 dark:bg-slate-800/50 dark:text-slate-300"
          aria-label={showZh ? '隐藏中文翻译' : '显示中文翻译'}
        >
          {showZh ? <EyeIcon width={16} height={16} /> : <EyeOffIcon width={16} height={16} />}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-1">
        {pendingLesson ? (
          <div className="py-8 text-center">
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
              「{sceneLabelText(lesson.scene_label)}」
              {lesson.status === 'generating' ? '正在生成…' : '生成失败'}
            </p>
            {lesson.error && <p className="mt-2 text-xs text-rose-500">{lesson.error}</p>}
            <p className="mt-2 text-xs text-slate-400">重点词 {words.length} 个</p>
            {lesson.status === 'failed' && (
              <button
                onClick={() => onRetrySingle(lesson.id)}
                disabled={busy}
                className="btn-primary mt-4 !px-5 disabled:opacity-60"
              >
                {busy ? '重新生成中…' : '重新生成本篇'}
              </button>
            )}
          </div>
        ) : (
          renderBody()
        )}
      </div>

      {/* 底部播放器：时间轴 + 倍速 / 循环 / 上一句 / 播放 / 下一句 */}
      {!pendingLesson && lines.length > 0 && (
        <div
          className="shrink-0 border-t border-slate-200/70 bg-white/95 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/95"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="mx-auto max-w-5xl px-4 pb-2 pt-2">
            <SeekBar
              subscribe={queue.subscribeProgress}
              getProgress={queue.getProgress}
              preparing={queue.preparing}
              onSeek={(ratio) => queue.seekTo(ratio)}
            />

            {/* 三栏：左右各一个 chip，中间三个播放按钮严格居中于屏幕 */}
            <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <div ref={rateMenuRef} className="relative flex min-w-0 justify-start">
                <button
                  type="button"
                  onClick={() => { setModeOpen(false); setRateOpen((v) => !v) }}
                  aria-expanded={rateOpen}
                  aria-haspopup="listbox"
                  title="选择倍速"
                  className={`inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full border px-2 py-1 text-[11px] font-semibold transition active:scale-95 sm:px-2.5 ${
                    rateOpen
                      ? 'border-brand-400 bg-brand-50 text-brand-700 dark:border-brand-500/50 dark:bg-brand-500/15 dark:text-brand-300'
                      : 'border-slate-300/70 bg-white/70 text-slate-600 hover:border-brand-300 dark:border-slate-600 dark:bg-white/5 dark:text-slate-300'
                  }`}
                >
                  {queue.rate.toFixed(1)}×
                  <ChevronRightIcon width={12} height={12} className={`shrink-0 ${rateOpen ? '-rotate-90' : 'rotate-90'}`} />
                </button>
                {rateOpen && (
                  <div
                    role="listbox"
                    className="absolute bottom-full left-0 z-40 mb-2 w-28 overflow-hidden rounded-[14px] border border-slate-200/70 bg-white p-1 shadow-float dark:border-slate-700/60 dark:bg-slate-800"
                  >
                    {RATES.map((r) => (
                      <button
                        key={r}
                        type="button"
                        role="option"
                        aria-selected={r === queue.rate}
                        onClick={() => {
                          queue.setRate(r)
                          setRateOpen(false)
                        }}
                        className={`flex w-full items-center justify-between rounded-[10px] px-2.5 py-1.5 text-[12px] font-semibold transition ${
                          r === queue.rate
                            ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                            : 'text-slate-600 hover:bg-slate-900/5 dark:text-slate-300 dark:hover:bg-white/10'
                        }`}
                      >
                        {r.toFixed(1)}×
                        {r === queue.rate && <CheckIcon width={13} height={13} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-center gap-3 sm:gap-6">
                <button
                  onClick={queue.prev}
                  aria-label="上一句"
                  className="rounded-full p-2 text-slate-600 transition hover:bg-slate-900/5 dark:text-slate-200 dark:hover:bg-white/10"
                >
                  <SkipBackIcon width={20} height={20} />
                </button>
                <button
                  onClick={queue.toggle}
                  aria-label={queue.playing ? '暂停' : '播放'}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-600 text-white shadow-soft transition active:scale-95 dark:border dark:border-brand-400/50 dark:bg-brand-500/15 dark:text-brand-200 dark:shadow-none"
                >
                  {queue.preparing ? (
                    <SpinnerIcon width={20} height={20} className="animate-spin" />
                  ) : queue.playing ? (
                    <PauseIcon width={20} height={20} />
                  ) : (
                    <PlayIcon width={20} height={20} />
                  )}
                </button>
                <button
                  onClick={queue.next}
                  aria-label="下一句"
                  className="rounded-full p-2 text-slate-600 transition hover:bg-slate-900/5 dark:text-slate-200 dark:hover:bg-white/10"
                >
                  <SkipForwardIcon width={20} height={20} />
                </button>
              </div>

              <div ref={modeMenuRef} className="relative flex min-w-0 justify-end">
                <button
                  type="button"
                  onClick={() => { setRateOpen(false); setModeOpen((v) => !v) }}
                  aria-expanded={modeOpen}
                  aria-haspopup="listbox"
                  title="选择播放模式"
                  className={`inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full border px-2 py-1 text-[11px] font-semibold transition active:scale-95 sm:px-2.5 ${
                    modeOpen
                      ? 'border-brand-400 bg-brand-50 text-brand-700 dark:border-brand-500/50 dark:bg-brand-500/15 dark:text-brand-300'
                      : playback.mode === 'off'
                        ? 'border-slate-300/70 bg-white/70 text-slate-600 hover:border-brand-300 dark:border-slate-600 dark:bg-white/5 dark:text-slate-300'
                        : 'border-brand-400/70 bg-brand-50 text-brand-700 dark:border-brand-400/45 dark:bg-brand-400/20 dark:text-brand-100'
                  }`}
                >
                  <RotateCcwIcon width={11} height={11} className="shrink-0" />
                  <span className="min-w-0 truncate">
                    {PLAY_MODES.find((m) => m.id === playback.mode)?.short ?? '播放'}
                  </span>
                  <ChevronRightIcon width={12} height={12} className={`shrink-0 ${modeOpen ? '-rotate-90' : 'rotate-90'}`} />
                </button>
                {modeOpen && (
                  <div
                    role="listbox"
                    className="absolute bottom-full right-0 z-40 mb-2 w-52 overflow-hidden rounded-[14px] border border-slate-200/70 bg-white p-1 shadow-float dark:border-slate-700/60 dark:bg-slate-800"
                  >
                    {PLAY_MODES.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        role="option"
                        aria-selected={m.id === playback.mode}
                        onClick={() => {
                          setPlayback({ mode: m.id })
                          setModeOpen(false)
                        }}
                        className={`flex w-full items-start gap-1.5 rounded-[10px] px-2.5 py-1.5 text-left transition ${
                          m.id === playback.mode
                            ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                            : 'text-slate-600 hover:bg-slate-900/5 dark:text-slate-300 dark:hover:bg-white/10'
                        }`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-[12px] font-semibold">{m.label}</span>
                          <span className="mt-0.5 block text-[10px] leading-snug text-slate-400 dark:text-slate-500">
                            {m.desc}
                          </span>
                          {m.id === 'sentence' && (
                            <span className="mt-0.5 block text-[10px] leading-snug text-brand-600 dark:text-brand-300">
                              {`当前第 ${Math.min(queue.sentencePass + 1, playback.sentenceRepeat)}/${playback.sentenceRepeat} 遍`}
                            </span>
                          )}
                        </span>
                        {m.id === playback.mode && <CheckIcon width={13} height={13} className="mt-0.5 shrink-0" />}
                      </button>
                    ))}
                    {playback.mode === 'sentence' && (
                      <div className="mt-1 border-t border-slate-100 px-2.5 py-2 dark:border-slate-700/60">
                        <p className="mb-1.5 text-[10px] font-bold text-slate-400">单句循环次数</p>
                        <div className="flex flex-wrap gap-1">
                          {SENTENCE_REPEAT_OPTIONS.map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setPlayback({ sentenceRepeat: opt.value })}
                              aria-pressed={opt.value === playback.sentenceRepeat}
                              className={`rounded-full border px-2 py-1 text-[11px] font-semibold transition ${
                                opt.value === playback.sentenceRepeat
                                  ? 'border-brand-400/70 bg-brand-50 text-brand-700 dark:border-brand-400/45 dark:bg-brand-400/20 dark:text-brand-100'
                                  : 'border-slate-200/70 text-slate-600 hover:border-brand-300 dark:border-slate-600 dark:text-slate-300'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

/**
 * 原生 range 进度条：细轨道 + 圆形滑块，拖动跟手。
 *
 * 关键点：拖动过程中只更新组件内部的预览值（不会让整篇文章重渲染，也不会打断语音），
 * 松手（pointerup / pointercancel / touchend）才调用一次 onSeek 重新定位。
 * 旧实现每次点击都 seekTo → playFrom 停掉旧语音重新合成，所以拖动起来「一段一段」。
 */
function SeekBar({
  subscribe,
  getProgress,
  preparing,
  onSeek,
}: {
  subscribe: (fn: () => void) => () => void
  /** elapsed 与 duration 来自同一次快照，比例始终一致 */
  getProgress: () => { elapsed: number; duration: number }
  preparing: boolean
  onSeek: (ratio: number) => void
}) {
  const { elapsed, duration } = useSyncExternalStore(subscribe, getProgress, getProgress)
  const [scrub, setScrub] = useState<number | null>(null)
  const scrubRef = useRef<number | null>(null)
  /** 播放中 duration 会随句子真实时长重算；拖动期间冻结量程，避免滑块跳动。 */
  const frozenMaxRef = useRef<number | null>(null)
  const max = Math.max(0.1, duration)
  const trackMax = frozenMaxRef.current ?? max
  /** 滑块位置钳在量程内；时间显示用真实累计秒，不受钳制影响。 */
  const shownSeconds = scrub ?? elapsed
  const value = Math.min(trackMax, Math.max(0, shownSeconds))
  const pct = (value / trackMax) * 100

  const commitRef = useRef<() => void>(() => {})
  commitRef.current = () => {
    const target = scrubRef.current
    if (target === null) return
    const frozen = frozenMaxRef.current ?? max
    scrubRef.current = null
    frozenMaxRef.current = null
    setScrub(null)
    onSeek(target / frozen)
  }
  useEffect(() => {
    const finish = () => commitRef.current()
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    window.addEventListener('touchend', finish)
    return () => {
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      window.removeEventListener('touchend', finish)
    }
  }, [])

  const preview = (v: number) => {
    if (scrubRef.current === null) frozenMaxRef.current = max
    const clamped = Math.min(frozenMaxRef.current ?? max, Math.max(0, v))
    scrubRef.current = clamped
    setScrub(clamped)
  }

  return (
    <div>
      <input
        type="range"
        min={0}
        max={trackMax}
        step="any"
        value={value}
        aria-label="播放进度"
        aria-valuetext={`${fmtTime(shownSeconds)} / ${fmtTime(duration)}`}
        className="player-seek"
        style={{ '--seek-pct': `${pct}%` } as CSSProperties}
        onChange={(e) => preview(Number(e.currentTarget.value))}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
          e.preventDefault()
          scrubRef.current = null
          frozenMaxRef.current = null
          setScrub(null)
          onSeek((shownSeconds + (e.key === 'ArrowLeft' ? -5 : 5)) / max)
        }}
      />
      <div className="-mt-0.5 flex items-center justify-between text-[10px] leading-tight tabular-nums text-slate-400">
        <span>{preparing ? '准备中' : ''}</span>
        <span>{fmtTime(shownSeconds)} / {fmtTime(duration)}</span>
      </div>
    </div>
  )
}
