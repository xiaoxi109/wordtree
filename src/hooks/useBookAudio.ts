import { useCallback, useEffect, useRef, useState } from 'react'
import type { BookLesson, BookSentence } from '../lib/bookTypes'
import { useSpeech } from './useSpeech'

/**
 * 书籍课文音频播放。
 *
 * 音源三级降级：
 *   1) 本地原声（APK 内 assets/public/books/audio/<bookId>/<key>.mp3）
 *   2) 远程原声（typewords 静态资源，联网时兜底）
 *   3) 本地 AI 朗读（Piper TTS，逐句朗读）
 *
 * 原声自带句级时间轴，可高亮当前句；TTS 模式按句序推进，同样能高亮。
 */

export type BookAudioMode = 'idle' | 'origin' | 'tts'
export type BookAudioSource = 'none' | 'local' | 'remote' | 'tts'

export interface BookAudioApi {
  mode: BookAudioMode
  /** 当前实际使用的音源 */
  source: BookAudioSource
  playing: boolean
  /** 当前播放到的句子下标；-1 表示没有可高亮的句子 */
  playingSentence: number
  /** 已播放秒数 */
  elapsed: number
  /** 总时长（秒） */
  duration: number
  rate: number
  /** 原声是否可用（当前篇有录音） */
  hasOrigin: boolean
  playAll(): void
  playSentence(index: number): void
  seekToSentence(index: number): void
  /** 按比例跳转（0~1） */
  seekRatio(ratio: number): void
  setRate(rate: number): void
  toggle(): void
  stop(): void
  /** 本篇读完（自动播下一篇） */
  onEnded?: () => void
}

/** 依据时间戳找当前句（时间轴缺失时返回 -1） */
export function sentenceAt(sentences: BookSentence[], t: number): number {
  if (!sentences.length) return -1
  let last = -1
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i]
    if (s.start === undefined || s.end === undefined) continue
    if (t >= s.start && t < s.end) return i
    if (t >= s.end) last = i
  }
  return last
}

/** 本地原声地址（APK 内资源 / web 端 public 目录） */
export function localAudioUrl(bookId: string, key: string): string {
  return `${import.meta.env.BASE_URL}books/audio/${bookId}/${key}`
}

/** 转成绝对地址（用于比较当前 src 是否已经是同一个文件） */
function safeAbsolute(url: string): string {
  try {
    return new URL(url, window.location.href).href
  } catch {
    return url
  }
}

export function useBookAudio(params: {
  lesson: BookLesson | null
  bookId: string
  onEnded?: () => void
}): BookAudioApi {
  const { lesson, bookId, onEnded } = params
  const { speak, stop: stopTts } = useSpeech()

  const [mode, setMode] = useState<BookAudioMode>('idle')
  const [source, setSource] = useState<BookAudioSource>('none')
  const [playing, setPlaying] = useState(false)
  const [playingSentence, setPlayingSentence] = useState(-1)
  const [elapsed, setElapsed] = useState(0)
  const [duration, setDuration] = useState(0)
  const [rate, setRateState] = useState(1)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const lessonRef = useRef<BookLesson | null>(lesson)
  lessonRef.current = lesson
  const bookIdRef = useRef(bookId)
  bookIdRef.current = bookId
  const rateRef = useRef(rate)
  rateRef.current = rate
  const onEndedRef = useRef(onEnded)
  onEndedRef.current = onEnded
  /** TTS 连播令牌：任何打断都会让它自增，令旧回调失效 */
  const ttsTokenRef = useRef(0)
  /** 当前正在尝试的音源链下标：0 本地 / 1 远程 / 2 TTS */
  const chainIdxRef = useRef(0)
  const speakRef = useRef(speak)
  speakRef.current = speak
  const stopTtsRef = useRef(stopTts)
  stopTtsRef.current = stopTts

  const stopEverything = useCallback(() => {
    ttsTokenRef.current += 1
    const el = audioRef.current
    if (el) {
      el.onerror = null
      try {
        el.pause()
      } catch {
        /* noop */
      }
    }
    stopTtsRef.current()
    setPlaying(false)
  }, [])

  /* ---------------- TTS 逐句朗读 ---------------- */
  const startTts = useCallback(
    (fromIndex: number) => {
      const current = lessonRef.current
      if (!current || current.sentences.length === 0) return
      const token = ++ttsTokenRef.current
      const el = audioRef.current
      if (el) {
        try {
          el.pause()
        } catch {
          /* noop */
        }
      }
      setMode('tts')
      setSource('tts')
      setPlaying(true)

      const speakNext = (index: number) => {
        if (token !== ttsTokenRef.current) return
        const sentences = lessonRef.current?.sentences ?? []
        if (index >= sentences.length) {
          setPlaying(false)
          setPlayingSentence(-1)
          onEndedRef.current?.()
          return
        }
        setPlayingSentence(index)
        const text = sentences[index].en
        if (!text) {
          speakNext(index + 1)
          return
        }
        speakRef.current(
          text,
          rateRef.current,
          () => {
            if (token !== ttsTokenRef.current) return
            speakNext(index + 1)
          },
          'en',
        )
      }
      speakNext(Math.max(0, fromIndex))
    },
    [],
  )

  /* ---------------- 原声播放 ---------------- */
  const ensureAudio = useCallback((): HTMLAudioElement => {
    let el = audioRef.current
    if (el) return el
    el = new Audio()
    el.preload = 'metadata'
    el.addEventListener('timeupdate', () => {
      const cur = audioRef.current
      if (!cur) return
      setElapsed(cur.currentTime || 0)
      const sentences = lessonRef.current?.sentences ?? []
      setPlayingSentence(sentenceAt(sentences, cur.currentTime || 0))
    })
    el.addEventListener('loadedmetadata', () => {
      const cur = audioRef.current
      if (!cur) return
      setDuration(Number.isFinite(cur.duration) ? cur.duration : 0)
    })
    el.addEventListener('ended', () => {
      setPlaying(false)
      setPlayingSentence(-1)
      onEndedRef.current?.()
    })
    audioRef.current = el
    return el
  }, [])

  const originChain = useCallback((current: BookLesson, bid: string): string[] => {
    if (!current.audio) return []
    const chain: string[] = [localAudioUrl(bid, current.audio.key)]
    if (current.audio.remote) chain.push(current.audio.remote)
    return chain
  }, [])

  /** 播放原声；chainIdx 用于失败后顺延到下一个音源 */
  const playOrigin = useCallback(
    (fromTime: number, chainIdx = 0, fromSentence = 0) => {
      const current = lessonRef.current
      if (!current) return
      const chain = originChain(current, bookIdRef.current)
      if (chainIdx >= chain.length) {
        console.error('[book-audio] 原书录音不可用，改用 AI 朗读')
        startTts(fromSentence)
        return
      }
      const el = ensureAudio()
      chainIdxRef.current = chainIdx
      setSource(chainIdx === 0 ? 'local' : 'remote')
      setMode('origin')
      setPlaying(true)
      // 打断 TTS 连播
      ttsTokenRef.current += 1
      stopTtsRef.current()

      const fail = () => {
        if (chainIdxRef.current !== chainIdx) return
        chainIdxRef.current = chainIdx + 1
        console.error(`[book-audio] 音源不可用，降级到下一个：${chain[chainIdx]}`)
        playOrigin(fromTime, chainIdx + 1, fromSentence)
      }
      // 媒体本身加载/解码失败（文件缺失、被当成 HTML 返回）才降级到下一个音源
      el.onerror = fail
      const url = chain[chainIdx]
      const absolute = safeAbsolute(url)
      const applyStart = () => {
        el.playbackRate = rateRef.current
        if (fromTime > 0) {
          try {
            el.currentTime = fromTime
          } catch {
            /* noop */
          }
        }
        const p = el.play()
        if (p && typeof p.catch === 'function') {
          p.catch((err) => {
            // play() 被拒多半是自动播放策略（缺少用户手势），不代表音源坏了：
            // 保持当前音源，等下一次真实点击再播。
            console.error('[book-audio] 播放被拒绝（等待用户手势）', err)
            setPlaying(false)
          })
        }
      }
      const onMeta = () => {
        el.removeEventListener('loadedmetadata', onMeta)
        applyStart()
      }
      // 同一个地址重复赋值不会再次触发 loadedmetadata：
      // 已经就绪时直接定位播放，否则重新挂载等待元数据。
      if (el.src === absolute && el.readyState >= 1) {
        applyStart()
      } else {
        el.addEventListener('loadedmetadata', onMeta)
        el.src = url
      }
    },
    [ensureAudio, originChain, startTts],
  )

  /* ---------------- 对外接口 ---------------- */
  const playAll = useCallback(() => {
    const current = lessonRef.current
    if (!current) return
    const el = audioRef.current
    // 已经在原声模式且暂停中 → 继续播
    if (el && chainIdxRef.current < 2 && mode === 'origin') {
      const p = el.play()
      if (p && typeof p.catch === 'function') {
        p.catch((err) => console.error('[book-audio] 播放被拒绝（等待用户手势）', err))
      }
      setPlaying(true)
      return
    }
    playOrigin(0, 0, 0)
  }, [mode, playOrigin])

  const playSentence = useCallback(
    (index: number) => {
      const current = lessonRef.current
      if (!current) return
      const sentence = current.sentences[index]
      if (!sentence) return
      if (sentence.start !== undefined && sentence.end !== undefined) {
        playOrigin(sentence.start, 0, index)
        return
      }
      // 没有时间轴：改用 TTS 朗读该句并继续往后
      startTts(index)
    },
    [playOrigin, startTts],
  )

  const seekToSentence = useCallback(
    (index: number) => {
      const current = lessonRef.current
      if (!current) return
      const sentence = current.sentences[index]
      if (!sentence || sentence.start === undefined) {
        playSentence(index)
        return
      }
      playOrigin(sentence.start, 0, index)
    },
    [playOrigin, playSentence],
  )

  const seekRatio = useCallback(
    (ratio: number) => {
      const el = audioRef.current
      if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return
      const target = Math.min(el.duration - 0.05, Math.max(0, ratio * el.duration))
      try {
        el.currentTime = target
      } catch {
        /* noop */
      }
      setElapsed(target)
    },
    [],
  )

  const setRate = useCallback((next: number) => {
    setRateState(next)
    rateRef.current = next
    const el = audioRef.current
    if (el) {
      try {
        el.playbackRate = next
      } catch {
        /* noop */
      }
    }
  }, [])

  const toggle = useCallback(() => {
    const el = audioRef.current
    if (mode === 'origin' && el) {
      if (el.paused) {
        const p = el.play()
        if (p && typeof p.catch === 'function') {
          p.catch((err) => console.error('[book-audio] 播放被拒绝（等待用户手势）', err))
        }
        setPlaying(true)
      } else {
        el.pause()
        setPlaying(false)
      }
      return
    }
    if (mode === 'tts') {
      // TTS 不可暂停，停止即回到起点
      stopEverything()
      setPlayingSentence(-1)
      return
    }
    playAll()
  }, [mode, playAll, playOrigin, stopEverything])

  const stop = useCallback(() => {
    stopEverything()
    setMode('idle')
    setSource('none')
    setPlayingSentence(-1)
  }, [stopEverything])

  /* 换篇 / 卸载时停止播放 */
  useEffect(() => {
    return () => {
      stopEverything()
    }
  }, [stopEverything])

  useEffect(() => {
    stopEverything()
    setMode('idle')
    setSource('none')
    setPlayingSentence(-1)
    setElapsed(0)
    setDuration(0)
  }, [lesson?.id, stopEverything])

  const hasOrigin = Boolean(lesson?.audio)

  return {
    mode,
    source,
    playing,
    playingSentence,
    elapsed,
    duration,
    rate,
    hasOrigin,
    playAll,
    playSentence,
    seekToSentence,
    seekRatio,
    setRate,
    toggle,
    stop,
    onEnded,
  }
}
