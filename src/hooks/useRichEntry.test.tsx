// @vitest-environment jsdom
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { richShardOf } from '../lib/richHash'

const RICH: Record<string, unknown> = {
  s: [
    ['The customer called to cancel.', '顾客打电话来取消了。'],
    ['He was killed by the murderer.', '他被凶手杀害了。'],
  ],
  p: [['cancel button', '取消按钮']],
  y: [['vt.', '[计]取消；删去', ['recall', 'call it off']]],
}

let fetchMock: ReturnType<typeof vi.fn>
type RichHook = typeof import('./useRichEntry').useRichEntry
let useRichEntryHook: RichHook

beforeEach(async () => {
  // 每个用例重新加载模块，避免富字典分片缓存跨用例串味
  vi.resetModules()
  fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ cancel: RICH }),
  }) as unknown as Response)
  vi.stubGlobal('fetch', fetchMock)
  const mod = await import('./useRichEntry')
  useRichEntryHook = mod.useRichEntry
})

let root: Root | null = null
let host: HTMLDivElement | null = null

function Probe({
  word,
  meaning,
  examples,
}: {
  word: string
  meaning: string
  examples: { en: string; zh: string }[]
}) {
  const rich = useRichEntryHook({ word, meaning, examples })
  return (
    <div
      data-testid="out"
      data-examples={JSON.stringify(rich.examples)}
      data-phrases={JSON.stringify(rich.phrases)}
      data-synonyms={JSON.stringify(rich.synonyms)}
    />
  )
}

async function mount(word: string, meaning: string, examples: { en: string; zh: string }[] = []) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  flushSync(() => {
    root!.render(<Probe word={word} meaning={meaning} examples={examples} />)
  })
  await new Promise((r) => setTimeout(r, 30))
  flushSync(() => {})
  const el = host.querySelector('[data-testid="out"]')!
  return {
    examples: JSON.parse(el.getAttribute('data-examples') ?? '[]') as { en: string; zh: string }[],
    phrases: JSON.parse(el.getAttribute('data-phrases') ?? '[]'),
    synonyms: JSON.parse(el.getAttribute('data-synonyms') ?? '[]'),
  }
}

afterEach(() => {
  if (root) {
    flushSync(() => root!.unmount())
    root = null
  }
  host?.remove()
  host = null
  vi.unstubAllGlobals()
})

describe('useRichEntry：例句 / 短语 / 近义词合并', () => {
  it('课程词没有例句时用富字典补齐', async () => {
    const out = await mount('cancel', '取消')
    expect(out.examples.length).toBeGreaterThan(0)
    expect(out.examples[0].en).toBe('The customer called to cancel.')
  })

  it('课程词自带例句时优先，且与富字典例句去重合并', async () => {
    const out = await mount('cancel', '取消', [
      { en: 'The customer called to cancel.', zh: '顾客打电话来取消了。' },
      { en: 'We cancel the order.', zh: '我们取消订单。' },
    ])
    const ens = out.examples.map((e) => e.en)
    expect(ens).toContain('We cancel the order.')
    expect(ens.filter((e) => e === 'The customer called to cancel.').length).toBe(1)
  })

  it('富字典的消极例句被过滤掉', async () => {
    const out = await mount('cancel', '取消')
    expect(out.examples.some((e) => e.zh.includes('凶手'))).toBe(false)
  })

  it('例句最多保留 3 条', async () => {
    const out = await mount('cancel', '取消')
    expect(out.examples.length).toBeLessThanOrEqual(3)
  })

  it('短语与近义词透传', async () => {
    const out = await mount('cancel', '取消')
    expect(out.phrases).toEqual([{ en: 'cancel button', zh: '取消按钮' }])
    expect(out.synonyms).toEqual([
      { pos: 'vt.', meaning: '[计]取消；删去', words: ['recall', 'call it off'] },
    ])
  })

  it('请求的是该词所在分片', async () => {
    await mount('cancel', '取消')
    expect(fetchMock).toHaveBeenCalled()
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain(`dicts/rich/${richShardOf('cancel')}.json`)
  })
})
