// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { ALL_WORDS } from '../data'
import { clearReviewWords, pushReviewWord } from './review'
import { wordKey } from './cluster'
import {
  BOX_INTERVALS_DAYS,
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

  it('认识：盒号递增，FSRS 稳定性与间隔单调增长', () => {
    const r1 = applyStudyGrade('alpha', 'good', NOW)
    expect(r1.box).toBe(0)
    expect(r1.stability).toBeGreaterThan(0)
    expect(r1.difficulty).toBeGreaterThanOrEqual(1)
    expect(r1.dueAt).toBeGreaterThan(NOW)
    expect(r1.lapses).toBe(0)

    const r2 = applyStudyGrade('alpha', 'good', r1.dueAt)
    expect(r2.box).toBe(1)
    expect(r2.stability).toBeGreaterThan(r1.stability)
    expect(r2.dueAt).toBeGreaterThan(r1.dueAt)
    expect(goodIntervalDays('alpha', r2.dueAt)).toBeGreaterThanOrEqual(1)
  })

  it('模糊与不认识：盒号归零、lapses 只在再次不认识时累加', () => {
    const good = applyStudyGrade('beta', 'good', NOW)
    applyStudyGrade('beta', 'good', good.dueAt)
    const hard = applyStudyGrade('beta', 'hard', good.dueAt)
    expect(hard.box).toBe(0)
    expect(hard.lapses).toBe(0)

    const again = applyStudyGrade('beta', 'again', hard.dueAt)
    expect(again.box).toBe(0)
    expect(again.lapses).toBe(1)
    expect(again.dueAt).toBeGreaterThan(hard.lastAt)
    // 遗忘后稳定性应比遗忘前低
    expect(again.stability).toBeLessThan(hard.stability)
  })

  it('旧记录（无 FSRS 字段）读取时按盒号迁移，不丢进度', () => {
    const key = 'legacy'
    localStorage.setItem('lexicore-study', JSON.stringify({
      [key]: { key, box: 3, dueAt: NOW - DAY, lastAt: NOW - 2 * DAY, seen: 4, lapses: 1 },
    }))
    const before = getStudyRecords()[key]
    expect(before.stability).toBe(BOX_INTERVALS_DAYS[3])
    expect(before.difficulty).toBeGreaterThanOrEqual(1)
    expect(before.seen).toBe(4)
    expect(before.lapses).toBe(1)
  })

  it('到期数量与今日已背统计', () => {
    const rec = applyStudyGrade('gamma', 'good', NOW)
    expect(getDueCount(NOW)).toBe(0)
    expect(getDueCount(rec.dueAt)).toBe(1)
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

  it('masteredOnly：错词本里的未掌握词与新词都不会混进复习牌堆', () => {
    const a1 = ALL_WORDS.filter((w) => w.level === 'A1')
    const mastered = new Set([a1[0].word, a1[1].word])
    // 未掌握的词进了错词本
    pushReviewWord(
      { key: wordKey(a1[2].word), word: a1[2].word, ipa: a1[2].ipa, meaning: a1[2].meaning },
      'unknown',
    )

    const session = buildStudySession({
      source: 'cefr',
      scope: 'A1',
      wrongOnly: false,
      masteredSet: mastered,
      masteredOnly: true,
      limit: 20,
      now: NOW,
    })
    expect(session.length).toBeGreaterThan(0)
    expect(session.every((c) => mastered.has(c.word))).toBe(true)
    expect(session.some((c) => c.word === a1[2].word)).toBe(false)
    expect(session.some((c) => c.stage === 'wrong')).toBe(false)
    expect(session.some((c) => c.stage === 'new')).toBe(false)
  })
})

describe('到期统计口径', () => {
  beforeEach(() => {
    localStorage.clear()
    clearReviewWords()
    clearStudyRecords()
  })

  it('传入 masteredSet 时只统计已掌握的到期词', () => {
    const r1 = applyStudyGrade(wordKey(first.word), 'good', NOW)
    const r2 = applyStudyGrade(wordKey(second.word), 'good', NOW)
    const dueTime = Math.max(r1.dueAt, r2.dueAt)

    expect(getDueCount(dueTime)).toBe(2)
    expect(getDueCount(dueTime, new Set([first.word]))).toBe(1)
    expect(getDueCount(dueTime, new Set())).toBe(0)
  })
})
