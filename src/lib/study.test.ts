// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { ALL_WORDS } from '../data'
import { clearReviewWords, pushReviewWord } from './review'
import { wordKey } from './cluster'
import {
  applyStudyGrade,
  buildStudySession,
  clearStudyRecords,
  getDueCount,
  getStudyRecords,
  getTodayStudiedCount,
  goodIntervalDays,
} from './study'

const DAY = 24 * 60 * 60 * 1000
const NOW = 1_700_000_000_000
const first = ALL_WORDS[0]
const second = ALL_WORDS[1]

describe('背词复习计划', () => {
  beforeEach(() => {
    localStorage.clear()
    clearReviewWords()
    clearStudyRecords()
  })

  it('认识：盒号递增，间隔按 1/2/4/8/16/30 天拉长', () => {
    const r1 = applyStudyGrade('alpha', 'good', NOW)
    expect(r1.box).toBe(0)
    expect(r1.dueAt).toBe(NOW + DAY)
    expect(r1.lapses).toBe(0)

    const r2 = applyStudyGrade('alpha', 'good', NOW + DAY)
    expect(r2.box).toBe(1)
    expect(r2.dueAt).toBe(NOW + DAY + 2 * DAY)
    expect(goodIntervalDays('alpha')).toBe(4)
  })

  it('模糊与不认识：都重置回第 0 盒（1 天后）', () => {
    applyStudyGrade('beta', 'good', NOW)
    applyStudyGrade('beta', 'good', NOW + DAY)
    const hard = applyStudyGrade('beta', 'hard', NOW + 2 * DAY)
    expect(hard.box).toBe(0)
    expect(hard.dueAt).toBe(NOW + 2 * DAY + DAY)

    const again = applyStudyGrade('beta', 'again', NOW + 3 * DAY)
    expect(again.box).toBe(0)
    expect(again.lapses).toBe(1)
    expect(again.dueAt).toBe(NOW + 3 * DAY + DAY)
  })

  it('到期数量与今日已背统计', () => {
    applyStudyGrade('gamma', 'good', NOW)
    expect(getDueCount(NOW)).toBe(0)
    expect(getDueCount(NOW + DAY)).toBe(1)
    expect(getTodayStudiedCount(NOW)).toBe(1)
    expect(Object.keys(getStudyRecords())).toContain('gamma')
  })
})

describe('背词组卡', () => {
  beforeEach(() => {
    localStorage.clear()
    clearReviewWords()
    clearStudyRecords()
  })

  it('错词优先，并且能进入错词本模式', () => {
    pushReviewWord(
      { key: wordKey(first.word), word: first.word, ipa: first.ipa, meaning: first.meaning },
      'unknown',
    )
    pushReviewWord(
      { key: wordKey(second.word), word: second.word, ipa: second.ipa, meaning: second.meaning },
      'fuzzy',
    )

    const mixed = buildStudySession({
      source: 'cefr',
      scope: 'all',
      wrongOnly: false,
      masteredSet: new Set(),
      now: NOW,
    })
    expect(mixed[0].stage).toBe('wrong')
    expect(mixed[0].key).toBe(wordKey(first.word))

    const wrong = buildStudySession({
      source: 'cefr',
      scope: 'all',
      wrongOnly: true,
      masteredSet: new Set(),
      now: NOW,
    })
    expect(wrong).toHaveLength(2)
    expect(wrong.every((c) => c.stage === 'wrong')).toBe(true)
  })

  it('按等级筛选，未掌握词优先且已掌握词不会混进新词组', () => {
    const a1 = ALL_WORDS.filter((w) => w.level === 'A1')
    expect(a1.length).toBeGreaterThan(20)
    const mastered = new Set([a1[0].word])

    const session = buildStudySession({
      source: 'cefr',
      scope: 'A1',
      wrongOnly: false,
      masteredSet: mastered,
      now: NOW,
    })
    expect(session.length).toBeGreaterThan(0)
    expect(session.every((c) => c.level === 'A1')).toBe(true)
    expect(session.some((c) => c.word === a1[0].word)).toBe(false)
  })

  it('错词本为空时返回空数组', () => {
    const session = buildStudySession({
      source: 'cefr',
      scope: 'all',
      wrongOnly: true,
      masteredSet: new Set(),
      now: NOW,
    })
    expect(session).toEqual([])
  })

  it('masteredOnly：只返回已掌握的词，且受 limit 分批限制', () => {
    const a1 = ALL_WORDS.filter((w) => w.level === 'A1')
    const mastered = new Set(a1.slice(0, 40).map((w) => w.word))

    const session = buildStudySession({
      source: 'cefr',
      scope: 'A1',
      wrongOnly: false,
      masteredSet: mastered,
      masteredOnly: true,
      limit: 20,
      now: NOW,
    })
    expect(session).toHaveLength(20)
    expect(session.every((c) => mastered.has(c.word))).toBe(true)
    expect(session.every((c) => c.stage === 'review')).toBe(true)
  })

  it('masteredOnly：SRS 到期词排在最前', () => {
    const a1 = ALL_WORDS.filter((w) => w.level === 'A1')
    const mastered = new Set(a1.slice(0, 40).map((w) => w.word))
    const late = a1[39]
    const key = wordKey(late.word)
    localStorage.setItem('lexicore-study', JSON.stringify({
      [key]: { key, box: 0, dueAt: NOW - DAY, lastAt: NOW - 2 * DAY, seen: 1, lapses: 0 },
    }))

    const session = buildStudySession({
      source: 'cefr',
      scope: 'A1',
      wrongOnly: false,
      masteredSet: mastered,
      masteredOnly: true,
      limit: 20,
      now: NOW,
    })
    expect(session[0].word).toBe(late.word)
  })
})
