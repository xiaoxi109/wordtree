import { useCallback, useEffect, useRef, useState } from 'react'
import { stripWTags } from '../lib/parse'
import { useSpeech, prepareSpeech, peekPrepared, setPlaybackRate } from './useSpeech'

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
  /** 是否在英文后跟读中文（阅读页关掉，听读页保持开启） */
  includeZh?: boolean
}

/** 未合成的句子按时长预估；合成后用 wav 真实时长替换，进度条因此不会跑偏。 */
export function estimateLineSeconds(text: string): number {
  const clean = stripWTags(text).trim()
  if (!clean) return 0
  if (/[\u4e00-\u9fff]/.test(clean)) return Math.max(0.6, clean.length / 4.2)
  const words = (clean.match(/[A-Za-z'’-]+/g) ?? []).length
  return Math.max(0.8, words / 2.6 + 0.35)
}

/**
 * 连续朗读队列：英文 →（可选）中文 → 停顿 → 下一句。
 * 进度条按「媒体秒」连续推进（播放中每 150ms 刷新），与时长显示共用同一份数据；
 * 每句播放前查预合成缓存，播放中后台预取下一句，避免现场推理造成的长等待。
 */
export function useSpeechQueue(lines: QueueLine[], opts: SpeechQueueOptions = {}) {
  const { speak, stop, speaking } = useSpeech()
  const gap = opts.gap ?? 420

  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [started, setStarted] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [duration, setDuration] = useState(0)
  const [rate, setRateState] = useState(1)
  const [includeZh, setIncludeZhState] = useState(opts.includeZh ?? true)
  const [repeat, setRepeatState] = useState(false)
  const [loop, setLoopState] = useState(false)

  const linesRef = useRef(lines)
  linesRef.current = lines
  const gapRef = useRef(gap)
  gapRef.current = gap
  const playingRef = useRef(false)
  const rateRef = useRef(rate)
  const includeZhRef = useRef(includeZh)
  const repeatRef = useRef(repeat)
  const loopRef = useRef(loop)
  const indexRef = useRef(0)
  const timers = useRef<number[]>([])
  /** 播放代次：停止/重播/换列表时 +1，旧语音的 onEnded 回调据此失效 */
  const epochRef = useRef(0)

  /** 每句的真实媒体时长（wav 头解析），未合成的用估算 */
  const actualRef = useRef<Map<number, number>>(new Map())
  /** 当前句之前累计的媒体秒 */
  const beforeRef = useRef(0)
  const currentMediaRef = useRef(0)
  const pausedMediaRef = useRef(0)
  const durationRef = useRef(0)
  const progressRef = useRef<{ t: number; value: number } | null>(null)
  const tickRef = useRef<number | null>(null)

  const clearTimers = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
  }, [])

  const stopTick = useCallback(() => {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current)
      tickRef.current = null
    }
  }, [])

  const gapSec = () => gapRef.current / 1000

  /** 单句时长：真实值优先，中文跟读按时长估算叠加 */
  const lineLen = useCallback((i: number) => {
    const line = linesRef.current[i]
    if (!line) return 0
    let sec = actualRef.current.get(i) ?? estimateLineSeconds(line.en)
    const zh = stripWTags(line.zh ?? '').trim()
    if (includeZhRef.current && zh) sec += estimateLineSeconds(zh)
    return sec
  }, [])

  const totalLen = useCallback(() => {
    const n = linesRef.current.length
    if (!n) return 0
    let sum = 0
    for (let i = 0; i < n; i += 1) sum += lineLen(i) + (i < n - 1 ? gapSec() : 0)
    return Math.max(sum, 0.1)
  }, [lineLen])

  const lenBefore = useCallback((i: number) => {
    let sum = 0
    for (let j = 0; j < i; j += 1) sum += lineLen(j) + gapSec()
    return sum
  }, [lineLen])

  const playAtRef = useRef<(i: number, pass?: number, epoch?: number, startAt?: number) => void>(() => {})
  const advanceRef = useRef<(i: number, epoch?: number) => void>(() => {})

  advanceRef.current = (i: number, epoch = epochRef.current) => {
    if (!playingRef.current || epoch !== epochRef.current) return
    const next = i + 1
    if (next >= linesRef.current.length) {
      if (loopRef.current) {
        const t = window.setTimeout(() => {
          if (playingRef.current && epoch === epochRef.current) playAtRef.current(0, 0, epoch, 0)
        }, gapRef.current)
        timers.current.push(t)
        return
      }
      stopTick()
      playingRef.current = false
      setPlaying(false)
      setPreparing(false)
      setElapsed(durationRef.current)
      return
    }
    const t = window.setTimeout(() => {
      if (playingRef.current && epoch === epochRef.current) playAtRef.current(next, 0, epoch, 0)
    }, gapRef.current)
    timers.current.push(t)
  }

  playAtRef.current = (i: number, pass = 0, epoch = epochRef.current, startAt = 0) => {
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

    durationRef.current = totalLen()
    setDuration(durationRef.current)
    beforeRef.current = lenBefore(i)
    currentMediaRef.current = startAt
    progressRef.current = null
    setElapsed(beforeRef.current + startAt)

    const en = stripWTags(line.en).trim()
    const zh = stripWTags(line.zh ?? '').trim()
    if (!en) {
      advanceRef.current(i, epoch)
      return
    }

    // 后台预取下一句：合成与当前句播放并行，句间不再卡住。
    const nextLine = linesRef.current[i + 1] ?? (loopRef.current ? linesRef.current[0] : null)
    if (nextLine) {
      const nextEn = stripWTags(nextLine.en).trim()
      if (nextEn) void prepareSpeech(nextEn)
      if (includeZhRef.current) {
        const nextZh = stripWTags(nextLine.zh ?? '').trim()
        if (nextZh) void prepareSpeech(nextZh, 'zh')
      }
    }

    setPreparing(!peekPrepared(en))

    const onProgress = (current: number, dur: number) => {
      if (!playingRef.current || epoch !== epochRef.current) return
      progressRef.current = { t: performance.now(), value: current }
      setPreparing(false)
      if (dur > 0 && Number.isFinite(dur)) {
        actualRef.current.set(i, dur)
        durationRef.current = totalLen()
        setDuration(durationRef.current)
      }
      setElapsed(Math.min(durationRef.current, beforeRef.current + current))
    }

    // 没有真实进度回调（系统 TTS / Web Audio 兜底）时按墙钟推进，同样不会停在原地。
    stopTick()
    let last = performance.now()
    tickRef.current = window.setInterval(() => {
      if (!playingRef.current || epoch !== epochRef.current) return
      const now = performance.now()
      const dt = ((now - last) / 1000) * rateRef.current
      last = now
      const rep = progressRef.current
      currentMediaRef.current = rep && now - rep.t < 800
        ? rep.value + ((now - rep.t) / 1000) * rateRef.current
        : currentMediaRef.current + dt
      const cap = lineLen(i)
      if (cap > 0 && currentMediaRef.current > cap) currentMediaRef.current = cap
      setElapsed(Math.min(durationRef.current, beforeRef.current + currentMediaRef.current))
    }, 150)

    const recordActual = () => {
      // onProgress 已给过 wav 真实时长时不要被 tick 的估值覆盖。
      const real = actualRef.current.get(i) ?? 0
      actualRef.current.set(i, Math.max(real, currentMediaRef.current, 0.1))
      durationRef.current = totalLen()
      setDuration(durationRef.current)
    }

    const afterEnglish = () => {
      setPreparing(false)
      if (!playingRef.current || epoch !== epochRef.current) return
      if (repeatRef.current && pass === 0) {
        playAtRef.current(i, 1, epoch, 0)
      } else if (includeZhRef.current && zh) {
        speak(
          zh,
          rateRef.current,
          () => {
            if (epoch !== epochRef.current) return
            recordActual()
            advanceRef.current(i, epoch)
          },
          'zh',
          { onProgress },
        )
      } else {
        recordActual()
        advanceRef.current(i, epoch)
      }
    }

    speak(en, rateRef.current, afterEnglish, 'en', { startAt, onProgress })
  }

  const playFrom = useCallback(
    (i: number, startAt = 0) => {
      const total = linesRef.current.length
      if (!total) return
      // 先让旧语音的回调失效，再 stop，避免 cancel 触发 onEnded 后误播下一句
      const epoch = epochRef.current + 1
      epochRef.current = epoch
      clearTimers()
      stopTick()
      stop()
      const at = Math.max(0, Math.min(total - 1, i))
      playingRef.current = true
      setPlaying(true)
      setStarted(true)
      setPreparing(false)
      indexRef.current = at
      setIndex(at)
      pausedMediaRef.current = startAt
      playAtRef.current(at, 0, epoch, startAt)
    },
    [clearTimers, stop, stopTick],
  )

  const pause = useCallback(() => {
    pausedMediaRef.current = currentMediaRef.current
    epochRef.current += 1
    playingRef.current = false
    clearTimers()
    stopTick()
    stop()
    setPlaying(false)
    setPreparing(false)
  }, [clearTimers, stop, stopTick])

  const toggle = useCallback(() => {
    if (playingRef.current) {
      pause()
      return
    }
    const at = indexRef.current >= linesRef.current.length ? 0 : indexRef.current
    // 暂停后继续：从原位置续播，进度条不回退。
    playFrom(at, pausedMediaRef.current)
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
        durationRef.current = totalLen()
        setDuration(durationRef.current)
        beforeRef.current = lenBefore(at)
        setElapsed(beforeRef.current)
      }
    },
    [playFrom, totalLen, lenBefore],
  )

  /** 进度条按时间定位到对应句子（并尽量从句子内的对应位置续播）。 */
  const seekTo = useCallback(
    (ratio: number) => {
      const n = linesRef.current.length
      if (!n) return
      const target = Math.max(0, Math.min(1, ratio)) * durationRef.current
      let acc = 0
      for (let i = 0; i < n; i += 1) {
        const len = lineLen(i)
        if (target < acc + len) {
          playFrom(i, Math.max(0, target - acc))
          return
        }
        acc += len + gapSec()
      }
      playFrom(n - 1)
    },
    [playFrom, lineLen],
  )

  const setRate = useCallback((v: number) => {
    rateRef.current = v
    setRateState(v)
    setPlaybackRate(v)
  }, [])

  const setIncludeZh = useCallback((v: boolean) => {
    includeZhRef.current = v
    setIncludeZhState(v)
  }, [])

  const setRepeat = useCallback((v: boolean) => {
    repeatRef.current = v
    setRepeatState(v)
  }, [])

  const setLoop = useCallback((v: boolean) => {
    loopRef.current = v
    setLoopState(v)
  }, [])

  // 播放列表变化（切换篇目/课程）：停止并回到开头；同时预热首句，点播放即可秒出声。
  useEffect(() => {
    epochRef.current += 1
    playingRef.current = false
    clearTimers()
    stopTick()
    stop()
    setPlaying(false)
    setStarted(false)
    setPreparing(false)
    indexRef.current = 0
    setIndex(0)
    currentMediaRef.current = 0
    pausedMediaRef.current = 0
    beforeRef.current = 0
    actualRef.current.clear()
    durationRef.current = totalLen()
    setDuration(durationRef.current)
    setElapsed(0)
    const first = stripWTags(linesRef.current[0]?.en ?? '').trim()
    if (first) void prepareSpeech(first)
    // totalLen 依赖 lineLen（稳定 useCallback），这里不需要重复订阅
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, clearTimers, stop, stopTick])

  useEffect(
    () => () => {
      epochRef.current += 1
      playingRef.current = false
      clearTimers()
      stopTick()
      stop()
    },
    [clearTimers, stop, stopTick],
  )

  return {
    lines,
    index,
    playing,
    started,
    preparing,
    elapsed,
    duration,
    speaking,
    rate,
    setRate,
    includeZh,
    setIncludeZh,
    repeat,
    setRepeat,
    loop,
    setLoop,
    playFrom,
    seekTo,
    toggle,
    pause,
    next: () => step(1),
    prev: () => step(-1),
  }
}

export type SpeechQueue = ReturnType<typeof useSpeechQueue>
