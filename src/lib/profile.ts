import { listEvents, type WordEvent } from '../db'
import { aggregate, type WordTrajectory } from './events'
import type { UserProfile } from './__TODO__-auto-level-recommendation'
import type { CategoryId } from '../data/types'

/**
 * 从事件流算全部词的 trajectory 索引（word_key → WordTrajectory）。
 * 传入 listEvents() 的结果（避免多次 IndexedDB 查询）。
 */
export function allTrajectories(events: WordEvent[]): Map<string, WordTrajectory> {
  const byKey = new Map<string, WordEvent[]>()
  for (const e of events) {
    const arr = byKey.get(e.word_key) ?? []
    arr.push(e)
    byKey.set(e.word_key, arr)
  }
  const map = new Map<string, WordTrajectory>()
  for (const [key, arr] of byKey) {
    map.set(key, aggregate(arr, key))
  }
  return map
}

/**
 * 用 trajectory 加权后的 effectiveMastered 替代 raw masteredSet.size。
 * 一个词的贡献 = known_rate * (1 - instability)
 *   → 已知 1000 个 known_rate=0.9 且 instability=0 的词 ≈ 900 "真掌握"
 *   → 已知 1000 个 known_rate=0.9 但 instability=0.6 的词 ≈ 360
 */
export function computeEffectiveMastered(
  masteredSet: Set<string>,
  trajectories: Map<string, WordTrajectory>,
): { count: number; weighted: number; leechRatio: number; slowKnownRatio: number; directionalRatio: number } {
  let weighted = 0
  let leech = 0
  let slowKnown = 0
  let dirWeak = 0

  for (const key of masteredSet) {
    const t = trajectories.get(key)
    if (!t) {
      // 从来没判过级的词 → 给默认值 0.8（保守，因为用户主动标记了）
      weighted += 0.8
      continue
    }
    const contribution = t.known_rate_en_to_zh * (1 - t.instability)
    weighted += contribution

    if (t.instability >= 0.5 && t.state_flips >= 2) leech++
    if (t.avg_reaction_ms != null && t.avg_reaction_ms > 5000) slowKnown++
    if (
      t.known_rate_zh_to_en != null &&
      Math.abs(t.known_rate_en_to_zh - t.known_rate_zh_to_en) > 0.3 &&
      (t.known_rate_en_to_zh > 0.7 || t.known_rate_zh_to_en > 0.7)
    ) dirWeak++
  }

  const total = masteredSet.size || 1
  return {
    count: masteredSet.size,
    weighted: Math.round(weighted),
    leechRatio: leech / total,
    slowKnownRatio: slowKnown / total,
    directionalRatio: dirWeak / total,
  }
}

/**
 * 基础水平分：effectiveMastered 落在哪个阈值区间。
 * 阈值按 Oxford 3000 的 CEFR 分布定（A1~A2 约 1200 词、A2~B1 约 2500、B1~B2 约 4000）。
 */
function baseLevel(effectiveMastered: number): number {
  if (effectiveMastered < 200) return 1.0
  if (effectiveMastered < 500) return 1.8
  if (effectiveMastered < 1200) return 2.5
  if (effectiveMastered < 2500) return 3.3
  if (effectiveMastered < 4000) return 3.8
  return 4.2
}

function levelLabel(l: number): 'A1' | 'A2' | 'B1' | 'B2' {
  if (l < 2) return 'A1'
  if (l < 3) return 'A2'
  if (l < 4) return 'B1'
  return 'B2'
}

/**
 * 综合水平评估：读事件流 + masteredSet → 算 UserProfile。
 * 这是 Phase 1 主入口，AiView 顶部水平展示和 recommend() 都依赖它。
 */
export async function computeUserProfile(
  masteredSet: Set<string>,
  // 可选：已经算出的 events，省一次 IndexedDB
  existingEvents?: WordEvent[],
): Promise<UserProfile> {
  const events = existingEvents ?? (await listEvents())
  const trajectories = allTrajectories(events)
  const eff = computeEffectiveMastered(masteredSet, trajectories)

  // 基础分 + 薄弱点扣分
  let level = baseLevel(eff.weighted)

  if (eff.leechRatio > 0.15) level -= 0.5
  else if (eff.leechRatio > 0.05) level -= 0.2

  if (eff.directionalRatio > 0.25) level -= 0.3
  else if (eff.directionalRatio > 0.1) level -= 0.15

  if (eff.slowKnownRatio > 0.2) level -= 0.2
  else if (eff.slowKnownRatio > 0.08) level -= 0.1

  // 边界保护
  level = Math.max(1.0, Math.min(4.2, level))

  // 词汇广度分：effective / 对应级别上限
  const levelCap = level < 2 ? 500 : level < 3 ? 1200 : level < 4 ? 2500 : 4000
  const vocabulary = Math.min(1, eff.weighted / levelCap)

  // 深度分：trajectory 的平均 instability 倒数（instability 低 = 稳定 = 深度好）
  let avgInstability = 0
  let trajCount = 0
  for (const t of trajectories.values()) {
    avgInstability += t.instability
    trajCount++
  }
  const depth = trajCount > 0 ? 1 - avgInstability / trajCount : 0.5

  return {
    id: 'current',
    generated_at: Date.now(),
    level,
    level_label: levelLabel(level),
    scores: {
      vocabulary,
      depth,
      grammar: 0.5,    // Phase 2+ 接 AI 聊天
      fluency: 0.5,    // Phase 2+ 接阅读事件
      listening: 0.5,  // Phase 3+
    },
    weaknesses: [],   // 由 diagnosis.ts 填
    strengths: [],    // 由 diagnosis.ts 填
  }
}
