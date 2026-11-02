import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getSet,
  listLessons,
  markLessonRead,
  saveLessonMark,
  saveSetPosition,
  type AiLesson,
  type AiLessonSet,
  type MarkState,
} from '../db'
import { buildWordIndex, stripWTags, textTokens, type LessonSegment } from '../lib/parse'
import { formatMeta } from '../lib/prompt'
import { lookupWord } from '../lib/dict'
import { wordKey } from '../lib/cluster'
import { pushReviewWord, removeReviewWord } from '../lib/review'
import { useSpeech } from '../hooks/useSpeech'
import { Sheet } from '../components/Sheet'
import LessonListen from '../components/LessonListen'
import { registerBack } from '../lib/back'
import {
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  PlayIcon,
  SkipBackIcon,
  SkipForwardIcon,
  SpeakerIcon,
  SpinnerIcon,
} from '../components/icons'

const RATE = 0.9
const SWIPE_THRESHOLD = 50

interface WordTarget {
  /** 正文里的原始词形（可能是 ordered / studies） */
  text: string
  /** 命中重点词表时的词键 */
  key: string | null
}

export default function LessonReader({
  setId,
  onBack,
  onApplyMark,
  onRetrySingle,
  busy,
  active = true,
  onToast,
}: {
  setId: string
  onBack: () => void
  onApplyMark: (word: string, mode: 'add' | 'remove') => void
  onRetrySingle: (lessonId: string) => void
  busy: boolean
  /** 当前是否在 AI 课程页；切走时暂停朗读 */
  active?: boolean
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}) {
  const [lessons, setLessons] = useState<AiLesson[] | null>(null)
  const [set, setSet] = useState<AiLessonSet | null>(null)
  const [idx, setIdx] = useState(0)
  const [showZh, setShowZh] = useState(true)
  const [mode, setMode] = useState<'read' | 'listen'>('read')
  const [target, setTarget] = useState<WordTarget | null>(null)

  const { speak, stop } = useSpeech()
  const savedPos = useRef<string | null>(null)

  /* ------------------------------ 载入 ------------------------------ */
  useEffect(() => {
    let alive = true
    Promise.all([listLessons(setId), getSet(setId)])
      .then(([ls, s]) => {
        if (!alive) return
        setLessons(ls)
        setSet(s)
        // 续读位置：优先上次读到的那篇
        const last = s?.lastIndex ?? 0
        setIdx((cur) => Math.max(0, Math.min(ls.length - 1, Number.isFinite(last) ? last : cur)))
      })
      .catch(() => onToast('读取教程失败', 'error'))
    return () => {
      alive = false
      stop()
    }
  }, [setId, onToast, stop])

  const lesson = lessons?.[idx] ?? null

  /** 词键 → 变体索引：ordered → order、studies → study */
  const wordIndex = useMemo(() => buildWordIndex(lesson?.words ?? []), [lesson])

  /** 听读模式队列：聚焦 segments 数组引用，避免标记更新时重置播放 */
  const segments = lesson?.segments
  const lines = useMemo(
    () =>
      (segments ?? []).map((s, i) => ({
        id: `seg-${i}`,
        en: s.en,
        zh: s.zh,
        speaker: s.speaker,
      })),
    [segments],
  )

  const markedCount = useMemo(() => Object.keys(lesson?.marks ?? {}).length, [lesson])
  const readCount = Math.min(set?.readCount ?? 0, set?.total ?? 0)

  // 打开一篇（且正文已生成）→ 记为已读 + 记住位置
  useEffect(() => {
    if (!lesson || lesson.status !== 'ready') return
    if (savedPos.current === lesson.id) return
    savedPos.current = lesson.id
    const firstRead = !lesson.readAt
    void markLessonRead(lesson.id)
    void saveSetPosition(setId, idx)
    if (firstRead) {
      setLessons((prev) =>
        prev ? prev.map((l) => (l.id === lesson.id ? { ...l, readAt: Date.now() } : l)) : prev,
      )
    }
    setSet((s) => (s ? { ...s, readCount: (s.readCount ?? 0) + (firstRead ? 1 : 0), lastIndex: idx } : s))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [lesson, idx, setId])

  // 切到其他页时停止朗读
  useEffect(() => {
    if (!active) stop()
  }, [active, stop])

  // 安卓返回键：先退出阅读器，回到课程列表
  const onBackRef = useRef(onBack)
  onBackRef.current = onBack
  useEffect(() => {
    if (!active) return
    return registerBack(() => onBackRef.current())
  }, [active])

  /* --------------------------- 三态标记 --------------------------- */
  const vocabBy = (key: string) => lesson?.words.find((w) => w.key === key) ?? null

  const opened = target
    ? target.key
      ? vocabBy(target.key)
      : null
    : null
  const dictEntry = target && !opened ? lookupWord(target.text) : null
  const reviewKeys = useMemo(() => new Set((lesson?.words ?? []).filter((w) => w.isReview).map((w) => w.key)), [lesson])

  const applyMark = async (state: MarkState) => {
    if (!lesson || !opened) return
    const { key, word, ipa, meaning } = opened
    await saveLessonMark(lesson.id, key, state)
    setLessons((prev) =>
      prev ? prev.map((l) => (l.id === lesson.id ? { ...l, marks: { ...l.marks, [key]: state } } : l)) : prev,
    )
    onApplyMark(word, state === 'known' ? 'add' : 'remove')
    if (state === 'known') {
      removeReviewWord(key)
      onToast(`已标记「${word}」为已掌握`, 'success')
    } else {
      // 错词真正回流：进复习队列，后续生成会编入新文章
      pushReviewWord({ key, word, ipa, meaning }, state)
      onToast(`「${word}」已加入复习队列，会编入后续课程`, 'info')
    }
    setTarget(null)
  }

  /* --------------------------- 长按查词 --------------------------- */
  const pressTimer = useRef<number | null>(null)
  const longPressed = useRef(false)

  const endPress = () => {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }
  /** 按住 420ms 弹出词义；轻点仍然直接查词 */
  const startPress = (text: string, key: string | null) => {
    longPressed.current = false
    endPress()
    pressTimer.current = window.setTimeout(() => {
      longPressed.current = true
      setTarget({ text, key })
    }, 420)
  }
  const tapWord = (text: string, key: string | null) => {
    if (longPressed.current) {
      longPressed.current = false
      return
    }
    setTarget({ text, key })
  }
  useEffect(() => endPress, [])

  /** 普通词加入未掌握：取消掌握标记并进复习队列 */
  const addUnknown = () => {
    if (!target) return
    const word = lemma || displayWord
    const key = target.key ?? wordKey(word)
    onApplyMark(word, 'remove')
    pushReviewWord({ key, word, ipa: displayIpa, meaning: displayMeaning }, 'unknown')
    onToast(`「${word}」已加入未掌握，后续课程会重点复现`, 'info')
    setTarget(null)
  }

  /* --------------------------- 翻页手势 --------------------------- */
  const touchX = useRef<number | null>(null)
  const touchY = useRef<number | null>(null)
  const onTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.touches[0].clientX
    touchY.current = e.touches[0].clientY
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current === null || touchY.current === null) return
    const dx = e.changedTouches[0].clientX - touchX.current
    const dy = e.changedTouches[0].clientY - touchY.current
    touchX.current = null
    touchY.current = null
    // 只在横向意图明确时翻页，避免误触
    if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) next()
      else prev()
    }
  }

  const go = (nextIdx: number) => {
    stop()
    setTarget(null)
    setIdx(nextIdx)
  }
  const prev = () => go(Math.max(0, idx - 1))
  const next = () => go(Math.min((lessons?.length ?? 1) - 1, idx + 1))

  /* ------------------------------ 状态页 ------------------------------ */
  if (!lessons) {
    return (
      <div className="flex justify-center py-16 text-slate-400">
        <SpinnerIcon width={24} height={24} className="animate-spin" />
      </div>
    )
  }
  if (lessons.length === 0) {
    return (
      <div className="rounded-[26px] border border-dashed border-slate-300/70 py-16 text-center text-slate-400 dark:border-slate-700/70">
        该课程集没有教程
        <div className="mt-4">
          <button onClick={onBack} className="text-sm font-semibold text-brand-600 underline underline-offset-4">
            返回课程列表
          </button>
        </div>
      </div>
    )
  }
  if (!lesson) return null

  const wordClass = (key: string) => {
    const mark = lesson.marks[key]
    const base =
      'rounded px-0.5 transition active:bg-brand-500/25 focus:outline-none focus:ring-2 focus:ring-brand-300'
    if (mark === 'unknown') return `${base} bg-rose-500/15 text-rose-600 underline decoration-rose-400 dark:text-rose-300`
    if (mark === 'fuzzy') return `${base} bg-amber-500/15 text-amber-600 underline decoration-amber-400 dark:text-amber-300`
    if (mark === 'known') return `${base} bg-brand-500/15 text-brand-700 underline decoration-brand-400 dark:text-brand-300`
    return `${base} text-brand-700 underline decoration-brand-300 decoration-dotted underline-offset-4 dark:text-brand-300`
  }

  /** 任意英文词都可点：命中重点词高亮；其余词也用本地词典查词 */
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

  const pendingLesson = lesson.status !== 'ready'
  const displayWord = target?.text ?? ''
  const displayIpa = opened?.ipa || dictEntry?.ipa || ''
  const displayMeaning = opened?.meaning || dictEntry?.meaning || ''
  const lemma = dictEntry && dictEntry.word.toLowerCase() !== displayWord.toLowerCase() ? dictEntry.word : ''
  const fmt = formatMeta(lesson.kind)

  /* --------------------------- 阅读排版 --------------------------- */
  const segmentPlay = (seg: LessonSegment, extra = '') => (
    <button
      onClick={() => speak(stripWTags(seg.en), RATE)}
      className={`shrink-0 rounded-full p-1.5 text-brand-600 transition hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-500/10 ${extra}`}
      aria-label="朗读这句"
    >
      <PlayIcon width={14} height={14} />
    </button>
  )

  const renderStory = () => (
    <div className="space-y-4">
      {lesson.segments.map((seg, i) => (
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

  const renderDialogue = () => (
    <div className="space-y-4">
      {lesson.segments.map((seg, i) => (
        <div key={i}>
          <div className="rounded-[18px] border border-slate-200/50 bg-white/55 p-3.5 dark:border-slate-700/40 dark:bg-slate-800/35">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[11px] font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                {seg.speaker || (i % 2 === 0 ? 'A' : 'B')}
              </span>
              <div className="ml-auto">{segmentPlay(seg)}</div>
            </div>
            <p className="text-[15px] leading-relaxed text-slate-800 dark:text-slate-100">
              {renderNodes(seg.en)}
            </p>
          </div>
          {showZh && seg.zh && <p className="ml-3 mt-1 text-sm text-slate-400">{seg.zh}</p>}
        </div>
      ))}
    </div>
  )

  const renderPoem = () => (
    <div className="my-5 space-y-5 text-center font-display">
      {lesson.segments.map((seg, i) => (
        <div key={i}>
          <p className="text-[17px] italic leading-8 text-slate-800 dark:text-slate-100">
            {renderNodes(seg.en)}
          </p>
          {showZh && seg.zh && <p className="mt-1 text-xs leading-relaxed text-slate-400">{seg.zh}</p>}
        </div>
      ))}
    </div>
  )

  const renderEmail = () => (
    <div className="surface-inset p-4 font-display">
      <div className="mb-3 border-b hairline pb-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Subject</p>
        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{lesson.title}</p>
      </div>
      <div className="space-y-3">
        {lesson.segments.map((seg, i) => (
          <div key={i}>
            <div className="flex items-start justify-between gap-2">
              <p className="flex-1 whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800 dark:text-slate-100">
                {renderNodes(seg.en)}
              </p>
              {segmentPlay(seg, 'mt-0.5')}
            </div>
            {showZh && seg.zh && <p className="mt-1 text-xs leading-relaxed text-slate-400">{seg.zh}</p>}
          </div>
        ))}
      </div>
    </div>
  )

  const renderDiary = () => (
    <div className="rounded-[18px] border-l-[3px] border-amber-300 bg-amber-50/50 p-4 font-display dark:border-amber-500/40 dark:bg-amber-500/5">
      <div className="space-y-3">
        {lesson.segments.map((seg, i) => (
          <div key={i}>
            <div className="flex items-start justify-between gap-2">
              <p className="flex-1 whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800 dark:text-slate-100">
                {renderNodes(seg.en)}
              </p>
              {segmentPlay(seg, 'mt-0.5')}
            </div>
            {showZh && seg.zh && <p className="mt-1 text-xs leading-relaxed text-slate-400">{seg.zh}</p>}
          </div>
        ))}
      </div>
    </div>
  )

  const renderArticle = () => (
    <div className="space-y-4 font-display">
      {lesson.segments.map((seg, i) => (
        <div key={i}>
          <div className="flex items-start justify-between gap-2">
            <p
              className={`flex-1 whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800 dark:text-slate-100 ${
                i === 0
                  ? 'first-letter:float-left first-letter:mr-1.5 first-letter:text-4xl first-letter:font-black first-letter:leading-8'
                  : ''
              }`}
            >
              {renderNodes(seg.en)}
            </p>
            {segmentPlay(seg, 'mt-0.5')}
          </div>
          {showZh && seg.zh && (
            <p className="mt-1 text-xs leading-relaxed text-slate-400">{seg.zh}</p>
          )}
        </div>
      ))}
    </div>
  )

  const renderReadBody = () => {
    if (lesson.kind === 'dialogue') return renderDialogue()
    if (lesson.kind === 'poem') return renderPoem()
    if (lesson.kind === 'email') return renderEmail()
    if (lesson.kind === 'diary') return renderDiary()
    if (lesson.kind === 'article') return renderArticle()
    return renderStory()
  }

  /* ------------------------------ 正文 ------------------------------ */
  return (
    <div>
      {/* 顶部：本集进度（返回统一由页面栈标题栏负责） */}
      <div className="mb-3">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-xs font-semibold text-slate-600 dark:text-slate-300">
            第 {idx + 1} / {lessons.length} 篇
          </p>
          {set && set.total > 0 && (
            <p className="shrink-0 text-[11px] text-slate-400">已读 {readCount}/{set.total}</p>
          )}
        </div>
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-900/[0.07] dark:bg-white/10">
          <div
            className="h-full rounded-full bg-brand-500 transition-all duration-500 ease-spring"
            style={{ width: `${((idx + 1) / lessons.length) * 100}%` }}
          />
        </div>
      </div>

      <div
        className="surface p-5 sm:p-6"
        style={{ touchAction: 'pan-y' }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {pendingLesson ? (
          <div className="py-8 text-center">
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
              「{lesson.sceneLabel}」{lesson.status === 'pending' ? '待生成' : '生成失败'}
            </p>
            {lesson.error && <p className="mt-2 text-xs text-rose-500">{lesson.error}</p>}
            <p className="mt-2 text-xs text-slate-400">重点词 {lesson.words.length} 个</p>
            <button
              onClick={() => onRetrySingle(lesson.id)}
              disabled={busy}
              className="btn-primary mt-4 !px-5 disabled:opacity-60"
            >
              {busy ? <SpinnerIcon width={15} height={15} className="animate-spin" /> : <PlayIcon width={15} height={15} />}
              重新生成本篇
            </button>
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${fmt.badge}`}>
                    {fmt.emoji} {fmt.label}
                  </span>
                  <span className="text-xs text-slate-400">{lesson.sceneLabel}</span>
                  {lesson.readAt && (
                    <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                      已读
                    </span>
                  )}
                </div>
                <h2 className="mt-1.5 break-words font-display text-[24px] font-semibold leading-snug text-slate-800 dark:text-slate-100">
                  {lesson.title}
                </h2>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-400">
                  <span>重点词 {lesson.words.length}</span>
                  <span>已标 {markedCount}</span>
                  {lesson.coverage && lesson.coverage.hit < lesson.coverage.total && (
                    <span className="text-amber-600 dark:text-amber-400">
                      覆盖 {lesson.coverage.hit}/{lesson.coverage.total}
                    </span>
                  )}
                  {!!lesson.coverage?.realWords && (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      用词 {Math.round(((lesson.coverage.known ?? 0) / lesson.coverage.realWords) * 100)}% 来自你的词库
                    </span>
                  )}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1.5 self-end sm:self-auto">
                <div className="flex rounded-full border border-slate-200/60 bg-white/60 p-0.5 text-[11px] font-semibold dark:border-slate-700/50 dark:bg-slate-800/50">
                  {(['read', 'listen'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      className={`rounded-full px-2.5 py-1 transition duration-200 ${
                        mode === m
                          ? 'bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-900'
                          : 'text-slate-500 dark:text-slate-300'
                      }`}
                    >
                      {m === 'read' ? '阅读' : '听读'}
                    </button>
                  ))}
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
            </div>

            {mode === 'listen' ? (
              <LessonListen
                key={lesson.id}
                lines={lines}
                active={active}
                showZh={showZh}
                onToggleZh={() => setShowZh((v) => !v)}
                title={`听读 · ${fmt.label}`}
              />
            ) : (
              <>
                <p className="mb-3 rounded-[14px] bg-slate-900/[0.035] px-3 py-2 text-[11px] text-slate-400 dark:bg-white/5">
                  点或长按正文里任意单词查词；带下划线的是本篇重点词，可直接标记掌握程度。
                </p>
                {renderReadBody()}
              </>
            )}

            {/* 重点词一览 */}
            <p className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-slate-400">
              本篇重点词 · 点击标记
            </p>
            <div className="flex flex-wrap gap-1.5">
              {lesson.words.map((w) => (
                <button
                  key={w.key}
                  type="button"
                  onTouchStart={() => startPress(w.word, w.key)}
                  onTouchEnd={endPress}
                  onTouchCancel={endPress}
                  onMouseDown={() => startPress(w.word, w.key)}
                  onMouseUp={endPress}
                  onMouseLeave={endPress}
                  onContextMenu={(e) => e.preventDefault()}
                  onClick={() => tapWord(w.word, w.key)}
                  className={`inline-flex items-center gap-1 rounded-full border border-transparent px-2.5 py-1 text-xs font-medium transition ${wordClass(w.key)}`}
                >
                  {w.word}
                  {w.isReview && (
                    <span className="rounded-full bg-amber-200/70 px-1 text-[10px] font-bold text-amber-800 dark:bg-amber-400/25 dark:text-amber-200">
                      复习
                    </span>
                  )}
                  {lesson.marks[w.key] === 'known' && <CheckIcon width={11} height={11} className="-translate-y-px" />}
                </button>
              ))}
            </div>

            {/* 读完 → 下一篇 */}
            {idx < lessons.length - 1 && (
              <button
                onClick={next}
                className="btn-primary mt-6 w-full !rounded-[16px]"
              >
                读完这篇，去下一篇
                <SkipForwardIcon width={16} height={16} />
              </button>
            )}
          </>
        )}
      </div>

      {/* 翻页 */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          onClick={prev}
          disabled={idx === 0}
          className="btn-soft !rounded-full !py-2.5 disabled:opacity-35"
        >
          <SkipBackIcon width={16} height={16} />
          上一篇
        </button>
        <span className="text-[11px] text-slate-400">左右滑动翻页</span>
        <button
          onClick={next}
          disabled={idx === lessons.length - 1}
          className="btn-soft !rounded-full !py-2.5 disabled:opacity-35"
        >
          下一篇
          <SkipForwardIcon width={16} height={16} />
        </button>
      </div>

      {/* 点词查词弹层（任意词） */}
      <Sheet
        open={!!target}
        onClose={() => setTarget(null)}
        title={displayWord}
        subtitle={[displayIpa, lemma ? `原形 ${lemma}` : ''].filter(Boolean).join(' · ') || undefined}
        footer={
          opened ? (
            <div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => applyMark('unknown')}
                  className={`rounded-[14px] py-3 text-sm font-semibold transition active:scale-[0.98] ${
                    lesson.marks[opened.key] === 'unknown'
                      ? 'bg-rose-500 text-white'
                      : 'bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-500/15 dark:text-rose-300'
                  }`}
                >
                  不认识
                </button>
                <button
                  onClick={() => applyMark('fuzzy')}
                  className={`rounded-[14px] py-3 text-sm font-semibold transition active:scale-[0.98] ${
                    lesson.marks[opened.key] === 'fuzzy'
                      ? 'bg-amber-500 text-white'
                      : 'bg-amber-50 text-amber-600 hover:bg-amber-100 dark:bg-amber-500/15 dark:text-amber-300'
                  }`}
                >
                  模糊
                </button>
                <button
                  onClick={() => applyMark('known')}
                  className={`rounded-[14px] py-3 text-sm font-semibold transition active:scale-[0.98] ${
                    lesson.marks[opened.key] === 'known'
                      ? 'bg-brand-600 text-white'
                      : 'bg-brand-50 text-brand-700 hover:bg-brand-100 dark:bg-brand-500/15 dark:text-brand-300'
                  }`}
                >
                  已掌握
                </button>
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
                onClick={() => setTarget(null)}
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
            {opened ? (
              <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                本篇重点词
              </span>
            ) : (
              <span className="rounded-full bg-slate-900/5 px-2 py-0.5 text-[11px] text-slate-500 dark:bg-white/10 dark:text-slate-300">
                文中查词
              </span>
            )}
            {target && target.key && reviewKeys.has(target.key) && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                复习词
              </span>
            )}
          </div>

          <p className="mt-3 text-[15px] leading-relaxed text-slate-700 dark:text-slate-200">
            {displayMeaning || '本地词典未收录这个词'}
            {!displayMeaning && (
              <span className="mt-1 block text-xs text-slate-400">
                可以先用「朗读」听发音，或到「词库」搜索该词。
              </span>
            )}
          </p>

          {opened && lesson.marks[opened.key] && (
            <p className="mt-3 text-xs text-slate-400">
              当前标记：
              <span className="font-semibold">
                {lesson.marks[opened.key] === 'known'
                  ? '已掌握'
                  : lesson.marks[opened.key] === 'fuzzy'
                    ? '模糊'
                    : '不认识'}
              </span>
            </p>
          )}
        </div>
      </Sheet>
    </div>
  )
}
