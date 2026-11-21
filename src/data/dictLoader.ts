import { ALL_WORDS } from './index'
import { inferLexiconLevel } from './lexicons'
import { guessScene } from './sceneRules'
import { WORD_CATEGORY } from './generated/categories'
import type { GradeRung } from './levels'
import type { CategoryId, Level, Word } from './types'

type Row =
  | readonly [string, string, string, string, string]
  | readonly [string, string, string, string, string, readonly (readonly [string, string])[]]

type LevelGrade = { level: Level; grade: GradeRung }

const cache = new Map<string, Word[]>()
const pending = new Map<string, Promise<Word[]>>()

/** 用现有课程词表的 level/grade 给外部词库补齐词级难度元数据（供 AI 推断参考）。 */
const levelGradeByWord = new Map<string, LevelGrade>()
for (const w of ALL_WORDS) {
  const key = w.word.toLowerCase()
  if (!levelGradeByWord.has(key)) {
    levelGradeByWord.set(key, { level: w.level, grade: w.grade ?? 'primary' })
  }
}

const normWord = (s: string) => s.toLowerCase().normalize('NFKC').replace(/[^a-z0-9'-]/g, '')
const categoryByWord = new Map<string, CategoryId>()
for (const [w, c] of Object.entries(WORD_CATEGORY)) categoryByWord.set(normWord(w), c)
for (const w of ALL_WORDS) {
  const key = normWord(w.word)
  if (!categoryByWord.has(key)) categoryByWord.set(key, w.category ?? 'thinking')
}

/** 课程词表里查不到的词，按词库推断档位；grade 仅作内部兼容字段。 */
function fallbackLevelGrade(id: string): LevelGrade {
  return { level: inferLexiconLevel(id), grade: 'primary' }
}

/**
 * 读取内置词库（public/dicts/<id>.json）。文件随 App 一起打包，完全离线；
 * 仅做内存缓存，切回来不会重复解析大 JSON。
 */
export function loadDictWords(id: string): Promise<Word[]> {
  const hit = cache.get(id)
  if (hit) return Promise.resolve(hit)
  const inFlight = pending.get(id)
  if (inFlight) return inFlight

  const task = (async () => {
    const url = `${import.meta.env.BASE_URL}dicts/${encodeURIComponent(id)}.json`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`词库 ${id} 加载失败: HTTP ${res.status}`)
    const rows = (await res.json()) as Row[]
    const fallback = fallbackLevelGrade(id)
    const words: Word[] = rows.map((row) => {
      const [word, lexiconId, ipa, meaning, , examples] = row
      const tier = levelGradeByWord.get(word.toLowerCase()) ?? fallback
      return {
        word,
        level: tier.level,
        ipa,
        pos: '',
        meaning,
        category: categoryByWord.get(normWord(word)) ?? guessScene(meaning, '', word) ?? 'thinking',
        grade: tier.grade,
        tier: 'core',
        lexiconId,
        examples: (examples ?? []).map(([en, zh]) => ({ en, zh })),
      }
    })
    cache.set(id, words)
    pending.delete(id)
    return words
  })()

  pending.set(id, task)
  task.catch(() => pending.delete(id))
  return task
}
