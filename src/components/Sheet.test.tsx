// @vitest-environment jsdom
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 捕获 Sheet 注册的返回处理器，模拟安卓系统返回键
let backHandler: (() => void) | null = null
let unregistered = false
vi.mock('../lib/back', () => ({
  registerBack: (fn: () => void) => {
    backHandler = fn
    return () => {
      unregistered = true
      if (backHandler === fn) backHandler = null
    }
  },
}))

import { Sheet } from './Sheet'

let root: Root | null = null
let host: HTMLDivElement | null = null

function mount(onClose: () => void, onBack?: () => void) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  flushSync(() => {
    root!.render(
      <Sheet open onClose={onClose} onBack={onBack} title="测试弹层">
        <div>内容</div>
      </Sheet>,
    )
  })
}

function pressSystemBack() {
  if (!backHandler) throw new Error('Sheet 未注册返回处理器')
  flushSync(() => backHandler!())
}

beforeEach(() => {
  backHandler = null
  unregistered = false
})

afterEach(() => {
  if (root) {
    flushSync(() => root!.unmount())
    root = null
  }
  host?.remove()
  host = null
})

describe('Sheet 安卓系统返回键', () => {
  it('未传 onBack 时，系统返回键调用 onClose 关闭弹层', () => {
    const onClose = vi.fn()
    mount(onClose)
    pressSystemBack()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('传入 onBack 时，系统返回键优先调用 onBack，不关闭弹层', () => {
    const onClose = vi.fn()
    const onBack = vi.fn()
    mount(onClose, onBack)
    pressSystemBack()
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('X 关闭按钮始终走 onClose，与 onBack 无关', () => {
    const onClose = vi.fn()
    const onBack = vi.fn()
    mount(onClose, onBack)
    const closeBtn = document.querySelector('button[aria-label="关闭"]') as HTMLButtonElement
    flushSync(() => closeBtn.click())
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onBack).not.toHaveBeenCalled()
  })

  it('弹层卸载时注销返回处理器', () => {
    mount(() => {})
    expect(backHandler).not.toBeNull()
    flushSync(() => root!.unmount())
    root = null
    expect(unregistered).toBe(true)
    expect(backHandler).toBeNull()
  })
})
