import { wordKey, type PoolWord } from './cluster'
import { buildWordIndex, textTokens } from './parse'

/**
 * 词汇用量分析：
 * 「文章用词有多少来自学习者已掌握的词汇」——这是「词越会越多、文章越写越丰富」的度量。
 * 生成时用它判断是否需要带回超纲词清单重试；阅读页用它展示用词覆盖率。
 */

/** 允许不限量使用的功能词/骨架词（不算「超纲实词」）。 */
export const FUNCTION_WORD_LIST =
  'a an the be am is are was were do does did have has had will would can could should and but or so ' +
  'because if when while before after i you he she it we they me him her us them my your his its our their ' +
  'this that these those in on at to for of with from by up down out off over into about not no yes very ' +
  'too also then now here there again all some any one two three four five six seven eight nine ten first ' +
  'next last day today'

export const FUNCTION_WORDS = new Set(FUNCTION_WORD_LIST.split(/\s+/).filter(Boolean))

/** 常见不规则变化 → 原形（故事里过去式密集，缺了会大量误判为「超纲」）。 */
export const IRREGULAR: Record<string, string> = {
  am: 'be', is: 'be', are: 'be', was: 'be', were: 'be', been: 'be', being: 'be',
  went: 'go', gone: 'go', goes: 'go',
  ran: 'run', ate: 'eat', eaten: 'eat', came: 'come', saw: 'see', seen: 'see',
  said: 'say', made: 'make', took: 'take', taken: 'take', got: 'get', gotten: 'get',
  gave: 'give', given: 'give', found: 'find', thought: 'think', told: 'tell',
  became: 'become', left: 'leave', felt: 'feel', brought: 'bring', began: 'begin',
  begun: 'begin', kept: 'keep', held: 'hold', wrote: 'write', written: 'write',
  stood: 'stand', heard: 'hear', let: 'let', meant: 'mean', met: 'meet',
  paid: 'pay', sat: 'sit', spoke: 'speak', spoken: 'speak', spent: 'spend',
  grew: 'grow', grown: 'grow', lost: 'lose', won: 'win', sent: 'send',
  built: 'build', understood: 'understand', drew: 'draw', drawn: 'draw',
  fell: 'fall', fallen: 'fall', cut: 'cut', read: 'read', slept: 'sleep',
  drank: 'drink', drunk: 'drink', swam: 'swim', sang: 'sing', sung: 'sing',
  children: 'child', men: 'man', women: 'woman', feet: 'foot', teeth: 'tooth',
  mice: 'mouse', people: 'person', better: 'good', best: 'good', worse: 'bad',
  worst: 'bad', more: 'many', most: 'many', less: 'little',
}

export interface VocabUsage {
  /** 实词总量（不含功能词） */
  realWords: number
  /** 其中来自已掌握词表 / 本篇重点词的数量 */
  knownWords: number
  /** knownWords / realWords，0-1 */
  ratio: number
  /** 超纲词（按出现频次降序去重） */
  outOfVocab: string[]
}

function normalizeToken(token: string): string {
  const t = token.toLowerCase().replace(/’/g, "'")
  return IRREGULAR[t] ?? t
}

/**
 * 统计正文用词对「已掌握词汇表 + 本篇重点词」的覆盖率。
 * allowedWords 传学习者全部已掌握词即可。
 */
export function vocabUsage(
  vocab: Array<Pick<PoolWord, 'key' | 'word'>>,
  allowedWords: string[],
  text: string,
): VocabUsage {
  const entries: Array<{ key: string; word: string }> = [
    ...allowedWords.filter(Boolean).map((w) => ({ key: wordKey(w), word: w })),
    ...vocab.map((w) => ({ key: w.key, word: w.word })),
  ]
  const index = buildWordIndex(entries)

  let realWords = 0
  let knownWords = 0
  const out = new Map<string, number>()

  for (const node of textTokens(text, new Map())) {
    if (!node.isWord) continue
    const raw = node.text.toLowerCase().replace(/’/g, "'")
    if (FUNCTION_WORDS.has(raw)) continue
    realWords++
    const lemma = IRREGULAR[raw] ?? raw
    if (index.has(raw) || index.has(lemma) || FUNCTION_WORDS.has(lemma)) {
      knownWords++
      continue
    }
    const display = normalizeToken(node.text)
    out.set(display, (out.get(display) ?? 0) + 1)
  }

  return {
    realWords,
    knownWords,
    ratio: realWords ? knownWords / realWords : 1,
    outOfVocab: Array.from(out.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([w]) => w),
  }
}
