#!/usr/bin/env node
/**
 * 核心词例句生成器（LLM 批量 + 严格校验 + 断点续传）
 * ==================================================
 * 目标：给「课程词表」里缺少例句的词各补 2 条英文例句 + 中文翻译。
 *
 * 用法（可在项目根目录用 npm 脚本，或直接 node）：
 *   npm run gen:examples:list              # 统计待补词量（不调模型）
 *   npm run gen:examples -- --limit 12     # 先跑一小批试水
 *   npm run gen:examples                   # 全量生成（断点续传，可中断重跑）
 *   npm run gen:examples:emit              # 只把已生成结果写成 TS
 *   npm run gen:examples:report            # 检查覆盖率
 *
 * 配置（二选一）：
 *   1) 环境变量：LLM_BASE_URL / LLM_MODEL / LLM_API_KEY
 *   2) 本地文件：.cache/llm.env（已 gitignore），内容形如
 *        LLM_BASE_URL=https://api.xxx/v1
 *        LLM_MODEL=xxx
 *        LLM_API_KEY=sk-xxx
 *        CONCURRENCY=1
 *        DELAY=2000
 *
 * 产物：
 *   src/data/generated/ecdict-examples.ts   （词 → Example[]）
 *   .cache/examples-store.json              （断点续传用的原始结果）
 *   .cache/examples-missing.txt             （仍未补齐的词清单）
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const GEN = path.join(ROOT, 'src', 'data', 'generated')
const CACHE = path.join(ROOT, '.cache')
const STORE_PATH = path.join(CACHE, 'examples-store.json')
const TARGET_PATH = path.join(CACHE, 'examples-targets.json')
const MISSING_PATH = path.join(CACHE, 'examples-missing.txt')
const OUT_PATH = path.join(GEN, 'ecdict-examples.ts')

/**
 * 读取 .cache/llm.env（KEY=VALUE），避免把 key 写进命令行 / 聊天记录。
 * 已存在的环境变量优先，不被文件覆盖。
 */
function loadEnvFile() {
  const file = path.join(CACHE, 'llm.env')
  if (!fs.existsSync(file)) return
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!m) continue
    const key = m[1]
    const value = m[2].replace(/^["']|["']$/g, '').trim()
    if (!process.env[key]) process.env[key] = value
  }
}
loadEnvFile()

const BASE_URL = (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '')
const MODEL = process.env.LLM_MODEL || ''
const API_KEY = process.env.LLM_API_KEY || ''
const TIMEOUT = Number(process.env.LLM_TIMEOUT || 60000)
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY || 3))
const BATCH = Math.max(1, Number(process.env.BATCH || 12))
const MAX_ATTEMPTS = 3

/** 各等级例句的英文词数上限（保证例句和词卡难度相称） */
const MAX_WORDS = { 'Pre-A1': 7, A1: 9, A2: 12, B1: 15, B2: 18, C1: 22 }

/* ------------------------------- 目标词收集 ------------------------------- */

const norm = (s) => s.toLowerCase().normalize('NFKC').replace(/[^a-z0-9'’-]/g, '')

function read(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
}

/** 解析生成器产出的元组行：[word, level, ipa, pos, meaning, grade, tier] */
function parseTupleFile(file) {
  const text = read(file)
  const out = []
  for (const m of text.matchAll(/^\s*\[("(?:[^"\\]|\\.)*"),\s*("(?:[^"\\]|\\.)*"),\s*("(?:[^"\\]|\\.)*"),\s*("(?:[^"\\]|\\.)*"),\s*("(?:[^"\\]|\\.)*"),\s*("(?:[^"\\]|\\.)*"),\s*("(?:[^"\\]|\\.)*")\],/gm)) {
    try {
      out.push({
        word: JSON.parse(m[1]),
        level: JSON.parse(m[2]),
        ipa: JSON.parse(m[3]),
        pos: JSON.parse(m[4]),
        meaning: JSON.parse(m[5]),
        grade: JSON.parse(m[6]),
        tier: JSON.parse(m[7]),
      })
    } catch { /* 跳过坏行 */ }
  }
  return out
}

function existingExamples() {
  const text = read(OUT_PATH)
  const out = new Map()
  // 形如 "word": [{ en: "...", zh: "..." }],
  const re = /"((?:[^"\\]|\\.)+)"\s*:\s*(\[[^\]]*\])/g
  for (const m of text.matchAll(re)) {
    try {
      const word = JSON.parse(`"${m[1]}"`)
      const list = JSON.parse(m[2].replace(/(\w+)\s*:/g, '"$1":'))
      if (Array.isArray(list) && list.length) out.set(norm(word), list)
    } catch { /* 忽略 */ }
  }
  return out
}

/** PEP 教材里缺例句的专有词 */
function pepGaps() {
  const grades = read(path.join(ROOT, 'src', 'data', 'pepGrades.ts'))
  const cefr = new Set()
  for (const f of ['preA1', 'a1', 'a2', 'b1', 'b2', 'idioms']) {
    for (const m of read(path.join(ROOT, 'src', 'data', `${f}.ts`)).matchAll(/word:\s*['"]([^'"]+)['"]/g)) {
      cefr.add(norm(m[1]))
    }
  }
  const enrich = read(path.join(ROOT, 'src', 'data', 'pepEnrich.ts'))
  const hasExamples = new Set()
  for (const m of enrich.matchAll(/"((?:[^"\\]|\\.)+)"\s*:\s*\{\s*"ipa"\s*:\s*"[^"]*"\s*,\s*"examples"\s*:\s*\[\s*\{/g)) {
    hasExamples.add(norm(m[1]))
  }

  const LEVEL_BY_GRADE = {
    primary: 'Pre-A1', g7: 'A1', g8: 'A2', g9: 'A2', g10: 'B1', g11: 'B1', g12: 'B2',
  }
  const out = []
  const seen = new Set()
  for (const g of ['primary', 'g7', 'g8', 'g9', 'g10', 'g11', 'g12']) {
    const re = new RegExp(`${g}\\s*:\\s*\\[([\\s\\S]*?)\\]\\s*[,}]`)
    const block = grades.match(re)
    if (!block) continue
    for (const m of block[1].matchAll(/"en"\s*:\s*"([^"]+)"\s*,\s*"phonetic"\s*:\s*"([^"]*)"\s*,\s*"zh"\s*:\s*"([^"]*)"/g)) {
      const word = m[1]
      const key = norm(word)
      if (!key || seen.has(key) || cefr.has(key) || hasExamples.has(key)) continue
      seen.add(key)
      out.push({ word, level: LEVEL_BY_GRADE[g] || 'A1', meaning: m[3], grade: g, source: 'pep' })
    }
  }
  return out
}

/** 全部「应当有例句」的核心词（是否已补由 store 判断，便于报告真实覆盖率）。 */
function collectTargets() {
  const targets = []
  const seen = new Set()

  for (const w of parseTupleFile(path.join(GEN, 'ecdict-core.ts'))) {
    if (w.tier !== 'core') continue
    const key = norm(w.word)
    if (!key || seen.has(key)) continue
    seen.add(key)
    targets.push({ word: w.word, level: w.level, meaning: w.meaning, grade: w.grade, source: 'ecdict' })
  }
  for (const w of pepGaps()) {
    const key = norm(w.word)
    if (!key || seen.has(key)) continue
    seen.add(key)
    targets.push(w)
  }
  return targets
}

/* ------------------------------- 校验规则 ------------------------------- */

const IRREGULAR = {
  am: 'be', is: 'be', are: 'be', was: 'be', were: 'be', been: 'be', being: 'be',
  has: 'have', had: 'have', having: 'have', does: 'do', did: 'do', done: 'do', doing: 'do',
  went: 'go', gone: 'go', goes: 'go', said: 'say', made: 'make', took: 'take', taken: 'take',
  came: 'come', saw: 'see', seen: 'see', got: 'get', gotten: 'get', gave: 'give', given: 'give',
  found: 'find', thought: 'think', told: 'tell', became: 'become', left: 'leave', felt: 'feel',
  brought: 'bring', began: 'begin', begun: 'begin', kept: 'keep', held: 'hold', wrote: 'write',
  written: 'write', stood: 'stand', heard: 'hear', let: 'let', meant: 'mean', met: 'meet',
  ran: 'run', paid: 'pay', sat: 'sit', spoke: 'speak', spoken: 'speak', lay: 'lie', led: 'lead',
  grew: 'grow', grown: 'grow', lost: 'lose', fell: 'fall', fallen: 'fall', sent: 'send',
  built: 'build', understood: 'understand', drew: 'draw', drawn: 'draw', broke: 'break',
  broken: 'break', spent: 'spend', cut: 'cut', rose: 'rise', risen: 'rise', drove: 'drive',
  driven: 'drive', bought: 'buy', wore: 'wear', worn: 'wear', chose: 'choose', chosen: 'choose',
  ate: 'eat', eaten: 'eat', fed: 'feed', fought: 'fight', threw: 'throw', thrown: 'throw',
  caught: 'catch', taught: 'teach', sold: 'sell', flew: 'fly', flown: 'fly', forgot: 'forget',
  forgotten: 'forget', hid: 'hide', hidden: 'hide', hung: 'hang', shot: 'shoot', slept: 'sleep',
  swam: 'swim', swum: 'swim', thought2: 'think',
  children: 'child', men: 'man', women: 'woman', feet: 'foot', teeth: 'tooth', mice: 'mouse',
  people: 'person', lives: 'life', knives: 'knife', wives: 'wife', leaves: 'leaf',
}

function variants(word) {
  const w = word.toLowerCase()
  const set = new Set([w])
  const add = (s) => { if (s) set.add(s) }
  add(`${w}s`)
  add(`${w}es`)
  add(`${w}ed`)
  add(`${w}d`)
  if (/e$/.test(w)) add(`${w.slice(0, -1)}ing`)
  add(`${w}ing`)
  if (/[^aeiou]y$/.test(w)) {
    add(`${w.slice(0, -1)}ies`)
    add(`${w.slice(0, -1)}ied`)
  }
  if (/[^aeiou][aeiou][^aeiou]$/.test(w)) {
    add(`${w}${w.slice(-1)}ed`)
    add(`${w}${w.slice(-1)}ing`)
  }
  return set
}

function containsWord(sentence, word) {
  const w = String(word || '').trim().toLowerCase()
  // 多词短语（in fact / a bit …）：规范化后按连续词序列匹配，容忍标点/空格差异
  if (/\s/.test(w)) {
    const needle = w.replace(/[^a-z0-9'’-]+/g, ' ').trim().replace(/\s+/g, ' ')
    const hay = sentence.toLowerCase().replace(/[^a-z0-9'’-]+/g, ' ').replace(/\s+/g, ' ').trim()
    return hay.includes(needle)
  }
  const tokens = (sentence.toLowerCase().match(/[a-z'’-]+/g) || [])
  const alts = variants(word)
  for (const t of tokens) {
    if (alts.has(t)) return true
    if (IRREGULAR[t] === word.toLowerCase()) return true
    if (IRREGULAR[t] && variants(word).has(IRREGULAR[t])) return true
  }
  return false
}

/** 校验一条例句；返回错误原因或 null（通过）。 */
function validateExample(ex, word, level) {
  if (!ex || typeof ex.en !== 'string' || typeof ex.zh !== 'string') return 'missing fields'
  const en = ex.en.trim()
  const zh = ex.zh.trim()
  if (!en || !zh) return 'empty'
  if (en.length > 160) return 'too long'
  if (/[<>{}|`]/.test(en)) return 'contains markup'
  if (/[\u4e00-\u9fff]/.test(en)) return 'chinese in english'
  if (!/[\u4e00-\u9fff]/.test(zh)) return 'no chinese'
  if (!containsWord(en, word)) return `word not found: ${word}`
  const cap = MAX_WORDS[level] || 15
  const count = en.split(/\s+/).filter(Boolean).length
  if (count > cap) return `too many words: ${count}>${cap}`
  if (count < 3) return 'too short'
  return null
}

/* ------------------------------- LLM 调用 ------------------------------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function promptFor(batch) {
  const lines = batch.map((t, i) => `${i + 1}. ${t.word}（${t.level}）— ${t.meaning || '无释义'}`).join('\n')
  return `请为下面每个单词各写 2 条例句，英文 + 准确的中文翻译。

硬性要求：
1. 每条例句必须原样包含该单词（可屈折：复数/时态/比较级），不能换成同义词；
2. 英文句长按等级控制：Pre-A1 ≤7 词，A1 ≤9 词，A2 ≤12 词，B1 ≤15 词，B2 ≤18 词，C1 ≤22 词；
3. 中文翻译自然准确，不得包含英文标签或尖括号；
4. 内容积极、贴近中小学生生活，避免暴力、消极、成人话题；
5. 只输出 JSON，不要任何解释或代码块标记。

【最重要 · 严禁套模板】
不要为了凑句子而堆砌空泛的形容词或固定句式。以下都是**错误示范**，禁止出现：
  ✗ We learned the small abbreviation word quietly today at the kind school.
  ✗ She has a kind smile and a quiet day with a warm start.
  ✗ The new small word is used in a kind story today.
正确做法：句子必须围绕该词**真实的含义和常见搭配**，宁可短、宁可朴素，也不要用与词义无关的修饰。
例如 abdomen（腹部）应该写 "My abdomen hurts after running."，而不是把它塞进"英雄/黎明/温暖"之类的意象里。

输出格式（严格）：
{"items":[{"word":"单词原形","examples":[{"en":"...","zh":"..."},{"en":"...","zh":"..."}]}]}

单词列表：
${lines}`
}

async function callModel(batch) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT)
  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.7,
        max_tokens: Math.min(4000, 200 + batch.length * 160),
        messages: [
          { role: 'system', content: '你是面向中国中小学学习者的英语教材作者，只输出 JSON。' },
          { role: 'user', content: promptFor(batch) },
        ],
      }),
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const data = await res.json()
    const text = data?.choices?.[0]?.message?.content ?? ''
    const json = text.replace(/^```[a-z]*\n?/i, '').replace(/```$/g, '').trim()
    const start = json.indexOf('{')
    const end = json.lastIndexOf('}')
    if (start < 0 || end <= start) throw new Error('no json in response')
    return JSON.parse(json.slice(start, end + 1))
  } finally {
    clearTimeout(timer)
  }
}

/* ------------------------------- 主流程 ------------------------------- */

function loadStore() {
  try {
    return JSON.parse(read(STORE_PATH) || '{}')
  } catch {
    return {}
  }
}

function saveStore(store) {
  fs.mkdirSync(CACHE, { recursive: true })
  fs.writeFileSync(STORE_PATH, JSON.stringify(store), 'utf8')
}

function writeOutput(store) {
  const keys = Object.keys(store).sort()
  const body = keys.map((k) => {
    const list = store[k].slice(0, 3)
    const ex = list.map((e) => `{ en: ${JSON.stringify(e.en)}, zh: ${JSON.stringify(e.zh)} }`).join(', ')
    return `  ${JSON.stringify(k)}: [${ex}],`
  }).join('\n')
  const content = `// AUTO-GENERATED by scripts/gen-examples.cjs — 请勿手工编辑。\n` +
    `// 覆盖 ${keys.length} 个核心词的例句（每词 1-3 条）\n` +
    `import type { Example } from '../types'\n\n` +
    `export const ECDICT_EXAMPLES: Record<string, Example[]> = {\n${body}\n}\n`
  fs.writeFileSync(OUT_PATH, content, 'utf8')
}

async function runPool(tasks, worker) {
  let cursor = 0
  const runners = Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, async () => {
    while (cursor < tasks.length) {
      const i = cursor
      cursor += 1
      await worker(tasks[i], i)
    }
  })
  await Promise.all(runners)
}

async function cmdList() {
  const targets = collectTargets()
  fs.mkdirSync(CACHE, { recursive: true })
  fs.writeFileSync(TARGET_PATH, JSON.stringify(targets, null, 2), 'utf8')
  const byLevel = {}
  const bySource = {}
  for (const t of targets) {
    byLevel[t.level] = (byLevel[t.level] || 0) + 1
    bySource[t.source] = (bySource[t.source] || 0) + 1
  }
  console.log(`待补例句的词：${targets.length}`)
  console.log(`  按等级：${JSON.stringify(byLevel)}`)
  console.log(`  按来源：${JSON.stringify(bySource)}`)
  console.log(`  批次：约 ${Math.ceil(targets.length / BATCH)} 批（每批 ${BATCH}，并发 ${CONCURRENCY}）`)
  console.log(`  清单：${path.relative(ROOT, TARGET_PATH)}`)
}

async function cmdReport() {
  const targets = collectTargets()
  const store = loadStore()
  let ok = 0
  const missing = []
  for (const t of targets) {
    const list = store[norm(t.word)]
    if (Array.isArray(list) && list.length && list.every((e) => !validateExample(e, t.word, t.level))) ok += 1
    else missing.push(t)
  }
  console.log(`目标 ${targets.length} 词：已合格 ${ok} · 待补 ${missing.length}（覆盖率 ${((ok / Math.max(1, targets.length)) * 100).toFixed(1)}%）`)
  if (missing.length) {
    const byLevel = {}
    for (const t of missing) byLevel[t.level] = (byLevel[t.level] || 0) + 1
    console.log(`  待补分布：${JSON.stringify(byLevel)}`)
  }
}

/* -------------------------- 给「外部模型/Agent」用的两个命令 -------------------------- */

const BATCH_DIR = path.join(CACHE, 'ex-batches')

/** 出题：打印下一批待补词（含可直接投喂给模型的提示词），由外部模型生成后写回 JSON。 */
async function cmdNext(count) {
  const targets = collectTargets()
  const store = loadStore()
  const pending = targets.filter((t) => isPending(store, t))
  if (!pending.length) {
    console.log('✓ 没有待补的词了，运行 npm run gen:examples:merge 然后 report。')
    return
  }
  const take = pending.slice(0, count || BATCH)
  fs.mkdirSync(BATCH_DIR, { recursive: true })

  const wordsJson = JSON.stringify(take.map((t) => ({ word: t.word, level: t.level, meaning: t.meaning })), null, 2)
  console.log(`剩余待补 ${pending.length} 词，本批 ${take.length} 词。`)
  console.log('')
  console.log('=== 给模型的提示词 ===')
  console.log(promptFor(take))
  console.log('')
  console.log('=== 本批词表（JSON，与上面的提示词内容一致）===')
  console.log(wordsJson)
  console.log('')
  console.log('=== 输出要求 ===')
  console.log('把模型返回的 JSON 原样保存到：')
  console.log(`  .cache/ex-batches/batch-${Date.now()}.json`)
  console.log('格式：{"items":[{"word":"原形","examples":[{"en":"...","zh":"..."},{"en":"...","zh":"..."}]}]}')
  console.log('保存后运行：npm run gen:examples:merge')
}

/** 读取 .cache/ex-batches/*.json，严格校验后合并进 store 并写出 TS。 */
async function cmdMerge() {
  fs.mkdirSync(BATCH_DIR, { recursive: true })
  const files = fs.readdirSync(BATCH_DIR).filter((f) => f.endsWith('.json'))
  if (!files.length) {
    console.log(`没有批次文件。请把模型输出保存到 ${path.relative(ROOT, BATCH_DIR)}/batch-*.json`)
    return
  }

  const store = loadStore()
  const targets = collectTargets()
  const byWord = new Map(targets.map((t) => [norm(t.word), t]))
  let added = 0
  let rejected = 0
  const rejects = []

  const pickExamples = (raw, word, level) => {
    const list = Array.isArray(raw) ? raw : raw?.examples
    if (!Array.isArray(list)) return []
    return list
      .map((e) => ({
        en: String(e?.en ?? e?.english ?? '').trim(),
        zh: String(e?.zh ?? e?.cn ?? e?.chinese ?? '').trim(),
      }))
      // 模板句直接判废（防止新批次又把废句写回来）
      .filter((e) => !TEMPLATE_MARKERS.some((m) => e.en.toLowerCase().includes(m)))
      .filter((e) => !validateExample(e, word, level))
  }

  for (const file of files) {
    let data
    try {
      data = JSON.parse(read(path.join(BATCH_DIR, file)))
    } catch {
      console.warn(`  跳过无法解析的文件：${file}`)
      continue
    }
    const items = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : null)
    if (items) {
      for (const it of items) {
        const word = String(it?.word ?? '').trim()
        const t = byWord.get(norm(word))
        if (!t) { rejected += 1; rejects.push(`${word}\t不在目标词表`); continue }
        const good = pickExamples(it, t.word, t.level)
        if (good.length) {
          // 已有 ≥2 条合格例句时不覆盖（历史批次反复重跑不应把好例句降级）
          const cur = store[norm(t.word)]
          if (!Array.isArray(cur) || cur.length < 2) store[norm(t.word)] = good.slice(0, 2)
          added += 1
        } else { rejected += 1; rejects.push(`${t.word}\t校验未通过`) }
      }
    } else if (data && typeof data === 'object') {
      // 兼容 { word: [ {en, zh} ] } 形式
      for (const [word, val] of Object.entries(data)) {
        const t = byWord.get(norm(word))
        if (!t) { rejected += 1; rejects.push(`${word}\t不在目标词表`); continue }
        const good = pickExamples(val, t.word, t.level)
        if (good.length) {
          const cur = store[norm(t.word)]
          if (!Array.isArray(cur) || cur.length < 2) store[norm(t.word)] = good.slice(0, 2)
          added += 1
        } else { rejected += 1; rejects.push(`${t.word}\t校验未通过`) }
      }
    }
  }

  saveStore(store)
  writeOutput(store)

  const left = targets.filter((t) => isPending(store, t))
  fs.mkdirSync(CACHE, { recursive: true })
  fs.writeFileSync(MISSING_PATH, left.map((t) => `${t.word}\t${t.level}\t${t.meaning}`).join('\n'), 'utf8')

  console.log(`✓ 合并完成：新增/更新 ${added} 词，拒绝 ${rejected} 条`)
  console.log(`  累计覆盖 ${targets.length - left.length} / ${targets.length}；仍缺 ${left.length} 词`)
  if (rejects.length) {
    console.log('  被拒记录（前 10 条）：')
    rejects.slice(0, 10).forEach((r) => console.log(`    ${r}`))
    fs.writeFileSync(path.join(CACHE, 'examples-rejected.txt'), rejects.join('\n'), 'utf8')
  }
  console.log(`  产物：${path.relative(ROOT, OUT_PATH)}`)
}

/* ------------------------------ 质量闸门 ------------------------------ */

/** 已知的模板残片：命中直接判废（跨词重复检测之外的兜底） */
const TEMPLATE_MARKERS = [
  'the kind school',
  'with a kind smile',
  'start with a kind',
  'abbreviation word',
  'word quietly today',
  'the quiet day with',
  'the small abbreviation',
  // 第二批观察到的同族变体（"善良的老师/温暖的开始/安静的一天"）
  'kind word',
  'warm start',
  'quiet day',
  'gentle hero',
  'kind start',
  'kind smile',
  'kind heart',
  'small family',
  'old story',
  'small story',
]

/** 4-gram 被多少个不同词共用；超过该值视为模板 */
const GRAM_MIN = Number(process.env.QA_GRAM_MIN || 20)

/** 清洗套模板的例句：整词都废则删除该词（下次 next 会重新出题）。 */
async function cmdQa() {
  const store = loadStore()
  const words = Object.keys(store)
  if (!words.length) {
    console.log('store 为空。')
    return
  }

  // 统计所有例句的 4-gram → 使用它的词集合
  const grams = new Map()
  const pieces = []
  for (const w of words) {
    for (const e of store[w]) {
      const toks = String(e.en || '').toLowerCase().replace(/[^a-z ]/g, '').split(/\s+/).filter(Boolean)
      for (let i = 0; i + 4 <= toks.length; i += 1) {
        const g = toks.slice(i, i + 4).join(' ')
        if (!grams.has(g)) grams.set(g, new Set())
        grams.get(g).add(w)
      }
      pieces.push({ w, en: String(e.en || '').toLowerCase() })
    }
  }
  const badGrams = new Set()
  for (const [g, set] of grams) if (set.size >= GRAM_MIN) badGrams.add(g)

  /**
   * 模板判废：
   *   1) 命中已知模板残片
   *   2) 4-gram 被大量词共用
   *   3) 堆砌空泛形容词（small/kind/warm/quiet/gentle…）——两个以上，或与所有格同现
   */
  const FILLER = /\b(small|kind|warm|quiet|gentle|fair|nice|lovely|bright|calm)\b/gi
  const isTemplate = (en) => {
    const low = String(en || '').toLowerCase()
    if (TEMPLATE_MARKERS.some((m) => low.includes(m))) return true
    const toks = low.replace(/[^a-z ]/g, '').split(/\s+/).filter(Boolean)
    for (let i = 0; i + 4 <= toks.length; i += 1) {
      if (badGrams.has(toks.slice(i, i + 4).join(' '))) return true
    }
    const fillers = (low.match(FILLER) || []).length
    if (fillers >= 2) return true
    if (fillers >= 1 && /'s\b/.test(low)) return true
    return false
  }

  let removedSentences = 0
  let removedWords = 0
  const removedWordList = []
  for (const w of words) {
    const keep = store[w].filter((e) => !isTemplate(e.en))
    removedSentences += store[w].length - keep.length
    if (keep.length) store[w] = keep
    else {
      delete store[w]
      removedWords += 1
      removedWordList.push(w)
    }
  }

  saveStore(store)
  writeOutput(store)
  fs.mkdirSync(CACHE, { recursive: true })
  fs.writeFileSync(path.join(CACHE, 'examples-removed.txt'), removedWordList.sort().join('\n'), 'utf8')

  console.log(`✓ 质量清洗：删除 ${removedSentences} 条例句，其中 ${removedWords} 个词整体作废`)
  console.log(`  剩余 ${Object.keys(store).length} 词`)
  console.log(`  作废清单：${path.relative(ROOT, path.join(CACHE, 'examples-removed.txt'))}`)
  console.log('  下一步：npm run gen:examples:next 会把这些词重新出题')
}

/** 只把 store 落盘成 TS（不调模型）：中断后可用它先产出可用数据。 */
async function cmdEmit() {
  const store = loadStore()
  const count = Object.keys(store).length
  if (!count) {
    console.log('store 为空，先运行 run。')
    return
  }
  writeOutput(store)
  console.log(`✓ 已从 store 写入 ${count} 词 → ${path.relative(ROOT, OUT_PATH)}`)
}

const DELAY = Math.max(0, Number(process.env.DELAY || 1500))

const isPending = (store, t) => {
  const list = store[norm(t.word)]
  return !(Array.isArray(list) && list.length && list.every((e) => !validateExample(e, t.word, t.level)))
}

/** 调一批并写回 store；返回本批新增词数。429 会指数退避重试。 */
async function processBatch(batch, store) {
  const pending = batch.filter((t) => isPending(store, t))
  if (!pending.length) return 0

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const data = await callModel(pending)
      const items = Array.isArray(data?.items) ? data.items : []
      let added = 0
      for (const t of pending) {
        const hit = items.find((it) => norm(String(it?.word || '')) === norm(t.word))
        if (!hit || !Array.isArray(hit.examples)) continue
        const good = hit.examples
          .map((e) => ({ en: String(e?.en || '').trim(), zh: String(e?.zh || '').trim() }))
          .filter((e) => !validateExample(e, t.word, t.level))
        if (good.length && isPending(store, t)) {
          store[norm(t.word)] = good.slice(0, 2)
          added += 1
        }
      }
      return added
    } catch (err) {
      const msg = String(err.message || '')
      const rateLimited = msg.includes('429')
      if (attempt === 4) {
        console.warn(`  批次失败（${batch.map((b) => b.word).join(', ').slice(0, 50)}…）：${msg.slice(0, 80)}`)
        return 0
      }
      // 限流退避更长：5s → 15s → 45s
      await sleep(rateLimited ? 5000 * Math.pow(3, attempt - 1) : 800 * attempt)
    }
  }
  return 0
}

async function cmdRun(limit) {
  if (!MODEL || !API_KEY) {
    console.error('缺少 LLM_MODEL / LLM_API_KEY 环境变量，无法调用模型。')
    process.exit(1)
  }
  // --limit 只跑前 N 个词（试跑用），补漏轮次同样只在这个范围内进行
  let scope = collectTargets()
  if (limit > 0) scope = scope.slice(0, limit)
  if (!scope.length) {
    console.log('没有待补的词。')
    return
  }

  const store = loadStore()
  let saved = 0
  let done = 0

  for (let pass = 0; pass < 3; pass += 1) {
    const pending = scope.filter((t) => isPending(store, t))
    if (!pending.length) break
    if (pass > 0) console.log(`补漏第 ${pass} 轮：剩余 ${pending.length} 词`)
    else console.log(`开始生成：${pending.length} 词 / 约 ${Math.ceil(pending.length / BATCH)} 批（模型 ${MODEL}）`)

    const batches = []
    for (let i = 0; i < pending.length; i += BATCH) batches.push(pending.slice(i, i + BATCH))

    await runPool(batches, async (batch) => {
      const added = await processBatch(batch, store)
      saved += added
      done += batch.length
      saveStore(store)
      if (done % (BATCH * 5) === 0 || done >= pending.length) {
        console.log(`  进度 ${Math.min(done, pending.length)}/${pending.length} · 累计 ${saved} 词`)
      }
      if (DELAY > 0) await sleep(DELAY)
    })
  }

  writeOutput(store)

  const left = scope.filter((t) => isPending(store, t))
  fs.mkdirSync(CACHE, { recursive: true })
  fs.writeFileSync(MISSING_PATH, left.map((t) => `${t.word}\t${t.level}\t${t.meaning}`).join('\n'), 'utf8')

  console.log(`\n✓ 完成：本次新增 ${saved} 词；范围内未补齐 ${left.length} 词`)
  console.log(`  产物：${path.relative(ROOT, OUT_PATH)}`)
  console.log(`  未补齐清单：${path.relative(ROOT, MISSING_PATH)}`)
}

const [, , cmd = 'list', ...rest] = process.argv
const limitArg = rest.indexOf('--limit')
const limit = limitArg >= 0 ? Number(rest[limitArg + 1]) : 0
/** next 的批大小：`next 40` 或 `next --limit 40` */
const nextCount = Number(rest.find((x) => /^\d+$/.test(x)) || limit || 0)

;(async () => {
  if (cmd === 'list') await cmdList()
  else if (cmd === 'report') await cmdReport()
  else if (cmd === 'emit') await cmdEmit()
  else if (cmd === 'next') await cmdNext(nextCount)
  else if (cmd === 'merge') await cmdMerge()
  else if (cmd === 'qa') await cmdQa()
  else if (cmd === 'run') await cmdRun(limit)
  else {
    console.log('用法：node tools/gen-examples.cjs [list|next N|merge|run|emit|report]')
  }
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
