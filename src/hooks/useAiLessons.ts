import { useCallback, useRef, useState } from 'react'
import { buildMasteredPool, categoryOfKey, sceneLabelText, TOPICS, type LessonGroup, type PoolWord, type TopicId } from '../lib/cluster'
import type { CategoryId, Level } from '../data/types'
import { chatJSON, LlmError, llmErrorMessage } from '../lib/llm'
import { buildLessonMessages, LESSON_FORMATS, type Difficulty, type LessonCondition, type LessonFormatChoice, type LessonKind } from '../lib/prompt'
import { estimateMaxTokens, matchedKeys, parseLessonContent, type LessonContent } from '../lib/parse'
import { vocabUsage } from '../lib/vocab'
import { getReviewWords, type ReviewWord } from '../lib/review'
import { isConfigReady, type LlmConfig } from '../config/llm'
import {
  createLesson,
  deleteLesson,
  getLessonFull,
  saveLessonContent,
  saveLessonError,
  type Lesson,
  type LessonSegment,
} from '../db'
import { buildLearnerProfile, recommend, weightedPick, type LearningMode, type GeneratedPlan } from '../lib/planner'

export interface GenerationProgress {
  status: 'idle' | 'generating'
  lessonId: string | null
  sceneLabel: string
  error: string | null
  mode: LearningMode
  plan: GeneratedPlan | null
}

const MAX_ATTEMPTS = 3
const ALLOWED_CAP = 1200

export function useAiLessons() {
  const [progress, setProgress] = useState<GenerationProgress>({
    status: 'idle',
    lessonId: null,
    sceneLabel: '',
    error: null,
    mode: 'daily',
    plan: null,
  })
  const cancelRef = useRef(false)

  const cancel = useCallback(() => {
    cancelRef.current = true
  }, [])

  /** 预计算学习计划（给顶部状态栏 / Sheet 显示推荐值用）。 */
  const previewPlan = useCallback(
    (
      masteredSet: Set<string>,
      mode: LearningMode,
      allowedLevels?: Level[],
      targetLevel?: Level | null,
    ): GeneratedPlan => {
      const rawPool = buildMasteredPool(masteredSet)
      const pool = allowedLevels && allowedLevels.length > 0
        ? rawPool.filter((w) => !w.level || allowedLevels.includes(w.level))
        : rawPool
      const reviewRaw = getReviewWords()

      const profile = buildLearnerProfile(pool, reviewRaw, targetLevel ?? null, loadStreak())
      return recommend(profile, mode)
    },
    [],
  )

  /** 生成单篇 AI 课程。骨架先落库，后台异步调 LLM。 */
  const generate = useCallback(
    async (
      masteredSet: Set<string>,
      cfg: LlmConfig,
      condition: LessonCondition,
      mode: LearningMode,
      overrides?: { difficulty?: Difficulty },
      allowedLevels?: Level[],
      targetLevel?: Level | null,
    ): Promise<Lesson> => {
      if (!isConfigReady(cfg)) throw new Error('请先在「设置」中配置大模型 API')

      const rawPool = buildMasteredPool(masteredSet)
      const pool: PoolWord[] = allowedLevels && allowedLevels.length > 0
        ? rawPool.filter((w) => !w.level || allowedLevels.includes(w.level))
        : rawPool
      if (pool.length === 0) throw new Error('还没有已掌握的单词：先去词库标记掌握，再来生成')

      const reviewRaw = getReviewWords()
      const masteredKeys = new Set(pool.map((w) => w.key))
      const reviewPool: PoolWord[] = reviewRaw
        .filter((w) => !masteredKeys.has(w.key))
        .map((w) => ({
          key: w.key,
          word: w.word,
          ipa: w.ipa,
          meaning: w.meaning,
          category: categoryOfKey(w.key) ?? 'thinking',
          theme: null,
          isReview: true,
        }))

      // 画像 → 推荐计划（词数由 planner 动态决定）→ 用户仅可覆盖难度
      const profile = buildLearnerProfile(pool, reviewRaw, targetLevel ?? null, loadStreak())
      let plan = recommend(profile, mode)
      if (overrides?.difficulty !== undefined) plan = { ...plan, difficulty: overrides.difficulty }

      const group = pickOneGroup(pool, reviewPool, reviewRaw, plan, condition.topic)
      const kind: LessonKind = pickKind(condition.format)

      cancelRef.current = false

      const lesson = await createLesson({
        title: '',
        kind,
        generation_mode: mode,
        scene_label: group.sceneLabel,
        scene_category: group.category === 'mixed' ? undefined : group.category,
        condition_topic: condition.topic,
        condition_difficulty: plan.difficulty,
        condition_format: condition.format ?? 'auto',
        words: group.words.map((w, i) => ({
          position: i,
          word_key: w.key,
          word: w.word,
          ipa: w.ipa,
          meaning: w.meaning,
          is_review: !!w.isReview,
        })),
      })

      setProgress({
        status: 'generating',
        lessonId: lesson.id,
        sceneLabel: group.sceneLabel,
        error: null,
        mode,
        plan,
      })

      const allowed = pool.slice(0, ALLOWED_CAP).map((w) => w.word)
      const effectiveCondition: LessonCondition = { ...condition, difficulty: plan.difficulty }
      void runGeneration(lesson.id, group, cfg, effectiveCondition, kind, allowed)

      return lesson
    },
    [],
  )
  const resume = useCallback(
    async (lessonId: string, cfg: LlmConfig) => {
      if (!isConfigReady(cfg)) throw new Error('请先配置大模型 API')
      const lesson = await getLessonFull(lessonId)
      if (!lesson) return
      const words: PoolWord[] = lesson.words.map((w) => ({
        key: w.word_key,
        word: w.word,
        ipa: w.ipa,
        meaning: w.meaning,
        category: categoryOfKey(w.word_key) ?? 'thinking',
        theme: null,
        isReview: w.is_review,
      }))
      const group: LessonGroup = {
        id: lesson.id,
        category: lesson.scene_category ?? 'mixed',
        sceneLabel: lesson.scene_label,
        sceneEn: '',
        words,
      }
      cancelRef.current = false
      setProgress((p) => ({
        ...p,
        status: 'generating',
        lessonId,
        sceneLabel: lesson.scene_label,
        error: null,
      }))
      const allowed = words.map((w) => w.word)
      void runGeneration(
        lesson.id,
        group,
        cfg,
        {
          topic: lesson.condition_topic,
          difficulty: lesson.condition_difficulty,
          format: lesson.condition_format,
        },
        lesson.kind,
        allowed,
      )
    },
    [],
  )

  const reset = useCallback(() => setProgress({ status: 'idle', lessonId: null, sceneLabel: '', error: null, mode: 'daily', plan: null }), [])

  return { progress, generate, resume, cancel, reset, previewPlan }

  // ========================= internals =========================

  async function runGeneration(
    lessonId: string,
    group: LessonGroup,
    cfg: LlmConfig,
    condition: LessonCondition,
    kind: LessonKind,
    allowed: string[],
  ): Promise<void> {
    try {
      const { content, coverage } = await generateOne(group, cfg, condition, kind, allowed, () => cancelRef.current)
      const segments: LessonSegment[] = content.segments.map((seg, i) => ({
        position: i,
        speaker: seg.speaker,
        en: seg.en,
        zh: seg.zh,
      }))
      await saveLessonContent(lessonId, content.title, content.kind, segments, coverage)
    } catch (e) {
      if (cancelRef.current) {
        await deleteLesson(lessonId).catch(() => {})
        setProgress((p) => ({ ...p, status: 'idle', lessonId: null, sceneLabel: '', error: null }))
        return
      }
      const msg = llmErrorMessage(e)
      await saveLessonError(lessonId, msg)
      setProgress((p) => ({ ...p, status: 'idle', error: msg }))
      return
    }
    setProgress((p) => (p.lessonId === lessonId
      ? { ...p, status: 'idle', lessonId: null, sceneLabel: '', error: null }
      : p))
  }
}

// ========================= 挑词（加权场景 + 动态复习词预算） =========================

function pickOneGroup(
  pool: PoolWord[],
  reviewPool: PoolWord[],
  reviewRaw: ReviewWord[],
  plan: GeneratedPlan,
  topic: TopicId,
): LessonGroup {
  const per = Math.min(28, Math.max(8, plan.wordsPerLesson))
  const max = per + 5

  // 1. 选候选 category 集合
  let categories = new Set(pool.map((w) => w.category))
  if (topic !== 'random') {
    const meta = TOPICS.find((t) => t.id === topic)
    if (meta) {
      const hit = new Set(meta.categories.filter((c) => categories.has(c)))
      if (hit.size > 0) categories = hit
    }
  }

  // 2. 把 plan.categoryWeights 应用到候选 category
  const catArr = Array.from(categories)
  const weights: Partial<Record<CategoryId, number>> = {}
  for (const c of catArr) weights[c] = plan.categoryWeights[c] ?? 1
  const cat = weightedPick(catArr, weights as any)

  // 3. 从该 category 的词里挑 max 个
  const bucket = pool.filter((w) => w.category === cat)
  const picked = bucket.sort(() => Math.random() - 0.5).slice(0, max)

  // 4. 复习词：按 plan.reviewRatio 算预算（最少 1 个，最多占一半）
  const reviewBudgetCount = Math.max(
    1,
    Math.min(Math.floor(max * 0.6), Math.round(max * plan.reviewRatio)),
  )
  const currentReviewCount = picked.filter((w) => w.isReview).length
  const reviewSlots = Math.max(0, reviewBudgetCount - currentReviewCount)

  // 复习词挑的时候优先选 misses 高的（更对症）
  const missScore = new Map(reviewRaw.map((r) => [r.key, r.misses ?? 1]))
  const reviewCandidates = reviewPool
    .filter((w) => !picked.some((p) => p.key === w.key))
    .sort((a, b) => (missScore.get(b.key) ?? 1) - (missScore.get(a.key) ?? 1) || Math.random() - 0.5)
    .slice(0, reviewSlots)

  const finalWords = [...picked, ...reviewCandidates]

  return {
    id: cat,
    category: cat,
    // 存中文场景名，别把内部 category id（people / food …）直接落到界面上
    sceneLabel: sceneLabelText(String(cat ?? 'mixed')),
    sceneEn: '',
    words: finalWords,
  }
}

function loadStreak(): number {
  try {
    // 兼容两种 key 格式：新的 lexicore-streak / 旧的 streak
    const raw = localStorage.getItem('lexicore-streak') ?? localStorage.getItem('streak')
    return raw ? Number(raw) || 0 : 0
  } catch {
    return 0
  }
}

function pickKind(format: LessonFormatChoice | undefined): LessonKind {
  if (format && format !== 'auto') return format
  // auto → 六种体裁随机挑一个（单篇每次都不一样）
  const all: LessonKind[] = LESSON_FORMATS.map((f) => f.id)
  return all[Math.floor(Math.random() * all.length)]
}

// ========================= generateOne（3 轮重试 + 覆盖率/用词率校验） =========================

async function generateOne(
  group: LessonGroup,
  cfg: LlmConfig,
  condition: LessonCondition,
  kind: LessonKind,
  allowed: string[],
  shouldCancel: () => boolean,
): Promise<{
  content: LessonContent
  coverage: { hit: number; total: number; missing: string[]; known: number; realWords: number }
}> {
  let missing: string[] = []
  let banned: string[] = []
  let best: {
    content: LessonContent
    hit: number
    missing: string[]
    usage: { knownWords: number; realWords: number; ratio: number; outOfVocab: string[] }
  } | null = null

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (shouldCancel()) throw new Error('canceled')
    try {
      const messages = buildLessonMessages(group, condition, kind, {
        allowedWords: allowed,
        missingWords: missing,
        bannedWords: banned,
      })
      const obj = await chatJSON(cfg, messages, {
        maxTokens: estimateMaxTokens(kind, group.words.length),
      })
      // CapacitorHttp 不支持 AbortSignal，只能在请求返回后立刻检查取消，
      // 保证此后不再解析/重试/写库。
      if (shouldCancel()) throw new Error('canceled')
      const parsed = parseLessonContent(obj)
      const content: LessonContent = { ...parsed, kind }

      const text = content.segments.map((s) => s.en).join('\n')
      const hit = matchedKeys(group.words, text)
      missing = group.words.filter((w) => !hit.has(w.key)).map((w) => w.word)
      const usage = vocabUsage(group.words, allowed, text)
      const overBudget = usage.outOfVocab.length > 8

      if (
        !best ||
        missing.length < best.missing.length ||
        (missing.length === best.missing.length && usage.ratio > best.usage.ratio)
      ) {
        best = { content, hit: hit.size, missing, usage }
      }

      if (missing.length > 0 || overBudget) {
        if (attempt < MAX_ATTEMPTS - 1) {
          banned = overBudget ? usage.outOfVocab.slice(0, 24) : []
          await sleep(400)
          continue
        }
      }
      break
    } catch (e) {
      // 取消不能被当成普通错误重试，也不该额外 sleep。
      if (e instanceof Error && e.message === 'canceled') throw e
      if (shouldCancel()) throw new Error('canceled')
      if (e instanceof LlmError && (e.kind === 'auth' || e.kind === 'rate')) throw e
      // 保留「内容无法解析 / 内容为空」这类可操作提示，不要吞成笼统的「生成失败」。
      if (e instanceof LlmError && (e.kind === 'json' || e.kind === 'empty') && attempt === MAX_ATTEMPTS - 1) {
        throw e
      }
      await sleep(800 * (attempt + 1))
    }
  }

  if (!best) throw new Error('生成失败')
  return {
    content: best.content,
    coverage: {
      hit: best.hit,
      total: group.words.length,
      missing: best.missing,
      known: best.usage.knownWords,
      realWords: best.usage.realWords,
    },
  }
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
