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
import { buildWordIndex, stripWTags, textTokens } from '../lib/parse'
import { formatMeta } from '../lib/prompt'
import { lookupWord } from '../lib/dict'
import { pushReviewWord, removeReviewWord } from '../lib/review'
import { appendWordEvent } from '../lib/events'
import { useSpeech } from '../hooks/useSpeech'
import { Sheet } from '../components/Sheet'
import { registerBack } from '../lib/back'
import {
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  PlayIcon,
  SpeakerIcon,
  SpinnerIcon,
} from '../components/icons'

const RATE = 0.9

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
  const [target, setTarget] = useState<WordTarget | null>(null)

  const { speak, stop } = useSpeech()

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

  // ========= 查词弹层 =========
  const openWord = (text: string, key: string | null) => setTarget({ text, key })
  const closeWord = () => setTarget(null)

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

  const segmentPlay = (seg: LessonSegment, extra = '') => (
    <button
      onClick={() => speak(stripWTags(seg.en), RATE)}
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
              <div className="ml-auto">{segmentPlay(seg)}</div>
            </div>
            <p className="text-[15px] leading-relaxed text-slate-800 dark:text-slate-100">{renderNodes(seg.en)}</p>
          </div>
        ))}
      </div>
    )
    if (lesson.kind === 'poem') return (
      <div className="my-5 space-y-5 text-center font-display">
        {segments.map((seg, i) => (
          <div key={i}>
            <p className="text-[17px] italic leading-8 text-slate-800 dark:text-slate-100">{renderNodes(seg.en)}</p>
            {showZh && seg.zh && <p className="mt-1 text-xs leading-relaxed text-slate-400">{seg.zh}</p>}
          </div>
        ))}
      </div>
    )
    if (lesson.kind === 'email') return (
      <div className="surface-inset p-4 font-display">
        <div className="mb-3 border-b hairline pb-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Subject</p>
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{lesson.title}</p>
        </div>
        <div className="space-y-3">
          {segments.map((seg, i) => (
            <div key={i} className="flex items-start justify-between gap-2">
              <p className="flex-1 whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800 dark:text-slate-100">
                {renderNodes(seg.en)}
              </p>
              {segmentPlay(seg, 'mt-0.5')}
            </div>
          ))}
        </div>
      </div>
    )
    if (lesson.kind === 'diary') return (
      <div className="rounded-[18px] border-l-[3px] border-amber-300 bg-amber-50/50 p-4 font-display dark:border-amber-500/40 dark:bg-amber-500/5">
        <div className="space-y-3">
          {segments.map((seg, i) => (
            <div key={i} className="flex items-start justify-between gap-2">
              <p className="flex-1 whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800 dark:text-slate-100">
                {renderNodes(seg.en)}
              </p>
              {segmentPlay(seg, 'mt-0.5')}
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
              {segmentPlay(seg, 'mt-0.5')}
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
              {segmentPlay(seg, 'mt-0.5')}
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
    <div>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${fmt.badge}`}>
              {fmt.emoji} {fmt.label}
            </span>
            <span className="text-xs text-slate-400">{lesson.scene_label}</span>
            {lesson.read_at && (
              <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                已读
              </span>
            )}
          </div>
          <h2 className="mt-1.5 break-words font-display text-[24px] font-semibold leading-snug text-slate-800 dark:text-slate-100">
            {lesson.title}
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
              「{lesson.scene_label}」
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
            <p className="mb-3 rounded-[14px] bg-slate-900/[0.035] px-3 py-2 text-[11px] text-slate-400 dark:bg-white/5">
              点或长按正文里任意单词查词；带下划线的是本篇重点词，可直接标记掌握程度。
            </p>
            {renderBody()}
          </>
        )}
      </div>

      {/* 重点词一览 */}
      {words.length > 0 && lesson.status === 'ready' && (
        <>
          <p className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-slate-400">
            本篇重点词 · 点击标记
          </p>
          <div className="flex flex-wrap gap-1.5">
            {words.map((w) => (
              <button
                key={w.word_key}
                type="button"
                onTouchStart={() => startPress(w.word, w.word_key)}
                onTouchEnd={endPress}
                onTouchCancel={endPress}
                onMouseDown={() => startPress(w.word, w.word_key)}
                onMouseUp={endPress}
                onMouseLeave={endPress}
                onContextMenu={(e) => e.preventDefault()}
                onClick={() => tapWord(w.word, w.word_key)}
                className={`inline-flex items-center gap-1 rounded-full border border-transparent px-2.5 py-1 text-xs font-medium transition ${
                  wordClass(w.word_key)
                }`}
              >
                {w.word}
                {w.is_review && (
                  <span className="rounded-full bg-amber-200/70 px-1 text-[10px] font-bold text-amber-800 dark:bg-amber-400/25 dark:text-amber-200">
                    复习
                  </span>
                )}
                {marks[w.word_key] === 'known' && <CheckIcon width={11} height={11} className="-translate-y-px" />}
              </button>
            ))}
          </div>
        </>
      )}

      {/* 点词弹层 */}
      <Sheet
        open={!!target}
        onClose={closeWord}
        title={displayWord}
        subtitle={[displayIpa, lemma ? `原形 ${lemma}` : ''].filter(Boolean).join(' · ') || undefined}
        footer={
          target?.key ? (
            <div>
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
            <div className="grid grid-cols-2 gap-2">
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
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => speak(displayWord, 0.85)}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 transition active:scale-95 dark:bg-brand-500/15 dark:text-brand-300"
            >
              <SpeakerIcon width={14} height={14} />
              朗读
            </button>
            {target?.key ? (
              <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                本篇重点词
              </span>
            ) : (
              <span className="rounded-full bg-slate-900/5 px-2 py-0.5 text-[11px] text-slate-500 dark:bg-white/10 dark:text-slate-300">
                文中查词
              </span>
            )}
            {target?.key && reviewKeys.has(target.key) && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                复习词
              </span>
            )}
          </div>
          <p className="mt-3 text-[15px] leading-relaxed text-slate-700 dark:text-slate-200">
            {displayMeaning || '本地词典未收录这个词'}
            {!displayMeaning && (
              <span className="mt-1 block text-xs text-slate-400">可以先用「朗读」听发音，或到「词库」搜索该词。</span>
            )}
          </p>
          {target?.key && marks[target.key] && (
            <p className="mt-3 text-xs text-slate-400">
              当前标记：
              <span className="font-semibold">
                {marks[target.key] === 'known' ? '已掌握' : marks[target.key] === 'fuzzy' ? '模糊' : '不认识'}
              </span>
            </p>
          )}
        </div>
      </Sheet>
    </div>
  )
}
