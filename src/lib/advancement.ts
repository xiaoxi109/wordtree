/**
 * 闯关晋级系统（LexiCore v3 架构）
 * =============================
 * 当「当前 rung 及以下」的**课程词表**达到掌握门槛后，解锁晋级闯关：
 *   - 小词池（≤300）要求 100%，保证低等级扎实；
 *   - 词池越大比例越低（95% → 90% → 80% → 70%），并有绝对上限（1200 词）；
 *   - 词典扩展词（tier=extra）不计入分母。
 * 闯关对**临界词**（当前 rung 自己的词）做抽检；通过则晋升到下一 rung。
 *
 * 目的：防止为晋级而乱标掌握（全标认识 → 但闯关会验证是否真的会）。
 */

import { CORE_WORDS } from '../data'
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
 * 晋级所需掌握比例：词池越大，容忍度越高。
 * 低等级（小词池）要求 100%，大等级逐步放宽到 70%，并设绝对上限避免「要背一万词」。
 */
const RATIO_STEPS: { max: number; ratio: number }[] = [
  { max: 300, ratio: 1 },
  { max: 1000, ratio: 0.95 },
  { max: 3000, ratio: 0.9 },
  { max: 6000, ratio: 0.8 },
  { max: Infinity, ratio: 0.7 },
]
/** 无论词池多大，最多要求掌握这么多词 */
const MAX_REQUIRED = 1200

/** 给定词池规模，算出晋级需要掌握的词数。 */
export function requiredMastery(total: number): number {
  if (total <= 0) return 0
  const step = RATIO_STEPS.find((s) => total <= s.max) ?? RATIO_STEPS[RATIO_STEPS.length - 1]
  return Math.min(total, Math.ceil(total * step.ratio), MAX_REQUIRED)
}

/**
 * 检测是否可晋级：
 *   1. 激活窗口内「课程词表」达到晋级所需掌握数（低等级 100%，大等级按比例 + 上限）
 *   2. 当前 rung 有下一级可去（不是 B2 上限）
 * 注：只统计 core 词；词典扩展词只用于查词/生成，不参与晋级门槛。
 */
export function checkAdvancement(
  route: Route,
  currentRung: GradeRung | LevelRung,
  masteredSet: Set<string>,
): {
  canAdvance: boolean
  nextRung: GradeRung | LevelRung | null
  stats: { total: number; mastered: number; required: number }
} {
  const levels: LevelRung[] = activeLevels(route, currentRung).filter((l) => l !== 'C1' && l !== 'C2')
  const scope = CORE_WORDS.filter((w) => levels.includes(w.level as LevelRung))
  const mastered = scope.filter((w) => masteredSet.has(w.word)).length
  const required = requiredMastery(scope.length)
  const canAdvance = scope.length > 0 && mastered >= required

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

  return { canAdvance: canAdvance && !!nextRung, nextRung, stats: { total: scope.length, mastered, required } }
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

  // 取该等级的课程词（扩展词不参与抽检，避免抽到从未出现过的生僻词）
  const pool = CORE_WORDS.filter((w) => w.level === highest)
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
  MAX_REQUIRED,
  RATIO_STEPS,
}
