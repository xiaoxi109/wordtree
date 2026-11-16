import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { wordKey } from '../lib/cluster'
import {
  buildQuestion,
  levelPlan,
  recordChallengeResult,
  spellCorrect,
  starsFor,
  type ChallengeGameDef,
  type ChallengeQuestion,
  type ChallengeWord,
} from '../lib/challenge'
import { saveLevelResult } from '../lib/challengeProgress'

export interface ChallengeSessionOptions {
  def: ChallengeGameDef
  /** 关卡序号（0 起） */
  level: number
  /** 可出题的词池 */
  pool: ChallengeWord[]
  /** 答对时把词标记为已掌握 */
  onMaster?: (word: ChallengeWord) => void
  /** 预生成的题目（AI 出题）；用完后回退到本地规则出题 */
  preset?: ChallengeQuestion[]
}

export interface ChallengeMistake {
  word: string
  meaning: string
  /** 该词是否已有 AI 讲解 */
  hasNote: boolean
}

export interface ChallengeSession {
  question: ChallengeQuestion | null
  index: number
  total: number
  score: number
  /** 本次选中的选项文本（拼写题为输入文本） */
  picked: string | null
  /** 当前题是否已判分 */
  judged: boolean
  /** 当前题判定结果 */
  correct: boolean | null
  finished: boolean
  stars: number
  /** 平均用时（毫秒） */
  avgMs: number
  /** 最快一题用时 */
  bestMs: number
  /** 当前连对 */
  streak: number
  /** 最高连对 */
  bestStreak: number
  /** 本局错题（结算页展示讲解） */
  mistakes: ChallengeMistake[]
  /** 选择题作答 */
  choose: (option: string) => void
  /** 拼写题作答 */
  submit: (text: string) => void
  restart: () => void
}

/**
 * 闯关一局的统一驱动：出题 → 计时 → 判分 → 结果回流学习体系 → 结算写进度。
 * 三种玩法（词义闪电选 / 听音辨词 / 拼写挑战）共用这一套流程，只有选项 UI 不同。
 */
export function useChallengeSession({ def, level, pool, onMaster, preset }: ChallengeSessionOptions): ChallengeSession {
  const plan = useMemo(() => levelPlan(level), [level])
  const total = def.perLevel

  // 预生成题目（AI 出题）：按顺序取，用完后回退本地规则出题
  const presetRef = useRef<ChallengeQuestion[]>(preset ?? [])
  presetRef.current = preset ?? []

  const takeQuestion = useCallback((): ChallengeQuestion | null => {
    const next = presetRef.current.shift()
    if (next) return next
    return buildQuestion({ def, pool, plan, used: usedRef.current })
  }, [def, plan, pool])

  const [question, setQuestion] = useState<ChallengeQuestion | null>(() => {
    const next = (preset ?? [])[0]
    return next ?? buildQuestion({ def, pool, plan, used: new Set() })
  })
  const [index, setIndex] = useState(0)
  const [score, setScore] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const [judged, setJudged] = useState(false)
  const [correct, setCorrect] = useState<boolean | null>(null)
  const [finished, setFinished] = useState(false)
  const [avgMs, setAvgMs] = useState(0)
  const [bestMs, setBestMs] = useState(0)
  const [streak, setStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)
  const [mistakes, setMistakes] = useState<ChallengeMistake[]>([])

  const usedRef = useRef<Set<string>>(new Set())
  const shownAtRef = useRef<number>(Date.now())
  const timesRef = useRef<number[]>([])
  const timerRef = useRef<number | null>(null)
  const finishedRef = useRef(false)

  // 组件卸载时清掉反馈定时器，避免卸载后 setState
  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
  }, [])

  const nextQuestion = useCallback(() => {
    if (index + 1 >= total) {
      setFinished(true)
      finishedRef.current = true
      return
    }
    setIndex((i) => i + 1)
    setQuestion(takeQuestion())
    setPicked(null)
    setJudged(false)
    setCorrect(null)
    shownAtRef.current = Date.now()
  }, [index, takeQuestion, total])

  const settle = useCallback(
    (isCorrect: boolean, target: ChallengeWord) => {
      const ms = Date.now() - shownAtRef.current
      timesRef.current.push(ms)
      setAvgMs(Math.round(timesRef.current.reduce((a, b) => a + b, 0) / timesRef.current.length))
      setBestMs((b) => (b === 0 ? ms : Math.min(b, ms)))

      if (isCorrect) {
        setScore((s) => s + 1)
        setStreak((s) => {
          const next = s + 1
          setBestStreak((b) => Math.max(b, next))
          return next
        })
      } else {
        setStreak(0)
        // 记录错题，结算页用来展示讲解
        setMistakes((prev) => {
          if (prev.some((m) => m.word.toLowerCase() === target.word.toLowerCase())) return prev
          return [...prev, { word: target.word, meaning: target.meaning, hasNote: false }]
        })
      }

      // 结果回流：写 SRS / 错词本 / 事件流；答对的词顺带标记为已掌握
      recordChallengeResult({ word: target, correct: isCorrect, reactionMs: ms }, def.id)
      if (isCorrect) onMaster?.(target)
    },
    [def.id, onMaster],
  )

  const judge = useCallback(
    (answer: string, isCorrect: boolean) => {
      if (judged || finishedRef.current) return
      const target = question?.target
      if (!target) return
      setPicked(answer)
      setJudged(true)
      setCorrect(isCorrect)
      settle(isCorrect, target)
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null
        nextQuestion()
      }, 700)
    },
    [judged, question, settle, nextQuestion],
  )

  const choose = useCallback(
    (option: string) => {
      if (!question) return
      judge(option, option === question.target.meaning || option === question.target.word)
    },
    [question, judge],
  )

  const submit = useCallback(
    (text: string) => {
      if (!question) return
      judge(text, spellCorrect(text, question.target.word))
    },
    [question, judge],
  )

  const restart = useCallback(() => {
    usedRef.current = new Set()
    timesRef.current = []
    finishedRef.current = false
    presetRef.current = preset ?? []
    setIndex(0)
    setScore(0)
    setPicked(null)
    setJudged(false)
    setCorrect(null)
    setFinished(false)
    setAvgMs(0)
    setBestMs(0)
    setStreak(0)
    setBestStreak(0)
    setMistakes([])
    shownAtRef.current = Date.now()
    setQuestion(takeQuestion())
  }, [preset, takeQuestion])

  // 首次出题后登记已用词；后续每题也登记
  useEffect(() => {
    if (question) usedRef.current.add(wordKey(question.target.word))
  }, [question])

  // 结算时写进度（星级 / 最好成绩 / 最快用时）
  const stars = starsFor(score, total)
  useEffect(() => {
    if (!finished) return
    saveLevelResult(def.id, level, { stars, score, total, avgMs })
  }, [finished, def.id, level, stars, score, total, avgMs])

  return {
    question,
    index,
    total,
    score,
    picked,
    judged,
    correct,
    finished,
    stars,
    avgMs,
    bestMs,
    streak,
    bestStreak,
    mistakes,
    choose,
    submit,
    restart,
  }
}
