/**
 * 生成所有拼读例词的美式音标（en_US/lessac 实际发音），一次性落盘为静态表。
 *
 *   npx tsx tools/gen-american-ipa.ts
 *
 * 原理：直接调用打包好的 piper_phonemize（espeak-ng en-us），拿到每个例词的
 * 音素序列，再按模型 phoneme_id_map 反查成 IPA 符号，归一化后写成
 * src/data/phonics/americanIpa.ts。这样例词显示的音标与点读发音严格一致，
 * 也与统一后的美式音标表（/ɛ/ /oʊ/ /ɪr/ …）对得上。
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PHONEMES } from '../src/data/phonics/ipa'
import { PHONICS_RULES } from '../src/data/phonics/rules'
import { phonemizeAmerican } from './phonemize'

async function main() {
  const words = new Set<string>()
  for (const p of PHONEMES) for (const ex of p.examples) words.add(ex.w.toLowerCase())
  for (const r of PHONICS_RULES) for (const ex of r.examples) words.add(ex.w.toLowerCase())

  const list = Array.from(words).sort()
  console.log(`待音素化 ${list.length} 个例词…`)

  const map: Record<string, string> = {}
  for (let i = 0; i < list.length; i += 1) {
    const w = list[i]
    try {
      const ipa = await phonemizeAmerican(w)
      map[w] = ipa ? `/${ipa}/` : ''
    } catch (e) {
      console.error(`跳过 ${w}:`, (e as Error).message)
    }
    if ((i + 1) % 40 === 0) console.log(`  ${i + 1}/${list.length}`)
  }

  const body = Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([w, ipa]) => `  ${JSON.stringify(w)}: ${JSON.stringify(ipa)},`)
    .join('\n')

  const out = resolve('src/data/phonics/americanIpa.ts')
  writeFileSync(
    out,
    `/**\n * 拼读例词的美式音标（由 en_US/lessac 实际发音反查，工具生成）。\n * 重新生成：npx tsx tools/gen-american-ipa.ts\n */\nexport const AMERICAN_IPA: Record<string, string> = {\n${body}\n}\n`,
  )
  console.log(`\n完成：${Object.keys(map).length} 条 → ${out}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
