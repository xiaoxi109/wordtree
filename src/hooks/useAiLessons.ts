import { useCallback, useRef, useState } from 'react'
import {
  buildMasteredPool,
  categoryOfKey,
  clusterWords,
  TOPIC_LABEL,
  type LessonGroup,
  type PoolWord,
  type TopicId,
} from '../lib/cluster'
import { chatJSON, LlmError, llmErrorMessage } from '../lib/llm'
import {
  buildLessonMessages,
  formatMeta,
  planKind,
  type LessonCondition,
  type LessonFormatChoice,
  type LessonKind,
} from '../lib/prompt'
import { estimateMaxTokens, matchedKeys, parseLessonContent, type LessonContent } from '../lib/parse'
import { vocabUsage } from '../lib/vocab'
import { getReviewWords } from '../lib/review'
import { isConfigReady, type LlmConfig } from '../config/llm'
import {
  getSet,
  listLessons,
  newId,
  putLesson,
  putSet,
  saveLessonContent,
  saveLessonError,
  type AiLesson,
  type AiLessonSet,
  type LessonStatus,
} from '../db'

export interface LiveLesson {
  id: string
  index: number
  sceneLabel: string
  status: LessonStatus
  /** 正在写作中（比 pending 更细的实时状态） */
  running?: boolean
  error?: string
}

export interface GenerationProgress {
  status: 'idle' | 'generating'
  setId: string | null
  total: number
  done: number
  failed: number
  /** 正在生成的场景名 */
  currentScene: string
  /** 逐篇状态（现代化进度列表用） */
  lessons: LiveLesson[]
  /** 可展示给用户的错误（如鉴权失败、无词可生成） */
  error: string | null
  /** 本次生成涉及多少复习词 */
  reviewCount: number
}

const IDLE: GenerationProgress = {
  status: 'idle',
  setId: null,
  total: 0,
  done: 0,
  failed: 0,
  currentScene: '',
  lessons: [],
  error: null,
  reviewCount: 0,
}

const CONCURRENCY = 2
const MAX_ATTEMPTS = 3 // 首次 + 2 次重试
/** 允许词汇表上限（避免 prompt 过大，超出时优先保留同场景词） */
const ALLOWED_CAP = 1200
/** 单篇允许的超纲实词个数（超出则带禁用词重试一次） */
const OUT_OF_VOCAB_BUDGET = 8

/** 计划篇目形式：自动模式按 6 种体裁循环，保证一套课程里形态丰富。 */
function planLessonKind(index: number, format: LessonFormatChoice | undefined): LessonKind {
  return planKind(index, format ?? 'auto')
}

export function useAiLessons() {
  const [progress, setProgress] = useState<GenerationProgress>(IDLE)
  const cancelRef = useRef(false)
  const abortRef = useRef(false)

  const cancel = useCallback(() => {
    cancelRef.current = true
  }, [])

  /**
   * 一次性生成覆盖全部已掌握词的课程集（并编入一部分错词复习词）。
   * 返回新建的课程集；生成在后台继续，可通过 progress 观察。
   */
  const generate = useCallback(
    async (masteredSet: Set<string>, cfg: LlmConfig, condition: LessonCondition): Promise<AiLessonSet> => {
      if (!isConfigReady(cfg)) throw new Error('请先在「设置」中配置大模型 API')
      const pool = buildMasteredPool(masteredSet)
      if (pool.length === 0) throw new Error('还没有已掌握的单词：先去「CEFR / 人教」页标记掌握，再来生成')

      // 错词队列：已重新掌握的词不再作为复习词
      const masteredKeys = new Set(pool.map((w) => w.key))
      const reviewPool: PoolWord[] = getReviewWords()
        .filter((w) => !masteredKeys.has(w.key))
        .map((w) => ({
          key: w.key,
          word: w.word,
          ipa: w.ipa,
          meaning: w.meaning,
          category: 'thinking',
          theme: null,
          isReview: true,
        }))

      const groups = clusterWords(pool, {
        wordsPerLesson: cfg.wordsPerLesson,
        topic: condition.topic,
        review: reviewPool,
      })

      const set: AiLessonSet = {
        id: newId('set'),
        createdAt: Date.now(),
        title: buildSetTitle(condition.topic, condition.format),
        condition,
        total: groups.length,
        done: 0,
        failed: 0,
        wordsCount: pool.length,
        status: 'generating',
        readCount: 0,
        lastIndex: 0,
      }

      cancelRef.current = false
      abortRef.current = false
      setProgress({
        ...IDLE,
        status: 'generating',
        setId: set.id,
        total: groups.length,
        reviewCount: groups.reduce((n, g) => n + g.words.filter((w) => w.isReview).length, 0),
      })

      await putSet(set)
      const skeletons: LiveLesson[] = []
      for (let i = 0; i < groups.length; i++) {
        const g = groups[i]
        const lesson: AiLesson = {
          id: newId('lesson'),
          setId: set.id,
          index: i,
          kind: planLessonKind(i, condition.format),
          sceneLabel: g.sceneLabel,
          title: '',
          status: 'pending',
          words: g.words.map((w) => ({
            key: w.key,
            word: w.word,
            ipa: w.ipa,
            meaning: w.meaning,
            isReview: w.isReview,
          })),
          segments: [],
          marks: {},
        }
        skeletons.push({ id: lesson.id, index: i, sceneLabel: g.sceneLabel, status: 'pending' })
        await putLesson(lesson)
      }
      setProgress((p) => ({ ...p, lessons: skeletons }))

      void runSet(set.id, cfg, pool)
      return set
    },
    [],
  )

  /** 对某课程集（重新）生成所有未就绪的篇目；ids 非空时只处理指定篇（单篇重试）。 */
  const resume = useCallback((setId: string, cfg: LlmConfig, ids?: string[]) => {
    cancelRef.current = false
    abortRef.current = false
    void runSet(setId, cfg, undefined, ids)
  }, [])

  const runSet = useCallback(async (setId: string, cfg: LlmConfig, pool?: PoolWord[], ids?: string[]) => {
    const set = await getSet(setId)
    if (!set) return
    let lessons = await listLessons(setId)
    lessons = ids ? lessons.filter((l) => ids.includes(l.id)) : lessons.filter((l) => l.status !== 'ready')
    if (lessons.length === 0) return

    // 允许词汇表：已掌握词全量（超上限时按本篇场景优先截断）
    const allowedPool = pool ?? buildMasteredPool(new Set(getMasteredSnapshot()))
    const reviewCount = lessons.reduce((n, l) => n + l.words.filter((w) => w.isReview).length, 0)

    setProgress({
      status: 'generating',
      setId,
      total: lessons.length,
      done: 0,
      failed: 0,
      currentScene: lessons[0]?.sceneLabel ?? '',
      error: null,
      reviewCount,
      lessons: lessons.map((l) => ({
        id: l.id,
        index: l.index,
        sceneLabel: l.sceneLabel,
        status: l.status,
        error: l.error,
      })),    })

    let done = 0
    let failed = 0
    let i = 0
    // 速率限制：退避后重排一次（防止服务端持续 429 造成死循环）
    const requeued = new Map<string, number>()

    const patchLive = (id: string, patch: Partial<LiveLesson>) => {
      setProgress((p) => ({
        ...p,
        lessons: p.lessons.map((l) => (l.id === id ? { ...l, ...patch } : l)),
      }))
    }

    const worker = async () => {
      while (!cancelRef.current && !abortRef.current) {
        const idx = i++
        if (idx >= lessons.length) return
        const lesson = lessons[idx]
        setProgress((p) => ({ ...p, currentScene: lesson.sceneLabel }))
        patchLive(lesson.id, { running: true })
        try {
          const allowed = pickAllowedWords(pool ?? allowedPool, lesson)
          const { content, coverage } = await generateOne(lesson, cfg, set.condition, allowed)
          await saveLessonContent(lesson.id, content, lesson.words, lesson.sceneLabel, coverage)
          patchLive(lesson.id, { running: false, status: 'ready' })
          done++
        } catch (e) {
          const msg = llmErrorMessage(e)
          if (e instanceof LlmError && e.kind === 'auth') {
            abortRef.current = true
            await saveLessonError(lesson.id, msg)
            patchLive(lesson.id, { running: false, status: 'failed', error: msg })
            setProgress((p) => ({ ...p, error: msg }))
          } else if (e instanceof LlmError && e.kind === 'rate' && (requeued.get(lesson.id) ?? 0) < 1) {
            requeued.set(lesson.id, (requeued.get(lesson.id) ?? 0) + 1)
            await sleep(5000)
            lessons.push(lesson) // 排回队尾重试，不计入失败
          } else {
            failed++
            await saveLessonError(lesson.id, msg)
            patchLive(lesson.id, { running: false, status: 'failed', error: msg })
          }
        }
        const readyCount = done
        setProgress((p) => ({ ...p, done: readyCount, failed }))
        await updateSetProgress(setId, readyCount, failed)
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, lessons.length) }, () => worker()))

    const after = await getSet(setId)
    if (after && after.status === 'generating') {
      const pending = (await listLessons(setId)).filter((l) => l.status !== 'ready')
      await putSet({
        ...after,
        status: pending.length === 0 ? 'ready' : after.done > 0 ? 'partial' : 'failed',
      })
    }
    setProgress((p) => (p.setId === setId ? { ...p, status: 'idle', currentScene: '' } : p))
  }, [])

  const reset = useCallback(() => setProgress(IDLE), [])

  return { progress, generate, resume, cancel, reset }
}

/* ---------------------------- internals ---------------------------- */

function buildSetTitle(topic: TopicId, format?: LessonFormatChoice): string {
  const scope = topic === 'random' ? '全场景复习' : `${TOPIC_LABEL[topic]}专题`
  const style = !format || format === 'auto' ? '多体裁' : formatMeta(format).label
  const d = new Date()
  return `${scope} · ${style} · ${d.getMonth() + 1}月${d.getDate()}日`
}

/** 从 localStorage 读取掌握词快照（resume 时没有原始 Set 时使用）。 */
function getMasteredSnapshot(): string[] {
  try {
    const raw = localStorage.getItem('lexicore-mastered')
    const arr = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/** 本篇允许词汇：全部已掌握词；超上限时同场景词优先。 */
function pickAllowedWords(pool: PoolWord[], lesson: AiLesson): string[] {
  if (pool.length <= ALLOWED_CAP) return pool.map((w) => w.word)
  const cats = new Set(
    lesson.words.map((w) => categoryOfKey(w.key)).filter((c): c is NonNullable<typeof c> => !!c),
  )
  const preferred = pool.filter((w) => cats.has(w.category)).map((w) => w.word)
  const rest = pool.filter((w) => !cats.has(w.category)).map((w) => w.word)
  return Array.from(new Set([...preferred, ...rest])).slice(0, ALLOWED_CAP)
}

async function generateOne(
  lesson: AiLesson,
  cfg: LlmConfig,
  condition: LessonCondition,
  allowed: string[],
): Promise<{
  content: LessonContent
  coverage: { hit: number; total: number; missing: string[]; known: number; realWords: number }
}> {
  const group: LessonGroup = {
    id: lesson.id,
    category: 'mixed',
    sceneLabel: lesson.sceneLabel,
    sceneEn: '',
    words: lesson.words.map((w) => ({
      key: w.key,
      word: w.word,
      ipa: w.ipa,
      meaning: w.meaning,
      category: 'thinking',
      theme: null,
      isReview: w.isReview,
    })),
  }

  let lastErr: unknown = null
  let missing: string[] = []
  let banned: string[] = []
  let best:
    | {
        content: LessonContent
        hit: number
        missing: string[]
        usage: { known: number; realWords: number; ratio: number; outOfVocab: string[] }
      }
    | null = null

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const messages = buildLessonMessages(group, condition, lesson.kind, {
        allowedWords: allowed,
        missingWords: missing,
        bannedWords: banned,
      })
      const obj = await chatJSON(cfg, messages, {
        maxTokens: estimateMaxTokens(lesson.kind, lesson.words.length),
      })
      const parsed = parseLessonContent(obj)
      // 以计划体裁为准：模型偶尔漏写/写错 type 时仍按预期排版与朗读。
      const content = { ...parsed, kind: lesson.kind }
      // 覆盖率校验：目标词必须真的写进正文，缺词则带提示重试
      const text = content.segments.map((s) => s.en).join('\n')
      const hit = matchedKeys(lesson.words, text)
      missing = lesson.words.filter((w) => !hit.has(w.key)).map((w) => w.word)
      // 用词校验：超纲实词过多时带禁用词清单重试（让文章更贴近已掌握词）
      const usage = vocabUsage(lesson.words, allowed, text)
      const overBudget = usage.outOfVocab.length > OUT_OF_VOCAB_BUDGET

      // 保留质量最好的一稿：先看重点词覆盖，再看用词率
      if (
        !best ||
        missing.length < best.missing.length ||
        (missing.length === best.missing.length && usage.ratio > best.usage.ratio)
      ) {
        best = {
          content,
          hit: hit.size,
          missing,
          usage: {
            known: usage.knownWords,
            realWords: usage.realWords,
            ratio: usage.ratio,
            outOfVocab: usage.outOfVocab,
          },
        }
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
      lastErr = e
      if (e instanceof LlmError && (e.kind === 'auth' || e.kind === 'rate')) throw e
      await sleep(800 * (attempt + 1))
    }
  }

  if (!best) throw lastErr ?? new Error('生成失败')
  return {
    content: best.content,
    coverage: {
      hit: best.hit,
      total: lesson.words.length,
      missing: best.missing,
      known: best.usage.known,
      realWords: best.usage.realWords,
    },
  }
}

async function updateSetProgress(setId: string, done: number, failed: number) {
  const set = await getSet(setId)
  if (!set) return
  await putSet({ ...set, done, failed, status: 'generating' })
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
