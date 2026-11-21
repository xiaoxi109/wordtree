// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  computeStreak,
  getBookEntry,
  lexiconIdForBook,
  loadBookProgress,
  markLessonRead,
  saveBookProgress,
  toggleFavorite,
  BOOK_PROGRESS_KEY,
} from './bookProgress'

describe('bookProgress', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('读取空进度返回空表', () => {
    expect(loadBookProgress()).toEqual({})
  })

  it('读写往返', () => {
    const map = markLessonRead({}, 'nce-1', 'nce-1-001')
    saveBookProgress(map)
    const loaded = loadBookProgress()
    expect(loaded['nce-1'].readIds).toEqual(['nce-1-001'])
    expect(loaded['nce-1'].lastId).toBe('nce-1-001')
    expect(loaded['nce-1'].days).toHaveLength(1)
  })

  it('损坏的 JSON 降级为空表', () => {
    localStorage.setItem(BOOK_PROGRESS_KEY, '{oops')
    expect(loadBookProgress()).toEqual({})
  })

  it('标记已学幂等，且不重复记录日期', () => {
    let map = markLessonRead({}, 'nce-1', 'nce-1-001', '2026-01-01')
    map = markLessonRead(map, 'nce-1', 'nce-1-001', '2026-01-01')
    expect(map['nce-1'].readIds).toEqual(['nce-1-001'])
    expect(map['nce-1'].days).toEqual(['2026-01-01'])
  })

  it('收藏可切换', () => {
    let map = toggleFavorite({}, 'nce-2', 'nce-2-007')
    expect(map['nce-2'].favIds).toEqual(['nce-2-007'])
    map = toggleFavorite(map, 'nce-2', 'nce-2-007')
    expect(map['nce-2'].favIds).toEqual([])
  })

  it('未知册返回空进度', () => {
    expect(getBookEntry({}, 'nce-9')).toEqual({ readIds: [], favIds: [], days: [] })
  })
})

describe('computeStreak', () => {
  it('连续三天返回 3', () => {
    const now = Date.parse('2026-03-10T12:00:00Z')
    expect(computeStreak(['2026-03-08', '2026-03-09', '2026-03-10'], now)).toBe(3)
  })

  it('昨天为止的连续也计入', () => {
    const now = Date.parse('2026-03-10T12:00:00Z')
    expect(computeStreak(['2026-03-08', '2026-03-09'], now)).toBe(2)
  })

  it('中间断档归零', () => {
    const now = Date.parse('2026-03-10T12:00:00Z')
    expect(computeStreak(['2026-03-05', '2026-03-07', '2026-03-08'], now)).toBe(0)
  })

  it('重复日期只算一天', () => {
    const now = Date.parse('2026-03-10T12:00:00Z')
    expect(computeStreak(['2026-03-10', '2026-03-10'], now)).toBe(1)
  })

  it('空数组返回 0', () => {
    expect(computeStreak([])).toBe(0)
  })
})

describe('lexiconIdForBook', () => {
  it('四册映射到 nce-new-1..4', () => {
    expect(lexiconIdForBook('nce-1')).toBe('nce-new-1')
    expect(lexiconIdForBook('nce-2')).toBe('nce-new-2')
    expect(lexiconIdForBook('nce-3')).toBe('nce-new-3')
    expect(lexiconIdForBook('nce-4')).toBe('nce-new-4')
  })

  it('未知册回退到第一册', () => {
    expect(lexiconIdForBook('nce-x')).toBe('nce-new-1')
  })
})
