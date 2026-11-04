/**
 * 词性（Part of Speech）归类。
 *
 * 词库里的 `pos` 字段格式不统一：`n.`、`n., v.`、`n./v.`、`modal v.`、`number`，
 * 人教补充词甚至是空串（词性藏在中文释义前缀里，如 `adj. 精确的`）。
 * 这里统一归一为可筛选的词性标签，供「按词性看词」使用。
 */
export type PosId =
  | 'n'
  | 'v'
  | 'adj'
  | 'adv'
  | 'pron'
  | 'prep'
  | 'conj'
  | 'det'
  | 'art'
  | 'num'
  | 'interj'
  | 'modal'
  | 'aux'
  | 'other'

export interface PosMeta {
  id: PosId
  label: string
  /** 词性缩写（卡片/详情展示用） */
  short: string
}

/** 展示顺序（也是筛选 chip 的顺序）。 */
export const POS_GROUPS: PosMeta[] = [
  { id: 'n', label: '名词', short: 'n.' },
  { id: 'v', label: '动词', short: 'v.' },
  { id: 'adj', label: '形容词', short: 'adj.' },
  { id: 'adv', label: '副词', short: 'adv.' },
  { id: 'pron', label: '代词', short: 'pron.' },
  { id: 'prep', label: '介词', short: 'prep.' },
  { id: 'conj', label: '连词', short: 'conj.' },
  { id: 'num', label: '数词', short: 'num.' },
  { id: 'det', label: '限定词', short: 'det.' },
  { id: 'art', label: '冠词', short: 'art.' },
  { id: 'interj', label: '感叹词', short: 'interj.' },
  { id: 'modal', label: '情态动词', short: 'modal v.' },
  { id: 'aux', label: '助动词', short: 'aux.' },
  { id: 'other', label: '其他 / 未标注', short: '' },
]

/** 常用词性：默认直接显示，其余收进「更多词性」。 */
export const PRIMARY_POS: PosId[] = ['n', 'v', 'adj', 'adv', 'pron', 'prep', 'conj', 'num']

const ORDER: Record<PosId, number> = Object.fromEntries(
  POS_GROUPS.map((p, i) => [p.id, i]),
) as Record<PosId, number>

const LABEL: Record<PosId, string> = Object.fromEntries(
  POS_GROUPS.map((p) => [p.id, p.label]),
) as Record<PosId, string>

const SHORT: Record<PosId, string> = Object.fromEntries(
  POS_GROUPS.map((p) => [p.id, p.short]),
) as Record<PosId, string>

/** 归一化后的词性 token → 归类 id（含 vt./vi./abbr. 等常见写法）。 */
const TAG_MAP: Record<string, PosId> = {
  n: 'n',
  noun: 'n',
  pl: 'n',
  v: 'v',
  verb: 'v',
  vt: 'v',
  vi: 'v',
  adj: 'adj',
  adjective: 'adj',
  adv: 'adv',
  adverb: 'adv',
  pron: 'pron',
  pronoun: 'pron',
  prep: 'prep',
  preposition: 'prep',
  conj: 'conj',
  conjunction: 'conj',
  det: 'det',
  determiner: 'det',
  art: 'art',
  article: 'art',
  a: 'art',
  num: 'num',
  number: 'num',
  numeral: 'num',
  int: 'interj',
  interj: 'interj',
  interjection: 'interj',
  exclam: 'interj',
  exclamation: 'interj',
  propernoun: 'n',
  modal: 'modal',
  modalv: 'modal',
  aux: 'aux',
  auxiliary: 'aux',
  auxiliaryv: 'aux',
  abbr: 'other',
  abbrev: 'other',
  symb: 'other',
  symbol: 'other',
  phr: 'other',
  phrase: 'other',
}

const PREFIX_RE = /^\s*([A-Za-z]{1,12})\.\s*/

function normalizeToken(token: string): string {
  return token.toLowerCase().replace(/[\s.·]/g, '')
}

function splitTokens(raw: string): string[] {
  return raw
    .toLowerCase()
    .split(/[,/;，、|&+]/)
    .map(normalizeToken)
    .filter(Boolean)
}

/**
 * 提取一个词的词性标签（可能多个，如 `n./v.`）。
 * 兜底顺序：`pos` 字段 → 中文释义前缀（人教补充词）→ 其他。
 */
export function posTags(word: { pos?: string; meaning?: string }): PosId[] {
  const tags = new Set<PosId>()

  const raw = (word.pos ?? '').trim()
  if (raw) {
    for (const token of splitTokens(raw)) {
      const id = TAG_MAP[token]
      if (id) tags.add(id)
    }
  }

  if (tags.size === 0) {
    const m = PREFIX_RE.exec((word.meaning ?? '').trim())
    if (m) {
      const id = TAG_MAP[normalizeToken(m[1])]
      if (id) tags.add(id)
    }
  }

  if (tags.size === 0) tags.add('other')
  return [...tags].sort((a, b) => ORDER[a] - ORDER[b])
}

/** 是否命中当前词性筛选（空集合 = 不限词性）。 */
export function matchesPos(
  word: { pos?: string; meaning?: string },
  selected: Set<PosId>,
): boolean {
  if (selected.size === 0) return true
  return posTags(word).some((t) => selected.has(t))
}

/** 统计一组词里每种词性的词数（一个词多词性会分别计数）。 */
export function countPos(
  words: { pos?: string; meaning?: string }[],
): Record<PosId, number> {
  const counts = Object.fromEntries(POS_GROUPS.map((p) => [p.id, 0])) as Record<PosId, number>
  for (const w of words) {
    for (const t of posTags(w)) counts[t] += 1
  }
  return counts
}

/** 词性中文名（用于筛选 chip 标题）。 */
export function posLabel(id: PosId): string {
  return LABEL[id] ?? id
}

/** 词性缩写，多个用「/」连接；「其他」返回空串。 */
export function posShort(word: { pos?: string; meaning?: string }): string {
  return posTags(word)
    .map((t) => SHORT[t])
    .filter(Boolean)
    .join(' / ')
}
