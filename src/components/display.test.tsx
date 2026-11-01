// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { DisplayModeToggle, loadDisplayMode } from './display'
import { WordCard } from './word'
import type { Word } from '../data'

const word: Word = {
  word: 'order',
  level: 'A1',
  ipa: '/ˈɔːdə(r)/',
  pos: 'v.',
  meaning: '点菜；命令',
  examples: [],
  category: 'food',
  common: true,
}

const noop = () => {}
const renderCard = (mode?: 'both' | 'en' | 'zh') =>
  renderToString(
    <WordCard word={word} mastered={false} mode={mode} onOpen={noop} onToggleMastered={noop} />,
  )

describe('loadDisplayMode', () => {
  beforeEach(() => localStorage.clear())

  it('默认中英对照', () => {
    expect(loadDisplayMode()).toBe('both')
  })

  it('读取合法值，非法值回退 both', () => {
    localStorage.setItem('lexicore-display-mode', 'zh')
    expect(loadDisplayMode()).toBe('zh')
    localStorage.setItem('lexicore-display-mode', 'xx')
    expect(loadDisplayMode()).toBe('both')
  })
})

describe('WordCard 显示语言', () => {
  it('both：英文、音标、中文都显示', () => {
    const html = renderCard('both')
    expect(html).toContain('order')
    expect(html).toContain('/ˈɔːdə(r)/')
    expect(html).toContain('点菜；命令')
  })

  it('en：只显示英文与音标，不显示中文', () => {
    const html = renderCard('en')
    expect(html).toContain('order')
    expect(html).toContain('/ˈɔːdə(r)/')
    expect(html).not.toContain('点菜；命令')
  })

  it('zh：只显示中文，不显示英文词形与音标', () => {
    const html = renderCard('zh')
    expect(html).toContain('点菜；命令')
    expect(html).not.toContain('>order<')
    expect(html).not.toContain('/ˈɔːdə(r)/')
  })

  it('未传 mode 时等价于 both（向后兼容）', () => {
    expect(renderCard()).toBe(renderCard('both'))
  })

  it('掌握标记在各模式下都可用', () => {
    for (const mode of ['both', 'en', 'zh'] as const) {
      expect(renderCard(mode)).toContain('标记为已掌握')
    }
  })
})

describe('DisplayModeToggle', () => {
  it('渲染三个选项并标记激活项', () => {
    const html = renderToString(<DisplayModeToggle value="zh" onChange={vi.fn()} />)
    expect(html).toContain('中英')
    expect(html).toContain('英文')
    expect(html).toContain('中文')
    // 激活项 aria-pressed=true，其余 false
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('aria-pressed="false"')
  })
})
