/**
 * 场景归类覆盖率报告（只读，不修改任何数据）
 *   npx tsx tools/report-scenes.ts [core|extra]
 */
import { readFileSync } from 'node:fs'
import { guessScene } from '../src/data/sceneRules'

const target = process.argv[2] === 'extra' ? 'extra' : 'core'
const file = `src/data/generated/ecdict-${target}.ts`
const text = readFileSync(file, 'utf8')

type Row = { word: string; level: string; pos: string; meaning: string }
const rows: Row[] = []
for (const m of text.matchAll(/^\s*\[("(?:[^"\\]|\\.)*"),\s*("(?:[^"\\]|\\.)*"),\s*("(?:[^"\\]|\\.)*"),\s*("(?:[^"\\]|\\.)*"),\s*("(?:[^"\\]|\\.)*"),\s*("(?:[^"\\]|\\.)*"),\s*("(?:[^"\\]|\\.)*")\],/gm)) {
  try {
    rows.push({
      word: JSON.parse(m[1]),
      level: JSON.parse(m[2]),
      pos: JSON.parse(m[4]),
      meaning: JSON.parse(m[5]),
    })
  } catch { /* 跳过坏行 */ }
}

const counts = new Map<string, number>()
const unknown: Row[] = []
for (const r of rows) {
  const c = guessScene(r.meaning, r.pos)
  if (!c) {
    unknown.push(r)
    counts.set('（兜底 thinking）', (counts.get('（兜底 thinking）') ?? 0) + 1)
  } else {
    counts.set(c, (counts.get(c) ?? 0) + 1)
  }
}

const total = rows.length || 1
console.log(`文件：${file}  共 ${rows.length} 词\n`)
const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
for (const [cat, n] of sorted) {
  console.log(`  ${cat.padEnd(16)} ${String(n).padStart(6)}  ${((n / total) * 100).toFixed(1)}%`)
}
console.log(`\n未命中关键词（回退 thinking）：${unknown.length} 词 (${((unknown.length / total) * 100).toFixed(1)}%)`)
console.log('样例（前 30）：')
for (const r of unknown.slice(0, 30)) {
  console.log(`  ${r.word} [${r.level}] ${r.meaning.slice(0, 40)}`)
}
