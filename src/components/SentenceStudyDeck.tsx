import { useCallback, useEffect, useRef, useState } from 'react'
import { SENTENCE_SCENES, getScene, type SentenceSceneId } from '../data/sentences'
import {
  applySentenceGrade,
  buildSentenceSession,
  getSentenceDueCount,
  getSentenceTodayCount,
  SENTENCE_SESSION_SIZE,
} from '../lib/sentenceProgress'
import { useSpeech } from '../hooks/useSpeech'
import { SpeakerBtn } from './word'
import { CheckIcon, EyeIcon, EyeOffIcon, RotateCcwIcon, XIcon } from './icons'

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

type Stats = { good: number; again: number }

/**
 * 复习页的「短句」模式：正面只给中文，先想英文，点开才看答案。
 * 判级同时更新短句的已掌握状态与间隔重复记录。
 */
export function SentenceStudyDeck({
  active = true,
  onSwitch,
}: {
  active?: boolean
  onSwitch: () => void
}) {
  const [scene, setScene] = useState<SentenceSceneId | 'all'>('all')
  const [shuffleOn, setShuffleOn] = useState(true)
  const [autoplay, setAutoplay] = useState(false)
  const [session, setSession] = useState<ReturnType<typeof buildSentenceSession> | null>(null)
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [stats, setStats] = useState<Stats>({ good: 0, again: 0 })
  const [exhausted, setExhausted] = useState(false)
  const [dueCount, setDueCount] = useState(() => getSentenceDueCount())
  const [todayCount, setTodayCount] = useState(() => getSentenceTodayCount())
  const practicedRef = useRef<Set<string>>(new Set())
  const { speak, stop } = useSpeech()

  const refreshCounts = useCallback(() => {
    setDueCount(getSentenceDueCount())
    setTodayCount(getSentenceTodayCount())
  }, [])

  const buildDeck = useCallback(
    (limit = SENTENCE_SESSION_SIZE) => buildSentenceSession({ scene, limit }),
    [scene],
  )

  const loadDeck = useCallback(() => {
    stop()
    practicedRef.current.clear()
    setExhausted(false)
    const next = buildDeck()
    setSession(shuffleOn ? shuffle(next) : next)
    setIndex(0)
    setRevealed(false)
    setStats({ good: 0, again: 0 })
    refreshCounts()
  }, [buildDeck, shuffleOn, refreshCounts, stop])

  useEffect(() => { loadDeck() }, [loadDeck])
  useEffect(() => { if (!active) stop() }, [active, stop])
  useEffect(() => () => stop(), [stop])

  const card = session?.[index]

  // 「朗读」只在答案翻开后播，避免一上来就把英文念出来。
  useEffect(() => {
    if (!autoplay || !revealed || !card) return
    const t = window.setTimeout(() => speak(card.en, 0.9), 120)
    return () => window.clearTimeout(t)
  }, [autoplay, revealed, card?.id, speak])

  const grade = useCallback(
    (result: 'good' | 'again') => {
      if (!card) return
      stop()
      applySentenceGrade(card.id, result)
      practicedRef.current.add(card.id)
      setStats((s) => ({ ...s, [result]: s[result] + 1 }))
      setRevealed(false)
      refreshCounts()

      const nextIndex = index + 1
      if (nextIndex >= (session?.length ?? 0)) {
        // 补牌用更大的候选池：避免前 20 条恰好都已练过就误判为「练完了」。
        const more = buildDeck(SENTENCE_SESSION_SIZE * 5).filter((s) => !practicedRef.current.has(s.id)).slice(0, SENTENCE_SESSION_SIZE)
        if (more.length > 0) {
          const batch = shuffleOn ? shuffle(more) : more
          setSession((prev) => [...(prev ?? []), ...batch])
        } else {
          setExhausted(true)
        }
      }
      setIndex(nextIndex)
    },
    [card, index, session, buildDeck, shuffleOn, refreshCounts, stop],
  )

  const done = exhausted || (session?.length ?? 0) === 0

  const shell = 'flex flex-col overflow-hidden'
  const shellStyle = {
    height: 'calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 72px)',
  }

  if (!session) {
    return (
      <div className={shell} style={shellStyle}>
        <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
          正在准备短句卡片…
        </div>
      </div>
    )
  }

  if (done || !card) {
    const total = stats.good + stats.again
    return (
      <div className={shell} style={shellStyle}>
        <FilterBar
          scene={scene}
          setScene={setScene}
          shuffleOn={shuffleOn}
          setShuffleOn={setShuffleOn}
          autoplay={autoplay}
          setAutoplay={setAutoplay}
          onSwitch={onSwitch}
        />
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full rounded-[26px] border border-slate-200/60 bg-white/85 p-6 text-center shadow-float dark:border-white/[0.06] dark:bg-slate-800/60">
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-50">
              {total > 0 ? '这一组练完了' : '暂时没有可练的短句'}
            </h2>
            <p className="mt-1 text-[11px] text-slate-400">
              今日已练 {todayCount} 句 · 待复习 {dueCount} 句
              {total > 0 && ` · 正确率 ${Math.round((stats.good / total) * 100)}%`}
            </p>
            {total > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-[14px] border border-brand-200/60 bg-brand-50/60 py-2.5 dark:border-brand-500/20 dark:bg-brand-500/10">
                  <p className="font-display text-lg font-semibold text-brand-700 dark:text-brand-300">{stats.good}</p>
                  <p className="text-[10px] text-brand-600/80 dark:text-brand-300/80">认识</p>
                </div>
                <div className="rounded-[14px] border border-rose-200/60 bg-rose-50/60 py-2.5 dark:border-rose-500/20 dark:bg-rose-500/10">
                  <p className="font-display text-lg font-semibold text-rose-600 dark:text-rose-300">{stats.again}</p>
                  <p className="text-[10px] text-rose-500/80 dark:text-rose-300/80">不认识</p>
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={loadDeck}
              className="btn-primary mt-5 w-full !py-3"
            >
              <RotateCcwIcon width={15} height={15} />
              再来一组
            </button>
            <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
              去「短句」页按场景浏览，标记未掌握的句子会优先出现在这里
            </p>
          </div>
        </div>
      </div>
    )
  }

  const sceneMeta = getScene(card.scene)

  return (
    <div className={shell} style={shellStyle}>
      <FilterBar
        scene={scene}
        setScene={setScene}
        shuffleOn={shuffleOn}
        setShuffleOn={setShuffleOn}
        autoplay={autoplay}
        setAutoplay={setAutoplay}
        onSwitch={onSwitch}
      />

      <section className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-2 pt-1">
        <div className="mb-2 flex shrink-0 items-center justify-between px-1 text-[11px] text-slate-400">
          <span>
            已练 {stats.good + stats.again} · 认识{' '}
            <span className="font-semibold text-brand-600 dark:text-brand-300">{stats.good}</span>
            {' · '}不认识{' '}
            <span className="font-semibold text-rose-500 dark:text-rose-300">{stats.again}</span>
          </span>
          <span className="tabular-nums">
            {Math.min(index + 1, session.length)} / {session.length}
          </span>
        </div>

        <div className="flex flex-1 flex-col rounded-[26px] border border-slate-200/60 bg-white/90 p-5 shadow-float dark:border-white/[0.06] dark:bg-slate-800/60">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                心里想说的中文
              </p>
              <p className="mt-2 break-words font-display text-[24px] font-semibold leading-snug text-slate-900 dark:text-slate-50">
                {card.zh}
              </p>
              <p className="mt-2 text-[11px] text-slate-400">先想一下，这句英文怎么说？</p>
              <span className="mt-3 inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">
                {sceneMeta?.label ?? '日常短句'}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {/* 喇叭常驻卡片右上：不用先翻答案也能听发音 */}
              <SpeakerBtn
                text={card.en}
                rate={0.9}
                iconSize={17}
                className="!h-9 !w-9 !rounded-full !border !border-brand-200/70 !bg-brand-50 !p-0 dark:!border-brand-500/25 dark:!bg-brand-500/10"
              />
              <button
                type="button"
                onClick={() => setRevealed((v) => !v)}
                aria-label={revealed ? '收起答案' : '显示答案'}
                className="shrink-0 rounded-full border border-slate-200/70 bg-white/80 p-2 text-slate-400 transition hover:text-slate-700 active:scale-95 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300"
              >
                {revealed ? <EyeOffIcon width={18} height={18} /> : <EyeIcon width={18} height={18} />}
              </button>
            </div>
          </div>

          {revealed && (
            <div className="mt-4 border-t border-slate-200/60 pt-4 dark:border-white/[0.06]">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                直接说
              </p>
              <p className="mt-1.5 font-display text-[20px] font-semibold leading-snug text-brand-700 dark:text-brand-300">
                {card.en}
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="shrink-0 pb-10 pt-1">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => grade('again')}
            className="flex items-center justify-center gap-2.5 rounded-[16px] border border-rose-200/60 bg-rose-50/80 px-3 py-4 transition active:scale-[0.98] dark:border-rose-500/25 dark:bg-rose-500/10"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-500 text-white shadow-sm">
              <XIcon width={16} height={16} />
            </span>
            <div className="flex flex-col items-center">
              <span className="text-[13px] font-bold text-rose-600 dark:text-rose-300">不认识</span>
              <span className="text-[10px] text-rose-500/70">归入未掌握</span>
            </div>
          </button>
          <button
            type="button"
            onClick={() => grade('good')}
            className="flex items-center justify-center gap-2.5 rounded-[16px] border border-brand-200/60 bg-brand-50/80 px-3 py-4 transition active:scale-[0.98] dark:border-brand-500/25 dark:bg-brand-500/10"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white shadow-sm">
              <CheckIcon width={16} height={16} />
            </span>
            <div className="flex flex-col items-center">
              <span className="text-[13px] font-bold text-brand-700 dark:text-brand-300">认识</span>
              <span className="text-[10px] text-brand-600/70">标记已掌握</span>
            </div>
          </button>
        </div>
      </section>
    </div>
  )
}

function FilterBar({
  scene,
  setScene,
  shuffleOn,
  setShuffleOn,
  autoplay,
  setAutoplay,
  onSwitch,
}: {
  scene: SentenceSceneId | 'all'
  setScene: (v: SentenceSceneId | 'all') => void
  shuffleOn: boolean
  setShuffleOn: (v: boolean) => void
  autoplay: boolean
  setAutoplay: (v: boolean) => void
  onSwitch: () => void
}) {
  return (
    <section className="shrink-0 pb-2 pt-1">
      <div className="flex items-center gap-1.5 rounded-[16px] border border-slate-200/70 bg-white/90 px-2.5 py-1.5 backdrop-blur-sm dark:border-white/[0.06] dark:bg-slate-900/90">
        <div className="flex shrink-0 items-center rounded-full bg-slate-100 p-0.5 dark:bg-white/10">
          <button
            type="button"
            onClick={onSwitch}
            className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-slate-500 dark:text-slate-300"
          >
            单词
          </button>
          <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-semibold text-white">
            短句
          </span>
        </div>
        <select
          value={scene}
          onChange={(e) => setScene(e.target.value as SentenceSceneId | 'all')}
          aria-label="短句场景"
          className="min-w-0 flex-1 bg-transparent text-[11px] font-semibold text-slate-600 outline-none dark:text-slate-200"
        >
          <option value="all">全部场景</option>
          {SENTENCE_SCENES.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setShuffleOn(!shuffleOn)}
          aria-pressed={shuffleOn}
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold transition ${
            shuffleOn ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-slate-300'
          }`}
        >
          {shuffleOn ? '乱序' : '顺序'}
        </button>
        <button
          type="button"
          onClick={() => setAutoplay(!autoplay)}
          aria-pressed={autoplay}
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold transition ${
            autoplay ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-slate-300'
          }`}
        >
          朗读
        </button>
      </div>
    </section>
  )
}
