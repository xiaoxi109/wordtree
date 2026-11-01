import { useCallback, useEffect, useRef, useState } from 'react'
import { LEVELS } from '../data'
import { GRADES } from '../data/grades'
import { GradeBadge, LevelBadge, SpeakerBtn } from '../components/word'
import { DISPLAY_OPTIONS, DisplayModeToggle, useDisplayMode } from '../components/display'
import { Sheet } from '../components/Sheet'
import { useSpeech } from '../hooks/useSpeech'
import { getReviewWords, pushReviewWord, removeReviewWord } from '../lib/review'
import {
  applyStudyGrade,
  buildStudySession,
  getDueCount,
  getTodayStudiedCount,
  goodIntervalDays,
  type StudyCard,
  type StudyGrade,
  type StudyScope,
  type StudySource,
  type StudyStage,
} from '../lib/study'
import {
  BookOpenIcon,
  CheckCheckIcon,
  CheckIcon,
  ChevronRightIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  ShuffleIcon,
  SlidersIcon,
  SpinnerIcon,
  XIcon,
} from '../components/icons'

type Stats = Record<StudyGrade, number>
const EMPTY_STATS: Stats = { again: 0, hard: 0, good: 0 }

const STAGE_STYLE: Record<StudyStage, { label: string; className: string }> = {
  new: {
    label: '新词',
    className: 'bg-brand-100/80 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300',
  },
  review: {
    label: '复习',
    className: 'bg-slate-900/5 text-slate-500 dark:bg-white/10 dark:text-slate-300',
  },
  wrong: {
    label: '错词',
    className: 'bg-rose-100/80 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  },
}

const SWIPE_THRESHOLD = 84

function shuffleCards<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * 背词：只复习「已掌握」的词（全量，不再按 20 张分批）。
 * - 正面只看词 + 音标，先回忆，再显示释义 / 例句；
 * - 认识 / 模糊 / 不认识 → 写入 Leitner 复习计划；
 * - 模糊 / 不认识会进错词队列，但不取消「已掌握」标记；
 * - 支持乱序、自动连播、中英/英文/中文显示，以及左右滑动手势。
 */
export default function StudyView({
  masteredSet,
  onApplyMark,
  active = true,
}: {
  masteredSet: Set<string>
  onApplyMark: (words: string[], mode: 'add' | 'remove') => void
  /** 当前是否停在「学习」标签；切走时停止朗读 */
  active?: boolean
}) {
  const [source, setSource] = useState<StudySource>('cefr')
  const [scope, setScope] = useState<StudyScope>('all')
  const [wrongOnly, setWrongOnly] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [shuffleOn, setShuffleOn] = useState(true)
  const [autoplay, setAutoplay] = useState(false)
  const [displayMode, setDisplayMode] = useDisplayMode()
  const [session, setSession] = useState<StudyCard[] | null>(null)
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [stats, setStats] = useState<Stats>({ ...EMPTY_STATS })
  const [wrongCount, setWrongCount] = useState(() => getReviewWords().length)
  const [dueCount, setDueCount] = useState(() => getDueCount())
  const [todayCount, setTodayCount] = useState(() => getTodayStudiedCount())
  const [drag, setDrag] = useState(0)
  const wasActiveRef = useRef(active)
  const dragStartRef = useRef<number | null>(null)
  const { speak, stop } = useSpeech()

  // 组卡时用最新掌握集，但不把 masteredSet 放进 effect 依赖：
  // 否则每背一张（标记掌握）都会重建整组卡，打断当前进度。
  const masteredRef = useRef(masteredSet)
  masteredRef.current = masteredSet

  const refreshCounts = useCallback(() => {
    setWrongCount(getReviewWords().length)
    setDueCount(getDueCount())
    setTodayCount(getTodayStudiedCount())
  }, [])

  /** 当前组卡内容的指纹，用于判断回到页面时掌握集是否发生变化 */
  const deckKeysRef = useRef('')

  const buildDeck = useCallback(
    () =>
      buildStudySession({
        source,
        scope,
        wrongOnly,
        masteredSet: masteredRef.current,
        masteredOnly: !wrongOnly,
      }),
    [source, scope, wrongOnly],
  )

  /** 组卡：默认取该范围内全部已掌握词；错词本模式只出错词，最多 20 张 */
  const loadDeck = useCallback(() => {
    const next = buildDeck()
    deckKeysRef.current = next
      .map((c) => c.key)
      .sort()
      .join('|')
    setSession(shuffleOn ? shuffleCards(next) : next)
    setIndex(0)
    setRevealed(false)
    setStats({ ...EMPTY_STATS })
    setDrag(0)
    refreshCounts()
  }, [buildDeck, shuffleOn, refreshCounts])

  useEffect(() => {
    stop()
    loadDeck()
  }, [loadDeck, stop])

  useEffect(() => {
    if (!active) stop()
  }, [active, stop])

  // 回到学习页时刷新计数；若期间在词表 / AI 页新标记了已掌握词，重新组卡
  useEffect(() => {
    if (active && !wasActiveRef.current) {
      refreshCounts()
      const keys = buildDeck()
        .map((c) => c.key)
        .sort()
        .join('|')
      if (keys !== deckKeysRef.current) loadDeck()
    }
    wasActiveRef.current = active
  }, [active, buildDeck, loadDeck, refreshCounts])

  useEffect(() => () => stop(), [stop])

  const startRound = () => {
    stop()
    loadDeck()
  }

  const pickSource = (next: StudySource) => {
    if (next === source) return
    stop()
    setSource(next)
    setScope('all')
  }

  const gradeCard = (grade: StudyGrade) => {
    const card = session?.[index]
    if (!card) return
    stop()
    setDrag(0)

    applyStudyGrade(card.key, grade)
    if (grade === 'good') {
      onApplyMark([card.word], 'add')
      removeReviewWord(card.key)
    } else {
      // 复习时忘了也保留「已掌握」标记，只是进错词队列重点再过一遍
      pushReviewWord(
        { key: card.key, word: card.word, ipa: card.ipa, meaning: card.meaning },
        grade === 'again' ? 'unknown' : 'fuzzy',
      )
    }

    setStats((s) => ({ ...s, [grade]: s[grade] + 1 }))
    setIndex((i) => i + 1)
    setRevealed(false)
    refreshCounts()
  }

  const card = session && index < session.length ? session[index] : null
  const finished = session !== null && session.length > 0 && index >= session.length
  const empty = session !== null && session.length === 0
  const done = session ? Math.min(index, session.length) : 0
  const pct = session?.length ? Math.round((done / session.length) * 100) : 0
  const goodDays = card ? goodIntervalDays(card.key) : 1
  const showMeaning = displayMode !== 'en'
  const showExampleEn = displayMode !== 'zh'
  const showExampleZh = displayMode !== 'en'

  // 自动连播：换卡时自动读单词；显示中文时接着读释义
  useEffect(() => {
    if (!active || !autoplay || !card) return
    speak(card.word, 0.9, () => {
      if (displayMode !== 'en' && card.meaning) speak(card.meaning, 0.9, undefined, 'zh')
    })
  }, [active, autoplay, card, displayMode, speak])

  /* 手势：在卡片上左右拖动，越过阈值即评价 */
  const onTouchStart = (e: React.TouchEvent) => {
    dragStartRef.current = e.touches[0].clientX
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (dragStartRef.current === null) return
    setDrag(e.touches[0].clientX - dragStartRef.current)
  }
  const onTouchEnd = () => {
    if (dragStartRef.current !== null) {
      if (drag <= -SWIPE_THRESHOLD) gradeCard('again')
      else if (drag >= SWIPE_THRESHOLD) gradeCard('good')
      else setDrag(0)
    }
    dragStartRef.current = null
  }

  const togglePill = (on: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition active:scale-95 ${
      on
        ? 'bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-900'
        : 'border border-slate-200/60 bg-white/60 text-slate-500 hover:text-slate-900 dark:border-slate-700/50 dark:bg-slate-800/40 dark:text-slate-400'
    }`

  const scopeOptions: { id: StudyScope; label: string }[] =
    source === 'cefr'
      ? [{ id: 'all', label: '全部' }, ...LEVELS.map((l) => ({ id: l.id, label: l.label }))]
      : [{ id: 'all', label: '全部' }, ...GRADES.map((g) => ({ id: g.id, label: g.label }))]

  const displayLabel = DISPLAY_OPTIONS.find((o) => o.id === displayMode)?.label ?? '中英'
  const filterSummary = wrongOnly
    ? `错词本 · ${shuffleOn ? '乱序' : '顺序'} · ${displayLabel}`
    : `${source === 'cefr' ? 'CEFR' : '人教'} · ${
        scopeOptions.find((o) => o.id === scope)?.label ?? '全部'
      } · ${shuffleOn ? '乱序' : '顺序'} · ${displayLabel}`

  const segCls = (on: boolean) =>
    `rounded-[11px] px-2 py-2 text-xs font-bold transition duration-200 ${
      on
        ? 'bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-900'
        : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
    }`

  return (
    <div>
      {/* 范围 / 词库 / 错词本 / 顺序 / 显示 全部收进筛选弹层 */}
      <button
        onClick={() => setFilterOpen(true)}
        className="surface mb-3 flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition active:scale-[0.995]"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-slate-900/5 text-slate-600 dark:bg-white/10 dark:text-slate-300">
          <SlidersIcon width={16} height={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-bold text-slate-800 dark:text-slate-100">筛选</span>
          <span className="mt-0.5 block truncate text-[11px] text-slate-400">{filterSummary}</span>
        </span>
        {wrongCount > 0 && (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
              wrongOnly
                ? 'bg-rose-500 text-white'
                : 'bg-rose-50 text-rose-500 dark:bg-rose-500/10 dark:text-rose-300'
            }`}
          >
            错词 {wrongCount}
          </span>
        )}
        <ChevronRightIcon width={16} height={16} className="shrink-0 text-slate-300" />
      </button>

      <Sheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="复习筛选"
        subtitle="选范围、顺序与答案语言"
        footer={
          <button onClick={() => setFilterOpen(false)} className="btn-ink w-full !py-3">
            完成
          </button>
        }
      >
        <div className="space-y-4 pb-1">
          <div>
            <p className="eyebrow mb-2">复习对象</p>
            <div className="grid grid-cols-2 gap-1 rounded-[14px] bg-slate-900/[0.04] p-1 dark:bg-white/[0.06]">
              {[
                { id: false as const, label: `已掌握 ${masteredSet.size}` },
                { id: true as const, label: `错词本 ${wrongCount}` },
              ].map((o) => (
                <button
                  key={String(o.id)}
                  onClick={() => {
                    if (o.id === wrongOnly) return
                    stop()
                    setWrongOnly(o.id)
                  }}
                  aria-pressed={o.id === wrongOnly}
                  className={segCls(o.id === wrongOnly)}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {wrongOnly && (
              <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                只复习「不认识 / 模糊」的词；答「认识」会移出错词本。
              </p>
            )}
          </div>

          {!wrongOnly && (
            <>
              <div>
                <p className="eyebrow mb-2">词库</p>
                <div className="grid grid-cols-2 gap-1 rounded-[14px] bg-slate-900/[0.04] p-1 dark:bg-white/[0.06]">
                  {(
                    [
                      { id: 'cefr' as const, label: 'CEFR' },
                      { id: 'pep' as const, label: '人教' },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.id}
                      onClick={() => pickSource(t.id)}
                      aria-pressed={source === t.id}
                      className={segCls(source === t.id)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="eyebrow mb-2">范围</p>
                <div className="flex flex-wrap gap-1.5">
                  {scopeOptions.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => setScope(opt.id)}
                      aria-pressed={scope === opt.id}
                      className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition active:scale-95 ${
                        scope === opt.id
                          ? 'bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-900'
                          : 'border border-slate-200/60 bg-white/50 text-slate-500 hover:text-slate-900 dark:border-slate-700/50 dark:bg-slate-800/40 dark:text-slate-400 dark:hover:text-slate-100'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <div>
            <p className="eyebrow mb-2">顺序与播放</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setShuffleOn((v) => !v)}
                aria-pressed={shuffleOn}
                className={togglePill(shuffleOn)}
              >
                <ShuffleIcon width={14} height={14} />
                乱序
              </button>
              <button
                onClick={() => setAutoplay((v) => !v)}
                aria-pressed={autoplay}
                className={togglePill(autoplay)}
              >
                {autoplay ? <PauseIcon width={14} height={14} /> : <PlayIcon width={14} height={14} />}
                自动连播
              </button>
            </div>
          </div>

          <div>
            <p className="eyebrow mb-2">答案显示</p>
            <DisplayModeToggle
              value={displayMode}
              onChange={(m) => {
                setDisplayMode(m)
                // 切换后直接翻开当前卡，让效果立刻可见
                setRevealed(true)
              }}
            />
            <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
              中英：释义 + 双语例句；英文：只留英文；中文：只留中文释义。
            </p>
          </div>
        </div>
      </Sheet>

      {session === null ? (
        <div className="flex justify-center py-16 text-slate-400">
          <SpinnerIcon width={24} height={24} className="animate-spin" />
        </div>
      ) : empty ? (
        <EmptyState
          wrongOnly={wrongOnly}
          source={source}
          onBackToNew={() => setWrongOnly(false)}
          onSwapSource={() => pickSource(source === 'cefr' ? 'pep' : 'cefr')}
        />
      ) : finished ? (
        <FinishedState
          stats={stats}
          wrongCount={wrongCount}
          wrongOnly={wrongOnly}
          onAgain={startRound}
          onWrongOnly={() => setWrongOnly(true)}
          onBackToNew={() => setWrongOnly(false)}
        />
      ) : (
        card && (
          <div>
            <div className="mb-2 px-0.5">
              <div className="mb-1.5 flex items-center justify-between gap-2 text-xs font-semibold text-slate-500 dark:text-slate-300">
                <span className="min-w-0 truncate text-[11px]">
                  <span className="font-display text-sm tracking-tight">
                    第 {Math.min(index + 1, session.length)} / {session.length} 张
                  </span>
                  <span className="ml-2 font-normal text-slate-400">
                    今日 {todayCount} · 到期 {dueCount}
                  </span>
                </span>
                <button onClick={startRound} className="btn-ghost shrink-0 !px-2 !py-1 !text-[11px]">
                  <RotateCcwIcon width={12} height={12} />
                  重新开始
                </button>
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-slate-900/[0.07] dark:bg-white/10">
                <div
                  className="h-full rounded-full bg-brand-500 transition-all duration-500 ease-spring"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            <div
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
              onTouchCancel={onTouchEnd}
              style={{
                touchAction: 'pan-y',
                transform: `translateX(${drag}px) rotate(${drag * 0.015}deg)`,
                transition: dragStartRef.current === null ? 'transform 0.28s cubic-bezier(0.22,1,0.36,1)' : 'none',
              }}
              className="rounded-[26px] border border-slate-200/60 bg-white/85 p-4 shadow-float dark:border-slate-700/50 dark:bg-slate-800/60 sm:p-5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STAGE_STYLE[card.stage].className}`}>
                    {STAGE_STYLE[card.stage].label}
                    {card.stage === 'wrong' && (card.misses ?? 0) > 1 ? ` ×${card.misses}` : ''}
                  </span>
                  {card.level && <LevelBadge level={card.level} />}
                  {card.grade && (source === 'pep' || wrongOnly) && <GradeBadge grade={card.grade} />}
                  {masteredSet.has(card.word) && (
                    <span className="rounded-full border border-brand-200/60 bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-700 dark:border-brand-500/25 dark:bg-brand-500/15 dark:text-brand-300">
                      已掌握
                    </span>
                  )}
                </div>
                <SpeakerBtn
                  key={`${card.key}-${index}`}
                  text={card.word}
                  rate={0.9}
                  iconSize={18}
                  className="!h-9 !w-9 shrink-0 !bg-brand-50 !p-0 dark:!bg-brand-500/10"
                />
              </div>

              <div key={`${card.key}-${index}`} className="mt-4 animate-scale-in text-center">
                <p className="break-words font-display text-[32px] font-semibold leading-none tracking-tight text-slate-900 dark:text-slate-50 sm:text-[40px]">
                  {card.word}
                </p>
                {card.ipa && <p className="mt-1.5 text-[13px] text-slate-400">{card.ipa}</p>}
              </div>

              {!revealed ? (
                <div className="mt-4">
                  <p className="text-center text-[11px] text-slate-400">先在心里回忆它的意思，再看答案</p>
                  <button
                    onClick={() => setRevealed(true)}
                    className="btn-ink mt-3 w-full !rounded-[16px] !py-3 tracking-wide"
                  >
                    显示答案
                  </button>
                  <p className="mt-2 text-center text-[11px] text-slate-300 dark:text-slate-600">
                    也可以左滑「不认识」· 右滑「认识」
                  </p>
                </div>
              ) : (
                <div className="mt-3.5 animate-scale-in">
                  <div className="surface-inset p-3.5">
                    {showMeaning && (
                      <div className="flex items-start gap-2">
                        {card.pos && (
                          <span className="mt-0.5 shrink-0 rounded-md border border-slate-200/60 bg-white px-1.5 py-0.5 text-[11px] font-bold text-slate-500 dark:border-slate-700/50 dark:bg-slate-800 dark:text-slate-300">
                            {card.pos}
                          </span>
                        )}
                        <p className="min-w-0 flex-1 text-[15px] font-semibold leading-relaxed text-slate-800 dark:text-slate-100">
                          {card.meaning}
                        </p>
                      </div>
                    )}

                    {card.examples.length > 0 && (
                      <ul className={`space-y-2 ${showMeaning ? 'mt-2.5 border-t hairline pt-2.5' : ''}`}>
                        {card.examples.slice(0, showExampleZh ? 1 : 2).map((ex, i) => (
                          <li key={i} className="flex items-start gap-1">
                            <SpeakerBtn
                              key={`${card.key}-ex-${i}`}
                              text={ex.en}
                              rate={0.9}
                              className="-ml-1 shrink-0 !p-1"
                            />
                            <div className="min-w-0">
                              {showExampleEn && (
                                <p className="font-display text-[13px] leading-relaxed text-slate-700 dark:text-slate-200">
                                  {ex.en}
                                </p>
                              )}
                              {showExampleZh && <p className="text-[11px] leading-relaxed text-slate-400">{ex.zh}</p>}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <button
                      onClick={() => gradeCard('again')}
                      className="flex flex-col items-center gap-1 rounded-[18px] border border-rose-200/60 bg-rose-50/60 px-1 py-2.5 transition hover:bg-rose-100 active:scale-[0.98] dark:border-rose-500/25 dark:bg-rose-500/10"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-500 text-white shadow-sm">
                        <XIcon width={16} height={16} />
                      </span>
                      <span className="text-[13px] font-bold text-rose-600 dark:text-rose-300">不认识</span>
                      <span className="text-[10px] text-rose-500/80 dark:text-rose-300/70">10 分钟后</span>
                    </button>

                    <button
                      onClick={() => gradeCard('hard')}
                      className="flex flex-col items-center gap-1 rounded-[18px] border border-amber-200/60 bg-amber-50/60 px-1 py-2.5 transition hover:bg-amber-100 active:scale-[0.98] dark:border-amber-500/25 dark:bg-amber-500/10"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500 text-white shadow-sm">
                        <RotateCcwIcon width={16} height={16} />
                      </span>
                      <span className="text-[13px] font-bold text-amber-700 dark:text-amber-300">模糊</span>
                      <span className="text-[10px] text-amber-600/80 dark:text-amber-300/70">明天</span>
                    </button>

                    <button
                      onClick={() => gradeCard('good')}
                      className="flex flex-col items-center gap-1 rounded-[18px] border border-brand-200/60 bg-brand-50/60 px-1 py-2.5 transition hover:bg-brand-100 active:scale-[0.98] dark:border-brand-500/25 dark:bg-brand-500/10"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-white shadow-sm">
                        <CheckIcon width={16} height={16} />
                      </span>
                      <span className="text-[13px] font-bold text-brand-700 dark:text-brand-300">认识</span>
                      <span className="text-[10px] text-brand-600/80 dark:text-brand-300/70">{goodDays} 天后</span>
                    </button>
                  </div>

                  <p className="mt-1.5 text-center text-[10px] leading-relaxed text-slate-400">
                    认识 → 标记已掌握并移出错词本；模糊 / 不认识 → 进入错词本
                  </p>
                </div>
              )}
            </div>
          </div>
        )
      )}
    </div>
  )
}

function EmptyState({
  wrongOnly,
  source,
  onBackToNew,
  onSwapSource,
}: {
  wrongOnly: boolean
  source: StudySource
  onBackToNew: () => void
  onSwapSource: () => void
}) {
  return (
    <div className="rounded-[30px] border border-dashed border-slate-300/70 bg-white/35 px-6 py-16 text-center dark:border-slate-700/70 dark:bg-slate-800/20">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[18px] bg-accent-lime/30 text-slate-700 dark:bg-accent-lime/10 dark:text-accent-lime">
        <BookOpenIcon width={26} height={26} />
      </div>
      <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
        {wrongOnly ? '错词本还是空的' : '这个范围还没有已掌握的词'}
      </p>
      <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-slate-400">
        {wrongOnly
          ? '复习时点「不认识 / 模糊」的词会自动收进这里。'
          : '在 CEFR 或人教词表里点开单词、标记「已掌握」，这里就能整轮复习。'}
      </p>
      <button onClick={wrongOnly ? onBackToNew : onSwapSource} className="btn-ink mt-5 !px-5 !py-2.5">
        {wrongOnly ? '返回已掌握复习' : `换到${source === 'cefr' ? '人教' : 'CEFR'}词库看看`}
      </button>
    </div>
  )
}

function FinishedState({
  stats,
  wrongCount,
  wrongOnly,
  onAgain,
  onWrongOnly,
  onBackToNew,
}: {
  stats: Stats
  wrongCount: number
  wrongOnly: boolean
  onAgain: () => void
  onWrongOnly: () => void
  onBackToNew: () => void
}) {
  const total = stats.again + stats.hard + stats.good
  return (
    <div className="rounded-[30px] border border-slate-200/60 bg-white/85 p-7 text-center shadow-float dark:border-slate-700/50 dark:bg-slate-800/60">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[20px] bg-accent-lime/40 text-brand-800 dark:bg-accent-lime/15 dark:text-accent-lime">
        <CheckCheckIcon width={30} height={30} />
      </div>
      <h2 className="font-display text-xl font-semibold text-slate-900 dark:text-slate-50">本轮复习完成</h2>
      <p className="mt-1 text-xs text-slate-400">共判断 {total} 次</p>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <div className="rounded-[16px] border border-brand-200/60 bg-brand-50/60 py-3 dark:border-brand-500/20 dark:bg-brand-500/10">
          <p className="font-display text-xl font-semibold text-brand-700 dark:text-brand-300">{stats.good}</p>
          <p className="text-[11px] text-brand-600/80 dark:text-brand-300/80">认识</p>
        </div>
        <div className="rounded-[16px] border border-amber-200/60 bg-amber-50/60 py-3 dark:border-amber-500/20 dark:bg-amber-500/10">
          <p className="font-display text-xl font-semibold text-amber-700 dark:text-amber-300">{stats.hard}</p>
          <p className="text-[11px] text-amber-600/80 dark:text-amber-300/80">模糊</p>
        </div>
        <div className="rounded-[16px] border border-rose-200/60 bg-rose-50/60 py-3 dark:border-rose-500/20 dark:bg-rose-500/10">
          <p className="font-display text-xl font-semibold text-rose-700 dark:text-rose-300">{stats.again}</p>
          <p className="text-[11px] text-rose-600/80 dark:text-rose-300/80">不认识</p>
        </div>
      </div>

      {wrongCount > 0 && (
        <p className="mt-4 text-[11px] leading-relaxed text-slate-400">
          {wrongCount} 个词在错词本里；下次生成 AI 课程时会自动把它们编进文章。
        </p>
      )}

      <div className="mt-6 flex flex-col gap-2">
        <button onClick={onAgain} className="btn-ink !py-3.5">
          <RotateCcwIcon width={17} height={17} />
          再复习一轮
        </button>
        {wrongOnly ? (
          <button onClick={onBackToNew} className="btn-soft !py-2.5">
            返回已掌握复习
          </button>
        ) : (
          wrongCount > 0 && (
            <button
              onClick={onWrongOnly}
              className="rounded-[18px] border border-rose-200/60 bg-rose-50/60 py-2.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-100 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300"
            >
              去错词本（{wrongCount}）
            </button>
          )
        )}
      </div>
    </div>
  )
}
