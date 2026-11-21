// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { richShardOf } from '../lib/richHash'

const BASE_DATA: Record<string, unknown> = {
  s: [['The customer called to cancel.', '顾客打电话来取消了。']],
  p: [['cancel button', '取消按钮']],
  y: [['vt.', '[计]取消；删去', ['recall', 'call it off']]],
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.resetModules()
  fetchMock = vi.fn(async (url: string) => {
    const shard = url.split('/').pop()!.replace('.json', '')
    if (shard !== String(richShardOf('cancel'))) {
      return { ok: false, status: 404, json: async () => ({}) } as unknown as Response
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ cancel: BASE_DATA }),
    } as unknown as Response
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('富字典分片加载器', () => {
  it('按词命中正确的分片并解析出例句/短语/近义词', async () => {
    const { ensureRich } = await import('./richDict')
    const entry = await ensureRich('cancel')
    expect(entry).not.toBeNull()
    expect(entry!.examples).toEqual([{ en: 'The customer called to cancel.', zh: '顾客打电话来取消了。' }])
    expect(entry!.phrases).toEqual([{ en: 'cancel button', zh: '取消按钮' }])
    expect(entry!.synonyms).toEqual([
      { pos: 'vt.', meaning: '[计]取消；删去', words: ['recall', 'call it off'] },
    ])
  })

  it('请求的 URL 指向该词所在的分片', async () => {
    const { loadRichShard } = await import('./richDict')
    await loadRichShard(richShardOf('cancel'))
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain(`dicts/rich/${richShardOf('cancel')}.json`)
  })

  it('并发请求同一分片只发一次 fetch', async () => {
    const { loadRichShard } = await import('./richDict')
    const shard = richShardOf('cancel')
    await Promise.all([loadRichShard(shard), loadRichShard(shard), loadRichShard(shard)])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('加载前 getRichSync 返回 null，加载后可取到', async () => {
    const { getRichSync, loadRichShard } = await import('./richDict')
    expect(getRichSync('cancel')).toBeNull()
    await loadRichShard(richShardOf('cancel'))
    expect(getRichSync('cancel')?.phrases).toHaveLength(1)
  })

  it('词库里没有的词返回 null，不报错', async () => {
    const { ensureRich } = await import('./richDict')
    expect(await ensureRich('zzznotaword')).toBeNull()
  })

  it('分片 404 时不抛异常，返回 null', async () => {
    const { loadRichShard } = await import('./richDict')
    expect(await loadRichShard(15)).toBeNull()
  })
})
