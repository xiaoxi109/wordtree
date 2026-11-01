import { useCallback, useEffect, useRef, useState } from 'react'
import { stripWTags } from '../lib/parse'
import { useSpeech } from './useSpeech'

/** 一条可朗读内容（AI 课程里的一个段落/一句台词）。 */
export interface QueueLine {
  id: string
  en: string
  zh?: string
  speaker?: string
}

export interface SpeechQueueOptions {
  /** 句与句之间的停顿（毫秒） */
  gap?: number
}

/**
 * 连续朗读队列：英文 →（可选）中文 → 停顿 → 下一句。
 * AI 课程「听读」与听词页「AI 课程听单」共用同一套播放逻辑。
 */
export function useSpeechQueue(lines: QueueLine[], opts: SpeechQueueOptions = {}) {
  const { speak, stop, speaking } = useSpeech()
  const gap = opts.gap ?? 420

  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [started, setStarted] = useState(false)
  const [rate, setRateState] = useState(0.9)
  const [includeZh, setIncludeZhState] = useState(true)
  const [repeat, setRepeatState] = useState(false)

  const linesRef = useRef(lines)
  linesRef.current = lines
  const gapRef = useRef(gap)
  gapRef.current = gap
  const playingRef = useRef(false)
  const rateRef = useRef(rate)
  const includeZhRef = useRef(includeZh)
  const repeatRef = useRef(repeat)
  const indexRef = useRef(0)
  const timers = useRef<number[]>([])
  /** 播放代次：停止/重播/换列表时 +1，旧语音的 onEnded 回调据此失效 */
  const epochRef = useRef(0)

  const clearTimers = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
  }, [])

  const playAtRef = useRef<(i: number, pass?: number, epoch?: number) => void>(() => {})
  const advanceRef = useRef<(i: number, epoch?: number) => void>(() => {})

  advanceRef.current = (i: number, epoch = epochRef.current) => {
    if (!playingRef.current || epoch !== epochRef.current) return
    const next = i + 1
    if (next >= linesRef.current.length) {
      playingRef.current = false
      setPlaying(false)
      return
    }
    const t = window.setTimeout(() => {
      if (playingRef.current && epoch === epochRef.current) playAtRef.current(next, 0, epoch)
    }, gapRef.current)
    timers.current.push(t)
  }

  playAtRef.current = (i: number, pass = 0, epoch = epochRef.current) => {
    if (!playingRef.current || epoch !== epochRef.current) return
    const line = linesRef.current[i]
    if (!line) {
      playingRef.current = false
      setPlaying(false)
      return
    }
    indexRef.current = i
    setIndex(i)
    setStarted(true)

    const en = stripWTags(line.en)
    const zh = stripWTags(line.zh ?? '')
    if (!en.trim()) {
      advanceRef.current(i, epoch)
      return
    }

    speak(en, rateRef.current, () => {
      if (!playingRef.current || epoch !== epochRef.current) return
      // 「每句两遍」：英文连读两次，再接中文
      if (repeatRef.current && pass === 0) {
        playAtRef.current(i, 1, epoch)
      } else if (includeZhRef.current && zh.trim()) {
        speak(
          zh,
          rateRef.current,
          () => {
            if (epoch === epochRef.current) advanceRef.current(i, epoch)
          },
          'zh',
        )
      } else {
        advanceRef.current(i, epoch)
      }
    })
  }

  const playFrom = useCallback(
    (i: number) => {
      const total = linesRef.current.length
      if (!total) return
      // 先让旧语音的回调失效，再 stop，避免 cancel 触发 onEnded 后误播下一句
      const epoch = epochRef.current + 1
      epochRef.current = epoch
      clearTimers()
      stop()
      const at = Math.max(0, Math.min(total - 1, i))
      playingRef.current = true
      setPlaying(true)
      setStarted(true)
      indexRef.current = at
      setIndex(at)
      playAtRef.current(at, 0, epoch)
    },
    [clearTimers, stop],
  )

  const pause = useCallback(() => {
    epochRef.current += 1
    playingRef.current = false
    clearTimers()
    stop()
    setPlaying(false)
  }, [clearTimers, stop])

  const toggle = useCallback(() => {
    if (playingRef.current) {
      pause()
      return
    }
    const at = indexRef.current >= linesRef.current.length ? 0 : indexRef.current
    playFrom(at)
  }, [pause, playFrom])

  const step = useCallback(
    (delta: number) => {
      const total = linesRef.current.length
      if (!total) return
      const at = Math.max(0, Math.min(total - 1, indexRef.current + delta))
      if (playingRef.current) {
        playFrom(at)
      } else {
        indexRef.current = at
        setIndex(at)
      }
    },
    [playFrom],
  )

  const setRate = useCallback((v: number) => {
    rateRef.current = v
    setRateState(v)
  }, [])

  const setIncludeZh = useCallback((v: boolean) => {
    includeZhRef.current = v
    setIncludeZhState(v)
  }, [])

  const setRepeat = useCallback((v: boolean) => {
    repeatRef.current = v
    setRepeatState(v)
  }, [])

  // 播放列表变化（切换篇目/课程）：停止并回到开头
  useEffect(() => {
    epochRef.current += 1
    playingRef.current = false
    clearTimers()
    stop()
    setPlaying(false)
    setStarted(false)
    indexRef.current = 0
    setIndex(0)
  }, [lines, clearTimers, stop])

  useEffect(
    () => () => {
      epochRef.current += 1
      playingRef.current = false
      clearTimers()
      stop()
    },
    [clearTimers, stop],
  )

  return {
    lines,
    index,
    playing,
    started,
    speaking,
    rate,
    setRate,
    includeZh,
    setIncludeZh,
    repeat,
    setRepeat,
    playFrom,
    toggle,
    pause,
    next: () => step(1),
    prev: () => step(-1),
  }
}

export type SpeechQueue = ReturnType<typeof useSpeechQueue>
