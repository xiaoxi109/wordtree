import { useRef, useState } from 'react'
import type { Word } from '../data'
import type { ChallengeProps } from '../views/ChallengesView'
import { SpeakerBtn } from './word'
import { CheckIcon, XIcon, SparklesIcon, RotateCcwIcon } from './icons'

const TOTAL = 10

function sample<T>(arr: T[], n: number): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy.slice(0, n)
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function buildQuestion(pool: Word[], prev?: Word): { target: Word; options: string[] } {
  const target = prev ? sample(pool.filter((w) => w.word !== prev.word), 1)[0] ?? pool[0] : pool[0]
  const distractors = sample(
    pool.filter((w) => w.word !== target.word && w.meaning !== target.meaning),
    3,
  ).map((w) => w.meaning)
  const options = shuffle([target.meaning, ...distractors])
  return { target, options }
}

/** 首个闯关游戏：看英文单词，四选一选中文释义，10 题计分。 */
export function WordPickGame({ pool, onExit }: ChallengeProps) {
  const [round, setRound] = useState(0)
  const [score, setScore] = useState(0)
  const [q, setQ] = useState(() => buildQuestion(pool))
  const [picked, setPicked] = useState<number | null>(null)
  const [finished, setFinished] = useState(false)
  const lock = useRef(false)

  const choose = (i: number) => {
    if (lock.current || picked !== null || finished) return
    lock.current = true
    setPicked(i)
    if (q.options[i] === q.target.meaning) setScore((s) => s + 1)
    window.setTimeout(() => {
      if (round + 1 >= TOTAL) {
        setFinished(true)
      } else {
        setRound((r) => r + 1)
        setQ(buildQuestion(pool, q.target))
        setPicked(null)
      }
      lock.current = false
    }, 700)
  }

  const restart = () => {
    setRound(0)
    setScore(0)
    setQ(buildQuestion(pool))
    setPicked(null)
    setFinished(false)
  }

  if (finished) {
    const pct = Math.round((score / TOTAL) * 100)
    const stars = score >= 9 ? '🏆 完美通关' : score >= 7 ? '🌟 表现出色' : score >= 5 ? '💪 继续加油' : '🌱 再练练'
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-[24px] bg-violet-100 dark:bg-violet-500/15">
          <SparklesIcon width={36} height={36} className="text-violet-600 dark:text-violet-300" />
        </div>
        <div>
          <p className="text-base font-bold text-slate-900 dark:text-slate-50">{stars}</p>
          <p className="mt-1 text-xs text-slate-400">
            答对 {score} / {TOTAL} · {pct}%
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={restart} className="btn-ink flex items-center gap-1.5 !px-6 !py-3">
            <RotateCcwIcon width={16} height={16} />
            再来一局
          </button>
          <button onClick={onExit} className="btn-soft !px-6 !py-3">
            返回列表
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col">
      {/* 进度 */}
      <div className="mb-3 px-0.5">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-300">
          <span className="font-display text-sm tracking-tight">
            第 {round + 1} / {TOTAL} 题
          </span>
          <span className="text-[11px] text-slate-400">已答对 {score}</span>
        </div>
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-900/[0.07] dark:bg-white/10">
          <div
            className="h-full rounded-full bg-violet-500 transition-all duration-300"
            style={{ width: `${((round + (picked !== null ? 1 : 0)) / TOTAL) * 100}%` }}
          />
        </div>
      </div>

      {/* 题目 */}
      <div className="flex flex-1 flex-col items-center justify-center">
        <div className="w-full rounded-[26px] border border-slate-200/60 bg-white/85 p-6 text-center shadow-float dark:border-slate-700/50 dark:bg-slate-800/60">
          <p className="break-words font-display text-[40px] font-semibold leading-none tracking-tight text-slate-900 dark:text-slate-50">
            {q.target.word}
          </p>
          {q.target.ipa && <p className="mt-2 text-[13px] text-slate-400">{q.target.ipa}</p>}
          <div className="mt-4 flex justify-center">
            <SpeakerBtn text={q.target.word} iconSize={18} className="!h-9 !w-9" />
          </div>
          <p className="mt-4 text-[11px] text-slate-400">选出正确的中文释义</p>
        </div>

        {/* 选项 */}
        <div className="mt-4 grid w-full grid-cols-1 gap-2.5">
          {q.options.map((opt, i) => {
            const isCorrect = opt === q.target.meaning
            const state =
              picked === null
                ? ''
                : i === picked && isCorrect
                  ? 'border-violet-300 bg-violet-100 text-violet-700 dark:border-violet-500/40 dark:bg-violet-500/15 dark:text-violet-200'
                  : i === picked && !isCorrect
                    ? 'border-rose-300 bg-rose-100 text-rose-600 dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-200'
                    : isCorrect
                      ? 'border-violet-300 bg-violet-100 text-violet-700 dark:border-violet-500/40 dark:bg-violet-500/15 dark:text-violet-200'
                      : 'border-slate-200/60 bg-white text-slate-500 opacity-60 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-400'
            return (
              <button
                key={i}
                disabled={picked !== null}
                onClick={() => choose(i)}
                className={`flex items-center justify-between gap-2 rounded-[16px] border px-4 py-3 text-left text-[15px] font-semibold transition active:scale-[0.99] dark:border-white/10 dark:bg-white/[0.04] ${state}`}
              >
                <span className="min-w-0 flex-1 truncate">{opt}</span>
                {picked !== null && (i === picked || isCorrect) && (
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
      </div>
    </div>
  )
}
