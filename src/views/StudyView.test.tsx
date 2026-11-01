// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import StudyView from './StudyView'
import { ALL_WORDS } from '../data'

const A1_WORDS = ALL_WORDS.filter((w) => w.level === 'A1')
/** 背词页只复习已掌握词，测试里固定用两个 A1 词当卡片池 */
function masteredWords(): Set<string> {
  const set = new Set<string>()
  set.add(A1_WORDS[0].word)
  set.add(A1_WORDS[1].word)
  return set
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

function buttonByText(text: string, excludes?: string) {
  return [...container.querySelectorAll('button')].find((b) => {
    const t = b.textContent ?? ''
    return t.includes(text) && (!excludes || !t.includes(excludes))
  })
}

beforeEach(() => {
  localStorage.clear()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe('StudyView 闪卡', () => {
  it('显示答案后点「认识」会标记掌握并写入复习计划', async () => {
    const onMark = vi.fn()
    await act(async () => {
      root.render(<StudyView masteredSet={masteredWords()} onApplyMark={onMark} active />)
    })
    expect(container.textContent).toContain('第 1 / 2 张')

    const reveal = buttonByText('显示答案')
    expect(reveal).toBeTruthy()
    await act(async () => {
      reveal!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const good = buttonByText('认识', '不认识')
    expect(good).toBeTruthy()
    await act(async () => {
      good!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onMark).toHaveBeenCalledTimes(1)
    expect(onMark).toHaveBeenCalledWith([expect.any(String)], 'add')
    const store = localStorage.getItem('lexicore-study') ?? ''
    expect(store).toContain('"seen":1')
    expect(container.textContent).toContain('第 2 / 2 张')
  })

  it('点「不认识」会进错词本，但不取消已掌握标记', async () => {
    const onMark = vi.fn()
    await act(async () => {
      root.render(<StudyView masteredSet={masteredWords()} onApplyMark={onMark} active />)
    })
    const firstWord = container.querySelector('p.break-words')?.textContent ?? ''

    await act(async () => {
      buttonByText('显示答案')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {
      buttonByText('不认识')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onMark).not.toHaveBeenCalled()
    const review = localStorage.getItem('lexicore-ai-review') ?? ''
    expect(review.toLowerCase()).toContain(firstWord.toLowerCase())
    expect(container.textContent).toContain('第 2 / 2 张')
  })
})
