#!/usr/bin/env node
/**
 * 手写例句（batch-me-*）质量自检 —— 与 gen-examples.cjs qa 同等规则：
 *   1) 4-gram 被 ≥20 个不同词共用 → 模板句
 *   2) 命中已知模板残片
 *   3) 堆砌空泛形容词（small/kind/warm/…）两个以上
 *   4) 英文句必须包含目标词；中文必须有译文
 */
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const ROOT = path.resolve(__dirname, '..')
const BATCH_DIR = path.join(ROOT, '.cache', 'ex-batches')

const TEMPLATE_MARKERS = ['the kind school', 'with a kind smile', 'start with a kind']
const FILLER = /\b(small|kind|warm|quiet|gentle|fair|nice|lovely|bright|calm)\b/gi
const GRAM_MIN = Number(process.env.QA_GRAM_MIN || 20)

const norm = (s) => String(s || '').toLowerCase().normalize('NFKC').replace(/[^a-z0-9'-]/g, '')
const items = []
for (const file of fs.readdirSync(BATCH_DIR).filter((f) => /^batch-me-.*\.json$/.test(f)).sort()) {
  let data
  try { data = JSON.parse(fs.readFileSync(path.join(BATCH_DIR, file), 'utf8')) } catch (e) { continue }
  for (const it of Array.isArray(data) ? data : (data?.items ?? [])) {
    const word = String(it?.word ?? '').trim()
    for (const e of Array.isArray(it?.examples) ? it.examples : []) {
      if (!word || !e?.en || !e?.zh) continue
      items.push({ file, word, en: String(e.en), zh: String(e.zh) })
    }
  }
}

const grams = new Map()
for (const it of items) {
  const toks = it.en.toLowerCase().replace(/[^a-z ]/g, '').split(/\s+/).filter(Boolean)
  for (let i = 0; i + 4 <= toks.length; i += 1) {
    const g = toks.slice(i, i + 4).join(' ')
    if (!grams.has(g)) grams.set(g, new Set())
    grams.get(g).add(norm(it.word))
  }
}

const problems = []
for (const it of items) {
  const low = it.en.toLowerCase()
  const reasons = []
  if (TEMPLATE_MARKERS.some((m) => low.includes(m))) reasons.push('命中模板残片')
  const toks = low.replace(/[^a-z ]/g, '').split(/\s+/).filter(Boolean)
  for (let i = 0; i + 4 <= toks.length; i += 1) {
    const g = toks.slice(i, i + 4).join(' ')
    if ((grams.get(g)?.size ?? 0) >= GRAM_MIN) { reasons.push(`4-gram共用${grams.get(g).size}词: "${g}"`); break }
  }
  const fillers = low.match(FILLER) ?? []
  if (fillers.length >= 2) reasons.push(`空泛形容词堆砌: ${fillers.join('/')}`)
  // 目标词（含复数/屈折变形）是否出现在句中
  const words = low.replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean)
  const editDist = (a, b) => {
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
    for (let j = 0; j <= b.length; j += 1) dp[0][j] = j
    for (let i = 1; i <= a.length; i += 1) {
      for (let j = 1; j <= b.length; j += 1) {
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      }
    }
    return dp[a.length][b.length]
  }
  const near = (target, token) => {
    const t = norm(target)
    const w = norm(token)
    if (!t || !w) return false
    if (w.includes(t) || t.includes(w)) return true
    if (t.length < 4) return false
    return Math.abs(t.length - w.length) <= 3 && editDist(t, w) <= 3
  }
  const flat = low.replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim()
  const phrase = it.word.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim()
  const hit = it.word.includes(' ')
    ? flat.includes(phrase)
    : words.some((w) => near(it.word, w))
  if (!hit) reasons.push('英文句未含目标词')
  if (!/[一-龥]/.test(it.zh)) reasons.push('中文译文缺失')
  if (it.en.length < 12) reasons.push('英文句过短')
  if (reasons.length) problems.push({ ...it, reasons })
}

console.log(`手写例句总数：${items.length}（${new Set(items.map((i) => norm(i.word))).size} 词）`)
console.log(`问题条目：${problems.length}`)
for (const p of problems) console.log(`  x [${p.file}] ${p.word}: ${p.reasons.join('；')}\n      ${p.en} || ${p.zh}`)

const seen = new Map()
const dupes = []
for (const it of items) {
  const k = norm(it.en)
  if (seen.has(k)) dupes.push(`${it.word} 与 ${seen.get(k)} 重复: ${it.en}`)
  else seen.set(k, it.word)
}
console.log(`\n重复句：${dupes.length}`)
for (const d of dupes) console.log('  x ' + d)
