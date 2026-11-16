// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_PLAYBACK,
  PLAY_MODES,
  SENTENCE_REPEAT_OPTIONS,
  getPlaybackSettings,
  isListMode,
  updatePlayback,
  type PlayMode,
} from './playback'

describe('播放模式设置', () => {
  beforeEach(() => {
    localStorage.clear()
    // 重置模块级缓存
    updatePlayback({ mode: 'off', sentenceRepeat: DEFAULT_PLAYBACK.sentenceRepeat })
  })

  it('默认播完即停', () => {
    const s = getPlaybackSettings()
    expect(s.mode).toBe('off')
    expect(s.sentenceRepeat).toBeGreaterThanOrEqual(2)
  })

  it('五种模式互斥且各有触发条件说明', () => {
    const ids = PLAY_MODES.map((m) => m.id)
    expect(ids).toEqual(['off', 'sentence', 'lesson', 'listSequential', 'listShuffle'])
    expect(new Set(ids).size).toBe(ids.length)
    for (const m of PLAY_MODES) {
      expect(m.label.length).toBeGreaterThan(0)
      expect(m.trigger.length).toBeGreaterThan(0)
    }
  })

  it('切换模式是单选，且局部更新不影响另一项设置', () => {
    updatePlayback({ sentenceRepeat: 5 })
    updatePlayback({ mode: 'sentence' })
    expect(getPlaybackSettings()).toEqual({ mode: 'sentence', sentenceRepeat: 5 })
    updatePlayback({ mode: 'listShuffle' })
    expect(getPlaybackSettings()).toEqual({ mode: 'listShuffle', sentenceRepeat: 5 })
  })

  it('设置持久化到 localStorage', () => {
    updatePlayback({ mode: 'lesson', sentenceRepeat: 5 })
    expect(JSON.parse(localStorage.getItem('lexicore-playback') ?? '{}')).toEqual({
      mode: 'lesson',
      sentenceRepeat: 5,
    })
  })

  it('次数选项都是有限值（保证整篇能读完）', () => {
    expect(SENTENCE_REPEAT_OPTIONS.length).toBeGreaterThan(0)
    for (const o of SENTENCE_REPEAT_OPTIONS) expect(o.value).toBeGreaterThanOrEqual(2)
  })

  it('只有两种列表模式需要跨篇调度', () => {
    const expected: Record<PlayMode, boolean> = {
      off: false,
      sentence: false,
      lesson: false,
      listSequential: true,
      listShuffle: true,
    }
    for (const m of PLAY_MODES) expect(isListMode(m.id)).toBe(expected[m.id])
  })
})
