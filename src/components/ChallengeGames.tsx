import { useEffect, useRef, useState } from 'react'
import { useSpeech } from '../hooks/useSpeech'
import { useChallengeSession } from '../hooks/useChallengeSession'
import { STAR_LABELS, shuffle, type ChallengeGameDef, type ChallengeQuestion, type ChallengeWord } from '../lib/challenge'
import { generateAndCacheAiItems, poolSignature } from '../lib/aiQuiz'
import { getBattleReport, generateBattleReport } from '../lib/battleReport'
import { getNote, ensureNote } from '../lib/aiNotes'
import { SpeakerBtn } from './word'
import { CheckIcon, XIcon, SparklesIcon, RotateCcwIcon, StarIcon, HeadphonesIcon, ChevronRightIcon } from './icons'

/**
 * 闯关玩法组件。
 *
 * 三种玩法共用 useChallengeSession 的出题 / 计时 / 判分 / 回流流程，
 * 差别只在题目区与作答方式：
 *  - word-pick   看英文选中文释义
 *  - listen-pick 只听发音选英文单词
 *  - spell       看中文释义拼写单词
 */

export interface ChallengeProps {
  /** 当前玩法定义 */
  def: ChallengeGameDef
  /** 关卡序号（0 起） */
  level: number
  /** 可出题的词池 */
  pool: ChallengeWord[]
  /** 答对时回调（用于标记已掌握） */
  onMaster?: (word: ChallengeWord) => void
  /** 返回关卡列表 */
  onExit: () => void
  /** 进入下一关（已解锁时） */
  onNextLevel?: () => void
  /** 预生成的题目（AI 出题） */
  preset?: ChallengeQuestion[]
  /** AI 剧情的当前章节 */
  chapter?: { intro: string; rival: string; clear: string }
}

/* ───────────────────────── 共享外框 ───────────────────────── */

function ProgressBar({
  index,
  total,
  score,
  streak,
}: {
  index: number
  total: number
  score: number
  streak: number
}) {
  return (
    <div className="mb-3 px-0.5">
      <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-300">
        <span className="font-display text-sm tracking-tight">
          第 {index + 1} / {total} 题
        </span>
        <span className="flex items-center gap-2 text-[11px] text-slate-400">
          {streak >= 2 && <span className="font-semibold text-amber-500">连对 {streak}</span>}
          <span>已答对 {score}</span>
        </span>
      </div>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-900/[0.07] dark:bg-white/10">
        <div
          className="h-full rounded-full bg-violet-500 transition-all duration-300"
          style={{ width: `${((index + 1) / total) * 100}%` }}
        />
      </div>
    </div>
  )
}

/* ───────────────────────── 结算页 ───────────────────────── */

function ResultPanel({
  session,
  def,
  level,
  clearLine,
  onRestart,
  onExit,
  onNextLevel,
}: {
  session: ReturnType<typeof useChallengeSession>
  def: ChallengeGameDef
  level: number
  clearLine?: string
  onRestart: () => void
  onExit: () => void
  onNextLevel?: () => void
}) {
  const pct = Math.round((session.score / session.total) * 100)
  const mistakeNotes = session.mistakes.map((m) => ({ ...m, note: getNote(m.word) }))
  const reportInput = {
    game: def.title,
    level,
    score: session.score,
    total: session.total,
    stars: session.stars,
    avgMs: session.avgMs,
    bestStreak: session.bestStreak,
    wrongWords: session.mistakes.map((m) => m.word),
  }
  const [report, setReport] = useState<string>(() => getBattleReport(reportInput) ?? '')

  useEffect(() => {
    let alive = true
    void generateBattleReport(reportInput).then((r) => {
      if (alive) setReport(r)
    })
    return () => {
      alive = false
    }
    // reportInput 每次渲染都是新对象；只在结算时生成一次即可
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.finished])

  // 结算时给还没讲解的错词补一次生成（下次遇到就能直接显示）
  useEffect(() => {
    for (const m of session.mistakes) {
      if (!getNote(m.word)) void ensureNote(m.word, m.meaning)
    }
  }, [session.mistakes])

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-[24px] bg-violet-100 dark:bg-violet-500/15">
        <SparklesIcon width={36} height={36} className="text-violet-600 dark:text-violet-300" />
      </div>

      <div>
        <div className="flex items-center justify-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <StarIcon
              key={i}
              width={30}
              height={30}
              filled={i < session.stars}
              className={i < session.stars ? 'text-amber-400' : 'text-slate-300/60 dark:text-slate-600'}
            />
          ))}
        </div>
        <p className="mt-2 text-base font-bold text-slate-900 dark:text-slate-50">
          {STAR_LABELS[session.stars]}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          第 {level + 1} 关 · 答对 {session.score} / {session.total} · {pct}%
        </p>
      </div>

      {/* 剧情通关台词 */}
      {clearLine && (
        <p className="w-full max-w-[330px] rounded-[12px] border border-fuchsia-200/60 bg-white/70 px-3 py-2 text-center text-[12px] leading-relaxed text-fuchsia-700 dark:border-fuchsia-500/25 dark:bg-white/[0.04] dark:text-fuchsia-300">
          {clearLine}
        </p>
      )}

      {/* AI 战报 */}
      {report && (
        <div className="w-full max-w-[330px] rounded-[16px] border border-fuchsia-200/60 bg-fuchsia-50/70 p-3 text-left dark:border-fuchsia-500/25 dark:bg-fuchsia-500/10">
          <p className="mb-1 flex items-center gap-1 text-[10px] font-bold text-fuchsia-600 dark:text-fuchsia-300">
            <SparklesIcon width={12} height={12} />
            AI 战报
          </p>
          <p className="text-[12px] leading-relaxed text-slate-700 dark:text-slate-200">{report}</p>
        </div>
      )}

      <div className="grid w-full grid-cols-3 gap-2">
        <div className="rounded-[14px] border border-slate-200/70 bg-white/70 py-2.5 dark:border-white/10 dark:bg-white/[0.04]">
          <p className="font-display text-[15px] font-bold text-slate-800 dark:text-slate-100">
            {(session.avgMs / 1000).toFixed(1)}s
          </p>
          <p className="mt-0.5 text-[10px] text-slate-400">平均用时</p>
        </div>
        <div className="rounded-[14px] border border-slate-200/70 bg-white/70 py-2.5 dark:border-white/10 dark:bg-white/[0.04]">
          <p className="font-display text-[15px] font-bold text-slate-800 dark:text-slate-100">
            {(session.bestMs / 1000).toFixed(1)}s
          </p>
          <p className="mt-0.5 text-[10px] text-slate-400">最快一题</p>
        </div>
        <div className="rounded-[14px] border border-slate-200/70 bg-white/70 py-2.5 dark:border-white/10 dark:bg-white/[0.04]">
          <p className="font-display text-[15px] font-bold text-slate-800 dark:text-slate-100">
            {session.bestStreak}
          </p>
          <p className="mt-0.5 text-[10px] text-slate-400">最高连对</p>
        </div>
      </div>

      <p className="max-w-[280px] text-[11px] leading-relaxed text-slate-400">
        答对的词已安排进复习计划，答错的词进了错词本
      </p>

      {/* 错题讲解 */}
      {mistakeNotes.length > 0 && (
        <div className="w-full max-w-[340px] rounded-[16px] border border-slate-200/70 bg-white/80 p-3 text-left dark:border-white/10 dark:bg-white/[0.04]">
          <p className="mb-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300">
            错题讲解（{mistakeNotes.length}）
          </p>
          <ul className="space-y-1.5">
            {mistakeNotes.map((m) => (
              <li key={m.word} className="text-[12px] leading-relaxed">
                <span className="font-display font-bold text-slate-800 dark:text-slate-100">{m.word}</span>
                <span className="text-slate-400"> · {m.meaning}</span>
                {m.note && (
                  <span className="mt-0.5 block text-[11px] text-amber-700 dark:text-amber-300">{m.note}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button onClick={onRestart} className="btn-ink flex items-center gap-1.5 !px-6 !py-3">
          <RotateCcwIcon width={16} height={16} />
          再来一局
        </button>
        {onNextLevel && (
          <button onClick={onNextLevel} className="btn-soft flex items-center gap-1.5 !px-5 !py-3">
            下一关
            <ChevronRightIcon width={15} height={15} />
          </button>
        )}
        <button onClick={onExit} className="btn-soft !px-6 !py-3">
          返回关卡
        </button>
      </div>
    </div>
  )
}

/* ───────────────────────── 选择题玩法 ───────────────────────── */

function ChoiceGame({ def, level, pool, onMaster, onExit, onNextLevel, preset, chapter }: ChallengeProps) {
  const session = useChallengeSession({ def, level, pool, onMaster, preset })
  const { speak } = useSpeech()
  const spokenFor = useRef<string | null>(null)
  const [note, setNote] = useState<string | undefined>(undefined)

  // 听音辨词：换题后自动播一次发音（同一单词只播一次，避免重复触发）
  useEffect(() => {
    if (def.id !== 'listen-pick' || !session.question) return
    const w = session.question.target.word
    if (spokenFor.current === w) return
    spokenFor.current = w
    const t = window.setTimeout(() => void speak(w, 0.85), 220)
    return () => window.clearTimeout(t)
  }, [def.id, session.question, speak])

  // 换题时清掉讲解
  useEffect(() => {
    setNote(undefined)
  }, [session.index])

  // 答错时展示讲解：优先用题目自带的，其次用缓存；都没有则后台生成（下次遇到即可见）
  useEffect(() => {
    if (!session.judged || session.correct !== false || !session.question) return
    const q = session.question
    const cached = q.note ?? getNote(q.target.word)
    if (cached) {
      setNote(cached)
      return
    }
    let alive = true
    void ensureNote(q.target.word, q.target.meaning).then((n) => {
      if (alive && n) setNote(n)
    })
    return () => {
      alive = false
    }
  }, [session.judged, session.correct, session.question])

  if (session.finished) {
    return (
      <ResultPanel
        session={session}
        def={def}
        level={level}
        clearLine={chapter?.clear}
        onRestart={session.restart}
        onExit={onExit}
        onNextLevel={onNextLevel}
      />
    )
  }

  const q = session.question
  if (!q) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
        暂时没有可出题的单词
      </div>
    )
  }

  const isWord = def.optionKind === 'word'
  const aiKind = q.kind
  const isAiKind = !!aiKind && aiKind !== 'meaning'
  // AI 题型考的是「选哪个英文词」，所以答案与选项用词形；听音辨词也是词形
  const answerText = isWord || isAiKind ? q.target.word : q.target.meaning

  const AI_KIND_LABEL: Record<string, string> = {
    cloze: '选出填入空格的单词',
    synonym: '选出意思最接近的词',
    antonym: '选出意思相反的词',
    root: '根据词根线索猜出单词',
  }

  return (
    <div className="flex flex-1 flex-col">
      {chapter?.rival && (
        <p className="mb-2 truncate rounded-[10px] bg-fuchsia-50 px-2.5 py-1.5 text-[11px] font-semibold text-fuchsia-700 dark:bg-fuchsia-500/10 dark:text-fuchsia-300">
          {chapter.rival}
        </p>
      )}
      <ProgressBar index={session.index} total={session.total} score={session.score} streak={session.streak} />

      <div className="flex flex-1 flex-col items-center justify-center">
        <div className="w-full rounded-[26px] border border-slate-200/60 bg-white/85 p-6 text-center shadow-card dark:border-slate-700/50 dark:bg-slate-800/60">
          {isWord ? (
            <>
              <button
                onClick={() => void speak(q.target.word, 0.85)}
                className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-600 text-white shadow-soft transition active:scale-95"
                aria-label="再听一次"
              >
                <HeadphonesIcon width={28} height={28} />
              </button>
              <p className="mt-4 text-[11px] text-slate-400">听发音，选出正确的单词</p>
            </>
          ) : isAiKind ? (
            <>
              <span className="inline-flex rounded-full bg-fuchsia-100 px-2 py-0.5 text-[10px] font-bold text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300">
                AI · {aiKind === 'cloze' ? '情境填空' : aiKind === 'synonym' ? '近义辨析' : aiKind === 'antonym' ? '反义对决' : '词根推理'}
              </span>
              {aiKind === 'cloze' || aiKind === 'root' ? (
                <p className="mt-3 break-words text-[19px] font-semibold leading-relaxed text-slate-900 dark:text-slate-50">
                  {q.promptText}
                </p>
              ) : (
                <p className="mt-3 break-words font-display text-[36px] font-semibold leading-none tracking-tight text-slate-900 dark:text-slate-50">
                  {q.target.word}
                </p>
              )}
              {aiKind !== 'cloze' && q.target.ipa && (
                <p className="mt-2 text-[13px] text-slate-400">{q.target.ipa}</p>
              )}
              <div className="mt-3 flex justify-center">
                <SpeakerBtn text={q.target.word} iconSize={18} className="!h-9 !w-9" />
              </div>
              <p className="mt-3 text-[11px] text-slate-400">{AI_KIND_LABEL[aiKind ?? '']}</p>
            </>
          ) : (
            <>
              <p className="break-words font-display text-[40px] font-semibold leading-none tracking-tight text-slate-900 dark:text-slate-50">
                {q.target.word}
              </p>
              {q.target.ipa && <p className="mt-2 text-[13px] text-slate-400">{q.target.ipa}</p>}
              <div className="mt-4 flex justify-center">
                <SpeakerBtn text={q.target.word} iconSize={18} className="!h-9 !w-9" />
              </div>
              <p className="mt-4 text-[11px] text-slate-400">选出正确的中文释义</p>
            </>
          )}
        </div>

        <div className="mt-4 grid w-full grid-cols-1 gap-2.5">
          {q.options.map((opt) => {
            const isCorrect = opt === answerText
            const isPicked = session.picked === opt
            const state = !session.judged
              ? ''
              : isCorrect
                ? 'border-violet-300 bg-violet-100 text-violet-700 dark:border-violet-500/40 dark:bg-violet-500/15 dark:text-violet-200'
                : isPicked
                  ? 'border-rose-300 bg-rose-100 text-rose-600 dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-200'
                  : 'border-slate-200/60 bg-white text-slate-500 opacity-60 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-400'
            return (
              <button
                key={opt}
                disabled={session.judged}
                onClick={() => session.choose(opt)}
                className={`flex items-center justify-between gap-2 rounded-[16px] border px-4 py-3 text-left text-[15px] font-semibold transition active:scale-[0.99] dark:border-white/10 dark:bg-white/[0.04] ${state}`}
              >
                <span className="min-w-0 flex-1 break-words">{opt}</span>
                {session.judged && (isPicked || isCorrect) && (
                  <span className="shrink-0">
                    {isCorrect ? (
                      <CheckIcon width={16} height={16} className="text-violet-600 dark:text-violet-300" />
                    ) : (
                      <XIcon width={16} height={16} className="text-rose-500 dark:text-rose-300" />
                    )}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* 讲解：答错时给出要点（AI 生成并缓存） */}
        {session.judged && session.correct === false && note && (
          <div className="mt-3 w-full rounded-[14px] bg-amber-50 px-4 py-2.5 text-[12px] leading-relaxed text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
            <span className="font-bold">AI 讲解：</span>
            {note}
          </div>
        )}
      </div>
    </div>
  )
}

/* ───────────────────────── 拼写玩法 ───────────────────────── */

function SpellGameInner({ def, level, pool, onMaster, onExit, onNextLevel, chapter }: ChallengeProps) {
  const session = useChallengeSession({ def, level, pool, onMaster })
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setText('')
    inputRef.current?.focus()
  }, [session.index])

  const submit = () => {
    if (!text.trim() || session.judged) return
    session.submit(text)
  }

  if (session.finished) {
    return (
      <ResultPanel
        session={session}
        def={def}
        level={level}
        clearLine={chapter?.clear}
        onRestart={() => {
          setText('')
          session.restart()
        }}
        onExit={onExit}
        onNextLevel={onNextLevel}
      />
    )
  }

  const q = session.question
  if (!q) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
        暂时没有可出题的单词
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col">
      {chapter?.rival && (
        <p className="mb-2 truncate rounded-[10px] bg-fuchsia-50 px-2.5 py-1.5 text-[11px] font-semibold text-fuchsia-700 dark:bg-fuchsia-500/10 dark:text-fuchsia-300">
          {chapter.rival}
        </p>
      )}
      <ProgressBar index={session.index} total={session.total} score={session.score} streak={session.streak} />

      <div className="flex flex-1 flex-col items-center justify-center">
        <div className="w-full rounded-[26px] border border-slate-200/60 bg-white/85 p-6 text-center shadow-card dark:border-slate-700/50 dark:bg-slate-800/60">
          <p className="break-words font-display text-[24px] font-semibold leading-tight text-slate-900 dark:text-slate-50">
            {q.target.meaning}
          </p>
          {q.target.ipa && <p className="mt-1.5 text-[13px] text-slate-400">{q.target.ipa}</p>}
          <p className="mt-4 font-display text-[22px] font-bold tracking-[0.2em] text-brand-600 dark:text-brand-300">
            {q.hint}
          </p>
          <p className="mt-2 text-[11px] text-slate-400">按提示补全单词</p>
        </div>

        <div className="mt-4 w-full">
          <input
            ref={inputRef}
            value={text}
            disabled={session.judged}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
            }}
            placeholder="输入英文单词"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="w-full rounded-[16px] border border-slate-200/70 bg-white px-4 py-3 text-[17px] font-semibold tracking-wide text-slate-900 outline-none transition placeholder:text-[13px] placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-300 focus:border-brand-400 disabled:opacity-70 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100 dark:placeholder:text-slate-500"
          />

          {session.judged ? (
            <div
              className={`mt-3 flex items-center justify-center gap-2 rounded-[16px] px-4 py-3 text-[14px] font-semibold ${
                session.correct
                  ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200'
                  : 'bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-200'
              }`}
            >
              {session.correct ? <CheckIcon width={16} height={16} /> : <XIcon width={16} height={16} />}
              <span>
                {session.correct ? '拼对了' : '正确答案'}
                <span className="ml-1 font-bold">{q.target.word}</span>
              </span>
              <SpeakerBtn text={q.target.word} iconSize={14} className="!h-7 !w-7" />
            </div>
          ) : (
            <button onClick={submit} disabled={!text.trim()} className="btn-ink mt-3 w-full !py-3 disabled:opacity-40">
              提交
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ───────────────────────── 导出 ───────────────────────── */

export function WordPickGame(props: ChallengeProps) {
  return <ChoiceGame {...props} />
}

export function ListenPickGame(props: ChallengeProps) {
  return <ChoiceGame {...props} />
}

export function SpellGame(props: ChallengeProps) {
  return <SpellGameInner {...props} />
}

/* ───────────────────────── AI 智囊玩法 ───────────────────────── */

/**
 * AI 出题玩法：
 *  - 进入时先让模型从「薄弱 / 已掌握 / 到期」词池里挑易混干扰项，并配一句讲解；
 *  - 模型不可用或返回不合法 → 自动降级为本地规则出题，玩法照常进行；
 *  - 题目按「玩法 + 关卡 + 词池签名」缓存，同一个词池不会重复调用模型。
 */
export function AiSmartGame(props: ChallengeProps) {
  const { def, level, pool } = props
  const [preset, setPreset] = useState<ChallengeQuestion[] | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [degraded, setDegraded] = useState(false)

  useEffect(() => {
    // 注意：不要用 ref 防止重复执行——StrictMode 的「挂载→卸载→重挂载」会让
    // 第一次的异步结果被 alive=false 丢弃，第二次又被 ref 挡住，导致永远 loading。
    // 依赖都是稳定的（pool 来自父组件 useMemo），交给 cleanup 处理即可。

    // 优先用薄弱词（错词本）与已掌握词
    const weak = pool.filter((w) => w.meaning)
    const candidates = weak.slice(0, 120).map((w) => ({ word: w.word, meaning: w.meaning, pos: w.pos }))
    if (candidates.length < 8) {
      setLoading(false)
      setDegraded(true)
      return
    }

    const cacheKey = `ai-smart-${level}-${poolSignature(candidates)}`
    let alive = true
    void (async () => {
      try {
        // 最多等 8 秒：AI 慢就先用本地题开打，生成结果仍会在后台写入缓存供下次使用
        const request = generateAndCacheAiItems({
          cacheKey,
          candidates,
          count: def.perLevel,
          game: 'AI 智囊（多题型）',
        })
        const timeout = new Promise<never[]>((resolve) => window.setTimeout(() => resolve([]), 8000))
        const items = await Promise.race([request, timeout])
        if (items.length === 0 && alive) setDegraded(true)
        if (!alive) return
        const byWord = new Map(pool.map((w) => [w.word.toLowerCase(), w]))
        const questions: ChallengeQuestion[] = []
        for (const item of items) {
          const target = byWord.get(item.word.toLowerCase())
          if (!target) continue
          const ds = item.distractors
            .map((d) => byWord.get(d.toLowerCase()))
            .filter((w): w is ChallengeWord => !!w && w.meaning !== target.meaning)
          if (ds.length < 3) continue
          // cloze / synonym / antonym / root 考的是「选哪个英文词」，选项用词形；
          // 经典 meaning 题选中文释义。
          const answerText = item.kind && item.kind !== 'meaning' ? target.word : target.meaning
          const options =
            item.kind && item.kind !== 'meaning'
              ? [answerText, ...ds.map((d) => d.word)]
              : [answerText, ...ds.map((d) => d.meaning)]
          questions.push({
            target,
            options: shuffle(options),
            note: item.note,
            kind: item.kind,
            promptText: item.promptText,
          })
        }
        if (questions.length === 0) {
          setDegraded(true)
        } else {
          setPreset(questions)
        }
      } catch {
        if (alive) setDegraded(true)
      } finally {
        if (alive) setLoading(false)
      }
    })()

    return () => {
      alive = false
    }
  }, [def.perLevel, level, pool])

  if (loading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <div className="h-12 w-12 animate-pulse rounded-[16px] bg-fuchsia-100 dark:bg-fuchsia-500/15" />
        <p className="text-[13px] font-semibold text-slate-600 dark:text-slate-300">AI 正在挑易混词…</p>
        <p className="text-[11px] text-slate-400">挑完就能开打，通常几秒钟</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-col">
      {degraded && (
        <p className="mb-2 rounded-[12px] bg-amber-50 px-3 py-2 text-[11px] text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
          AI 出题有点慢，已先用本地易混词开打；生成好会缓存，下次进来就是 AI 题
        </p>
      )}
      <ChoiceGame {...props} preset={preset} />
    </div>
  )
}
