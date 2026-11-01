import type { PoolWord } from './cluster'
import { wordKey } from './cluster'
import type { LessonKind } from './prompt'

export interface LessonSegment {
  speaker?: string
  en: string
  zh: string
}

export interface LessonContent {
  kind: LessonKind
  title: string
  segments: LessonSegment[]
}

const DEFAULT_TITLE: Record<LessonKind, string> = {
  story: '小故事',
  dialogue: '对话练习',
  diary: '一篇日记',
  email: '一封邮件',
  article: '科普短文',
  poem: '一首小诗',
}

/** 模型可能返回 story/dialogue/日记/邮件/科普/诗等不同写法，统一到六种体裁。 */
export function normalizeKind(input: unknown): LessonKind {
  const s = String(input ?? '').toLowerCase()
  if (s.includes('dialog') || s.includes('对话')) return 'dialogue'
  if (s.includes('diary') || s.includes('journal') || s.includes('日记')) return 'diary'
  if (s.includes('email') || s.includes('mail') || s.includes('便条') || s.includes('邮件')) return 'email'
  if (s.includes('article') || s.includes('essay') || s.includes('science') || s.includes('科普')) return 'article'
  if (s.includes('poem') || s.includes('poetry') || s.includes('诗')) return 'poem'
  return 'story'
}

/** 校验并规范化模型返回的教程 JSON。无效则抛错（调用方据此重试）。 */
export function parseLessonContent(obj: unknown): LessonContent {
  const o = obj as Record<string, unknown>
  if (!o || typeof o !== 'object') throw new Error('教程内容不是对象')

  const kind = normalizeKind(o.type ?? o.kind ?? o.format)

  const rawSegments = [o.segments, o.paragraphs, o.lines, o.dialogue]
    .find((v) => Array.isArray(v)) as unknown[] | undefined
  if (!rawSegments || rawSegments.length === 0) throw new Error('缺少 segments')

  const segments: LessonSegment[] = []
  for (const item of rawSegments) {
    if (!item || typeof item !== 'object') continue
    const s = item as Record<string, unknown>
    const en = str(s.en ?? s.text ?? s.english)
    if (!en) continue
    const zh = str(s.zh ?? s.translation ?? s.ch)
    const speaker = str(s.speaker ?? s.role ?? s.name) || undefined
    segments.push(speaker ? { speaker, en, zh } : { en, zh })
  }
  if (segments.length === 0) throw new Error('segments 全部无效')

  const title = str(o.title) || DEFAULT_TITLE[kind]
  return { kind, title, segments }
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

export function hasWTags(en: string): boolean {
  return /<w>[\s\S]*?<\/w>/.test(en)
}

export function stripWTags(en: string): string {
  return en.replace(/<\/?w>/g, '')
}

/** 词表检索索引：变体（复数/时态等）→ 词键。 */
export function buildWordIndex(vocab: Array<Pick<PoolWord, 'key' | 'word'>>): Map<string, string> {
  const index = new Map<string, string>()
  for (const v of vocab) {
    for (const variant of wordVariants(v.word.toLowerCase())) {
      if (!index.has(variant)) index.set(variant, v.key)
    }
  }
  return index
}

/** 简单词形展开：词本身 + -s/-es/-ed/-ing（含去 e、辅音 y 变 ies）。 */
export function wordVariants(base: string): string[] {
  const out = new Set<string>([base])
  if (!/^[a-z][a-z' -]*$/.test(base)) return [base]
  out.add(`${base}s`)
  out.add(`${base}es`)
  out.add(`${base}ed`)
  out.add(`${base}ing`)
  if (base.endsWith('e')) {
    out.add(`${base}d`)
    out.add(`${base.slice(0, -1)}ing`)
    out.add(`${base.slice(0, -1)}ed`)
    out.add(base.slice(0, -1) + 'ies')
  }
  if (base.endsWith('y') && base.length > 2) out.add(`${base.slice(0, -1)}ies`)
  const last = base.slice(-1)
  if (base.length > 2) out.add(`${base}${last}ed`)
  out.add(`${base}${last}ing`)
  return Array.from(out).filter((s) => s.length > 1)
}

export interface SegmentNode {
  text: string
  /** 命中的词键：非空则说明是目标词 */
  word?: string
  /** 是否为英文词条（可点击查词）；标点与空白为 false */
  isWord?: boolean
}

/**
 * 把一段英文切成可渲染节点：
 * - 带 <w> 标签：按标签切分（可靠）
 * - 无标签：按词表变体做正则回退匹配
 */
export function segmentNodes(en: string, index: Map<string, string>): SegmentNode[] {
  if (hasWTags(en)) return nodesFromTags(en, index)
  return nodesFromRegex(en, index)
}

function nodesFromTags(en: string, index: Map<string, string>): SegmentNode[] {
  const nodes: SegmentNode[] = []
  const parts = en.split(/(<w>[\s\S]*?<\/w>)/g)
  for (const part of parts) {
    if (!part) continue
    if (part.startsWith('<w>')) {
      const raw = stripWTags(part).trim()
      if (!raw) continue
      // 模型常写屈折词形（ordered），须经变体索引归一回词表键，否则点词查不到词
      const key = index.get(raw.toLowerCase()) ?? wordKey(raw)
      if (key) nodes.push({ text: raw, word: key })
      else nodes.push({ text: raw })
    } else {
      nodes.push({ text: part })
    }
  }
  return nodes
}

function nodesFromRegex(en: string, index: Map<string, string>): SegmentNode[] {
  if (index.size === 0) return [{ text: en }]
  // 长词优先，避免 "ice cream" 被 "cream" 截胡
  const patterns = Array.from(index.keys())
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
  const re = new RegExp(`\\b(${patterns.join('|')})\\b`, 'gi')

  const nodes: SegmentNode[] = []
  let last = 0
  for (const m of en.matchAll(re)) {
    const start = m.index ?? 0
    if (start > last) nodes.push({ text: en.slice(last, start) })
    const key = index.get(m[0].toLowerCase())
    nodes.push(key ? { text: m[0], word: key } : { text: m[0] })
    last = start + m[0].length
  }
  if (last < en.length) nodes.push({ text: en.slice(last) })
  return nodes.length ? nodes : [{ text: en }]
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 把整段英文切成「词 / 非词」节点：每个英文单词都可点击查词，
 * 命中目标词表时附带词键（用于高亮与三态标记）。
 * 相比 segmentNodes：不再依赖 <w> 标签，任意词都能点。
 */
export function textTokens(en: string, index: Map<string, string>): SegmentNode[] {
  const plain = stripWTags(en)
  const nodes: SegmentNode[] = []
  // 逐 token 切分：保留标点与空白，英文词按字母/撇号/连字符聚合
  for (const part of plain.split(/([A-Za-z][A-Za-z'’-]*)/g)) {
    if (!part) continue
    if (!/^[A-Za-z]/.test(part)) {
      nodes.push({ text: part })
      continue
    }
    const key = index.get(part.toLowerCase()) ?? index.get(wordKey(part))
    nodes.push(key ? { text: part, word: key, isWord: true } : { text: part, isWord: true })
  }
  return nodes
}

/** 统计目标词在正文中的命中情况（覆盖率校验）。 */
export function matchedKeys(
  vocab: Array<Pick<PoolWord, 'key' | 'word'>>,
  text: string,
): Set<string> {
  const index = buildWordIndex(vocab)
  const hit = new Set<string>()
  if (index.size === 0) return hit
  const plain = stripWTags(text)
  const patterns = Array.from(index.keys())
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
  const re = new RegExp(`\\b(${patterns.join('|')})\\b`, 'gi')
  for (const m of plain.matchAll(re)) {
    const key = index.get(m[0].toLowerCase())
    if (key) hit.add(key)
  }
  return hit
}

/** 估算一篇需要模型输出的 token 上限（正文 + 中文 + JSON 包装）。 */
export function estimateMaxTokens(kind: LessonKind, words: number): number {
  const base =
    kind === 'poem'
      ? 900
      : kind === 'email'
        ? 1500
        : kind === 'dialogue'
          ? 1600
          : kind === 'diary'
            ? 1800
            : 2200
  return Math.min(3000, base + words * 40)
}
