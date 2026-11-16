// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import PhonicsView from './PhonicsView'
import { PHONEMES } from '../data/phonics'

/**
 * 冒烟测试：首屏（音标表）必须完整渲染 48 个音标入口 + 每个卡片的发音按钮，
 * 防止数据与视图脱节（例如分组名改了但视图仍按旧 id 过滤，导致整块空白）。
 */
describe('PhonicsView', () => {
  const html = renderToString(<PhonicsView />)

  it('渲染三个入口与总览', () => {
    expect(html).toContain('音标表')
    expect(html).toContain('自然拼读')
    expect(html).toContain('听辨练习')
    expect(html).toContain('看词能读')
  })

  it('四个分组与全部音标符号都出现', () => {
    for (const label of ['单元音', '双元音', '辅音', '辅音连缀']) {
      expect(html).toContain(label)
    }
    for (const p of PHONEMES) {
      expect(html).toContain(p.id)
    }
  })

  it('每张音标卡都有独立的发音按钮', () => {
    const buttons = html.match(/aria-label="播放音标 /g) ?? []
    expect(buttons.length).toBe(PHONEMES.length)
  })
})
