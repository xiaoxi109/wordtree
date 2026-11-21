// @vitest-environment jsdom
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { SeekBar, fmtTime } from './SeekBar'

let root: Root | null = null
let host: HTMLDivElement | null = null

afterEach(() => {
  if (root) {
    flushSync(() => root!.unmount())
    root = null
  }
  host?.remove()
  host = null
})

function mount(props: {
  elapsed: number
  duration: number
  leftLabel?: string
  preparing?: boolean
  onSeek: (ratio: number) => void
}) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  flushSync(() => {
    root!.render(<SeekBar {...props} />)
  })
  const input = host.querySelector('input[type="range"]') as HTMLInputElement
  return { input, text: host.textContent ?? '' }
}

describe('fmtTime', () => {
  it('输出 mm:ss', () => {
    expect(fmtTime(0)).toBe('00:00')
    expect(fmtTime(37)).toBe('00:37')
    expect(fmtTime(125)).toBe('02:05')
  })

  it('负数与非法值按 0 处理', () => {
    expect(fmtTime(-5)).toBe('00:00')
    expect(fmtTime(Number.NaN)).toBe('00:00')
  })
})

describe('SeekBar', () => {
  it('显示当前时间与总时长', () => {
    const { text } = mount({ elapsed: 12, duration: 37, onSeek: () => {} })
    expect(text).toContain('00:12')
    expect(text).toContain('00:37')
  })

  it('左侧显示音源标签', () => {
    const { text } = mount({ elapsed: 0, duration: 37, leftLabel: '本地原声', onSeek: () => {} })
    expect(text).toContain('本地原声')
  })

  it('准备中优先显示准备提示', () => {
    const { text } = mount({ elapsed: 0, duration: 37, leftLabel: '本地原声', preparing: true, onSeek: () => {} })
    expect(text).toContain('准备中')
    expect(text).not.toContain('本地原声')
  })

  it('松手后才真正 seek（拖动中只预览）', () => {
    const ratios: number[] = []
    const { input } = mount({ elapsed: 0, duration: 100, onSeek: (r) => ratios.push(r) })
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    setter.call(input, '50')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    flushSync(() => {})
    // 拖动中还没有触发 seek
    expect(ratios.length).toBe(0)
    window.dispatchEvent(new Event('pointerup'))
    expect(ratios.length).toBe(1)
    expect(ratios[0]).toBeCloseTo(0.5, 5)
  })

  it('时长为 0 时也不崩', () => {
    const { input } = mount({ elapsed: 0, duration: 0, onSeek: () => {} })
    expect(input.max).toBe('0.1')
  })
})
