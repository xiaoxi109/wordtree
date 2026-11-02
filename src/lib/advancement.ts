/**
 * 闯关晋级系统（LexiCore v3 架构）
 * =============================
 * 当「当前 rung 及以下」的词全部掌握后，解锁晋级闯关。
 * 闯关对**临界词**（当前 rung 自己的词）做抽检；通过则晋升到下一 rung。
 *
 * 目的：防止为晋级而乱标掌握（全标认识 → 但闯关会验证是否真的会）。
 */

import { ALL_WORDS } from '../data'
import {
  activeLevels,
  nextGrade,
  nextLevel,
  gradeToLevel,
  type Route,
  type GradeRung,
  type LevelRung,
} from '../data/levels'
import type { Word } from '../data'

const QUIZ_SIZE = 10        // 抽检数量
const QUIZ_PASS_RATE = 0.8  // 通过率阈值（≥80% 即通过）

/**
 * 检测是否可晋级：
 *   1. 激活窗口内所有词都已掌握
 *   2. 当前 rung 有下一级可去（不是 B2 上限）
 */
export function checkAdvancement(
  route: Route,
  currentRung: GradeRung | LevelRung,
  masteredSet: Set<string>,
): { canAdvance: boolean; nextRung: GradeRung | LevelRung | null; stats: { total: number; mastered: number } } {
  const levels = activeLevels(route, currentRung).filter((l) => l !== 'C1' && l !== 'C2')
  const scope = ALL_WORDS.filter((w) => levels.includes(w.level))
  const mastered = scope.filter((w) => masteredSet.has(w.word)).length
  const canAdvance = scope.length > 0 && mastered === scope.length

  // 找下一级：根据路线选对应的 rung 序列
  let nextRung: GradeRung | LevelRung | null = null
  if (route === 'grade') {
    const n = nextGrade(currentRung as GradeRung)
    // 西式词库上限 B2；如果 grade 映射到了 C1，就不再晋级
    if (n) {
      const mapped = gradeToLevel(n)
      if (mapped !== 'C1' && mapped !== 'C2') nextRung = n
    }
  } else {
    const n = nextLevel(currentRung as LevelRung)
    if (n && n !== 'C1' && n !== 'C2') nextRung = n
  }

  return { canAdvance: canAdvance && !!nextRung, nextRung, stats: { total: scope.length, mastered } }
}

/**
 * 抽取闯关题：从**临界 rung**（当前最高等级）中随机取 QUIZ_SIZE 个词。
 * 抽检的目的是防止为晋级而乱标掌握——如果真掌握了，抽检也应该全对。
 */
export function pickQuizWords(
  route: Route,
  currentRung: GradeRung | LevelRung,
  count = QUIZ_SIZE,
): Word[] {
  // 临界 rung = 激活窗口内的最高 CEFR 等级
  const levels = activeLevels(route, currentRung).filter((l) => l !== 'C1' && l !== 'C2')
  const highest = levels[levels.length - 1] ?? 'Pre-A1'

  // 取该等级的全部词
  const pool = ALL_WORDS.filter((w) => w.level === highest)
  const shuffled = [...pool].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, Math.min(count, pool.length))
}

/**
 * 计算闯关结果
 */
export function gradeQuiz(results: boolean[]): {
  total: number
  known: number
  rate: number
  passed: boolean
} {
  const total = results.length
  const known = results.filter((r) => r).length
  const rate = total > 0 ? known / total : 0
  return { total, known, rate, passed: rate >= QUIZ_PASS_RATE }
}

export const ADVANCEMENT_CONFIG = {
  QUIZ_SIZE,
  QUIZ_PASS_RATE,
}
