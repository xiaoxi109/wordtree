import { useCallback, useEffect, useRef, useState } from 'react'
import { stripMarkup, stripWTags } from '../lib/parse'
import { isListMode, type PlaybackSettings, type PlayMode } from '../lib/playback'
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
  /**
   * 播放模式状态机。传了就按模式决定篇内推进；不传则沿用旧的 repeat/loop 两个布尔
   * （听读页 SpeechControls 仍在用），两套互不干扰。
   */
  playback?: PlaybackSettings
  /** 列表顺序/随机模式：本篇自然播完时触发，交给上层切到下一篇 */
  onLessonEnd?: (mode: PlayMode) => void
}

/** 未合成的句子按时长预估，只用于「剩余句数」的预估总时长。 */
export function estimateLineSeconds(text: string): number {
  const clean = stripWTags(text).trim()
  if (!clean) return 0
  if (/[\u4e00-\u9fff]/.test(clean)) return Math.max(0.6, clean.length / 4.2)
  const words = (clean.match(/[A-Za-z'’-]+/g) ?? []).length
  return Math.max(0.8, words / 2.6 + 0.35)
}

interface ProgressSnapshot {
  elapsed: number
  duration: number
}

/**
 * 连续朗读队列：英文 →（可选）中文 → 停顿 → 下一句。
 *
 * 进度条是「真实累计已播秒」时间轴：
 * - 分子 = 当前句起点的真实累计秒 + 本句音频的真实媒体秒，播放中每秒严格 +1；
 * - 分母在一句开始时算定（真实累计 + 当前句 + 剩余句预估），句内固定不动；
 * - 句与句之间用累加器推进（含停顿），不重算前面句子的估算，所以边界连续不跳。
 * elapsed 与 duration 由同一个 store 快照原子发布，比例不会错位。
 */
export function useSpeechQueue(lines: QueueLine[], opts: SpeechQueueOptions = {}) {
  const { speak, stop, speaking } = useSpeech()
  const gap = opts.gap ?? 420

  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [started, setStarted] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [rate, setRateState] = useState(1)
  const [includeZh, setIncludeZhState] = useState(opts.includeZh ?? true)
  const [repeat, setRepeatState] = useState(false)
  const [loop, setLoopState] = useState(false)
  const [sentencePass, setSentencePass] = useState(0)

  /** 进度高频更新走外部 store，只让进度条重渲染，不拖动整篇文章。 */
  const progressStore = useRef({
    value: { elapsed: 0, duration: 0 } as ProgressSnapshot,
    listeners: new Set<() => void>(),
  })
  const publishProgress = useCallback((elapsed: number, duration: number) => {
    progressStore.current.value = { elapsed, duration }
    progressStore.current.listeners.forEach((fn) => fn())
  }, [])
  const getProgress = useCallback(() => progressStore.current.value, [])
  const subscribeProgress = useCallback((fn: () => void) => {
    progressStore.current.listeners.add(fn)
    return () => { progressStore.current.listeners.delete(fn) }
  }, [])

  const linesRef = useRef(lines)
  linesRef.current = lines
  const playbackRef = useRef(opts.playback)
  playbackRef.current = opts.playback
  const onLessonEndRef = useRef(opts.onLessonEnd)
  onLessonEndRef.current = opts.onLessonEnd
  const passRef = useRef(0)
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

  /** 每句英文 wav 的真实时长（播放/预合成时写入） */
  const actualRef = useRef<Map<number, number>>(new Map())
  /** 每句中文跟读 wav 的真实时长（预合成时写入） */
  const zhActualRef = useRef<Map<number, number>>(new Map())
  /**
   * 整篇总时长（媒体秒）：= 各句真实 wav 时长（未知时用估算）+ 句间停顿。
   * 与倍速无关——2× 只让「已播媒体秒」推进更快，总长不变。
   */
  const totalRef = useRef(0.1)
  /** 最近一次真实音频进度回调的时间戳 */
  const progressAtRef = useRef(0)
  /** 期望位置的墙钟基准：位置 = media + (now - wall) * rate，真实进度只用来校正 */
  const clockWallRef = useRef(0)
  const clockMediaRef = useRef(0)
  /** 当前句起点在时间轴上的真实累计秒；句边界用累加器推进，严格连续 */
  const baseRef = useRef(0)
  /** 最近一次发布的真实累计秒 */
  const positionRef = useRef(0)
  /** 暂停时记住句起点，恢复播放不回跳 */
  const pausedBaseRef = useRef(0)
  /** 当前句已播的媒体秒（暂停续播 / 无进度回调时的墙钟兜底） */
  const currentMediaRef = useRef(0)
  const pausedMediaRef = useRef(0)

  const tickRef = useRef<number | null>(null)

  const clearTimers = useCallback(() => {
    // 同一数组里既有 setTimeout 也有停顿进度用的 setInterval
    timers.current.forEach((t) => {
      window.clearTimeout(t)
      window.clearInterval(t)
    })
    timers.current = []
  }, [])

  const stopTick = useCallback(() => {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current)
      tickRef.current = null
    }
  }, [])

  const gapSec = () => gapRef.current / 1000

  /** 停顿的墙钟时长：按倍速缩放（2× 时停顿减半），与音频节奏保持一致。 */
  const gapWallMs = () => Math.max(0, gapRef.current / Math.max(0.1, rateRef.current))

  /**
   * 停顿也是时间轴上的一段：期间进度条从「本句末尾」平滑走到「下句起点」，
   * 而不是原地冻结、到下一句再跳一格。
   */
  const runGapProgress = useCallback(
    (from: number, epoch: number) => {
      const wall = gapWallMs()
      if (wall <= 0) return null
      const begin = performance.now()
      return window.setInterval(() => {
        if (!playingRef.current || epoch !== epochRef.current) return
        const p = Math.min(1, (performance.now() - begin) / wall)
        publishProgress(from + gapSec() * p, totalRef.current)
      }, 100)
    },
    [publishProgress],
  )

  /** 单句占用的时间轴秒：英文真实时长优先，未合成的用估算；含中文跟读估算。 */
  const lineDur = useCallback((i: number) => {
    const line = linesRef.current[i]
    if (!line) return 0
    const real = actualRef.current.get(i)
    const enSec = real && real > 0 ? real : estimateLineSeconds(line.en)
    const zh = stripMarkup(line.zh ?? '').trim()
    const zhReal = zhActualRef.current.get(i)
    const zhSec = includeZhRef.current && zh
      ? (zhReal && zhReal > 0 ? zhReal : estimateLineSeconds(zh))
      : 0
    return Math.max(0.1, enSec + zhSec)
  }, [])

  /** 第 i 句起点（估算轴），仅用于用户主动跳转时定位。 */
  const startOf = useCallback((i: number) => {
    let sum = 0
    for (let j = 0; j < i; j += 1) sum += lineDur(j) + gapSec()
    return sum
  }, [lineDur])

  /**
   * 整篇总时长（媒体秒）：已播句用真实 wav 时长，未播句用「已预合成时长 或 估算」。
   * 与 seek 的 startOf 使用同一份时长表，避免两套时间基互相错位。
   */
  const computeTotal = useCallback(() => {
    const n = linesRef.current.length
    let sum = 0
    for (let i = 0; i < n; i += 1) {
      const line = linesRef.current[i]
      const en = stripWTags(line.en).trim()
      const enSec =
        actualRef.current.get(i) ??
        peekPrepared(en)?.duration ??
        estimateLineSeconds(en)
      const zh = stripMarkup(line.zh ?? '').trim()
      const zhCached = peekPrepared(zh, 'zh')?.duration
      const zhSec = includeZhRef.current && zh
        ? Math.max(0.1, zhActualRef.current.get(i) ?? (zhCached && zhCached > 0 ? zhCached : estimateLineSeconds(zh)))
        : 0
      sum += Math.max(0.1, enSec + zhSec) + (i < n - 1 ? gapSec() : 0)
    }
    return Math.max(sum, 0.1)
  }, [])

  /**
   * 整篇后台预合成（串行）：全部句子拿到真实 wav 时长后，把总时长校正为
   * 精确值——仅在尚未开播（进度仍为 0）时执行，进度条静止时无感知。
   * 串行合成远快于实时播放，会一直跑在播放游标前面，不会挤掉「下一句」的预取。
   */
  const prerenderAllRef = useRef<() => Promise<void>>(async () => {})
  prerenderAllRef.current = async () => {
    const snapshot = linesRef.current
    const n = snapshot.length
    if (!n || n > 48) return
    for (let i = 0; i < n; i += 1) {
      const line = snapshot[i]
      const en = stripWTags(line.en).trim()
      if (en) {
        try {
          const p = await prepareSpeech(en)
          if (p && p.duration > 0 && !actualRef.current.has(i)) actualRef.current.set(i, p.duration)
        } catch { /* 单句失败不影响整体 */ }
      }
      if (includeZhRef.current) {
        const zh = stripMarkup(line.zh ?? '').trim()
        if (zh) {
          try {
            const p = await prepareSpeech(zh, 'zh')
            if (p && p.duration > 0 && !zhActualRef.current.has(i)) zhActualRef.current.set(i, p.duration)
          } catch { /* 单句失败不影响整体 */ }
        }
      }
    }
    if (linesRef.current !== snapshot) return
    if (positionRef.current > 0.01) return
    totalRef.current = computeTotal()
    publishProgress(positionRef.current, totalRef.current)
  }

  const playAtRef = useRef<(i: number, pass?: number, epoch?: number, startAt?: number) => void>(() => {})
  const advanceRef = useRef<(i: number, epoch?: number) => void>(() => {})

  const halt = useCallback(() => {
    clearTimers()
    stopTick()
    playingRef.current = false
    setPlaying(false)
    setPreparing(false)
    passRef.current = 0
    setSentencePass(0)
    pausedMediaRef.current = 0
  }, [clearTimers, stopTick])

  advanceRef.current = (i: number, epoch = epochRef.current) => {
    if (!playingRef.current || epoch !== epochRef.current) return
    const next = i + 1
    // 下一句起点 = 当前真实累计位置 + 句间停顿；用累加器推进，不重算前句估算。
    const nextBase = positionRef.current + gapSec()
    const wall = gapWallMs()
    if (next >= linesRef.current.length) {
      const pb = playbackRef.current
      const mode = pb?.mode ?? (loopRef.current ? 'lesson' : 'off')
      if (mode === 'lesson') {
        const gapTick = runGapProgress(positionRef.current, epoch)
        if (gapTick !== null) timers.current.push(gapTick)
        const t = window.setTimeout(() => {
          if (gapTick !== null) window.clearInterval(gapTick)
          if (playingRef.current && epoch === epochRef.current) {
            baseRef.current = 0
            positionRef.current = 0
            playAtRef.current(0, 0, epoch, 0)
          }
        }, wall)
        timers.current.push(t)
        return
      }
      // 篇末一次性对齐：总时长收敛到真实累计已播秒，进度到 100%，时间显示真实值。
      const final = Math.max(positionRef.current, 0.1)
      if (isListMode(mode)) {
        halt()
        publishProgress(final, final)
        onLessonEndRef.current?.(mode)
        return
      }
      halt()
      publishProgress(final, final)
      return
    }
    // 停顿期间进度条继续平滑前进（停顿按倍速缩放）
    const gapTick = runGapProgress(positionRef.current, epoch)
    if (gapTick !== null) timers.current.push(gapTick)
    const t = window.setTimeout(() => {
      if (gapTick !== null) window.clearInterval(gapTick)
      if (playingRef.current && epoch === epochRef.current) {
        baseRef.current = nextBase
        playAtRef.current(next, 0, epoch, 0)
      }
    }, wall)
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
    const en = stripWTags(line.en).trim()
    const zh = stripMarkup(line.zh ?? '').trim()

    // 已预合成的句子用 wav 真实时长，让分母从一开始就尽量接近真实。
    const cached = peekPrepared(en)?.duration
    if (cached && cached > 0 && !actualRef.current.has(i)) actualRef.current.set(i, cached)

    indexRef.current = i
    setIndex(i)
    setStarted(true)
    passRef.current = pass
    setSentencePass(pass)

    // 句边界处用最新时长表校正总长：把前面用估算的句子换成真实 wav 时长（通常差 < 1s）
    totalRef.current = computeTotal()

    /**
     * 时间轴 = 媒体秒：本句起点（真实累加）+ 本句已播媒体秒。
     * 总长与倍速无关，2× 时只是「媒体秒」推进得更快，滑块随之加速。
     */
    const lineStart = baseRef.current
    const publishSeconds = (within: number) => {
      const e = lineStart + Math.max(0, within)
      positionRef.current = e
      publishProgress(e, totalRef.current)
    }

    currentMediaRef.current = startAt
    publishSeconds(startAt)

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
    const zhEstSec = includeZhRef.current && zh ? estimateLineSeconds(zh) : 0
    const realEn = actualRef.current.get(i)
    const enDur = realEn && realEn > 0 ? realEn : Math.max(0.1, lineDur(i) - zhEstSec)
    /** 兜底外推的封顶点：英文段封在英文结束，进入中文跟读后放到整句结束 */
    let phaseEnd = enDur

    /**
     * 英文音频进度：只用来「校正」，不直接发布（发布交给 100ms ticker）。
     * 部分 WebView 在非 1.0 倍速下 seek 后 currentTime 会停止更新，
     * 若由它直接驱动进度条就会卡死；这里只把已播位置抬到真实值并重设时钟基准。
     */
    const onProgress = (current: number, dur: number) => {
      if (!playingRef.current || epoch !== epochRef.current) return
      progressAtRef.current = performance.now()
      setPreparing(false)
      // 真实时长写入时长表：后续句子的总时长与 seek 都用它，替代估算。
      if (dur > 0 && Number.isFinite(dur)) actualRef.current.set(i, dur)
      if (current > currentMediaRef.current) currentMediaRef.current = current
      clockMediaRef.current = currentMediaRef.current
      clockWallRef.current = progressAtRef.current
    }
    /** 中文跟读：接在英文段真实结束点之后继续，交界不回退。 */
    const onZhProgress = (current: number) => {
      if (!playingRef.current || epoch !== epochRef.current) return
      progressAtRef.current = performance.now()
      setPreparing(false)
      const enBase = actualRef.current.get(i) ?? enDur
      const pos = enBase + current
      if (pos > currentMediaRef.current) currentMediaRef.current = pos
      clockMediaRef.current = currentMediaRef.current
      clockWallRef.current = progressAtRef.current
    }

    // 进度只有这一个发布者（100ms）：位置 = max(真实已播, 墙钟 × 倍速的期望值)。
    // 真实音频进度只负责校正基准；即使某些 WebView 在非 1.0 倍速下 seek 后
    // currentTime 停止更新，期望值仍按倍速前进，进度条不会卡死。
    // 位置封顶在当前段结尾，绝不越过句界，因此没有句尾回跳。
    stopTick()
    progressAtRef.current = 0
    clockWallRef.current = performance.now()
    clockMediaRef.current = startAt
    tickRef.current = window.setInterval(() => {
      if (!playingRef.current || epoch !== epochRef.current) return
      const now = performance.now()
      const expected = clockMediaRef.current + ((now - clockWallRef.current) / 1000) * rateRef.current
      const next = Math.min(Math.max(currentMediaRef.current, expected), phaseEnd)
      currentMediaRef.current = next
      publishSeconds(next)
    }, 100)

    const finishLine = () => {
      if (epoch !== epochRef.current) return
      // 先停掉本句的兜底时钟，避免它和「停顿推进」互相覆盖
      stopTick()
      currentMediaRef.current = lineDur(i)
      publishSeconds(lineDur(i))
      advanceRef.current(i, epoch)
    }

    const afterEnglish = () => {
      setPreparing(false)
      if (!playingRef.current || epoch !== epochRef.current) return
      const pb = playbackRef.current
      const repeatTimes = pb?.mode === 'sentence'
        ? pb.sentenceRepeat
        : (pb ? 1 : (repeatRef.current ? 2 : 1))
      if (pass + 1 < repeatTimes) {
        // 单句循环：回到本句起点重播，进度条随之回到本句开头。
        baseRef.current = lineStart
        positionRef.current = lineStart
        clockWallRef.current = performance.now()
        clockMediaRef.current = 0
        playAtRef.current(i, pass + 1, epoch, 0)
      } else if (includeZhRef.current && zh) {
        // 中文起点对齐到英文的真实结束点，中英交界不回退
        const enReal = actualRef.current.get(i) ?? enDur
        baseRef.current = lineStart + enReal
        phaseEnd = lineDur(i)
        // 中文段新基准：从英文真实结束点起按倍速结算
        clockWallRef.current = performance.now()
        clockMediaRef.current = enReal
        publishSeconds(enReal)
        speak(zh, rateRef.current, finishLine, 'zh', { onProgress: onZhProgress })
      } else {
        finishLine()
      }
    }

    speak(en, rateRef.current, afterEnglish, 'en', { startAt, onProgress })
  }

  const playFrom = useCallback(
    (i: number, startAt = 0, pass = 0, baseHint?: number) => {
      const total = linesRef.current.length
      if (!total) return
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
      // 主动跳转按时间轴定位；暂停恢复用记下的句起点，保证不回跳。
      baseRef.current = baseHint ?? startOf(at)
      playAtRef.current(at, pass, epoch, startAt)
    },
    [clearTimers, stop, stopTick, startOf],
  )

  const pause = useCallback(() => {
    pausedMediaRef.current = currentMediaRef.current
    pausedBaseRef.current = baseRef.current
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
    playFrom(at, pausedMediaRef.current, passRef.current, pausedBaseRef.current)
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
        currentMediaRef.current = 0
        baseRef.current = startOf(at)
        positionRef.current = baseRef.current
        publishProgress(baseRef.current, totalRef.current)
      }
    },
    [playFrom, publishProgress, startOf],
  )

  /** 进度条按真实秒定位到对应句子，句内偏移直接就是音频秒。 */
  const seekTo = useCallback(
    (ratio: number) => {
      const n = linesRef.current.length
      if (!n) return
      const total = totalRef.current
      const target = Math.max(0, Math.min(1, ratio)) * total
      let i = n - 1
      for (let k = 0; k < n; k += 1) {
        if (target < startOf(k) + lineDur(k)) {
          i = k
          break
        }
      }
      const within = Math.max(0, target - startOf(i))
      playFrom(i, within)
    },
    [playFrom, lineDur, startOf],
  )

  const setRate = useCallback((v: number) => {
    if (v !== rateRef.current) {
      // 换速不打断播放：把「期望位置」的基准挪到当前位置，避免按新倍速瞬间跳变
      clockMediaRef.current = currentMediaRef.current
      clockWallRef.current = performance.now()
    }
    rateRef.current = v
    setRateState(v)
    setPlaybackRate(v)
  }, [])

  const setIncludeZh = useCallback((v: boolean) => {
    includeZhRef.current = v
    setIncludeZhState(v)
    // 是否跟读中文会改变总长（中文段有无），重算后重新发布同一时刻的快照
    totalRef.current = computeTotal()
    publishProgress(positionRef.current, totalRef.current)
  }, [computeTotal, publishProgress])

  const setRepeat = useCallback((v: boolean) => {
    repeatRef.current = v
    setRepeatState(v)
  }, [])

  const setLoop = useCallback((v: boolean) => {
    loopRef.current = v
    setLoopState(v)
  }, [])

  // 播放列表变化（切换篇目/课程）：时间轴归零、停止播放；预热首句。
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
    passRef.current = 0
    setSentencePass(0)
    actualRef.current.clear()
    zhActualRef.current.clear()
    baseRef.current = 0
    positionRef.current = 0
    // 总长 = 媒体秒求和（已缓存句子用真实 wav 时长，其余用估算），预合成后再校正。
    totalRef.current = computeTotal()
    publishProgress(0, totalRef.current)
    const first = stripWTags(linesRef.current[0]?.en ?? '').trim()
    if (first) void prepareSpeech(first)
    // 后台预合成整篇：真实时长齐了就把分母校正为精确值（仅开播前）
    void prerenderAllRef.current()
    // computeTotal 只依赖 refs，不需要重复订阅
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
    /** 供进度条用 useSyncExternalStore 订阅，避免高频刷新整页 */
    subscribeProgress,
    getProgress,
    speaking,
    rate,
    setRate,
    includeZh,
    setIncludeZh,
    repeat,
    setRepeat,
    loop,
    setLoop,
    /** 单句循环当前遍数（0-based），仅 sentence 模式有意义 */
    sentencePass,
    playFrom,
    seekTo,
    toggle,
    pause,
    next: () => step(1),
    prev: () => step(-1),
  }
}

export type SpeechQueue = ReturnType<typeof useSpeechQueue>
