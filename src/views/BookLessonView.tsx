import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { BOOK_CATALOG } from '../data/generated/book-catalog'
import { loadBookLessons } from '../data/bookLoader'
import { loadMastered } from '../data/lexicons'
import { useBookAudio } from '../hooks/useBookAudio'
import { useBookEntry, useMarkLessonRead, useToggleFavorite } from '../hooks/useBookProgress'
import { lexiconIdForBook } from '../lib/bookProgress'
import { lookupWord } from '../lib/dict'
import { registerBack } from '../lib/back'
import type { BookLesson, BookSentence } from '../lib/bookTypes'
import type { Word } from '../data'
import BookCatalogPanel from './BookCatalogPanel'
import { SeekBar } from '../components/SeekBar'
import {
  CheckIcon,
  ChevronRightIcon,
  ListIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  SkipBackIcon,
  SkipForwardIcon,
  SpinnerIcon,
  StarIcon,
} from '../components/icons'

const RATES = [0.8, 1.0, 1.2]

/**
 * 书页：左侧篇目目录 + 右侧中英对照正文 + 底部播放条。
 * 课文与原书录音全部离线内置，长按单词可查词并标记掌握。
 */
export default function BookLessonView({
  bookId,
  lessonId,
  onBack,
  onOpenWord,
  onToast,
}: {
  bookId: string
  lessonId?: string
  onBack: () => void
  /** 打开全局统一的查词弹层；第二参为本册配套词表 id，掌握状态写回该词表 */
  onOpenWord: (w: Word, lexiconId?: string) => void
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}) {
  const meta = useMemo(() => BOOK_CATALOG.find((m) => m.id === bookId), [bookId])
  const [lessons, setLessons] = useState<BookLesson[] | null>(null)
  const [currentId, setCurrentId] = useState<string | null>(lessonId ?? null)
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [showZh, setShowZh] = useState(true)
  const [questionOpen, setQuestionOpen] = useState(true)
  const [autoNext, setAutoNext] = useState(true)
  const [mastered, setMastered] = useState<Set<string>>(new Set())

  const entry = useBookEntry(bookId)
  const markRead = useMarkLessonRead()
  const toggleFav = useToggleFavorite()
  const lexiconId = lexiconIdForBook(bookId)
  /** 上次学到哪一篇：打开书页时优先回到那一篇 */
  const lastIdRef = useRef<string | null>(entry.lastId ?? null)
  lastIdRef.current = entry.lastId ?? null

  /** 载入整册课文（本地 JSON，秒开） */
  useEffect(() => {
    let alive = true
    loadBookLessons(bookId)
      .then((list) => {
        if (!alive) return
        setLessons(list)
        setCurrentId((prev) => {
          if (prev) return prev
          const last = lastIdRef.current
          if (last && list.some((l) => l.id === last)) return last
          return list[0]?.id ?? null
        })
      })
      .catch(() => {
        if (alive) onToast('课文加载失败', 'error')
      })
    return () => {
      alive = false
    }
  }, [bookId, onToast])

  const current = useMemo(
    () => lessons?.find((l) => l.id === currentId) ?? null,
    [lessons, currentId],
  )

  /** 打开一篇即记为已学 */
  useEffect(() => {
    if (!currentId) return
    markRead(bookId, currentId)
  }, [bookId, currentId, markRead])

  /** 掌握词：与配套词表共享同一份数据 */
  const refreshMastered = useCallback(() => {
    setMastered(new Set(loadMastered(lexiconId).map((w) => w.toLowerCase())))
  }, [lexiconId])
  useEffect(() => {
    refreshMastered()
  }, [refreshMastered])

  /** 下一篇（用于「读完后自动续播」） */
  const nextIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!lessons || !currentId) {
      nextIdRef.current = null
      return
    }
    const idx = lessons.findIndex((l) => l.id === currentId)
    nextIdRef.current = idx >= 0 && idx + 1 < lessons.length ? lessons[idx + 1].id : null
  }, [lessons, currentId])

  const autoNextRef = useRef(autoNext)
  autoNextRef.current = autoNext
  const [autoPlayToken, setAutoPlayToken] = useState(0)

  const handleEnded = useCallback(() => {
    if (!autoNextRef.current) return
    const nextId = nextIdRef.current
    if (!nextId) return
    setCurrentId(nextId)
    setAutoPlayToken((t) => t + 1)
  }, [])

  const audio = useBookAudio({ lesson: current, bookId, onEnded: handleEnded })
  const playAllRef = useRef(audio.playAll)
  playAllRef.current = audio.playAll
  useEffect(() => {
    if (!autoPlayToken) return
    const timer = window.setTimeout(() => playAllRef.current(), 80)
    return () => window.clearTimeout(timer)
  }, [autoPlayToken])

  /* ---------------- 长按查词：直接打开全局统一的完整详情弹层 ---------------- */
  const pressTimer = useRef<number | null>(null)
  const longPressed = useRef(false)
  const endPress = () => {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }
  const startPress = (token: string) => {
    longPressed.current = false
    endPress()
    pressTimer.current = window.setTimeout(() => {
      longPressed.current = true
      // 屈折变体先经本地词典解析回规范词形；查不到时用 token 构造最小词条，
      // 例句 / 短语 / 近义词由全局详情弹层内的富字典按需补齐。
      const dictEntry = lookupWord(token)
      const word: Word = {
        word: dictEntry?.word ?? token,
        level: 'A1',
        ipa: dictEntry?.ipa ?? '',
        pos: '',
        meaning: dictEntry?.meaning ?? '本地词典未收录这个词',
        examples: [],
      }
      // 带上本册配套词表：弹层内「加入已掌握」写回该词表，与词库页进度共享
      onOpenWord(word, lexiconId)
    }, 420)
  }
  useEffect(() => endPress, [])

  /** Android 返回键：查词弹层在栈顶自行消费返回键，这里只负责退回书架 */
  const onBackRef = useRef(onBack)
  onBackRef.current = onBack
  useEffect(() => {
    return registerBack(() => {
      onBackRef.current()
    })
  }, [])
  /** 长按已弹词卡，松手后浏览器补发的 click 必须吞掉，否则会误触发句子播放 */
  const swallowLongPressClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (!longPressed.current) return
    longPressed.current = false
    e.stopPropagation()
  }

  /** 逐词渲染：词可长按查词；已掌握的词用品牌色轻染 */
  const renderTokens = (sentence: BookSentence) => {
    const nodes: ReactNode[] = []
    let prevEnd = 0
    sentence.tokens.forEach((t, i) => {
      // token 只覆盖非空白字符，中间的空格按原偏移补回来
      if (t.start > prevEnd) {
        nodes.push(<span key={`gap-${i}`}>{sentence.en.slice(prevEnd, t.start)}</span>)
      }
      if (!/^[A-Za-z]/.test(t.text)) {
        nodes.push(<span key={i}>{t.text}</span>)
      } else {
        const done = mastered.has(t.text.toLowerCase())
        nodes.push(
          <button
            key={i}
            type="button"
            onPointerDown={() => startPress(t.text)}
            onPointerUp={endPress}
            onPointerCancel={endPress}
            onPointerLeave={endPress}
            onContextMenu={(e) => e.preventDefault()}
            onClick={(e) => {
              swallowLongPressClick(e)
              e.currentTarget.blur()
            }}
            className={`word-token select-none rounded px-0.5 transition [-webkit-touch-callout:none] focus:outline-none ${
              done ? 'text-brand-700 dark:text-brand-300' : ''
            }`}
          >
            {t.text}
          </button>,
        )
      }
      prevEnd = t.end
    })
    if (prevEnd < sentence.en.length) {
      nodes.push(<span key="tail">{sentence.en.slice(prevEnd)}</span>)
    }
    return nodes
  }

  const sourceLabel =
    audio.source === 'local'
      ? '本地原声'
      : audio.source === 'remote'
        ? '远程原声'
        : audio.source === 'tts'
          ? 'AI 朗读'
          : audio.hasOrigin
            ? '原书录音'
            : '无录音'

  /** 倍速下拉 */
  const [rateOpen, setRateOpen] = useState(false)
  const rateMenuRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!rateOpen) return
    const close = (e: Event) => {
      const target = e.target as Node | null
      if (rateMenuRef.current && target && !rateMenuRef.current.contains(target)) setRateOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [rateOpen])

  const sentences = current?.sentences ?? []

  /** 上一句：本句已播 1.5 秒以上则重播本句，否则跳到上一句 */
  const playPrevSentence = useCallback(() => {
    const idx = audio.playingSentence
    if (idx < 0) {
      audio.playAll()
      return
    }
    const cur = sentences[idx]
    if (cur && cur.start !== undefined && audio.elapsed - cur.start > 1.5) {
      audio.seekToSentence(idx)
      return
    }
    audio.playSentence(Math.max(0, idx - 1))
  }, [audio, sentences])

  /** 下一句：到最后一句就停 */
  const playNextSentence = useCallback(() => {
    const idx = audio.playingSentence
    if (idx < 0) {
      audio.playAll()
      return
    }
    const next = idx + 1
    if (next >= sentences.length) {
      audio.stop()
      return
    }
    audio.playSentence(next)
  }, [audio, sentences])

  return (
    <div
      className="-mx-4 flex flex-col overflow-hidden"
      style={{ height: 'calc(100dvh - env(safe-area-inset-top) - 72px)' }}
    >
      {/* ---------------- 顶栏 ---------------- */}
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-200/60 px-3 py-2.5 dark:border-slate-700/50">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-semibold text-slate-800 dark:text-slate-100">
            {current?.title ?? meta?.name ?? '课文'}
          </p>
          <p className="truncate text-[11px] text-slate-400">
            {meta?.name ?? ''} · 第 {current?.index ?? '-'} 篇 · {meta?.level ?? ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowZh((v) => !v)}
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold transition active:scale-95 ${
            showZh
              ? 'bg-brand-50 text-brand-700 dark:bg-brand-400/20 dark:text-brand-100'
              : 'bg-slate-100/70 text-slate-500 dark:bg-white/5 dark:text-slate-400'
          }`}
        >
          {showZh ? '中英' : '仅英'}
        </button>
        {current && (
          <button
            type="button"
            onClick={() => toggleFav(bookId, current.id)}
            aria-label={entry.favIds.includes(current.id) ? '取消收藏' : '收藏本篇'}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition active:scale-95 ${
              entry.favIds.includes(current.id)
                ? 'border-amber-300/70 bg-amber-50 text-amber-500 dark:border-amber-500/30 dark:bg-amber-500/15'
                : 'border-slate-200/70 bg-white/70 text-slate-400 dark:border-slate-700/55 dark:bg-slate-800/50'
            }`}
          >
            <StarIcon width={15} height={15} />
          </button>
        )}
        <button
          type="button"
          onClick={() => setCatalogOpen(true)}
          aria-label="打开目录"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200/70 bg-white/70 text-slate-600 transition active:scale-95 md:hidden dark:border-slate-700/55 dark:bg-slate-800/50 dark:text-slate-300"
        >
          <ListIcon width={15} height={15} />
        </button>
      </div>

      {/* ---------------- 主体 ---------------- */}
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[248px] shrink-0 border-r border-slate-200/60 md:block dark:border-slate-700/50">
          {lessons && (
            <BookCatalogPanel
              lessons={lessons}
              currentId={currentId}
              readIds={new Set(entry.readIds)}
              favIds={new Set(entry.favIds)}
              onSelect={(id) => {
                setCurrentId(id)
                setCatalogOpen(false)
              }}
              onToggleFav={(id) => toggleFav(bookId, id)}
            />
          )}
        </aside>

        <main className="no-scrollbar min-w-0 flex-1 overflow-y-auto px-4 pb-8 pt-4">
          {!lessons ? (
            <div className="flex justify-center py-16 text-slate-400">
              <SpinnerIcon width={22} height={22} className="animate-spin" />
            </div>
          ) : !current ? (
            <p className="py-16 text-center text-sm text-slate-400">这一册还没有课文</p>
          ) : (
            <>
              <header>
                <h1 className="font-display text-[24px] font-bold tracking-tight text-slate-900 dark:text-slate-50">
                  {current.title}
                </h1>
                {current.titleZh && (
                  <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">{current.titleZh}</p>
                )}
              </header>
              {/* 课文自带的理解自检问题 */}
              {current.question && (
                <section className="mt-4 rounded-[18px] border border-brand-200/60 bg-brand-50/50 p-3.5 dark:border-brand-500/25 dark:bg-brand-500/10">
                  <button
                    type="button"
                    onClick={() => setQuestionOpen((v) => !v)}
                    className="flex w-full items-start gap-2 text-left"
                  >
                    <span className="mt-0.5 shrink-0 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                      Question
                    </span>
                    <span className="min-w-0 flex-1 text-[13.5px] font-medium leading-relaxed text-slate-700 dark:text-slate-200">
                      {current.question.en}
                    </span>
                  </button>
                  {questionOpen && current.question.zh && (
                    <p className="mt-2 pl-1 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
                      {current.question.zh}
                    </p>
                  )}
                </section>
              )}

              {current.people && current.people.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {current.people.map((p) => (
                    <span
                      key={p}
                      className="rounded-full border border-slate-200/70 bg-white/70 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500 dark:border-slate-700/55 dark:bg-slate-800/50 dark:text-slate-400"
                    >
                      {p}
                    </span>
                  ))}
                </div>
              )}

              {current.quote && (
                <blockquote className="mt-4 border-l-[3px] border-brand-300/80 pl-3.5 dark:border-brand-500/50">
                  <p className="text-[14px] leading-relaxed text-slate-600 dark:text-slate-300">{current.quote.en}</p>
                  {current.quote.zh && (
                    <p className="mt-1 text-[13px] leading-relaxed text-slate-400">{current.quote.zh}</p>
                  )}
                </blockquote>
              )}

              {/* 逐句中英对照 */}
              <div className="mt-5 space-y-3.5">
                {current.sentences.map((s, i) => {
                  const active = audio.playingSentence === i
                  return (
                    <div
                      key={i}
                      onClick={() => audio.playSentence(i)}
                      className={`cursor-pointer rounded-[12px] px-2 py-1 transition-colors ${
                        active
                          ? 'bg-brand-100/70 dark:bg-brand-500/15'
                          : 'hover:bg-slate-900/[0.03] dark:hover:bg-white/5'
                      }`}
                    >
                      <p className="text-[17px] leading-[1.75] text-slate-800 dark:text-slate-100">
                        {renderTokens(s)}
                      </p>
                      {showZh && s.zh && (
                        <p className="mt-1 text-[14.5px] leading-relaxed text-slate-500 dark:text-slate-400">
                          {s.zh}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </main>
      </div>
      {/* ---------------- 底部播放条（与 AI 阅读器同一套布局） ---------------- */}
      <div
        className="shrink-0 border-t border-slate-200/70 bg-white/95 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/95"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="px-4 pb-2 pt-2">
          <SeekBar
            elapsed={audio.elapsed}
            duration={audio.duration}
            leftLabel={sourceLabel}
            onSeek={audio.seekRatio}
          />

          {/* 三栏：左右各一个 chip，中间三个播放按钮严格居中于屏幕 */}
          <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div ref={rateMenuRef} className="relative flex min-w-0 justify-start">
              <button
                type="button"
                onClick={() => setRateOpen((v) => !v)}
                aria-expanded={rateOpen}
                aria-haspopup="listbox"
                title="选择倍速"
                className={`inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full border px-2 py-1 text-[11px] font-semibold transition active:scale-95 sm:px-2.5 ${
                  rateOpen
                    ? 'border-brand-400 bg-brand-50 text-brand-700 dark:border-brand-500/50 dark:bg-brand-500/15 dark:text-brand-300'
                    : 'border-slate-300/70 bg-white/70 text-slate-600 hover:border-brand-300 dark:border-slate-600 dark:bg-white/5 dark:text-slate-300'
                }`}
              >
                {audio.rate.toFixed(1)}×
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
                      aria-selected={audio.rate === r}
                      onClick={() => {
                        audio.setRate(r)
                        setRateOpen(false)
                      }}
                      className={`flex w-full items-center justify-between rounded-[10px] px-2.5 py-1.5 text-[12px] font-semibold transition ${
                        audio.rate === r
                          ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                          : 'text-slate-600 hover:bg-slate-900/5 dark:text-slate-300 dark:hover:bg-white/10'
                      }`}
                    >
                      {r.toFixed(1)}×
                      {audio.rate === r && <CheckIcon width={13} height={13} />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-center gap-3 sm:gap-6">
              <button
                type="button"
                onClick={playPrevSentence}
                aria-label="上一句"
                className="rounded-full p-2 text-slate-600 transition hover:bg-slate-900/5 dark:text-slate-200 dark:hover:bg-white/10"
              >
                <SkipBackIcon width={20} height={20} />
              </button>
              <button
                type="button"
                onClick={audio.toggle}
                aria-label={audio.playing ? '暂停' : '播放'}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-600 text-white shadow-soft transition active:scale-95 dark:border dark:border-brand-400/50 dark:bg-brand-500/15 dark:text-brand-200 dark:shadow-none"
              >
                {audio.playing ? <PauseIcon width={20} height={20} /> : <PlayIcon width={20} height={20} />}
              </button>
              <button
                type="button"
                onClick={playNextSentence}
                aria-label="下一句"
                className="rounded-full p-2 text-slate-600 transition hover:bg-slate-900/5 dark:text-slate-200 dark:hover:bg-white/10"
              >
                <SkipForwardIcon width={20} height={20} />
              </button>
            </div>

            <div className="flex min-w-0 justify-end">
              <button
                type="button"
                onClick={() => setAutoNext((v) => !v)}
                aria-pressed={autoNext}
                title={autoNext ? '读完后自动播下一篇' : '只播本篇'}
                className={`inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full border px-2 py-1 text-[11px] font-semibold transition active:scale-95 sm:px-2.5 ${
                  autoNext
                    ? 'border-brand-400/70 bg-brand-50 text-brand-700 dark:border-brand-400/45 dark:bg-brand-400/20 dark:text-brand-100'
                    : 'border-slate-300/70 bg-white/70 text-slate-600 hover:border-brand-300 dark:border-slate-600 dark:bg-white/5 dark:text-slate-300'
                }`}
              >
                <RotateCcwIcon width={11} height={11} className="shrink-0" />
                <span className="min-w-0 truncate">{autoNext ? '续播' : '单篇'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ---------------- 窄屏目录抽屉 ---------------- */}
      {catalogOpen && lessons && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setCatalogOpen(false)}
            aria-hidden
          />
          <div className="absolute inset-y-0 left-0 w-[84%] max-w-[320px] bg-white shadow-float dark:bg-slate-900">
            <BookCatalogPanel
              lessons={lessons}
              currentId={currentId}
              readIds={new Set(entry.readIds)}
              favIds={new Set(entry.favIds)}
              onSelect={(id) => {
                setCurrentId(id)
                setCatalogOpen(false)
              }}
              onToggleFav={(id) => toggleFav(bookId, id)}
              onClose={() => setCatalogOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
