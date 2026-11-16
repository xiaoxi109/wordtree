// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  getDrillBest,
  getPhonemeMastered,
  getPhonicsStats,
  getRuleMastered,
  isPhonemeMastered,
  isRuleMastered,
  saveDrillBest,
  subscribePhonicsProgress,
  togglePhonemeMastered,
  toggleRuleMastered,
} from './phonicsProgress'
import { PHONEME_TOTAL, RULE_TOTAL } from '../data/phonics'

beforeEach(() => localStorage.clear())

describe('音标 / 拼读进度', () => {
  it('初始进度为 0，总量与数据一致', () => {
    const stats = getPhonicsStats()
    expect(stats.phonemeDone).toBe(0)
    expect(stats.ruleDone).toBe(0)
    expect(stats.phonemeTotal).toBe(PHONEME_TOTAL)
    expect(stats.ruleTotal).toBe(RULE_TOTAL)
    expect(stats.pct).toBe(0)
  })

  it('标记音标后统计与订阅同步', () => {
    let calls = 0
    const off = subscribePhonicsProgress(() => {
      calls += 1
    })
    togglePhonemeMastered('iː')
    expect(calls).toBe(1)
    expect(isPhonemeMastered('iː')).toBe(true)
    expect(getPhonicsStats().phonemeDone).toBe(1)
    // 再点一次取消
    togglePhonemeMastered('iː')
    expect(isPhonemeMastered('iː')).toBe(false)
    off()
    togglePhonemeMastered('æ')
    expect(calls).toBe(2) // 退订后不再回调
  })

  it('音标与规则分开存储，互不污染', () => {
    togglePhonemeMastered('ʃ')
    toggleRuleMastered('D-sh')
    expect(getPhonemeMastered().has('D-sh')).toBe(false)
    expect(getRuleMastered().has('ʃ')).toBe(false)
    expect(isRuleMastered('D-sh')).toBe(true)
    const stats = getPhonicsStats()
    expect(stats.phonemeDone).toBe(1)
    expect(stats.ruleDone).toBe(1)
    expect(stats.pct).toBe(Math.round((2 / (PHONEME_TOTAL + RULE_TOTAL)) * 100))
  })

  it('损坏的 localStorage 不抛错', () => {
    localStorage.setItem('lexicore-phonetics-mastered', '{oops')
    expect(getPhonemeMastered().size).toBe(0)
    localStorage.setItem('lexicore-phonics-rules-mastered', '{"a":1}')
    expect(getRuleMastered().size).toBe(0)
  })
})

describe('听辨练习成绩', () => {
  it('只有破纪录才写入', () => {
    expect(getDrillBest()).toEqual({ ipa: 0, rule: 0, total: 10 })
    expect(saveDrillBest('ipa', 6, 10)).toBe(true)
    expect(getDrillBest().ipa).toBe(6)
    expect(saveDrillBest('ipa', 5, 10)).toBe(false)
    expect(getDrillBest().ipa).toBe(6)
    expect(saveDrillBest('ipa', 9, 10)).toBe(true)
    expect(getDrillBest().ipa).toBe(9)
  })

  it('两种模式分别记分', () => {
    saveDrillBest('rule', 7, 10)
    expect(getDrillBest().rule).toBe(7)
    expect(getDrillBest().ipa).toBe(0)
  })
})
