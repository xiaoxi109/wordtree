/**
 * 校验自然拼读模块的内容与发音是否准确（离线跑，不进 App）。
 *
 *   npx tsx tools/verify-phonics.ts
 *
 * 校验五件事：
 *   A.  音标表的例词里，是不是真的有这个音（用 espeak en-us 的真实音素判断）；
 *   A2. 例词的拼写提示（hi）是不是真的出现在这个词里；
 *   B.  拼读规则的例词里，是不是真的有这组字母、这个音；
 *   C.  生成的音标音频，文件是否齐全、有没有文件名冲突；
 *   D.  每条音频的波形体检：时长、峰值（防止出现静音或爆音的废文件）；
 *   E.  规则里手写的音标标注 vs espeak 实际音素（只提示，供人工复核）。
 *
 * 「标准答案」来自打包好的 piper_phonemize（espeak-ng en-us），
 * 与 App 里 Piper en_US/lessac 用的是同一套音素，因此这里的判断与实际听感一致。
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PHONEMES } from '../src/data/phonics/ipa'
import { PHONICS_RULES } from '../src/data/phonics/rules'
import { collectClipTokens, ipaClipSlug, ipaTokensIn } from '../src/data/phonics/clips'
import { phonemizeSymbols, normalizeIpa } from './phonemize'

/** 音标 id → espeak 音素符号序列（用于在单词音素里查找） */
function expectedSequence(id: string): string[] {
  const map: Record<string, string[]> = {
    'iː': ['i', 'ː'],
    'ɪ': ['ɪ'],
    'ɛ': ['ɛ'],
    'æ': ['æ'],
    'ɑː': ['ɑ', 'ː'],
    'ɔː': ['ɔ', 'ː'],
    'ʊ': ['ʊ'],
    'uː': ['u', 'ː'],
    'ʌ': ['ʌ'],
    'ɜː': ['ɜ', 'ː'],
    'ə': ['ə'],
    'eɪ': ['e', 'ɪ'],
    'aɪ': ['a', 'ɪ'],
    'ɔɪ': ['ɔ', 'ɪ'],
    'aʊ': ['a', 'ʊ'],
    'oʊ': ['o', 'ʊ'],
    'ɪr': ['ɪ', 'r'],
    'ɛr': ['ɛ', 'r'],
    'ʊr': ['ʊ', 'r'],
    'tʃ': ['t', 'ʃ'],
    'dʒ': ['d', 'ʒ'],
    tr: ['t', 'r'],
    dr: ['d', 'r'],
    ts: ['t', 's'],
    dz: ['d', 'z'],
  }
  return map[id] ?? Array.from(id)
}

type Match = 'exact' | 'soft' | 'no'

/** 单词音素串里是否包含目标音；长度符可有可无（espeak 有时不标长音） */
function matchPhoneme(haystack: string, id: string): Match {
  if (!haystack) return 'no'
  const hay = normalizeIpa(haystack)
  const needle = expectedSequence(id)
  if (hay.includes(needle.join(''))) return 'exact'
  const hayNoLen = hay.replace(/ː/g, '')
  const needleNoLen = needle.filter((c) => c !== 'ː').join('')
  if (needleNoLen && hayNoLen.includes(needleNoLen)) return 'soft'
  return 'no'
}

/**
 * 从规则的 grapheme 里取出候选字母组合：
 *   'ai / ay'      → ['ai', 'ay']
 *   '-at -an'      → ['at', 'an']
 *   'a_e'          → ['a_e']（带通配，顺序匹配）
 *   'th（清）'     → ['th']
 *   '开音节（元音结尾）' → []（纯中文，交给例词自带的 hi 兜底）
 */
function graphemeCandidates(raw: string): string[] {
  const out: string[] = []
  for (const chunk of raw.split('/')) {
    for (const m of chunk.match(/[a-z_]+/gi) ?? []) {
      const g = m.toLowerCase()
      if (!out.includes(g)) out.push(g)
    }
  }
  return out
}

/** 字母组合是否出现在单词里；带 '_' 的按顺序通配匹配（a_e → a…e） */
function graphemeMatches(candidates: string[], word: string): boolean {
  return candidates.some((g) => {
    if (!g) return false
    if (!g.includes('_')) return word.includes(g)
    const parts = g.split('_').filter(Boolean)
    let at = 0
    for (const p of parts) {
      const idx = word.indexOf(p, at)
      if (idx < 0) return false
      at = idx + p.length
    }
    return true
  })
}

/** 读取 16bit PCM wav 的时长与峰值 */
function inspectWav(file: string): { seconds: number; peak: number } | null {
  const buf = readFileSync(file)
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF') return null
  let offset = 12
  let rate = 22050
  let bits = 16
  let dataStart = -1
  let dataLen = 0
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4)
    const size = buf.readUInt32LE(offset + 4)
    if (id === 'fmt ') {
      // fmt 块数据从 offset+8 开始：audioFormat(2) channels(2) sampleRate(4)
      rate = buf.readUInt32LE(offset + 12)
      bits = buf.readUInt16LE(offset + 22)
    } else if (id === 'data') {
      dataStart = offset + 8
      dataLen = Math.min(size, buf.length - dataStart)
      break
    }
    offset += 8 + size + (size % 2)
  }
  if (dataStart < 0 || bits !== 16) return null
  let peak = 0
  for (let i = dataStart; i + 1 < dataStart + dataLen; i += 2) {
    const v = Math.abs(buf.readInt16LE(i)) / 32768
    if (v > peak) peak = v
  }
  return { seconds: dataLen / 2 / rate, peak }
}

async function main() {
  // 1) 收集所有例词，只音素化一次
  const words = new Set<string>()
  for (const p of PHONEMES) for (const ex of p.examples) words.add(ex.w.toLowerCase())
  for (const r of PHONICS_RULES) for (const ex of r.examples) words.add(ex.w.toLowerCase())

  const actual = new Map<string, string>()
  let i = 0
  for (const w of words) {
    try {
      actual.set(w, normalizeIpa(await phonemizeSymbols(w)))
    } catch (e) {
      console.error(`音素化失败 ${w}:`, (e as Error).message)
    }
    i += 1
    if (i % 50 === 0) console.log(`  音素化 ${i}/${words.size}`)
  }
  console.log(`已音素化 ${actual.size} 个例词\n`)

  let errors = 0
  let warnings = 0

  // ---- A. 音标表：例词是否真的含这个音 ----
  console.log('=== A. 音标表例词是否真含该音 ===')
  for (const p of PHONEMES) {
    for (const ex of p.examples) {
      const word = ex.w.toLowerCase()
      const ph = actual.get(word) ?? ''
      const m = matchPhoneme(ph, p.id)
      if (m === 'no') {
        errors += 1
        console.log(`  ✗ /${p.id}/ 例词 ${ex.w} 不含该音（实际 ${ph || '?'}）`)
      } else if (m === 'soft') {
        warnings += 1
        console.log(`  ? /${p.id}/ 例词 ${ex.w} 只在忽略长度符时匹配（实际 ${ph}）`)
      }
    }
  }
  console.log(errors ? `  见上方 ✗ 条目` : '  ✓ 全部通过')

  // ---- A2. 例词的拼写提示是否出现在词里 ----
  console.log('\n=== A2. 例词拼写提示（hi）核对 ===')
  let a2Bad = 0
  for (const p of PHONEMES) {
    for (const ex of p.examples) {
      if (!ex.hi) continue
      const word = ex.w.toLowerCase()
      if (!word.includes(ex.hi.toLowerCase())) {
        a2Bad += 1
        errors += 1
        console.log(`  ✗ /${p.id}/ 例词 ${ex.w} 的拼写提示「${ex.hi}」不在词里`)
      }
      // 拼写提示要么正好在拼写列表里，要么是某个 magic-e 写法的前缀（a_e 覆盖 a）
      const hi = ex.hi.toLowerCase()
      const known = p.spellings.some((s) => s === hi || s.startsWith(hi))
      if (!known) {
        warnings += 1
        console.log(`  ? /${p.id}/ 例词 ${ex.w} 的提示「${ex.hi}」不在该音的拼写列表里`)
      }
    }
  }
  console.log(a2Bad ? `  共 ${a2Bad} 处异常` : '  ✓ 全部通过')

  // ---- B. 拼读规则：例词是否含这组字母与这个音 ----
  console.log('\n=== B. 拼读规则例词核对 ===')
  let bBad = 0
  for (const r of PHONICS_RULES) {
    const candidates = graphemeCandidates(r.grapheme)
    const tokens = ipaTokensIn(r.sound).map((t) => t.replace(/^\/|\/$/g, ''))
    const allowsSilent = r.sound.includes('不发音')

    for (const ex of r.examples) {
      const word = ex.w.toLowerCase()
      const ph = actual.get(word) ?? ''

      // 字母组合：规则里没有 ASCII 时，用例词自带的 hi 兜底
      const letterCands = candidates.length ? candidates : graphemeCandidates(ex.hi ?? '')
      if (letterCands.length && !graphemeMatches(letterCands, word)) {
        bBad += 1
        errors += 1
        console.log(
          `  ✗ 规则 ${r.id}「${r.grapheme}」例词 ${ex.w} 里找不到这组字母` +
            `（候选 ${letterCands.join('|')}）`,
        )
      }

      if (!tokens.length || allowsSilent) continue
      const hit = tokens.some((t) => matchPhoneme(ph, t) !== 'no')
      if (!hit) {
        bBad += 1
        errors += 1
        console.log(
          `  ✗ 规则 ${r.id}「${r.grapheme} → ${r.sound}」例词 ${ex.w} 的实际音是 ${ph}`,
        )
      }
    }
    if (allowsSilent && tokens.length) {
      console.log(`  - 规则 ${r.id} 允许「不发音」，只核对字母：${r.sound}`)
    }
  }
  console.log(bBad ? `  共 ${bBad} 处异常` : '  ✓ 全部通过')

  // ---- C. 音频文件是否齐全 ----
  console.log('\n=== C. 音标音频文件校验 ===')
  const tokens = collectClipTokens(
    PHONEMES.map((p) => p.id),
    PHONICS_RULES.map((r) => r.sound),
  )
  let cBad = 0
  for (const token of tokens) {
    const file = resolve('public/audio/ipa', `${ipaClipSlug(token)}.wav`)
    if (!existsSync(file)) {
      cBad += 1
      errors += 1
      console.log(`  ✗ 缺音频：${token} → ${file}`)
    }
  }
  const dup = new Map<string, string>()
  for (const token of tokens) {
    const slug = ipaClipSlug(token)
    const prev = dup.get(slug)
    if (prev) {
      cBad += 1
      errors += 1
      console.log(`  ✗ 文件名冲突：${prev} 与 ${token} 都是 ${slug}`)
    }
    dup.set(slug, token)
  }
  console.log(cBad ? `  共 ${cBad} 处异常（应生成 ${tokens.length} 条）` : `  ✓ ${tokens.length} 条音频齐全`)

  // ---- D. 音频波形体检 ----
  console.log('\n=== D. 音频波形体检 ===')
  let dBad = 0
  for (const token of tokens) {
    const file = resolve('public/audio/ipa', `${ipaClipSlug(token)}.wav`)
    if (!existsSync(file)) continue
    const info = inspectWav(file)
    if (!info) {
      dBad += 1
      errors += 1
      console.log(`  ✗ ${token} 不是可解析的 16bit PCM wav`)
      continue
    }
    if (info.seconds < 0.08) {
      dBad += 1
      errors += 1
      console.log(`  ✗ ${token} 时长只有 ${info.seconds.toFixed(2)}s，几乎没有声音`)
    }
    if (info.peak < 0.05) {
      dBad += 1
      errors += 1
      console.log(`  ✗ ${token} 峰值只有 ${info.peak.toFixed(3)}，基本是静音`)
    }
  }
  console.log(dBad ? `  共 ${dBad} 处异常` : '  ✓ 全部音频有声且长度正常')

  // ---- E. 手写音标标注 vs 实际发音（提示） ----
  console.log('\n=== E. 手写音标标注 vs espeak 实际（提示） ===')
  let eBad = 0
  const annotated: { from: string; ex: { w: string; ipa?: string } }[] = []
  for (const p of PHONEMES) for (const ex of p.examples) annotated.push({ from: `音标表 /${p.id}/`, ex })
  for (const r of PHONICS_RULES) for (const ex of r.examples) annotated.push({ from: `规则 ${r.id}`, ex })
  for (const { from, ex } of annotated) {
    if (!ex.ipa) continue
    const word = ex.w.toLowerCase()
    const ph = actual.get(word) ?? ''
    const given = normalizeIpa(ex.ipa.replace(/^\/|\/$/g, ''))
    if (!ph) continue
    if (given.replace(/ː/g, '') === ph.replace(/ː/g, '')) continue
    eBad += 1
    warnings += 1
    console.log(`  ? ${from} 例词 ${ex.w}：标注 ${ex.ipa}，实际 /${ph}/`)
  }
  console.log(eBad ? `  共 ${eBad} 处提示（多为标点/重音/长度写法差异）` : '  ✓ 全部一致')

  console.log('\n=== 汇总 ===')
  console.log(
    `音标 ${PHONEMES.length} 个，规则 ${PHONICS_RULES.length} 条，音频 ${tokens.length} 条，` +
      `错误 ${errors} 处，提示 ${warnings} 处`,
  )
  if (errors) process.exitCode = 1
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
