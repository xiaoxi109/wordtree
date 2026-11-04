import { useRef, useState } from 'react'
import type { Word } from '../data'
import { checkAdvancement, gradeQuiz, pickQuizWords, ADVANCEMENT_CONFIG } from '../lib/advancement'
import { SpeakerBtn, LevelBadge } from './word'
import { useSpeech } from '../hooks/useSpeech'
import {
  CheckIcon,
  XIcon,
  SparklesIcon,
  ArrowLeftIcon,
} from './icons'
import type { Route, GradeRung, LevelRung } from '../data/levels'
import { LEVEL_RUNGS, GRADE_RUNGS } from '../data/levels'

type Phase = 'intro' | 'quiz' | 'result'

interface QuizProps {
  route: Route
  currentRung: GradeRung | LevelRung
  masteredSet: Set<string>
  onComplete: (passed: boolean, nextRung: GradeRung | LevelRung | null) => void
  onCancel: () => void
}

/**
 * 闯关晋级 Quiz：
 *   - intro：显示当前状态和闯关目标
 *   - quiz：逐条判断临界词（认识/不认识）
 *   - result：显示结果，通过则晋级
 *
 * onComplete 只负责上报晋级结果，绝不负责卸载页面；结果页由本组件展示，
 * 用户点「完成 / 返回」后经 onCancel 退出。
 */
export function AdvancementQuiz({ route, currentRung, masteredSet, onComplete, onCancel }: QuizProps) {
  const check = checkAdvancement(route, currentRung, masteredSet)
  const [phase, setPhase] = useState<Phase>(check.canAdvance ? 'intro' : 'result')
  const [questions] = useState<Word[]>(() => pickQuizWords(route, currentRung))
  const [index, setIndex] = useState(0)
  const [knowns, setKnowns] = useState<boolean[]>([])
  const { stop } = useSpeech()
  // 防止快速双击「认识」重复提交导致 index 越界 / 重复上报晋级。
  const submittingRef = useRef(false)

  const targetLabel = (() => {
    if (!check.nextRung) return null
    if (route === 'grade') {
      return GRADE_RUNGS.find((r) => r.id === check.nextRung)?.label ?? String(check.nextRung)
    }
    return LEVEL_RUNGS.find((r) => r.id === check.nextRung)?.label ?? String(check.nextRung)
  })()

  const submit = (known: boolean) => {
    if (submittingRef.current) return
    submittingRef.current = true
    stop()
    const next = [...knowns, known]
    setKnowns(next)
    if (index + 1 >= questions.length) {
      const result = gradeQuiz(next)
      setPhase('result')
      onComplete(result.passed, result.passed ? check.nextRung : null)
    } else {
      setIndex(index + 1)
    }
    // 与渲染解耦地释放锁，避免同一帧内连点。
    window.setTimeout(() => { submittingRef.current = false }, 0)
  }

  const result = phase === 'result' ? gradeQuiz(knowns) : null
  const hasAnswers = knowns.length > 0

  return (
    <div className="flex min-h-full flex-col">
      {/* 顶部 */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <button onClick={onCancel} aria-label="返回" className="icon-btn !h-9 !w-9">
          <ArrowLeftIcon width={18} height={18} />
        </button>
        <h2 className="font-display text-[16px] font-bold tracking-tight text-slate-900 dark:text-slate-50">
          晋级闯关
        </h2>
        <span className="w-9" />
      </div>

      {phase === 'intro' && check.canAdvance && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-[24px] bg-accent-lime/20">
            <SparklesIcon width={36} height={36} className="text-accent-lime" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              恭喜！你已掌握当前级全部 {check.stats.total} 词
            </p>
            <p className="mt-1 text-xs text-slate-400">
              抽检 {questions.length} 个当前级的词 · 通过率 {Math.round(ADVANCEMENT_CONFIG.QUIZ_PASS_RATE * 100)}% 可晋级
            </p>
          </div>
          {check.nextRung && (
            <div className="rounded-[16px] border border-brand-200/60 bg-brand-50/60 px-4 py-2.5 dark:border-brand-500/25 dark:bg-brand-500/10">
              <p className="text-[11px] text-brand-600 dark:text-brand-300">晋级目标</p>
              <p className="text-sm font-bold text-brand-700 dark:text-brand-200">{targetLabel}</p>
            </div>
          )}
          <button onClick={() => setPhase('quiz')} className="btn-ink mt-2 !px-8 !py-3">
            开始闯关
          </button>
        </div>
      )}

      {phase === 'quiz' && questions[index] && (
        <div className="flex flex-1 flex-col">
          <div className="mb-2 px-0.5">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-300">
              <span className="font-display text-sm tracking-tight">
                第 {index + 1} / {questions.length} 题
              </span>
              <span className="text-[11px] text-slate-400">
                通过需 ≥ {Math.round(ADVANCEMENT_CONFIG.QUIZ_PASS_RATE * 100)}%
              </span>
            </div>
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-900/[0.07] dark:bg-white/10">
              <div
                className="h-full rounded-full bg-brand-500 transition-all duration-300"
                style={{ width: `${((index + 1) / questions.length) * 100}%` }}
              />
            </div>
          </div>

          <QuizCard word={questions[index]} onKnown={() => submit(true)} onUnknown={() => submit(false)} />
        </div>
      )}

      {/* 尚未达到闯关条件时进来的空结果态，避免显示「0/0 · 0%」 */}
      {phase === 'result' && !hasAnswers && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <p className="text-base font-bold text-slate-800 dark:text-slate-100">尚未达到闯关条件</p>
          <p className="max-w-xs text-xs leading-relaxed text-slate-400">
            当前等级还需掌握更多单词，继续背词后再来挑战吧
          </p>
          <button onClick={onCancel} className="btn-soft mt-2 !px-8 !py-3">
            返回首页
          </button>
        </div>
      )}

      {phase === 'result' && hasAnswers && result && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          {result.passed ? (
            <>
              <div className="flex h-20 w-20 items-center justify-center rounded-[24px] bg-accent-lime/30">
                <CheckIcon width={36} height={36} className="text-brand-600 dark:text-accent-lime" />
              </div>
              <div>
                <p className="text-base font-bold text-slate-800 dark:text-slate-100">
                  🎉 闯关通过！
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  答对 {result.known} / {result.total} · {Math.round(result.rate * 100)}%
                </p>
              </div>
              {check.nextRung && (
                <p className="rounded-[16px] bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                  已晋级到 {targetLabel}
                </p>
              )}
              <button onClick={onCancel} className="btn-ink mt-2 !px-8 !py-3">
                完成
              </button>
            </>
          ) : (
            <>
              <div className="flex h-20 w-20 items-center justify-center rounded-[24px] bg-rose-100 dark:bg-rose-500/10">
                <XIcon width={36} height={36} className="text-rose-500 dark:text-rose-400" />
              </div>
              <div>
                <p className="text-base font-bold text-slate-800 dark:text-slate-100">
                  闯关未通过
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  答对 {result.known} / {result.total} · {Math.round(result.rate * 100)}%
                </p>
                <p className="mt-2 text-[11px] text-slate-400">
                  继续巩固一下，下次再来挑战吧
                </p>
              </div>
              <button onClick={onCancel} className="btn-soft mt-2 !px-8 !py-3">
                返回首页
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function QuizCard({
  word,
  onKnown,
  onUnknown,
}: {
  word: Word
  onKnown: () => void
  onUnknown: () => void
}) {
  return (
    <div className="rounded-[26px] border border-slate-200/60 bg-white/85 p-5 shadow-float dark:border-slate-700/50 dark:bg-slate-800/60">
      <div className="flex items-center justify-between gap-2">
        <LevelBadge level={word.level} />
        <SpeakerBtn text={word.word} iconSize={18} className="!h-9 !w-9" />
      </div>

      <div className="mt-5 text-center">
        <p className="break-words font-display text-[36px] font-semibold leading-none tracking-tight text-slate-900 dark:text-slate-50">
          {word.word}
        </p>
        {word.ipa && <p className="mt-2 text-[13px] text-slate-400">{word.ipa}</p>}
      </div>

      <p className="mt-4 text-center text-[11px] text-slate-400">
        认识这个词吗？
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <button
          onClick={onUnknown}
          className="flex items-center justify-center gap-2 rounded-[18px] border border-rose-200/60 bg-rose-50/60 px-4 py-3 text-sm font-bold text-rose-600 transition hover:bg-rose-100 active:scale-[0.98] dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300"
        >
          <XIcon width={16} height={16} />
          不认识
        </button>
        <button
          onClick={onKnown}
          className="flex items-center justify-center gap-2 rounded-[18px] border border-brand-200/60 bg-brand-50/60 px-4 py-3 text-sm font-bold text-brand-700 transition hover:bg-brand-100 active:scale-[0.98] dark:border-brand-500/25 dark:bg-brand-500/10 dark:text-brand-300"
        >
          <CheckIcon width={16} height={16} />
          认识
        </button>
      </div>

      {word.examples.length > 0 && (
        <div className="mt-4 rounded-[14px] bg-slate-900/[0.03] p-3 dark:bg-white/[0.04]">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
            提示 · 例句
          </p>
          <p className="font-display text-[12px] leading-relaxed text-slate-600 dark:text-slate-300">
            {word.examples[0].en}
          </p>
        </div>
      )}
    </div>
  )
}
