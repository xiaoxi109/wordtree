import { TOTAL_CORE } from './index'
import {
  DICT_CATALOG,
  DICT_TAGS_BY_CATEGORY,
  type DictCatalogItem,
} from './generated/dict-catalog'
import type { Level } from './types'

export type { LexiconId } from './types'

export interface LexiconMeta {
  id: string
  name: string
  description: string
  category: string
  tags: string[]
  count: number
}

/** 系统核心词库 + TypeWords 194 个词库，共 195 项，数据全部内置。 */
export const LEXICONS: LexiconMeta[] = [
  {
    id: 'core',
    name: '词树核心词库',
    description: '牛津 3000 / 中考高考 / 场景词',
    category: '系统词库',
    tags: ['系统词库'],
    count: TOTAL_CORE,
  },
  ...DICT_CATALOG.map((d: DictCatalogItem) => ({ ...d })),
]

export const DICT_CATEGORY_LIST = [
  '系统词库',
  '国际考试',
  '中国考试',
  '青少年英语',
  '代码练习',
]

export const DICT_TAGS: Record<string, string[]> = {
  '系统词库': ['系统词库'],
  ...DICT_TAGS_BY_CATEGORY,
}

export const getLexiconMeta = (id: string): LexiconMeta | undefined =>
  LEXICONS.find((l) => l.id === id)

export const isLexiconId = (v: unknown): v is string =>
  typeof v === 'string' && LEXICONS.some((l) => l.id === v)

export const masteredKey = (id: string): string =>
  id === 'core' ? 'lexicore-mastered' : `lexicore-mastered:${id}`

/**
 * AI 课程难度：按当前词库推断 CEFR 档位，不再依赖学习路线/我的等级。
 * 词级 level 仍保留，用于 planner 依据已掌握词做自适应推荐。
 */
export function inferLexiconLevel(id: string): Level {
  if (id === 'core') return 'B2'
  const meta = getLexiconMeta(id)
  const name = `${meta?.name ?? ''} ${meta?.description ?? ''} ${id}`.toLowerCase()
  if (/新概念英语.?1|nce.?new.?1/.test(name)) return 'A1'
  if (/新概念英语.?2|nce.?new.?2/.test(name)) return 'A2'
  if (/新概念英语.?3|nce.?new.?3/.test(name)) return 'B1'
  if (/新概念英语.?4|nce.?new.?4/.test(name)) return 'B2'
  if (/cet.?4|四级/.test(name)) return 'B1'
  if (/cet.?6|六级|雅思|ielts|托福|toefl/.test(name)) return 'B2'
  if (/考研|kaoyan/.test(name)) return 'B2'
  if (/中考/.test(name)) return 'B1'
  if (/小学|primary/.test(name)) return 'A1'
  return 'B1'
}

export function loadMastered(id: string): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(masteredKey(id)) || '[]')
    return Array.isArray(parsed) ? parsed.filter((w): w is string => typeof w === 'string') : []
  } catch {
    return []
  }
}
