import { useCallback, useEffect, useRef, useState } from 'react'
import {
  applyStudyGrade,
  buildStudySession,
  getDueCount,
  getTodayStudiedCount,
  goodIntervalDays,
  type StudyCard,
} from '../lib/study'
import { posShort } from '../lib/pos'
import { SpeakerBtn, LevelBadge, GradeBadge } from '../components/word'
import { DisplayModeToggle, useDisplayMode } from '../components/display'
import { useSpeech } from '../hooks/useSpeech'
import { appendWordEvent, directionFromDisplayMode } from '../lib/events'
import type { Route } from '../data/levels'
import { CheckIcon, RotateCcwIcon, XIcon, EyeIcon, EyeOffIcon } from '../components/icons'

type Stats = { again: number; good: number }
const EMPTY_STATS: Stats = { again: 0, good: 0 }

function shuffleCards<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * 复习页面：只有「认识 / 不认识」两态。
 * 布局：整页 flex-col 三段——顶部筛选常驻 + 中间闪卡独立滚动 + 底部判级按钮贴底。
 * 无滑动手势，判级完全依赖底部按钮。
 *
 * 三种显示模式下的内容策略（见用户第 3 条需求）：
 *  - zh  → 正面：中文释义 + 词性 + 等级 + 徽章；展开：英文词形+音标
 *  - en  → 正面：英文词形+音标 + 词性 + 等级 + 徽章；展开：中文释义
 *  - both→ 正面：英文词形+音标 + 中文释义 + 词性 + 等级 + 徽章；展开：双语例句
 */
export default function StudyView({
  route: _route = 'level',
  masteredSet,
  onApplyMark,
  active = true,
}: {
  route?: Route
  masteredSet: Set<string>
  onApplyMark: (words: string[], mode: 'add' | 'remove') => void
  active?: boolean
}) {
  const [shuffleOn, setShuffleOn] = useState(true)
  const [autoplay, setAutoplay] = useState(false)
  const [displayMode, setDisplayMode] = useDisplayMode()
  const [session, setSession] = useState<StudyCard[] | null>(null)
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [stats, setStats] = useState<Stats>({ ...EMPTY_STATS })
  const [dueCount, setDueCount] = useState(() => getDueCount())
  const [todayCount, setTodayCount] = useState(() => getTodayStudiedCount())
  const [shownAt, setShownAt] = useState(() => Date.now())
  const { speak, stop } = useSpeech()

  const masteredRef = useRef(masteredSet)
  masteredRef.current = masteredSet

  const refreshCounts = useCallback(() => {
    setDueCount(getDueCount())
    setTodayCount(getTodayStudiedCount())
  }, [])

  const buildDeck = useCallback(
    () =>
      buildStudySession({
        source: 'cefr',
        scope: 'all',
        wrongOnly: false,
        masteredOnly: true,
        masteredSet: masteredRef.current,
      }),
    [],
  )

  const loadDeck = useCallback(() => {
    const next = buildDeck()
    setSession(shuffleOn ? shuffleCards(next) : next)
    setIndex(0)
    setRevealed(false)
    setStats({ ...EMPTY_STATS })
    refreshCounts()
  }, [buildDeck, shuffleOn, refreshCounts])

  useEffect(() => {
    stop()
    loadDeck()
  }, [loadDeck, stop])

  useEffect(() => {
    if (!active) stop()
  }, [active, stop])

  useEffect(() => () => stop(), [stop])

  // 开启「朗读」后每次切到新卡片自动发音；中文模式下英文读完接中文释义。
  const autoplayKey = session?.[index]?.key
  useEffect(() => {
    if (!autoplay || !autoplayKey || !session) return
    const w = session[index]
    if (!w) return
    const t = window.setTimeout(() => {
      speak(w.word, 0.9, () => {
        if (displayMode === 'zh' && w.meaning) speak(w.meaning, 0.9, undefined, 'zh')
      })
    }, 200)
    return () => window.clearTimeout(t)
  }, [autoplay, autoplayKey, session, index, displayMode, speak])

  const startRound = () => {
    stop()
    loadDeck()
  }

  const gradeCard = useCallback(
    (grade: 'good' | 'again') => {
      const card = session?.[index]
      if (!card) return
      stop()

      applyStudyGrade(card.key, grade === 'good' ? 'good' : 'again')
      onApplyMark([card.word], grade === 'good' ? 'add' : 'remove')

      void appendWordEvent({
        word_key: card.key,
        word: card.word,
        direction: directionFromDisplayMode(displayMode),
        source: 'study',
        grade: grade === 'good' ? 'known' : 'unknown',
        reaction_ms: Date.now() - shownAt,
      }).catch((err) => console.error('写入学习事件失败:', err))

      setStats((s) => ({ ...s, [grade]: s[grade] + 1 }))
      setIndex((i) => i + 1)
      setRevealed(false)
      setShownAt(Date.now())
      refreshCounts()
    },
    [session, index, stop, onApplyMark, refreshCounts, shownAt, displayMode],
  )

  const done = index >= (session?.length ?? 0)
  const card = session?.[index]

  // session 为 null 表示牌堆还在加载，不能当成「本轮完成」渲染。
  if (!session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-400">
        正在准备复习卡片…
      </div>
    )
  }

  if (done || !card) {
    return (
      <FinishScreen
        stats={stats}
        dueCount={dueCount}
        todayCount={todayCount}
        onRestart={startRound}
        empty={session?.length === 0}
      />
    )
  }

  const isZh = displayMode === 'zh'
  const isEn = displayMode === 'en'
  const isBoth = displayMode === 'both'

  return (
    // 自己算高度：避开顶部 fixed 返回栏 + flex-col 三段式，顶/底固定、中间滚动
    <div
      className="flex flex-col overflow-hidden"
      style={{
        height:
          'calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 72px)',
      }}
    >
      {/* ── 1. 固定顶部筛选区（圆角卡片） ── */}
      <section className="shrink-0 px-3 pb-2 pt-1">
        <div className="flex items-center gap-1.5 rounded-[16px] border border-slate-200/70 bg-white/90 px-2.5 py-1.5 backdrop-blur-sm dark:border-white/[0.06] dark:bg-slate-900/90">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">筛选</p>

          <button
            onClick={() => setShuffleOn((v) => !v)}
            aria-pressed={shuffleOn}
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold transition ${
              shuffleOn
                ? 'bg-brand-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-slate-300'
            }`}
          >
            {shuffleOn ? '乱序' : '顺序'}
          </button>

          <button
            onClick={() => setAutoplay((v) => !v)}
            aria-pressed={autoplay}
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold transition ${
              autoplay
                ? 'bg-brand-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-slate-300'
            }`}
          >
            朗读 {autoplay ? '开' : '关'}
          </button>

          <DisplayModeToggle value={displayMode} onChange={setDisplayMode} className="ml-auto" />
        </div>
      </section>

      {/* ── 2. 卡片区：内容始终居上，超出才滚动 ── */}
      <section className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-2 pt-1">
        {/* 项目风格卡片：跟 WordDetailBody 对齐 */}
        <div className="rounded-[26px] border border-slate-200/60 bg-white/90 p-5 shadow-float dark:border-white/[0.06] dark:bg-slate-800/60">
          {/* 卡头：标题 inline 徽章 + 发音 + 眼睛 toggle */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              {/* zh 模式：正面中文释义 */}
              {isZh && card.meaning && (
                <p className="break-words font-display text-[24px] font-semibold leading-tight text-slate-900 dark:text-slate-50">
                  {card.meaning}
                </p>
              )}
              {/* en / both 模式：正面英文词形 */}
              {(isEn || isBoth) && (
                <p className="break-words font-display text-[30px] font-semibold leading-none tracking-tight text-slate-900 dark:text-slate-50">
                  {card.word}
                </p>
              )}

              {/* 音标（en/zh 模式单独一行；both 模式 inline 在词后） */}
              {card.ipa && (
                <p className={`${isBoth ? 'mt-0 inline text-[14px] text-slate-400' : 'mt-1.5 text-[13px] text-slate-400'}`}>
                  {card.ipa}
                </p>
              )}

              {/* 徽章行：词性 + 等级 + 发音喇叭 inline */}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <SpeakerBtn
                  text={card.word}
                  rate={0.85}
                  iconSize={18}
                  className="!h-8 !w-8 !bg-brand-50 !p-0 dark:!bg-brand-500/10"
                />
                {card.pos && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500 dark:bg-white/[0.08] dark:text-slate-300">
                    {posShort({ pos: card.pos, meaning: card.meaning })}
                  </span>
                )}
                {card.grade ? (
                  <GradeBadge grade={card.grade} />
                ) : (
                  card.level && <LevelBadge level={card.level} />
                )}
                {card.common && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                    常用词
                  </span>
                )}
              </div>

              {/* both 模式：正面就显示中文释义 */}
              {isBoth && card.meaning && (
                <p className="mt-2 text-[15px] font-semibold text-slate-700 dark:text-slate-200">
                  {card.meaning}
                </p>
              )}
            </div>

            {/* 眼睛图标 toggle */}
            <button
              type="button"
              onClick={() => setRevealed(!revealed)}
              aria-label={revealed ? '收起答案' : '显示答案'}
              className="shrink-0 rounded-full border border-slate-200/70 bg-white/80 p-2 text-slate-400 transition hover:text-slate-700 active:scale-95 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:text-slate-100"
            >
              {revealed ? (
                <EyeOffIcon width={18} height={18} />
              ) : (
                <EyeIcon width={18} height={18} />
              )}
            </button>
          </div>

          {/* reveal 揭示内容 */}
          {revealed && (
            <div className="mt-4 space-y-3 border-t border-slate-200/60 pt-4 dark:border-white/[0.06]">
              {/* zh 模式展开 → 英文词形音标（简化显示在卡头下方，不再单独一张卡） */}
              {isZh && (
                <div className="flex items-center gap-2">
                  <p className="font-display text-[20px] font-semibold leading-none tracking-tight text-slate-900 dark:text-slate-50">
                    {card.word}
                  </p>
                  {card.ipa && <span className="text-[12px] text-slate-400">{card.ipa}</span>}
                  <SpeakerBtn
                    text={card.word}
                    rate={0.85}
                    iconSize={14}
                    className="!h-6 !w-6 !bg-brand-50 !p-0 dark:!bg-brand-500/10"
                  />
                </div>
              )}

              {/* en 模式展开 → 中文释义 */}
              {isEn && card.meaning && (
                <p className="text-[15px] font-semibold leading-relaxed text-slate-800 dark:text-slate-100">
                  {card.meaning}
                </p>
              )}

              {/* 例句 */}
              {card.examples && card.examples.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                    例句
                  </p>
                  <ul className="space-y-2">
                    {card.examples.map((ex, i) => (
                      <li
                        key={i}
                        className="rounded-[16px] bg-[#f6f3ea]/80 px-3.5 py-2.5 dark:bg-slate-900/40"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[14px] leading-relaxed text-slate-800 dark:text-slate-100">
                            {ex.en || ''}
                          </p>
                          {ex.en && (
                            <SpeakerBtn
                              text={ex.en}
                              rate={0.9}
                              iconSize={14}
                              className="-mr-0.5 -mt-0.5 shrink-0 !p-1"
                            />
                          )}
                        </div>
                        {ex.zh && (
                          <p className="mt-1 text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">
                            {ex.zh}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── 3. 底部判级按钮：无背景块，整体上移，内容居中 ── */}
      <section className="shrink-0 px-3 pb-6 pt-1">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => gradeCard('again')}
            className="flex items-center justify-center gap-2 rounded-[14px] border border-rose-200/60 bg-rose-50/80 px-3 py-2.5 transition active:scale-[0.98] dark:border-rose-500/25 dark:bg-rose-500/10"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-500 text-white shadow-sm">
              <XIcon width={14} height={14} />
            </span>
            <div className="flex flex-col items-center">
              <span className="text-[12px] font-bold text-rose-600 dark:text-rose-300">
                不认识
              </span>
              <span className="text-[9px] text-rose-500/70">归入未掌握</span>
            </div>
          </button>
          <button
            type="button"
            onClick={() => gradeCard('good')}
            className="flex items-center justify-center gap-2 rounded-[14px] border border-brand-200/60 bg-brand-50/80 px-3 py-2.5 transition active:scale-[0.98] dark:border-brand-500/25 dark:bg-brand-500/10"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white shadow-sm">
              <CheckIcon width={14} height={14} />
            </span>
            <div className="flex flex-col items-center">
              <span className="text-[12px] font-bold text-brand-700 dark:text-brand-300">
                认识
              </span>
              <span className="text-[9px] text-brand-600/70">
                {card.stage === 'review'
                  ? `下次 ${goodIntervalDays(card.key)} 天后`
                  : '标记已掌握'}
              </span>
            </div>
          </button>
        </div>
      </section>
    </div>
  )
}

/* --------------------------- FinishScreen --------------------------- */

function FinishScreen({
  stats,
  dueCount,
  todayCount,
  onRestart,
  empty,
}: {
  stats: Stats
  dueCount: number
  todayCount: number
  onRestart: () => void
  empty?: boolean
}) {
  const total = stats.again + stats.good
  return (
    <div className="rounded-[26px] border border-slate-200/60 bg-white/85 p-6 text-center shadow-float dark:border-slate-700/50 dark:bg-slate-800/60">
      {empty ? (
        <>
          <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-50">
            还没有已掌握的词
          </h2>
          <p className="mt-1 text-[11px] text-slate-400">
            先去「背词」浏览并标记已掌握的词，就可以来复习了
          </p>
        </>
      ) : (
        <>
          <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-50">
            本轮复习完成
          </h2>
          <p className="mt-0.5 text-[11px] text-slate-400">
            今天已学 {todayCount} · 到期复习 {dueCount}
          </p>

          {total > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-[14px] border border-brand-200/60 bg-brand-50/60 py-2.5 dark:border-brand-500/20 dark:bg-brand-500/10">
                <p className="font-display text-lg font-semibold text-brand-700 dark:text-brand-300">
                  {stats.good}
                </p>
                <p className="text-[10px] text-brand-600/80 dark:text-brand-300/80">认识</p>
              </div>
              <div className="rounded-[14px] border border-rose-200/60 bg-rose-50/60 py-2.5 dark:border-rose-500/20 dark:bg-rose-500/10">
                <p className="font-display text-lg font-semibold text-rose-700 dark:text-rose-300">
                  {stats.again}
                </p>
                <p className="text-[10px] text-rose-600/80 dark:text-rose-300/80">不认识</p>
              </div>
            </div>
          )}
        </>
      )}

      <div className="mt-4 flex justify-center gap-3">
        <button onClick={onRestart} className="btn-primary !py-2.5 !text-[12px]">
          <RotateCcwIcon width={12} height={12} />
          再来一轮
        </button>
      </div>
    </div>
  )
}
