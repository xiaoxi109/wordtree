// @vitest-environment jsdom
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Word } from '../data/types'

// WordModal 用 Sheet 做 portal 弹层，这里替换成轻量容器，只验证 footer 按钮的行为契约。
vi.mock('./Sheet', () => ({
  Sheet: ({ footer, children }: { footer?: unknown; children?: unknown }) => (
    <div>
      {children as never}
      {footer as never}
    </div>
  ),
  ActionSheet: () => null,
}))

import { WordModal } from './word'

const word: Word = {
  word: 'about',
  level: 'A1',
  ipa: '/əˈbaʊt/',
  pos: 'prep.',
  meaning: '关于；大约',
  examples: [{ en: 'A book about dogs.', zh: '一本关于狗的书。' }],
  grade: 'g7',
  category: 'thinking',
}

let root: Root | null = null
let host: HTMLDivElement | null = null

function mount(mastered: boolean, onToggle: () => void, onClose: () => void) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  flushSync(() => {
    root!.render(
      <WordModal word={word} mastered={mastered} onToggleMastered={onToggle} onClose={onClose} />,
    )
  })
}

afterEach(() => {
  if (root) {
    flushSync(() => root!.unmount())
    root = null
  }
  host?.remove()
  host = null
})

function findButton(text: string): HTMLButtonElement {
  const btn = Array.from(document.querySelectorAll('button')).find((b) =>
    b.textContent?.includes(text),
  )
  if (!btn) throw new Error(`未找到按钮：${text}`)
  return btn as HTMLButtonElement
}

describe('词卡详情「已掌握 / 未掌握」二态切换', () => {
  it('未掌握时显示「加入已掌握」，点击后切换状态并关闭弹层', () => {
    let toggled = 0
    let closed = 0
    mount(false, () => toggled++, () => closed++)

    flushSync(() => findButton('加入已掌握').click())

    expect(toggled).toBe(1)
    expect(closed).toBe(1)
  })

  it('已掌握时显示「取消已掌握」，点击后切换状态并关闭弹层', () => {
    let toggled = 0
    let closed = 0
    mount(true, () => toggled++, () => closed++)

    flushSync(() => findButton('取消已掌握').click())

    expect(toggled).toBe(1)
    expect(closed).toBe(1)
  })

  it('不再提供「加入未掌握」第三态入口', () => {
    mount(false, () => {}, () => {})
    expect(document.body.textContent).not.toContain('加入未掌握')
  })

  it('详情正文不再显示「已掌握」徽标标签（底部操作按钮保留）', () => {
    // mastered=true 时旧版会在释义上方渲染一个文本恰为「已掌握」的徽标 span
    mount(true, () => {}, () => {})
    const exactMasteredLabels = Array.from(document.querySelectorAll('span')).filter(
      (el) => el.textContent?.trim() === '已掌握',
    )
    expect(exactMasteredLabels).toHaveLength(0)
    // 底部切换按钮仍在（文案为「取消已掌握」，不等于徽标标签）
    expect(findButton('取消已掌握')).toBeTruthy()
  })
})
