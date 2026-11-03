import { listEvents, listLessons, getLessonMarks, type WordEvent } from '../db'
import type { UserProfile, WeakPoint, WordTrajectory } from './__TODO__-auto-level-recommendation'
import { allTrajectories } from './profile'

// ========================= 七类薄弱点诊断 =========================

/** Phase 1 就能跑的薄弱点诊断：全从事件流 + LessonMark 聚合。 */
export async function findWeaknesses(
  profile: UserProfile,
  masteredSet: Set<string>,
  existingEvents?: WordEvent[],
): Promise<WeakPoint[]> {
  const events = existingEvents ?? (await listEvents())
  const trajectories = allTrajectories(events)
  const weaknesses: WeakPoint[] = []

  // ① Leech 不稳定词（masteredSet 里 instability >= 0.5 且 flips >= 2）
  const leeches: WordTrajectory[] = []
  for (const key of masteredSet) {
    const t = trajectories.get(key)
    if (t && t.instability >= 0.5 && t.state_flips >= 2) leeches.push(t)
  }
  leeches.sort((a, b) => b.instability - a.instability)
  for (const t of leeches.slice(0, 5)) {
    weaknesses.push({
      type: 'leech',
      id: t.word_key,
      label: `${t.word}（来来回回 ${t.state_flips} 次）`,
      severity: Math.min(1, t.instability),
      evidence: { count: t.state_flips, sources: ['study', 'ai_reader'] },
      prescription: `下次 AI 课程**强制**把 "${t.word}" 放进去（无论场景匹配）`,
    })
  }

  // ② 方向性薄弱：一边 known_rate > 0.7 另一边 < 0.5
  const directional: { t: WordTrajectory; weakDir: 'en→zh' | 'zh→en'; gap: number }[] = []
  for (const t of trajectories.values()) {
    if (t.known_rate_zh_to_en == null) continue
    const en = t.known_rate_en_to_zh
    const zh = t.known_rate_zh_to_en
    if (en > 0.7 && zh < 0.5) directional.push({ t, weakDir: 'zh→en', gap: en - zh })
    else if (zh > 0.7 && en < 0.5) directional.push({ t, weakDir: 'en→zh', gap: zh - en })
  }
  directional.sort((a, b) => b.gap - a.gap)
  for (const { t, weakDir, gap } of directional.slice(0, 5)) {
    weaknesses.push({
      type: 'direction',
      id: t.word_key,
      label: `${t.word}（看英文能认，${weakDir === 'zh→en' ? '说不出来' : '看不懂中文释义'}）`,
      severity: Math.min(1, gap),
      evidence: {
        count: Math.round(
          weakDir === 'zh→en' ? (1 - t.known_rate_zh_to_en) * 10 : (1 - t.known_rate_en_to_zh) * 10,
        ),
        sources: ['study'],
      },
      prescription:
        weakDir === 'zh→en'
          ? `StudyView 里给 "${t.word}" 多推几张中→英方向的卡；AI 文章里放成填空位`
          : `StudyView 里给 "${t.word}" 多推几张英→中方向的卡`,
      direction: weakDir,
    })
  }

  // ③ 慢反应 known
  const slowKnown: WordTrajectory[] = []
  for (const t of trajectories.values()) {
    if (t.avg_reaction_ms != null && t.avg_reaction_ms > 5000 && t.known_rate_en_to_zh > 0.5) {
      slowKnown.push(t)
    }
  }
  slowKnown.sort((a, b) => (b.avg_reaction_ms ?? 0) - (a.avg_reaction_ms ?? 0))
  for (const t of slowKnown.slice(0, 3)) {
    weaknesses.push({
      type: 'slow',
      id: t.word_key,
      label: `${t.word}（反应 ${(t.avg_reaction_ms! / 1000).toFixed(1)}s 才答 known）`,
      severity: Math.min(1, (t.avg_reaction_ms! - 5000) / 10000),
      evidence: { count: t.total_events, sources: ['study'] },
      prescription: `StudyView 里如果反应 > 3s 点 known，弹追问"确定真的认识吗？"`,
    })
  }

  // ④ AI 课程高频 unknown（从 LessonMark 表聚合）
  const lessons = await listLessons()
  const unknownCount = new Map<string, number>()
  for (const l of lessons) {
    if (l.status !== 'ready') continue
    const marks = await getLessonMarks(l.id)
    for (const m of marks) {
      if (m.state === 'unknown' || m.state === 'fuzzy') {
        unknownCount.set(m.word_key, (unknownCount.get(m.word_key) ?? 0) + 1)
      }
    }
  }
  const topUnknown = [...unknownCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  for (const [wordKey, count] of topUnknown) {
    const traj = trajectories.get(wordKey)
    const word = traj?.word ?? wordKey
    weaknesses.push({
      type: 'vocab',
      id: wordKey,
      label: `${word}（AI 课程里 ${count} 次标为 unknown/fuzzy）`,
      severity: Math.min(1, count / 5),
      evidence: { count, sources: ['ai_reader'] },
      prescription: `下次 AI 课程把 "${word}" 放进去并要求出现 2 次`,
    })
  }

  // ⑤ 场景级薄弱：聚合 topUnknown 的 category
  // 需要 category → topic 的映射，简化版用 TOPICS 做反向
  const categoryCount = new Map<CategoryId, number>()
  const catToTopic = new Map<CategoryId, string>()
  for (const t of TOPICS) {
    for (const cat of t.categories) {
      categoryCount.set(cat, 0)
      catToTopic.set(cat, t.id)
    }
  }
  for (const [wordKey] of topUnknown) {
    // category 从 WordTrajectory 拿不到，从 masteredSet 查——简化：跳过，等 phase 2
    // 这里只做 AI 高频 unknown 的场景粗聚合（从 Lesson.scene_label 来）
  }

  // 场景级临时简化：用 lesson.scene_label 聚合
  const sceneCount = new Map<string, number>()
  for (const l of lessons) {
    if (l.status !== 'ready') continue
    const marks = await getLessonMarks(l.id)
    const unkCount = marks.filter((m) => m.state !== 'known').length
    if (unkCount > 0) {
      sceneCount.set(l.scene_label, (sceneCount.get(l.scene_label) ?? 0) + unkCount)
    }
  }
  const topScene = [...sceneCount.entries()].sort((a, b) => b[1] - a[1])[0]
  if (topScene && topScene[1] >= 3) {
    weaknesses.push({
      type: 'category',
      id: topScene[0],
      label: `${topScene[0]} 场景（累计 ${topScene[1]} 次 unknown）`,
      severity: Math.min(1, topScene[1] / 10),
      evidence: { count: topScene[1], sources: ['ai_reader'] },
      prescription: `下次 AI 生成优先挑 ${topScene[0]} 场景的词`,
    })
  }

  // 按 severity 排，取 top 10
  weaknesses.sort((a, b) => b.severity - a.severity)
  return weaknesses.slice(0, 10)
}

// ========================= 辅助：从 profile + masteredSet 算 strengths =========================

export async function findStrengths(
  profile: UserProfile,
  masteredSet: Set<string>,
  existingEvents?: WordEvent[],
): Promise<WeakPoint[]> {
  const events = existingEvents ?? (await listEvents())
  const trajectories = allTrajectories(events)
  const strengths: WeakPoint[] = []

  // 稳定掌握的词：known_rate >= 0.9 且 instability <= 0.2
  const stable: WordTrajectory[] = []
  for (const key of masteredSet) {
    const t = trajectories.get(key)
    if (t && t.known_rate_en_to_zh >= 0.9 && t.instability <= 0.2) stable.push(t)
  }
  stable.sort((a, b) => b.known_rate_en_to_zh - a.known_rate_en_to_zh)
  for (const t of stable.slice(0, 3)) {
    strengths.push({
      type: 'vocab',
      id: t.word_key,
      label: `${t.word}（稳定掌握）`,
      severity: t.known_rate_en_to_zh,
      evidence: { count: t.total_events, sources: ['study', 'ai_reader'] },
      prescription: `可以考虑进阶到更难的词`,
    })
  }

  return strengths
}
