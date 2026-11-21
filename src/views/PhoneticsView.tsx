import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  PHONEMES,
  PHONEME_GROUPS,
  phonemeAudioUrl,
  phonemeVideoUrl,
  type Phoneme,
} from '../data/phonetics'
import { stopSharedAudio, useSpeech } from '../hooks/useSpeech'
import { Sheet } from '../components/Sheet'
import { InfoIcon, SpeakerIcon } from '../components/icons'

type Filter = 'all' | 'vowel' | 'consonant'

const FILTERS: { id: Filter; label: string; count: number }[] = [
  { id: 'all', label: '全部', count: PHONEMES.length },
  {
    id: 'vowel',
    label: '元音',
    count: PHONEME_GROUPS.filter((g) => g.family === 'vowel').reduce(
      (n, g) => n + PHONEMES.filter((p) => p.category === g.id).length,
      0,
    ),
  },
  {
    id: 'consonant',
    label: '辅音',
    count: PHONEME_GROUPS.filter((g) => g.family === 'consonant').reduce(
      (n, g) => n + PHONEMES.filter((p) => p.category === g.id).length,
      0,
    ),
  },
]

/**
 * 音标页：48 个国际音标按类别分组，点击即播放本地 mp3（离线可用）。
 * 详情页复用抓取自 typewords.cc/phonetics 的发音要领、辨音提示与例词。
 */
export default function PhoneticsView({ active = true }: { active?: boolean }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [errorId, setErrorId] = useState<string | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [videoMissing, setVideoMissing] = useState(false)
  const [speakingWord, setSpeakingWord] = useState<string | null>(null)
  const { speak, stop: stopSpeech } = useSpeech()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const speakingWordRef = useRef<string | null>(null)

  const stopWord = useCallback(() => {
    speakingWordRef.current = null
    setSpeakingWord(null)
    stopSpeech()
  }, [stopSpeech])

  useEffect(() => {
    setVideoMissing(false)
    stopWord()
  }, [detailId, stopWord])

  const groups = useMemo(
    () => PHONEME_GROUPS.filter((g) => filter === 'all' || g.family === filter),
    [filter],
  )
  const detail = useMemo(
    () => PHONEMES.find((p) => p.id === detailId) ?? null,
    [detailId],
  )

  const stop = useCallback(() => {
    const audio = audioRef.current
    audioRef.current = null
    if (audio) {
      audio.onended = null
      audio.onerror = null
      audio.pause()
      try { audio.currentTime = 0 } catch { /* noop */ }
    }
    setPlayingId(null)
  }, [])

  useEffect(() => {
    if (!active) {
      stop()
      stopWord()
      setDetailId(null)
    }
  }, [active, stop, stopWord])

  useEffect(() => () => {
    stop()
    stopWord()
  }, [stop, stopWord])

  const play = (phoneme: Phoneme) => {
    stop()
    videoRef.current?.pause()
    // 音标音频不走 TTS：浏览器端停 speechSynthesis，APK 端停共享 Web Audio，避免两个声音叠在一起
    stopWord()
    stopSharedAudio()
    setErrorId(null)

    const audio = new Audio(phonemeAudioUrl(phoneme.id))
    audio.preload = 'auto'
    audioRef.current = audio
    setPlayingId(phoneme.id)

    const clear = () => {
      if (audioRef.current !== audio) return
      audioRef.current = null
      setPlayingId(null)
    }
    audio.onended = clear
    audio.onerror = () => {
      clear()
      setErrorId(phoneme.id)
    }
    void audio.play().catch(() => {
      clear()
      setErrorId(phoneme.id)
    })
  }

  /** 常见例词点击喇叭：浏览器走系统 TTS，APK 走离线 Piper 英文语音 */
  const speakWord = (word: string) => {
    if (speakingWordRef.current === word) {
      stopWord()
      return
    }
    stop()
    videoRef.current?.pause()
    stopWord()
    speakingWordRef.current = word
    setSpeakingWord(word)
    void speak(word, 0.9, () => {
      if (speakingWordRef.current === word) {
        speakingWordRef.current = null
        setSpeakingWord(null)
      }
    }, 'en')
  }

  return (
    <div className="pb-6">
      {/* 元音 / 辅音筛选 */}
      <div className="mb-2 flex items-center gap-2">
        <div className="inline-flex shrink-0 rounded-full border border-slate-200/70 bg-white/70 p-0.5 dark:border-white/10 dark:bg-white/[0.06]">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                filter === item.id
                  ? 'bg-brand-600 text-white shadow-soft dark:bg-brand-500/15 dark:text-brand-200 dark:shadow-none'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              {item.label} {item.count}
            </button>
          ))}
        </div>
        <span className="ml-auto shrink-0 text-[11px] text-slate-400">点击音标听发音</span>
      </div>

      {/* 分组音标网格 */}
      {groups.map((group) => {
        const items = PHONEMES.filter((p) => p.category === group.id)
        if (!items.length) return null
        return (
          <section key={group.id} className="mb-3">
            <div className="mb-1.5 flex items-baseline gap-2 px-1">
              <h2 className="shrink-0 text-[13px] font-bold text-slate-900 dark:text-slate-50">
                {group.title}
              </h2>
              <p className="min-w-0 truncate text-[10px] text-slate-400">{group.description}</p>
              <span className="ml-auto shrink-0 text-[10px] text-slate-400">{items.length} 个</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {items.map((p) => {
                const isPlaying = playingId === p.id
                const hasError = errorId === p.id
                const isDetail = detailId === p.id
                return (
                  <div
                    key={p.id}
                    className={`flex min-w-0 flex-col rounded-[12px] border bg-white shadow-soft transition dark:bg-white/[0.04] ${
                      isDetail
                        ? 'border-brand-500/70 ring-2 ring-brand-500/15'
                        : isPlaying
                          ? 'border-brand-400/70'
                          : 'border-slate-900/[0.05] dark:border-white/10'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => play(p)}
                      aria-label={`播放音标 ${p.symbol}`}
                      className={`flex h-[38px] w-full min-w-0 flex-row items-center justify-center gap-1.5 rounded-t-[12px] px-0.5 transition active:scale-[0.97] ${
                        isPlaying ? 'bg-brand-50 dark:bg-brand-500/10' : ''
                      }`}
                    >
                      <span className="whitespace-nowrap font-display text-[13px] font-bold leading-none text-slate-800 dark:text-slate-100">
                        {p.symbol}
                      </span>
                      <SpeakerIcon
                        width={11}
                        height={11}
                        className={`shrink-0 ${
                          hasError
                            ? 'text-rose-500'
                            : isPlaying
                              ? 'animate-pulse text-brand-600 dark:text-brand-300'
                              : 'text-slate-400'
                        }`}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetailId((prev) => (prev === p.id ? null : p.id))}
                      aria-label={`查看音标 ${p.symbol} 的发音讲解`}
                      className={`flex h-6 w-full items-center justify-center gap-0.5 rounded-b-[12px] border-t border-slate-900/[0.04] text-[9px] font-semibold transition dark:border-white/[0.06] ${
                        isDetail
                          ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300'
                          : 'text-slate-400 hover:bg-slate-50 hover:text-brand-600 dark:hover:bg-white/5 dark:hover:text-brand-300'
                      }`}
                    >
                      <InfoIcon width={10} height={10} className="shrink-0" />
                      <span>讲解</span>
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}

      {/* 发音讲解弹层：播放按钮收进标题栏，留出更多空间给视频与讲解 */}
      <Sheet
        open={detail !== null}
        onClose={() => setDetailId(null)}
        headerLeading={detail ? (
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="min-w-0 truncate font-display text-xl font-semibold text-slate-900 dark:text-slate-50">
              {detail.symbol} 发音讲解
            </h2>
            <button
              type="button"
              onClick={() => play(detail)}
              aria-label={
                errorId === detail.id
                  ? '音频暂不可用'
                  : playingId === detail.id
                    ? '正在播放，点击重播'
                    : '点击播放音标'
              }
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white shadow-soft transition hover:bg-brand-700 active:scale-90 dark:border dark:border-brand-400/50 dark:bg-brand-500/15 dark:text-brand-200 dark:shadow-none dark:hover:bg-brand-500/25 ${
                playingId === detail.id ? 'animate-pulse' : ''
              }`}
            >
              <SpeakerIcon width={17} height={17} />
            </button>
          </div>
        ) : null}
        maxWidth="max-w-lg"
      >
        {detail && (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-[16px] border border-sky-200/80 bg-sky-100/70 dark:border-sky-500/20 dark:bg-sky-500/10">
              {videoMissing ? (
                <div className="flex aspect-video items-center justify-center px-6 text-center text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">
                  视频暂不可用，仍可播放音频并查看文字讲解。
                </div>
              ) : (
                <video
                  key={detail.id}
                  ref={videoRef}
                  className="aspect-video w-full bg-black"
                  controls
                  playsInline
                  preload="metadata"
                  src={phonemeVideoUrl(detail.id)}
                  onPlay={() => { stop(); stopWord() }}
                  onError={() => setVideoMissing(true)}
                />
              )}
            </div>

            <div>
              <p className="mb-1.5 px-1 text-[12px] font-bold text-slate-700 dark:text-slate-200">发音要领</p>
              <ul className="surface-inset space-y-1.5 p-3">
                {detail.pronunciationTips.map((tip) => (
                  <li key={tip} className="flex gap-2 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-slate-400" />
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-[18px] border border-slate-200/70 bg-white/70 p-3 dark:border-slate-700/50 dark:bg-slate-800/40">
              <p className="mb-1 text-[12px] font-bold text-slate-700 dark:text-slate-200">辨音提示</p>
              <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                {detail.confusionNote}
              </p>
            </div>

            <div>
              <p className="mb-1.5 px-1 text-[12px] font-bold text-slate-700 dark:text-slate-200">常见例词</p>
              <div className="divide-y divide-slate-200/70 overflow-hidden rounded-[14px] border border-slate-200/70 dark:divide-white/10 dark:border-white/10">
                {detail.examples.map((ex) => (
                  <div
                    key={`${ex.word}-${ex.phonetic}`}
                    className="flex items-center gap-2 bg-white/50 px-3 py-2.5 dark:bg-white/[0.03]"
                  >
                    <button
                      type="button"
                      onClick={() => speakWord(ex.word)}
                      aria-label={`朗读 ${ex.word}`}
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition active:scale-90 ${
                        speakingWord === ex.word
                          ? 'bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300'
                          : 'text-slate-400 hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-white/10 dark:hover:text-blue-300'
                      }`}
                    >
                      <SpeakerIcon
                        width={14}
                        height={14}
                        className={speakingWord === ex.word ? 'animate-pulse' : ''}
                      />
                    </button>
                    <span className="min-w-0 truncate text-[12px] font-semibold text-slate-800 dark:text-slate-100">
                      {ex.word}
                    </span>
                    <span className="shrink-0 font-display text-[11px] text-slate-500 dark:text-slate-400">
                      {ex.phonetic}
                    </span>
                    <span className="ml-auto shrink-0 text-[11px] text-slate-400">{ex.meaning}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  )
}
