import { useCallback, useEffect, useState } from 'react'

// ─── Module-level shared state (all SpeakerBtn & header button share one session) ───
type DownloadStatus = 'idle' | 'downloading' | 'ready' | 'error'

let _status: DownloadStatus = 'idle'
let _progress = 0
let _progressLabel = ''
let sessionShared: any = null
let sessionZh: any = null
let initPromiseShared: Promise<void> | null = null
let initPromiseZh: Promise<void> | null = null
let audioShared: AudioBufferSourceNode | null = null
let audioCtxShared: AudioContext | null = null
let reqIdShared = 0

// 播放状态必须模块级共享：SpeakerBtn / 设置页 / 复习页 / 闯关页会同时存在多个
// useSpeech 实例，若各自 useState，某处 stop() 后其他实例的按钮会一直显示「播放中」。
let _speaking = false
const speakingSubscribers = new Set<(v: boolean) => void>()
function emitSpeaking(v: boolean): void {
  if (_speaking === v) return
  _speaking = v
  speakingSubscribers.forEach((fn) => fn(v))
}

// 共享 AudioContext（Web Audio 在 Android WebView 下对本地 wav 播放最稳定，
// 优于 new Audio(blobUrl).play()——后者在 WebView 中常静音且不报错）。
function getAudioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext
  if (!Ctor) return null
  if (!audioCtxShared) audioCtxShared = new Ctor()
  return audioCtxShared
}

// APK 播放双路径：主用 <audio>(new Audio) 播放 blob wav；失败时回退 Web Audio。
let audioSharedHtml: HTMLAudioElement | null = null

// Web Audio 兜底播放。url 传入时在播放结束/失败后 revoke，避免 blob URL 泄漏。
function playViaWebAudio(
  blob: Blob,
  rate: number,
  reqId: number,
  onEnded?: () => void,
  setSpeakingFn?: (v: boolean) => void,
  url?: string,
): void {
  const revoke = () => {
    if (!url) return
    try {
      URL.revokeObjectURL(url)
    } catch {
      /* noop */
    }
  }
  const ctx = getAudioCtx()
  if (!ctx) {
    setSpeakingFn?.(false)
    revoke()
    return
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  blob
    .arrayBuffer()
    .then((buf) => ctx!.decodeAudioData(buf))
    .then((audioBuf) => {
      if (reqId !== reqIdShared) {
        // 已被更新的请求取代，本结果作废
        revoke()
        return
      }
      const src = ctx!.createBufferSource()
      src.buffer = audioBuf
      src.playbackRate.value = rate
      src.connect(ctx!.destination)
      audioShared = src
      src.onended = () => {
        setSpeakingFn?.(false)
        if (audioShared === src) audioShared = null
        revoke()
        onEnded?.()
      }
      src.start(0)
    })
    .catch((e) => {
      console.error('Web Audio 播放失败:', e)
      setSpeakingFn?.(false)
      revoke()
    })
}

/* ------------------------------------------------------------------ */
/* 预合成缓存：把「点一下 → 现场推理 → 出声」改成「先备好音频 → 秒播」  */
/* 同一句重复朗读 / 后台预取命中时不再等待 Piper WASM 推理。            */
/* ------------------------------------------------------------------ */
export interface PreparedSpeech {
  blob: Blob
  /** wav 媒体时长（秒）；0 表示头部解析失败，由上层估算 */
  duration: number
}

const preparedCache = new Map<string, PreparedSpeech>()
const pendingSynth = new Map<string, Promise<PreparedSpeech | null>>()
/** Piper WASM 会话不能并发 predict，所有合成串行排队 */
let synthChain: Promise<unknown> = Promise.resolve()

const synthKey = (text: string, lang: 'en' | 'zh') => `${lang}\u0000${text}`

function enqueueSynth<T>(job: () => Promise<T>): Promise<T> {
  const p = synthChain.then(job, job)
  synthChain = p.catch(() => {})
  return p
}

/** 从 wav 头取真实时长，用于进度条与总时长显示（不依赖 loadedmetadata 异步事件）。 */
async function wavDuration(blob: Blob): Promise<number> {
  try {
    const head = new DataView(await blob.slice(0, 4096).arrayBuffer())
    if (head.byteLength < 44) return 0
    const tag = (o: number) =>
      String.fromCharCode(head.getUint8(o), head.getUint8(o + 1), head.getUint8(o + 2), head.getUint8(o + 3))
    if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return 0
    let off = 12
    let byteRate = 0
    let dataSize = 0
    while (off + 8 <= head.byteLength) {
      const id = tag(off)
      const size = head.getUint32(off + 4, true)
      if (id === 'fmt ') byteRate = head.getUint32(off + 16, true)
      if (id === 'data') { dataSize = size; break }
      if (size <= 0) break
      off += 8 + size
    }
    return byteRate > 0 && dataSize > 0 ? dataSize / byteRate : 0
  } catch {
    return 0
  }
}

/** 模块级会话准备：预合成与 speak 共用，不依赖任何 React 实例。 */
async function ensureSessionReady(lang: 'en' | 'zh'): Promise<any> {
  if (!sessionShared?.ready) {
    if (_status === 'error') {
      _status = 'idle'
      emit('idle')
    }
    if (_status === 'downloading' && initPromiseShared) await initPromiseShared
    else await downloadModel()
  }
  if (lang === 'en') return sessionShared
  if (!sessionZh?.ready) {
    emitProgress(50, '加载中文语音模型…')
    await initChineseSession()
  }
  return sessionZh
}

async function predictWithTimeout(session: any, text: string): Promise<Blob> {
  let timer: number | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error('predict-timeout(8s)')), 8000)
  })
  try {
    return await Promise.race<Blob>([session.predict(text), timeout])
  } finally {
    if (timer !== undefined) window.clearTimeout(timer)
  }
}

/** 后台预合成一句并缓存；浏览器环境（走系统 TTS）返回 null。 */
export function prepareSpeech(text: string, lang: 'en' | 'zh' = 'en'): Promise<PreparedSpeech | null> {
  const clean = text.trim()
  if (!clean || !isCapacitor) return Promise.resolve(null)
  const key = synthKey(clean, lang)
  const cached = preparedCache.get(key)
  if (cached) return Promise.resolve(cached)
  const pending = pendingSynth.get(key)
  if (pending) return pending
  const p = enqueueSynth(async () => {
    try {
      const session = await ensureSessionReady(lang)
      if (!session?.ready) throw new Error('TtsSession not ready')
      const blob = await predictWithTimeout(session, clean)
      const item: PreparedSpeech = { blob, duration: await wavDuration(blob) }
      preparedCache.set(key, item)
      return item
    } catch (err) {
      console.error('Piper 预合成失败:', err)
      return null
    } finally {
      pendingSynth.delete(key)
    }
  })
  pendingSynth.set(key, p)
  return p
}

/** 同步查缓存：让队列可以判断这句是否已经能「秒播」。 */
export function peekPrepared(text: string, lang: 'en' | 'zh' = 'en'): PreparedSpeech | null {
  return preparedCache.get(synthKey(text.trim(), lang)) ?? null
}

/** 倍速即时生效，不打断当前播放。 */
/** 当前音频的进度心跳，模块级唯一：stop / 换句时必须清掉，避免连播堆积定时器。 */
let progressTick: number | null = null

function clearProgressTick(): void {
  if (progressTick !== null) {
    window.clearInterval(progressTick)
    progressTick = null
  }
}

export function setPlaybackRate(rate: number): void {
  if (audioSharedHtml) audioSharedHtml.playbackRate = rate
  if (audioShared) {
    try { audioShared.playbackRate.value = rate } catch { /* noop */ }
  }
}

function stopCurrentAudio(): void {
  clearProgressTick()
  if (audioSharedHtml) {
    const el = audioSharedHtml
    audioSharedHtml = null
    el.onended = null
    el.onerror = null
    try {
      el.pause()
      if (el.src.startsWith('blob:')) URL.revokeObjectURL(el.src)
    } catch { /* noop */ }
  }
  if (audioShared) {
    const src = audioShared
    audioShared = null
    src.onended = null
    try { src.stop() } catch { /* noop */ }
    try { src.disconnect() } catch { /* noop */ }
  }
}

/** 播放已备好的 wav：不再有任何 await，调用即出声。 */
export function playPrepared(
  prepared: PreparedSpeech,
  rate: number,
  onEnded?: () => void,
  onProgress?: (current: number, duration: number) => void,
  startAt = 0,
): void {
  stopCurrentAudio()
  const url = URL.createObjectURL(prepared.blob)
  const audio = new Audio(url)
  audio.playbackRate = rate
  audioSharedHtml = audio

  let ended = false
  const cleanup = () => {
    if (ended) return
    ended = true
    clearProgressTick()
    emitSpeaking(false)
    try { URL.revokeObjectURL(url) } catch { /* noop */ }
    if (audioSharedHtml === audio) audioSharedHtml = null
    onEnded?.()
  }
  audio.onended = cleanup

  let webAudioTried = false
  const tryWebAudio = () => {
    if (webAudioTried) return
    webAudioTried = true
    clearProgressTick()
    playViaWebAudio(prepared.blob, rate, reqIdShared, onEnded, emitSpeaking, url)
  }
  audio.onerror = () => tryWebAudio()

  if (startAt > 0) {
    audio.addEventListener('loadedmetadata', () => {
      try { audio.currentTime = Math.min(startAt, prepared.duration || startAt) } catch { /* noop */ }
    }, { once: true })
  }

  emitSpeaking(true)
  clearProgressTick()
  progressTick = window.setInterval(() => {
    if (ended || audio.paused) return
    onProgress?.(audio.currentTime, audio.duration || prepared.duration)
  }, 150)

  const p = audio.play()
  if (p && typeof p.catch === 'function') p.catch(() => tryWebAudio())
}

// 运行环境判断：APK（Capacitor）用 Piper 离线模型；浏览器用原生 SpeechSynthesis。
const isCapacitor =
  typeof window !== 'undefined' && (window as any).Capacitor !== undefined
// 浏览器原生 TTS 是否可用
const synthAvailable =
  typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window

const subscribers = new Set<(s: DownloadStatus) => void>()
const progressSubscribers = new Set<(p: { pct: number; label: string }) => void>()

function emit(s: DownloadStatus) {
  _status = s
  subscribers.forEach((fn) => fn(s))
}

function emitProgress(pct: number, label: string) {
  _progress = pct
  _progressLabel = label
  progressSubscribers.forEach((fn) => fn({ pct, label }))
}

/** Subscribe to shared download status. Returns unsubscribe function. */
function onStatusChange(fn: (s: DownloadStatus) => void) {
  subscribers.add(fn)
  return () => { subscribers.delete(fn) }
}

/** Subscribe to download progress {pct:0-100, label}. Returns unsubscribe function. */
function onProgressChange(fn: (p: { pct: number; label: string }) => void) {
  progressSubscribers.add(fn)
  return () => { progressSubscribers.delete(fn) }
}

/**
 * 中文模型按需加载：只在第一次朗读中文时创建另一个会话。
 * 冷启动因此只需初始化内置的英文模型，而不是一次性加载两个模型。
 */
async function initChineseSession(): Promise<void> {
  if (sessionZh?.ready) return
  if (initPromiseZh) return initPromiseZh
  initPromiseZh = (async () => {
    const { TtsSession } = await import('@realtimex/piper-tts-web')
    const sess = await TtsSession.create({
      voiceId: 'zh_CN-huayan-medium',
      fallbackStrategy: 'local',
      allowLocalModels: true,
      wasmPaths: {
        onnxWasm: `${import.meta.env.BASE_URL}tts/onnx/`,
        piperData: `${import.meta.env.BASE_URL}tts/piper/`,
        piperWasm: `${import.meta.env.BASE_URL}tts/piper/`,
      },
      progress: (p: { url: string; total: number; loaded: number }) => {
        if (p.total > 0) {
          emitProgress(50 + Math.round((p.loaded / p.total) * 50), '加载中文语音模型…')
        }
      },
    })
    // 防御断言：两个语音必须是独立会话。若库仍为单例（补丁未生效），
    // 二次 create 会复用同一实例并覆盖 _wasmPaths，导致 predict 必败。
    if (sess === sessionShared) {
      throw new Error('TtsSession 复用了同一实例（单例补丁未生效），中英文会话必须独立')
    }
    if (!sess?.ready) throw new Error('Chinese TtsSession not ready after create')
    sessionZh = sess
    emitProgress(100, '完成')
  })().catch((err) => {
    initPromiseZh = null
    sessionZh = null
    throw err
  })
  return initPromiseZh
}

/**
 * 冷启动预加载（APK 专属）：只加载英文模型。
 * Android WebView 要求 audio.play() 处在用户手势链内，必须在启动时就把会话备好；
 * 中文模型延迟到首次中文朗读。非 Capacitor 环境走原生 SpeechSynthesis，不调用本函数。
 */
export async function downloadModel(): Promise<void> {
  if (sessionShared?.ready) return
  if (_status === 'downloading' && initPromiseShared) return initPromiseShared

  emit('downloading')
  emitProgress(0, '准备中…')
  initPromiseShared = (async () => {
    try {
      emitProgress(5, '加载引擎…')
      const { TtsSession } = await import('@realtimex/piper-tts-web')
      // 离线优先：allowLocalModels + local 策略，不回退 CDN。
      sessionShared = await TtsSession.create({
        voiceId: 'en_US-lessac-medium',
        fallbackStrategy: 'local',
        allowLocalModels: true,
        wasmPaths: {
          onnxWasm: `${import.meta.env.BASE_URL}tts/onnx/`,
          piperData: `${import.meta.env.BASE_URL}tts/piper/`,
          piperWasm: `${import.meta.env.BASE_URL}tts/piper/`,
        },
        progress: (p: { url: string; total: number; loaded: number }) => {
          if (p.total > 0) {
            emitProgress(10 + Math.round((p.loaded / p.total) * 90), '加载英文语音模型…')
          }
        },
      })
      if (!sessionShared?.ready) throw new Error('TtsSession not ready after create')
      emitProgress(100, '完成')
      emit('ready')
    } catch (err) {
      console.error('Piper TTS 内置模型初始化失败:', err)
      emit('error')
      initPromiseShared = null
      sessionShared = null
      throw err
    }
  })()
  return initPromiseShared!
}

export function getDownloadStatus(): DownloadStatus {
  return _status
}

export function getDownloadProgress(): { pct: number; label: string } {
  return { pct: _progress, label: _progressLabel }
}

/**
 * Text-to-speech via Piper WASM (local inference, no system TTS needed).
 * Uses en_US-lessac-medium voice (American English, female, clear) and
 * zh_CN-huayan-medium (Mandarin) for Chinese text.
 */
export function useSpeech() {
  // speaking 用模块级共享状态，setSpeaking 直接指向 emitSpeaking（引用稳定，
  // 不需要进任何 useCallback 的依赖数组）。
  const [speaking, setSpeakingState] = useState(_speaking)
  const setSpeaking = emitSpeaking
  const [status, setStatus] = useState<DownloadStatus>(_status)
  const [progress, setProgress] = useState<{ pct: number; label: string }>({
    pct: _progress,
    label: _progressLabel,
  })

  // Sync shared status into local state
  useEffect(() => onStatusChange(setStatus), [])
  // Sync shared download progress into local state
  useEffect(() => onProgressChange(setProgress), [])
  useEffect(() => {
    speakingSubscribers.add(setSpeakingState)
    return () => { speakingSubscribers.delete(setSpeakingState) }
  }, [])

  // 浏览器环境：预热 SpeechSynthesis 语音列表（部分浏览器需异步 loaded）。
  useEffect(() => {
    if (isCapacitor || !synthAvailable) return
    // 立即触发一次加载；若为空，监听 voiceschanged 再次填充。
    if (!window.speechSynthesis.getVoices().length) {
      const onVoices = () => window.speechSynthesis.getVoices()
      window.speechSynthesis.onvoiceschanged = onVoices
      return () => {
        window.speechSynthesis.onvoiceschanged = null
      }
    }
  }, [])

  // APK 环境：Android WebView 要求 AudioContext 在用户手势链内 resume，
  // 否则后续 setTimeout 内播放会被静音。首次用户交互（点击/触摸）即解锁。
  useEffect(() => {
    if (!isCapacitor) return
    const unlock = () => {
      const ctx = getAudioCtx()
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {})
    }
    const opts = { passive: true } as AddEventListenerOptions
    document.addEventListener('pointerdown', unlock, opts)
    document.addEventListener('touchstart', unlock, opts)
    document.addEventListener('keydown', unlock, opts)
    return () => {
      document.removeEventListener('pointerdown', unlock)
      document.removeEventListener('touchstart', unlock)
      document.removeEventListener('keydown', unlock)
    }
  }, [])

  // 回退方案：系统语音合成（WebView 内置，不需要模型/联网）。当 Piper 挂起或失败时兜底，保证至少能出声。
  const fallbackSpeechSynthesis = useCallback(
    (text: string, rate: number, onEnded?: () => void, lang: 'en' | 'zh' = 'en') => {
      try {
        if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
          console.error('系统 TTS 不可用，且 Piper 失败')
          return
        }
        window.speechSynthesis.cancel()
        const u = new SpeechSynthesisUtterance(text)
        // 按文本语言选择系统语音：中文走 zh-CN，英文走 en-US。
        const voiceLang = lang === 'zh' ? 'zh-CN' : 'en-US'
        const voices = window.speechSynthesis.getVoices()
        const picked = voices.find((v) => v.lang === voiceLang) ?? null
        if (picked) u.voice = picked
        u.lang = voiceLang
        u.rate = rate
        setSpeaking(true)
        u.onend = () => {
          setSpeaking(false)
          onEnded?.()
        }
        u.onerror = () => {
          setSpeaking(false)
          // 系统 TTS 也失败：仍然走完回调链，避免听词自动连播卡死。
          onEnded?.()
        }
        window.speechSynthesis.speak(u)
      } catch (e) {
        console.error('fallback TTS failed:', e)
        setSpeaking(false)
      }
    },
    [],
  )

  // loading 直接由共享的下载状态派生：预合成在模块级进行，不依赖某个 React 实例。
  const loading = status === 'downloading'

  const speak = useCallback(
    async (
      text: string,
      rate = 0.9,
      onEnded?: () => void,
      lang: 'en' | 'zh' = 'en',
      opts?: { startAt?: number; onProgress?: (current: number, duration: number) => void },
    ) => {
      if (!text) return

      // ── 浏览器环境：直接用原生 SpeechSynthesis，不加载模型、不联网 ──
      if (!isCapacitor) {
        if (!synthAvailable) {
          console.warn('浏览器环境 speechSynthesis 不可用')
          return
        }
        try {
          window.speechSynthesis.cancel() // 停止上一条
          const u = new SpeechSynthesisUtterance(text)
          // 选语音：优先匹配 lang 对应的本地语音包
          const voiceLang = lang === 'zh' ? 'zh-CN' : 'en-US'
          const voices = window.speechSynthesis.getVoices()
          const picked =
            voices.find((v) => v.lang === voiceLang) ??
            voices.find((v) => v.lang.startsWith(lang === 'zh' ? 'zh' : 'en')) ??
            null
          if (picked) u.voice = picked
          u.lang = voiceLang
          u.rate = rate
          setSpeaking(true)
          u.onend = () => {
            setSpeaking(false)
            onEnded?.()
          }
          u.onerror = () => {
            setSpeaking(false)
            // 连播队列靠 onEnded 推进，报错时也必须走完回调链否则永久卡住。
            onEnded?.()
          }
          window.speechSynthesis.speak(u)
        } catch (err) {
          console.error('SpeechSynthesis speak failed:', err)
          setSpeaking(false)
        }
        return
      }

      // ── APK 环境：Piper 离线模型（中+英两个 medium） ──
      // 先停掉上一条；合成走统一缓存，命中时不再等待 WASM 推理。
      stopCurrentAudio()
      const id = ++reqIdShared
      try {
        const prepared = await prepareSpeech(text, lang)
        // 等待合成期间可能已被 stop() / 新的一句取代
        if (id !== reqIdShared) return
        if (!prepared) {
          fallbackSpeechSynthesis(text, rate, onEnded, lang)
          return
        }
        playPrepared(prepared, rate, onEnded, opts?.onProgress, opts?.startAt ?? 0)
      } catch (err) {
        if (id !== reqIdShared) return
        console.error('Piper TTS speak failed:', err)
        setSpeaking(false)
        fallbackSpeechSynthesis(text, rate, onEnded, lang)
      }
    },
    [fallbackSpeechSynthesis],
  )

  const stop = useCallback(() => {
    // 使所有在途 speak（仍在等合成）失效，避免停止后又冒出上一句。
    // 注意：后台预合成不受影响，它只写缓存，不播放。
    reqIdShared += 1
    emitSpeaking(false)
    if (synthAvailable) window.speechSynthesis.cancel()
    if (!isCapacitor) return
    stopCurrentAudio()
  }, [])

  // 产品目标为 APK；非 Capacitor 仅用于本地 vite 预览，走系统 TTS，视为永久 ready。
  const browserReady = !isCapacitor
  const finalStatus: DownloadStatus = browserReady ? 'ready' : status
  const finalLoading = browserReady ? false : loading
  const finalSupported = browserReady ? synthAvailable : true

  return {
    speak,
    stop,
    preload: downloadModel,
    speaking,
    supported: finalSupported,
    loading: finalLoading,
    downloadStatus: finalStatus,
    downloadProgress: browserReady ? { pct: 100, label: '就绪' } : progress,
  }
}
