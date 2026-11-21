/**
 * 通用播放进度条（与 AI 阅读器播放条同一套外观）。
 *
 * 细轨道 + 圆形滑块；拖动过程中只更新组件内部的预览值
 * （不会让整页重渲染，也不会打断正在播放的语音），
 * 松手（pointerup / pointercancel / touchend）才真正 seek。
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react'

/** mm:ss（不足两位的分钟补零，与 AI 阅读器一致） */
export const fmtTime = (sec: number): string => {
  const s = Math.max(0, Math.floor(Number.isFinite(sec) ? sec : 0))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function SeekBar({
  elapsed,
  duration,
  preparing,
  leftLabel,
  onSeek,
}: {
  /** 已播放秒数 */
  elapsed: number
  /** 总时长（秒） */
  duration: number
  /** 准备中（左侧提示优先显示这个） */
  preparing?: boolean
  /** 左侧说明文字（音源、状态等） */
  leftLabel?: string
  /** 按比例跳转（0~1） */
  onSeek: (ratio: number) => void
}) {
  const [scrub, setScrub] = useState<number | null>(null)
  const scrubRef = useRef<number | null>(null)
  /** 播放中 duration 会变；拖动期间冻结量程，避免滑块跳动。 */
  const frozenMaxRef = useRef<number | null>(null)

  const max = Math.max(0.1, duration)
  const trackMax = frozenMaxRef.current ?? max
  const shownSeconds = scrub ?? elapsed
  const value = Math.min(trackMax, Math.max(0, shownSeconds))
  const pct = (value / trackMax) * 100

  const commitRef = useRef<() => void>(() => {})
  commitRef.current = () => {
    const target = scrubRef.current
    if (target === null) return
    const frozen = frozenMaxRef.current ?? max
    scrubRef.current = null
    frozenMaxRef.current = null
    setScrub(null)
    onSeek(target / frozen)
  }
  useEffect(() => {
    const finish = () => commitRef.current()
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    window.addEventListener('touchend', finish)
    return () => {
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      window.removeEventListener('touchend', finish)
    }
  }, [])

  const preview = (v: number) => {
    if (scrubRef.current === null) frozenMaxRef.current = max
    const clamped = Math.min(frozenMaxRef.current ?? max, Math.max(0, v))
    scrubRef.current = clamped
    setScrub(clamped)
  }

  return (
    <div>
      <input
        type="range"
        min={0}
        max={trackMax}
        step="any"
        value={value}
        aria-label="播放进度"
        aria-valuetext={`${fmtTime(shownSeconds)} / ${fmtTime(duration)}`}
        className="player-seek"
        style={{ '--seek-pct': `${pct}%` } as CSSProperties}
        onChange={(e) => preview(Number(e.currentTarget.value))}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
          e.preventDefault()
          scrubRef.current = null
          frozenMaxRef.current = null
          setScrub(null)
          onSeek((shownSeconds + (e.key === 'ArrowLeft' ? -5 : 5)) / max)
        }}
      />
      <div className="-mt-0.5 flex items-center justify-between text-[10px] leading-tight tabular-nums text-slate-400">
        <span className="truncate">{preparing ? '准备中' : (leftLabel ?? '')}</span>
        <span className="shrink-0">
          {fmtTime(shownSeconds)} / {fmtTime(duration)}
        </span>
      </div>
    </div>
  )
}
