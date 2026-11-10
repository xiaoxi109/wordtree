import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getLesson,
  getLessonSegments,
  getLessonWords,
  markLessonRead,
  saveLessonMark,
  type Lesson,
  type LessonSegment,
  type LessonWord,
  type WordMarkState,
} from '../db'
import { ALL_WORDS, type Word } from '../data'
import { buildWordIndex, stripWTags, textTokens } from '../lib/parse'
import { posShort } from '../lib/pos'
import { sceneLabelText, wordKey } from '../lib/cluster'
import { formatMeta } from '../lib/prompt'
import { GradeBadge, LevelBadge, SpeakerBtn } from '../components/word'
import { lookupWord } from '../lib/dict'
import { pushReviewWord, removeReviewWord } from '../lib/review'
import { appendWordEvent } from '../lib/events'
import { useSpeech } from '../hooks/useSpeech'
import { useSpeechQueue, type QueueLine } from '../hooks/useSpeechQueue'
import { Sheet } from '../components/Sheet'
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
  SpeakerIcon,
  SpinnerIcon,
} from '../components/icons'

const RATES = [0.8, 0.9, 1.0, 1.2, 1.5]

const fmtTime = (sec: number) => {
  const s = Math.max(0, Math.floor(Number.isFinite(sec) ? sec : 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
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

/** 例句里的英文词都能点，不依赖本篇重点词表。 */
const EMPTY_WORD_INDEX = new Map<string, string>()

interface WordTarget {
  text: string
  key: string | null
}

export default function LessonReader({
  lessonId,
  onBack,
  onApplyMark,
  onRetrySingle,
  onToast,
  busy = false,
  active = true,
}: {
  lessonId: string
  onBack: () => void
  onApplyMark: (word: string, mode: 'add' | 'remove') => void
  onRetrySingle: (lessonId: string) => void
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void
  busy?: boolean
  active?: boolean
}) {
  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [segments, setSegments] = useState<LessonSegment[]>([])
  const [words, setWords] = useState<LessonWord[]>([])
  const [marks, setMarks] = useState<Record<string, WordMarkState>>({})
  const [showZh, setShowZh] = useState(true)
  /** 点词栈：从例句里继续点词会压栈，弹层顶部可「返回上一个词」。 */
  const [wordStack, setWordStack] = useState<WordTarget[]>([])
  const target = wordStack[wordStack.length - 1] ?? null
  const [rateOpen, setRateOpen] = useState(false)
  const rateMenuRef = useRef<HTMLDivElement>(null)

  const { speak, stop } = useSpeech()

  // 点播放器其它区域 / 页面空白处收起倍速下拉
  useEffect(() => {
    if (!rateOpen) return
    const onPointerDown = (e: PointerEvent) => {
      if (rateMenuRef.current && !rateMenuRef.current.contains(e.target as Node)) setRateOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [rateOpen])

  // 连续朗读队列：长段落拆成短句，底部播放器按「媒体秒」显示连续进度。
  const { lines, segmentStarts } = useMemo(() => {
    const items: QueueLine[] = []
    const starts: number[] = []
    segments.forEach((seg, si) => {
      starts.push(items.length)
      const parts = splitSentences(seg.en)
      const safe = parts.length ? parts : [stripWTags(seg.en).trim()].filter(Boolean)
      safe.forEach((en, pi) => items.push({ id: `${lessonId}-${si}-${pi}`, en, speaker: seg.speaker }))
    })
    return { lines: items, segmentStarts: starts }
  }, [segments, lessonId])
  // 阅读页只朗读英文：不加载中文模型、不在播放器里放「中文朗读」开关。
  const queue = useSpeechQueue(lines, { includeZh: false })

  // 载入
  useEffect(() => {
    let alive = true
    Promise.all([getLesson(lessonId), getLessonSegments(lessonId), getLessonWords(lessonId)])
      .then(([l, segs, w]) => {
        if (!alive) return
        setLesson(l)
        setSegments(segs)
        setWords(w)
        // 从 Lesson.marks 里读（Lesson 接口会有 marks 吗？这里先用 marks state 独立管理，存时再合）
        // 简化版：marks 在 saveLessonMark 后从 db 读 → 这里用 LessonMark 表
      })
      .catch(() => alive && onToast('读取教程失败', 'error'))
    return () => { alive = false; stop() }
  }, [lessonId, onToast, stop])

  // 三态标记从独立表读
  useEffect(() => {
    let alive = true
    import('../db').then(async (mod) => {
      if (!alive) return
      const ms = await mod.getLessonMarks(lessonId)
      const map: Record<string, WordMarkState> = {}
      for (const m of ms) map[m.word_key] = m.state
      setMarks(map)
    })
    return () => { alive = false }
  }, [lessonId])

  const wordIndex = useMemo(
    () => buildWordIndex(words.map((w) => ({ key: w.word_key, word: w.word }))),
    [words],
  )
  const reviewKeys = useMemo(() => new Set(words.filter((w) => w.is_review).map((w) => w.word_key)), [words])
  const markedCount = Object.keys(marks).length

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

  // ========= 查词弹层（支持例句逐层深入） =========
  const openWord = (text: string, key: string | null) => setWordStack([{ text, key }])
  const closeWord = () => setWordStack([])
  const pushWord = (text: string, key: string | null) =>
    setWordStack((prev) => [...prev, { text, key }])
  const popWord = () => setWordStack((prev) => prev.slice(0, -1))

  // ========= 三态标记 =========
  const applyMark = async (state: WordMarkState) => {
    if (!lesson || !target || !target.key) return
    const word = words.find((w) => w.word_key === target.key)
    if (!word) return
    await saveLessonMark(lesson.id, word.word_key, state)
    void appendWordEvent({
      word_key: word.word_key,
      word: word.word,
      direction: 'both',
      source: 'ai_reader',
      grade: state,
      context_id: lesson.id,
    })
    setMarks((prev) => ({ ...prev, [word.word_key]: state }))
    onApplyMark(word.word, state === 'known' ? 'add' : 'remove')
    if (state === 'known') {
      removeReviewWord(word.word_key)
      onToast(`已标记「${word.word}」为已掌握`, 'success')
    } else {
      pushReviewWord({ key: word.word_key, word: word.word, ipa: word.ipa, meaning: word.meaning }, state)
      onToast(`「${word.word}」已加入复习队列，下次会编进新文章`, 'info')
    }
    closeWord()
  }

  const addUnknown = () => {
    if (!target) return
    const lemma = dictEntry?.word.toLowerCase() ?? target.text
    const key = target.key ?? lemma
    const ipa = dictEntry?.ipa ?? ''
    const meaning = dictEntry?.meaning ?? ''
    onApplyMark(target.text, 'remove')
    pushReviewWord({ key, word: target.text, ipa, meaning }, 'unknown')
    onToast(`「${target.text}」已加入未掌握，后续课程会重点复现`, 'info')
    closeWord()
  }

  const dictEntry = useMemo(() => {
    if (!target) return null
    return lookupWord(target.text)
  }, [target])

  /** 完整词条：有例句、等级、词性，供弹层按「背词详情」的方式展示。 */
  const detailWord = useMemo<Word | null>(() => {
    if (!dictEntry) return null
    const map = fullWordMap()
    return map.get(dictEntry.key) ?? map.get(wordKey(dictEntry.word)) ?? null
  }, [dictEntry])

  /** 例句里的每个英文词都可点：命中词典就压栈，实现逐层深入查词。 */
  const renderExampleNodes = (en: string) =>
    textTokens(en, EMPTY_WORD_INDEX).map((n, i) =>
      n.isWord ? (
        <button
          key={i}
          type="button"
          onClick={() => {
            const hit = lookupWord(n.text)
            if (!hit) return
            const key = wordIndex.get(n.text.toLowerCase()) ?? wordIndex.get(wordKey(n.text)) ?? null
            pushWord(n.text, key)
          }}
          className="rounded px-0.5 text-brand-700 underline decoration-brand-300 decoration-dotted underline-offset-2 transition hover:bg-brand-100 active:bg-brand-500/25 dark:text-brand-300 dark:decoration-brand-500/60 dark:hover:bg-brand-500/20"
          title="点词查卡"
        >
          {n.text}
        </button>
      ) : (
        <span key={i}>{n.text}</span>
      ),
    )

  // ========= 长按查词 =========
  const pressTimer = useRef<number | null>(null)
  const longPressed = useRef(false)
  const endPress = () => {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }
  const startPress = (text: string, key: string | null) => {
    longPressed.current = false
    endPress()
    pressTimer.current = window.setTimeout(() => {
      longPressed.current = true
      openWord(text, key)
    }, 420)
  }
  const tapWord = (text: string, key: string | null) => {
    if (longPressed.current) {
      longPressed.current = false
      return
    }
    openWord(text, key)
  }
  useEffect(() => endPress, [])

  // ========= 状态页 =========
  if (!lesson || (lesson.status === 'ready' && segments.length === 0)) {
    return (
      <div className="flex justify-center py-16 text-slate-400">
        <SpinnerIcon width={24} height={24} className="animate-spin" />
      </div>
    )
  }

  const pendingLesson = lesson.status !== 'ready'
  const fmt = formatMeta(lesson.kind)
  const displayWord = target?.text ?? ''
  const displayIpa = (target?.key && words.find((w) => w.word_key === target.key)?.ipa) || dictEntry?.ipa || ''
  const displayMeaning = (target?.key && words.find((w) => w.word_key === target.key)?.meaning) || dictEntry?.meaning || ''
  const lemma = dictEntry && dictEntry.word.toLowerCase() !== displayWord.toLowerCase() ? dictEntry.word : ''

  const wordClass = (key: string) => {
    const mark = marks[key]
    const base = 'rounded px-0.5 transition active:bg-brand-500/25 focus:outline-none focus:ring-2 focus:ring-brand-300'
    if (mark === 'unknown') return `${base} bg-rose-500/15 text-rose-600 underline decoration-rose-400 dark:text-rose-300`
    if (mark === 'fuzzy') return `${base} bg-amber-500/15 text-amber-600 underline decoration-amber-400 dark:text-amber-300`
    if (mark === 'known') return `${base} bg-brand-500/15 text-brand-700 underline decoration-brand-400 dark:text-brand-300`
    return `${base} text-brand-700 underline decoration-brand-300 decoration-dotted underline-offset-4 dark:text-brand-300`
  }

  const renderNodes = (en: string) =>
    textTokens(en, wordIndex).map((n, i) =>
      n.isWord ? (
        <button
          key={i}
          type="button"
          onTouchStart={() => startPress(n.text, n.word ?? null)}
          onTouchEnd={endPress}
          onTouchCancel={endPress}
          onMouseDown={() => startPress(n.text, n.word ?? null)}
          onMouseUp={endPress}
          onMouseLeave={endPress}
          onContextMenu={(e) => e.preventDefault()}
          onClick={() => tapWord(n.text, n.word ?? null)}
          className={
            n.word
              ? wordClass(n.word)
              : 'rounded px-0.5 transition hover:bg-slate-900/[0.06] active:bg-slate-900/10 dark:hover:bg-white/10 dark:active:bg-white/15'
          }
        >
          {n.text}
        </button>
      ) : (
        <span key={i}>{n.text}</span>
      ),
    )

  const segmentPlay = (index: number, extra = '') => (
    <button
      onClick={() => queue.playFrom(segmentStarts[index] ?? index)}
      className={`shrink-0 rounded-full p-1.5 text-brand-600 transition hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-500/10 ${extra}`}
      aria-label="朗读这句"
    >
      <PlayIcon width={14} height={14} />
    </button>
  )

  const renderBody = () => {
    if (lesson.kind === 'dialogue') return (
      <div className="space-y-4">
        {segments.map((seg, i) => (
          <div key={i} className="rounded-[18px] border border-slate-200/50 bg-white/55 p-3.5 dark:border-slate-700/40 dark:bg-slate-800/35">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[11px] font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                {seg.speaker || (i % 2 === 0 ? 'A' : 'B')}
              </span>
              <div className="ml-auto">{segmentPlay(i)}</div>
            </div>
            <p className="text-[15px] leading-relaxed text-slate-800 dark:text-slate-100">{renderNodes(seg.en)}</p>
            {showZh && seg.zh && <p className="mt-1 text-xs leading-relaxed text-slate-400">{seg.zh}</p>}
          </div>
        ))}
      </div>
    )
    if (lesson.kind === 'poem') return (
      // 小诗与其它体裁同一套布局：每段一行 + 右侧逐句播放按钮
      <div className="space-y-4 font-display">
        {segments.map((seg, i) => (
          <div key={i}>
            <div className="flex items-start justify-between gap-2">
              <p className="flex-1 whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800 dark:text-slate-100">
                {renderNodes(seg.en)}
              </p>
              {segmentPlay(i, 'mt-0.5')}
            </div>
            {showZh && seg.zh && <p className="mt-1 text-xs leading-relaxed text-slate-400">{seg.zh}</p>}
          </div>
        ))}
      </div>
    )
    if (lesson.kind === 'email') return (
      <div className="surface-inset p-4 font-display">
        <div className="space-y-3">
          {segments.map((seg, i) => (
            <div key={i}>
              <div className="flex items-start justify-between gap-2">
                <p className="flex-1 whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800 dark:text-slate-100">
                  {renderNodes(seg.en)}
                </p>
                {segmentPlay(i, 'mt-0.5')}
              </div>
              {showZh && seg.zh && <p className="mt-1 text-xs leading-relaxed text-slate-400">{seg.zh}</p>}
            </div>
          ))}
        </div>
      </div>
    )
    if (lesson.kind === 'diary') return (
      <div className="rounded-[18px] border-l-[3px] border-amber-300 bg-amber-50/50 p-4 font-display dark:border-amber-500/40 dark:bg-amber-500/5">
        <div className="space-y-3">
          {segments.map((seg, i) => (
            <div key={i}>
              <div className="flex items-start justify-between gap-2">
                <p className="flex-1 whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800 dark:text-slate-100">
                  {renderNodes(seg.en)}
                </p>
                {segmentPlay(i, 'mt-0.5')}
              </div>
              {showZh && seg.zh && <p className="mt-1 text-xs leading-relaxed text-slate-400">{seg.zh}</p>}
            </div>
          ))}
        </div>
      </div>
    )
    if (lesson.kind === 'article') return (
      <div className="space-y-4 font-display">
        {segments.map((seg, i) => (
          <div key={i}>
            <div className="flex items-start justify-between gap-2">
              <p className={`flex-1 whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800 dark:text-slate-100 ${
                i === 0 ? 'first-letter:float-left first-letter:mr-1.5 first-letter:text-4xl first-letter:font-black first-letter:leading-8' : ''
              }`}>
                {renderNodes(seg.en)}
              </p>
              {segmentPlay(i, 'mt-0.5')}
            </div>
            {showZh && seg.zh && <p className="mt-1 text-xs leading-relaxed text-slate-400">{seg.zh}</p>}
          </div>
        ))}
      </div>
    )
    // story default
    return (
      <div className="space-y-4">
        {segments.map((seg, i) => (
          <div key={i}>
            <div className="flex items-start justify-between gap-2">
              <p className="flex-1 whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800 dark:text-slate-100">
                {renderNodes(seg.en)}
              </p>
              {segmentPlay(i, 'mt-0.5')}
            </div>
            {showZh && seg.zh && (
              <p className="mt-1 border-l-2 border-slate-200 pl-2 text-sm text-slate-400 dark:border-slate-700">
                {seg.zh}
              </p>
            )}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="pb-[calc(env(safe-area-inset-bottom)+104px)]">
      <div className="mb-3 flex items-start justify-between gap-2">
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
          </div>
          <h2 className="mt-1.5 break-words font-display text-[24px] font-semibold leading-snug text-slate-800 dark:text-slate-100">
            {stripWTags(lesson.title)}
          </h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-400">
            <span>重点词 {lesson.coverage_total ?? words.length}</span>
            <span>已标 {markedCount}</span>
            {lesson.coverage_hit != null && lesson.coverage_total != null && lesson.coverage_hit < lesson.coverage_total && (
              <span className="text-amber-600 dark:text-amber-400">
                覆盖 {lesson.coverage_hit}/{lesson.coverage_total}
              </span>
            )}
            {lesson.coverage_real_words && (
              <span className="text-emerald-600 dark:text-emerald-400">
                用词 {Math.round(((lesson.coverage_known ?? 0) / lesson.coverage_real_words) * 100)}% 来自你的词库
              </span>
            )}
          </p>
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

      <div className="surface p-5 sm:p-6">
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
          <>
            {renderBody()}
          </>
        )}
      </div>

      {/* 点词弹层 */}
      <Sheet
        open={!!target}
        onClose={closeWord}
        title={
          <span className="flex items-center gap-2.5">
            <span className="min-w-0 truncate">{displayWord}</span>
            <button
              type="button"
              onClick={() => speak(displayWord, 0.85)}
              aria-label="朗读"
              title="朗读"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 transition active:scale-95 dark:bg-brand-500/15 dark:text-brand-300"
            >
              <SpeakerIcon width={15} height={15} />
            </button>
          </span>
        }
        subtitle={[displayIpa, lemma ? `原形 ${lemma}` : ''].filter(Boolean).join(' · ') || undefined}
        footer={
          target?.key ? (
            <div className="pb-3">
              <div className="grid grid-cols-3 gap-2">
                {(['unknown', 'fuzzy', 'known'] as WordMarkState[]).map((state) => {
                  const active = marks[target.key!] === state
                  const label = state === 'unknown' ? '不认识' : state === 'fuzzy' ? '模糊' : '已掌握'
                  const cls =
                    state === 'unknown'
                      ? active ? 'bg-rose-500 text-white' : 'bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-500/15 dark:text-rose-300'
                      : state === 'fuzzy'
                        ? active ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-600 hover:bg-amber-100 dark:bg-amber-500/15 dark:text-amber-300'
                        : active ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-700 hover:bg-brand-100 dark:bg-brand-500/15 dark:text-brand-300'
                  return (
                    <button
                      key={state}
                      onClick={() => applyMark(state)}
                      className={`rounded-[14px] py-3 text-sm font-semibold transition active:scale-[0.98] ${cls}`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
              <p className="mt-2 text-center text-[11px] leading-relaxed text-slate-400">
                「不认识 / 模糊」会移出已掌握并进入复习队列，之后的课程会把它写进新文章
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 pb-3">
              <button
                onClick={addUnknown}
                className="rounded-[14px] bg-rose-50 py-3 text-sm font-semibold text-rose-600 transition hover:bg-rose-100 active:scale-[0.98] dark:bg-rose-500/15 dark:text-rose-300"
              >
                加入未掌握
              </button>
              <button
                onClick={closeWord}
                className="rounded-[14px] bg-slate-900/[0.05] py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-900/10 dark:bg-white/10 dark:text-slate-200"
              >
                关闭
              </button>
            </div>
          )
        }
      >
        <div className="pb-1">
          {/* 逐层查词：从例句点进来的词可返回上一个词 */}
          {wordStack.length > 1 && (
            <button
              type="button"
              onClick={popWord}
              className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-[12px] font-semibold text-brand-700 transition hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-300"
            >
              <ChevronRightIcon width={14} height={14} className="rotate-180" />
              返回上一个词
            </button>
          )}

          <div className="flex flex-wrap items-center gap-1.5">
            {detailWord && (detailWord.grade
              ? <GradeBadge grade={detailWord.grade} />
              : <LevelBadge level={detailWord.level} />)}
            {detailWord && posShort(detailWord) && (
              <span className="rounded-full border border-slate-200/60 bg-white/70 px-2 py-0.5 text-[11px] font-bold text-slate-500 dark:border-slate-700/60 dark:bg-slate-800/60 dark:text-slate-300">
                {posShort(detailWord)}
              </span>
            )}
            {detailWord?.common && (
              <span className="rounded-full border border-amber-200/60 bg-amber-100/70 px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/15 dark:text-amber-300">
                常用词
              </span>
            )}
            {target?.key && (
              <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                本篇重点词
              </span>
            )}
            {target?.key && reviewKeys.has(target.key) && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                复习词
              </span>
            )}
          </div>

          <div className="surface-inset mt-3 p-4">
            <p className="text-[16px] font-semibold leading-relaxed text-slate-800 dark:text-slate-100">
              {displayMeaning || '本地词典未收录这个词'}
            </p>
            {!displayMeaning && (
              <span className="mt-1 block text-xs text-slate-400">可以到「词库」搜索该词。</span>
            )}
          </div>

          <p className="mb-2.5 mt-5 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
            Examples · 例句
            <span className="ml-2 font-normal tracking-normal text-slate-400">（点词继续查）</span>
          </p>
          {detailWord && detailWord.examples.length > 0 ? (
            <ul className="space-y-3">
              {detailWord.examples.map((ex, i) => (
                <li key={i} className="surface px-4 py-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-display text-[15px] leading-relaxed text-slate-800 dark:text-slate-100">
                      {renderExampleNodes(ex.en)}
                    </p>
                    <SpeakerBtn text={ex.en} rate={0.9} iconSize={16} className="-mr-1 -mt-1 shrink-0" />
                  </div>
                  {ex.zh && (
                    <p className="mt-1 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">{ex.zh}</p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-[18px] border border-dashed border-slate-300/80 py-6 text-center text-sm text-slate-400 dark:border-slate-700/70">
              暂无例句
            </p>
          )}

          {target?.key && marks[target.key] && (
            <p className="mt-4 text-xs text-slate-400">
              当前标记：
              <span className="font-semibold">
                {marks[target.key] === 'known' ? '已掌握' : marks[target.key] === 'fuzzy' ? '模糊' : '不认识'}
              </span>
            </p>
          )}
        </div>
      </Sheet>

      {/* 底部播放器：时间轴 + 倍速 / 循环 / 上一句 / 播放 / 下一句 */}
      {!pendingLesson && lines.length > 0 && (
        <div
          className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/70 bg-white/95 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/95"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="mx-auto max-w-5xl px-4 pb-2 pt-2">
            <div className="flex items-center gap-2.5">
              <span className="w-10 shrink-0 text-right text-[10px] tabular-nums text-slate-400">
                {queue.preparing ? '准备中' : fmtTime(queue.elapsed)}
              </span>
              <div
                role="slider"
                aria-label="播放进度"
                aria-valuemin={0}
                aria-valuemax={Math.max(1, Math.round(queue.duration))}
                aria-valuenow={Math.round(queue.elapsed)}
                aria-valuetext={`${fmtTime(queue.elapsed)} / ${fmtTime(queue.duration)}`}
                tabIndex={0}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  queue.seekTo((e.clientX - rect.left) / rect.width)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft') queue.seekTo((queue.elapsed - 5) / Math.max(queue.duration, 1))
                  if (e.key === 'ArrowRight') queue.seekTo((queue.elapsed + 5) / Math.max(queue.duration, 1))
                }}
                className="relative h-1.5 flex-1 cursor-pointer rounded-full bg-slate-900/10 dark:bg-white/15"
              >
                <div
                  className="h-full rounded-full bg-brand-500 transition-[width] duration-150 ease-linear"
                  style={{
                    width: `${queue.duration > 0 ? Math.max(0, Math.min(100, (queue.elapsed / queue.duration) * 100)) : 0}%`,
                  }}
                />
              </div>
              <span className="w-10 shrink-0 text-[10px] tabular-nums text-slate-400">
                {fmtTime(queue.duration)}
              </span>
            </div>

            {/* 三栏：左右各一个 chip，中间三个播放按钮严格居中于屏幕 */}
            <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <div ref={rateMenuRef} className="relative flex justify-start">
                <button
                  type="button"
                  onClick={() => setRateOpen((v) => !v)}
                  aria-expanded={rateOpen}
                  aria-haspopup="listbox"
                  title="选择倍速"
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition active:scale-95 ${
                    rateOpen
                      ? 'border-brand-400 bg-brand-50 text-brand-700 dark:border-brand-500/50 dark:bg-brand-500/15 dark:text-brand-300'
                      : 'border-slate-300/70 bg-white/70 text-slate-600 hover:border-brand-300 dark:border-slate-600 dark:bg-white/5 dark:text-slate-300'
                  }`}
                >
                  {queue.rate.toFixed(1)}×
                  <ChevronRightIcon width={12} height={12} className={rateOpen ? '-rotate-90' : 'rotate-90'} />
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

              <div className="flex items-center justify-center gap-4 sm:gap-6">
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
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-600 text-white shadow-soft transition active:scale-95"
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

              <div className="flex justify-end">
                <button
                  onClick={() => queue.setLoop(!queue.loop)}
                  aria-pressed={queue.loop}
                  title="循环播放本篇"
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition active:scale-95 ${
                    queue.loop
                      ? 'border-brand-400 bg-brand-600 text-white dark:border-brand-500/50'
                      : 'border-slate-300/70 bg-white/70 text-slate-600 hover:border-brand-300 dark:border-slate-600 dark:bg-white/5 dark:text-slate-300'
                  }`}
                >
                  <RotateCcwIcon width={11} height={11} />
                  循环
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
