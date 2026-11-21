// @vitest-environment jsdom
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 捕获每次 speak 传入的 onEnded，用于模拟播放结束；speaking 固定为 false，
// 复现「全局 speaking 不会区分是哪个喇叭」的场景。
const speakCalls: Array<{ text: string; onEnded?: () => void }> = []
vi.mock('../hooks/useSpeech', () => ({
  useSpeech: () => ({
    speak: (text: string, _rate?: number, onEnded?: () => void) => {
      speakCalls.push({ text, onEnded })
    },
    stop: () => {},
    speaking: false,
    loading: false,
    preload: async () => {},
    downloadStatus: 'ready',
    downloadProgress: { pct: 100, label: '就绪' },
  }),
}))

import { SpeakerBtn } from './word'

let root: Root | null = null
let host: HTMLDivElement | null = null

function mount(words: string[]) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  flushSync(() => {
    root!.render(
      <div>
        {words.map((w) => (
          <SpeakerBtn key={w} text={w} />
        ))}
      </div>,
    )
  })
}

function buttons(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll('button')) as HTMLButtonElement[]
}

function pulse(btn: HTMLButtonElement): boolean {
  return btn.className.includes('animate-pulse')
}

beforeEach(() => {
  speakCalls.length = 0
})

afterEach(() => {
  if (root) {
    flushSync(() => root!.unmount())
    root = null
  }
  host?.remove()
  host = null
})

describe('词卡喇叭按钮播放态（issue: 点一个喇叭导致全部卡片一起呼吸）', () => {
  it('点击某个喇叭后只有它被标记为 pulse，其他喇叭保持静止', () => {
    mount(['baby', 'brother', 'cat'])
    const [a, b, c] = buttons()

    flushSync(() => a.click())

    expect(pulse(a)).toBe(true)
    expect(pulse(b)).toBe(false)
    expect(pulse(c)).toBe(false)
  })

  it('点击第二个喇叭后，第一个熄灭，只有第二个 pulse', () => {
    mount(['baby', 'brother'])
    const [a, b] = buttons()

    flushSync(() => a.click())
    flushSync(() => b.click())

    expect(pulse(a)).toBe(false)
    expect(pulse(b)).toBe(true)
  })

  it('播放结束回调只熄灭当前持有令牌的喇叭，不影响其他卡片', () => {
    mount(['baby', 'brother'])
    const [a, b] = buttons()

    flushSync(() => a.click())
    // a 还在播时点 b：b 抢到令牌，a 熄灭
    flushSync(() => b.click())
    // a 的播放结束回调延迟到达，不应把 b 也熄灭
    flushSync(() => speakCalls[0].onEnded?.())

    expect(pulse(a)).toBe(false)
    expect(pulse(b)).toBe(true)

    // 当前持有令牌的 b 播放结束，才熄灭
    flushSync(() => speakCalls[1].onEnded?.())
    expect(pulse(b)).toBe(false)
  })
})
