/**
 * FSRS-4.5 间隔重复算法（Free Spaced Repetition Scheduler）
 *
 * 基于 DSR 模型：Difficulty（难度）/ Stability（记忆稳定性）/ Retrievability（可提取概率）。
 * 公式与默认权重取自官方 wiki（open-spaced-repetition/fsrs4anki · The Algorithm）。
 *
 * 本项目只调度到「天」，且评分只用三档 Again/Hard/Good（G=1/2/3，无 Easy），
 * 故未引入分钟级 learning steps；首次/遗忘后的间隔统一 clamp 到最小 1 天。
 */

/** FSRS-4.5 官方默认权重 w[0..16] */
export const FSRS_WEIGHTS = [
  0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474,
  0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755,
] as const

/** FSRS-4.5 遗忘曲线常量：DECAY=-0.5, FACTOR=19/81（R(t=S)=0.9） */
const DECAY = -0.5
const FACTOR = 19 / 81
/** 目标留存率：间隔 = stability 时的记住概率 */
export const DEFAULT_DESIRED_RETENTION = 0.9
/** 最小间隔（天）：项目按天调度 */
export const MIN_INTERVAL_DAYS = 1

/** 评分档位：Again=不认识 / Hard=有印象 / Good=认识 */
export type FsrsGrade = 1 | 2 | 3

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** 初始稳定性 S0(G) = w[G-1] */
export function initialStability(grade: FsrsGrade): number {
  return FSRS_WEIGHTS[grade - 1]
}

/** 初始难度 D0(G) = w4 - (G-3)·w5，限制在 [1,10] */
export function initialDifficulty(grade: FsrsGrade): number {
  return clamp(FSRS_WEIGHTS[4] - (grade - 3) * FSRS_WEIGHTS[5], 1, 10)
}

/** 可提取概率 R(t,S) = (1 + FACTOR·t/S)^DECAY，t 为距上次复习的天数 */
export function retrievability(elapsedDays: number, stability: number): number {
  const t = Math.max(0, elapsedDays)
  const s = Math.max(0.01, stability)
  return Math.pow(1 + (FACTOR * t) / s, DECAY)
}

/** 下次难度 D' = w7·D0(3) + (1-w7)·(D - w6·(G-3))，限制在 [1,10] */
export function nextDifficulty(difficulty: number, grade: FsrsGrade): number {
  const dBase = difficulty - FSRS_WEIGHTS[6] * (grade - 3)
  return clamp(FSRS_WEIGHTS[7] * FSRS_WEIGHTS[4] + (1 - FSRS_WEIGHTS[7]) * dBase, 1, 10)
}

/** 成功回忆后的稳定性 S'_r */
export function stabilityAfterRecall(
  difficulty: number,
  stability: number,
  retriev: number,
  grade: FsrsGrade,
): number {
  const gradeFactor = grade === 2 ? FSRS_WEIGHTS[15] : 1 // Hard 削弱增长
  const growth =
    Math.exp(FSRS_WEIGHTS[8]) *
    (11 - difficulty) *
    Math.pow(stability, -FSRS_WEIGHTS[9]) *
    (Math.exp(FSRS_WEIGHTS[10] * (1 - retriev)) - 1) *
    gradeFactor
  return Math.max(0.01, stability * (growth + 1))
}

/** 遗忘后的稳定性 S'_f */
export function stabilityAfterLapse(
  difficulty: number,
  stability: number,
  retriev: number,
): number {
  const s = Math.max(0, stability)
  const value =
    FSRS_WEIGHTS[11] *
    Math.pow(difficulty, -FSRS_WEIGHTS[12]) *
    (Math.pow(s + 1, FSRS_WEIGHTS[13]) - 1) *
    Math.exp(FSRS_WEIGHTS[14] * (1 - retriev))
  return Math.max(0.01, value)
}

/** 由稳定性算下次间隔 I(r,S) = S/FACTOR·(r^(1/DECAY) - 1)，向下取整、最小 1 天 */
export function intervalDays(stability: number, desiredRetention = DEFAULT_DESIRED_RETENTION): number {
  const raw = (stability / FACTOR) * (Math.pow(desiredRetention, 1 / DECAY) - 1)
  return Math.max(MIN_INTERVAL_DAYS, Math.round(raw))
}

export interface FsrsState {
  stability: number
  difficulty: number
}

export interface FsrsReviewResult extends FsrsState {
  /** 下次复习间隔（天） */
  interval: number
}

/**
 * 一次复习评分后的完整状态推进。
 * @param prev 上一次的记忆状态；null 表示新卡（用初始 S0/D0）
 * @param grade 评分档位（1=不认识 / 2=有印象 / 3=认识）
 * @param elapsedDays 距上次复习的天数；新卡传 0
 */
export function review(
  prev: FsrsState | null,
  grade: FsrsGrade,
  elapsedDays = 0,
  desiredRetention = DEFAULT_DESIRED_RETENTION,
): FsrsReviewResult {
  if (!prev) {
    const stability = initialStability(grade)
    return { stability, difficulty: initialDifficulty(grade), interval: intervalDays(stability, desiredRetention) }
  }

  const stability = clamp(prev.stability, 0.01, 36500)
  const difficulty = clamp(prev.difficulty, 1, 10)
  const r = retrievability(elapsedDays, stability)

  const nextStability =
    grade === 1
      ? stabilityAfterLapse(difficulty, stability, r)
      : stabilityAfterRecall(difficulty, stability, r, grade)
  const updatedDifficulty = nextDifficulty(difficulty, grade)

  return {
    stability: nextStability,
    difficulty: updatedDifficulty,
    interval: intervalDays(nextStability, desiredRetention),
  }
}
