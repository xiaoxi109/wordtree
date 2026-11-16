#!/usr/bin/env node
/**
 * ECDICT → 项目词库生成器
 * ========================
 * 输入：.cache/ecdict.csv（ECDICT，MIT License，Copyright © 2025 Linwei）
 *       下载：https://github.com/skywind3000/ECDICT
 * 输出：src/data/generated/ecdict-*.ts（按等级分文件）+ ecdict.ts（聚合入口）+ 报告
 *
 * 用法：
 *   npm run gen:lexicon                 # 默认读取 .cache/ecdict.csv
 *   npm run gen:lexicon -- "E:\path\ecdict.csv"
 *   MAX_FRQ=30000 MAX_BNC=30000 npm run gen:lexicon
 *
 * 清洗规则（目标是「常用 3 万词」，拒绝大而杂）：
 *   1. 只保留单个英文词：无空格、无数字、无标点（连字符/撇号除外）
 *   2. 剔除屈折变体：exchange 里含 `0:` 说明它是某个原形的变形（was/got/did 等）
 *   3. 剔除专有名词：首字母大写且不是 I / 星期 / 月份，也不在牛津核心词表里
 *   4. 频次门槛：牛津核心词 OR 考纲标签（zk/gk/cet4/cet6/ky）OR frq ≤ MAX_FRQ OR bnc ≤ MAX_BNC
 *
 * 等级/年级映射（写进词条，供「我的等级」双阶梯使用）：
 *   tag=ky            → kaoyan / C1
 *   tag=cet6          → cet6   / C1
 *   tag=cet4          → cet4   / B2
 *   tag=gk            → g10~g12（PEP 教材年级优先，否则按词频分位）/ B1~B2
 *   tag=zk            → primary~g9（同上）/ Pre-A1~A2
 *   无标签            → 按 frq 分位落到 A1/A2/B1/B2
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const readline = require('node:readline')

const ROOT = path.resolve(__dirname, '..')
const CSV_PATH = process.argv[2] || path.join(ROOT, '.cache', 'ecdict.csv')
const OUT_DIR = path.join(ROOT, 'src', 'data', 'generated')
const REPORT_PATH = path.join(__dirname, 'ecdict-report.json')

const MAX_FRQ = Number(process.env.MAX_FRQ || 30000)
const MAX_BNC = Number(process.env.MAX_BNC || 30000)

/* ------------------------- 等级 ↔ 年级对照（与 data/levels.ts 一致） ------------------------- */
const GRADE_LEVEL = {
  primary: 'Pre-A1',
  g7: 'A1',
  g8: 'A2',
  g9: 'A2',
  g10: 'B1',
  g11: 'B1',
  g12: 'B2',
  cet4: 'B2',
  cet6: 'C1',
  kaoyan: 'C1',
}
const LEVEL_ORDER = ['Pre-A1', 'A1', 'A2', 'B1', 'B2', 'C1']

/* ------------------------------------ CSV 流式解析 ------------------------------------ */
/** 逐条产出记录（支持引号内的逗号与换行）。 */
async function* readCsv(file) {
  const stream = fs.createReadStream(file, { encoding: 'utf8' })
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })

  let header = null
  let buf = ''
  let inQuotes = false

  const parseRow = (line) => {
    const out = []
    let cur = ''
    let q = false
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i]
      if (q) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i += 1 } else q = false
        } else cur += ch
      } else if (ch === '"') q = true
      else if (ch === ',') { out.push(cur); cur = '' }
      else cur += ch
    }
    out.push(cur)
    return out
  }

  for await (const line of rl) {
    buf = buf ? `${buf}\n${line}` : line
    // 用引号计数判断当前累积是否跨行（奇数次 = 仍在引号内）
    const quotes = (buf.match(/"/g) || []).length
    inQuotes = quotes % 2 === 1
    if (inQuotes) continue

    const row = parseRow(buf)
    buf = ''
    if (!header) {
      header = row.map((h) => h.trim().replace(/^\uFEFF/, ''))
      continue
    }
    const rec = {}
    for (let i = 0; i < header.length; i += 1) rec[header[i]] = row[i] ?? ''
    yield rec
  }
}

/* ------------------------------------ 现有词库去重集合 ------------------------------------ */
function readText(p) {
  return fs.readFileSync(p, 'utf8')
}

function collectExistingWords() {
  const set = new Set()
  const norm = (s) => s.toLowerCase().normalize('NFKC').replace(/[^a-z0-9'’-]/g, '')
  for (const f of ['preA1', 'a1', 'a2', 'b1', 'b2', 'idioms']) {
    const p = path.join(ROOT, 'src', 'data', `${f}.ts`)
    if (!fs.existsSync(p)) continue
    for (const m of readText(p).matchAll(/word:\s*['"]([^'"]+)['"]/g)) {
      const k = norm(m[1])
      if (k && !/\s/.test(m[1])) set.add(k)
    }
  }
  // PEP 教材词（运行时也会并入）
  for (const m of readText(path.join(ROOT, 'src', 'data', 'pepGrades.ts')).matchAll(/"en"\s*:\s*"([^"]+)"/g)) {
    const k = norm(m[1])
    if (k && !/\s/.test(m[1])) set.add(k)
  }
  return set
}

/** PEP 教材词 → 首次出现年级（权威的中式年级来源）。 */
function collectPepGrades() {
  const map = new Map()
  const text = readText(path.join(ROOT, 'src', 'data', 'pepGrades.ts'))
  const norm = (s) => s.toLowerCase().normalize('NFKC').replace(/[^a-z0-9'’-]/g, '')
  for (const g of ['primary', 'g7', 'g8', 'g9', 'g10', 'g11', 'g12']) {
    const re = new RegExp(`${g}\\s*:\\s*\\[([\\s\\S]*?)\\]\\s*[,}]`)
    const block = text.match(re)
    if (!block) continue
    for (const m of block[1].matchAll(/"en"\s*:\s*"([^"]+)"/g)) {
      const k = norm(m[1])
      if (k && !map.has(k)) map.set(k, g)
    }
  }
  return map
}

/* ------------------------------------ 清洗与分类 ------------------------------------ */
const WORD_SHAPE = /^[A-Za-z][A-Za-z'’-]*$/
const KEEP_UPPER = new Set([
  'i',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december',
])

function cleanMeaning(row) {
  const zh = String(row.translation || '').trim()
  const en = String(row.definition || '').trim()
  const src = zh || en
  if (!src) return ''
  // 每行一个义项（CSV 里可能是真实换行，也可能是字面 \n）：保留前 2 条，压成一行
  const senses = src.split(/\r?\n|\\n/).map((s) => s.trim()).filter(Boolean).slice(0, 2)
  const text = senses.join('；').replace(/\s+/g, ' ')
  return text.length > 120 ? `${text.slice(0, 118)}…` : text
}

function cleanPos(row) {
  // ECDICT: n:46/v:54 → n./v.
  const raw = String(row.pos || '').trim()
  if (!raw) return ''
  const parts = raw.split('/').map((p) => p.split(':')[0].trim()).filter(Boolean).slice(0, 2)
  return parts.map((p) => `${p}.`).join('/')
}

function cleanIpa(row) {
  let p = String(row.phonetic || '').trim()
  if (!p) return ''
  // ECDICT 里混入了西里尔字母与半角冒号，统一成标准 IPA 字符
  p = p
    .replace(/ә/g, 'ə')
    .replace(/є/g, 'ɛ')
    .replace(/:/g, 'ː')
    .replace(/^\[|\]$/g, '')
  return p.startsWith('/') ? p : `/${p}/`
}

/** 粗分类：仅用于「没有词频」时兜底定级。 */
function coarseKind(tags) {
  if (tags.has('ky')) return 'ky'
  if (tags.has('cet6')) return 'cet6'
  if (tags.has('cet4')) return 'cet4'
  if (tags.has('gk')) return 'gk'
  if (tags.has('zk')) return 'zk'
  return 'freq'
}

/** 无词频时的标签兜底档位。 */
const TAG_FALLBACK = {
  ky: { grade: 'kaoyan', level: 'C1' },
  cet6: { grade: 'cet6', level: 'C1' },
  cet4: { grade: 'cet4', level: 'B2' },
  gk: { grade: 'g12', level: 'B2' },
  zk: { grade: 'g9', level: 'A2' },
}

/** 无标签词按词频落到 CEFR 档。 */
function freqBand(frq, bnc) {
  const f = frq > 0 ? frq : bnc
  if (!f || f <= 0) return null
  if (f <= 1000) return { grade: 'g7', level: 'A1' }
  if (f <= 3000) return { grade: 'g8', level: 'A2' }
  if (f <= 6000) return { grade: 'g10', level: 'B1' }
  if (f <= 12000) return { grade: 'g12', level: 'B2' }
  if (f <= MAX_FRQ) return { grade: 'cet6', level: 'C1' }
  return null
}

/* ------------------------------------------ 主流程 ------------------------------------------ */
async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`✗ 找不到 CSV：${CSV_PATH}`)
    console.error('  请从 https://github.com/skywind3000/ECDICT 下载 ecdict.csv 放到 .cache/ecdict.csv')
    process.exit(1)
  }

  const existing = collectExistingWords()
  const pepGrade = collectPepGrades()
  console.log(`现有词库去重集合：${existing.size} 个词；PEP 年级表：${pepGrade.size} 个词`)

  const tagHist = {}
  const tagCounts = {}
  const stats = { total: 0, skipShape: 0, skipVariant: 0, skipProper: 0, skipFreq: 0, dup: 0, kept: 0 }
  const kept = []

  for await (const row of readCsv(CSV_PATH)) {
    stats.total += 1
    const word = String(row.word || '').trim()
    if (!word || !WORD_SHAPE.test(word)) { stats.skipShape += 1; continue }

    // 缩略残词（n't、's、d'）与单字母杂项：不是独立词条
    const lower = word.toLowerCase()
    const head = lower.split("'")[0]
    if (head.length < 2 || /'$/.test(lower) || (lower.length === 1 && lower !== 'a' && lower !== 'i')) {
      stats.skipShape += 1
      continue
    }

    const key = word.toLowerCase().normalize('NFKC')
    if (existing.has(key)) { stats.dup += 1; continue }

    // 屈折变体：exchange 含 0: 说明它是某个原形的变形
    const exchange = String(row.exchange || '')
    if (/(^|\/)0:/.test(exchange)) { stats.skipVariant += 1; continue }

    const tags = new Set(String(row.tag || '').trim().split(/\s+/).filter(Boolean))
    const isOxford = String(row.oxford || '').trim() === '1'

    // 专有名词：首字母大写且不在白名单、也不是牛津核心词
    if (/^[A-Z]/.test(word) && !KEEP_UPPER.has(key) && !isOxford) { stats.skipProper += 1; continue }

    const frq = Number(row.frq) || 0
    const bnc = Number(row.bnc) || 0
    const hasExamTag = ['zk', 'gk', 'cet4', 'cet6', 'ky'].some((t) => tags.has(t))
    const passFreq = (frq > 0 && frq <= MAX_FRQ) || (bnc > 0 && bnc <= MAX_BNC)
    if (!isOxford && !hasExamTag && !passFreq) { stats.skipFreq += 1; continue }

    const tagKey = [...tags].sort().join(' ') || 'none'
    tagHist[tagKey] = (tagHist[tagKey] || 0) + 1
    // 各标签命中数（含多重命中），用于确定"核心词"的严格程度
    for (const t of ['zk', 'gk', 'cet4', 'cet6', 'ky']) {
      if (tags.has(t)) tagCounts[t] = (tagCounts[t] || 0) + 1
    }
    if (isOxford) tagCounts.oxford = (tagCounts.oxford || 0) + 1

    const meaning = cleanMeaning(row)
    if (!meaning) { stats.skipShape += 1; continue } // 无释义的条目没有价值

    // 难度以「词频」为准：考纲标签只说明"出现在某考试词表"，不代表难度
    // （toward / behavior 这类高频词在 ky 词表里，但绝不能标成 C1）
    const band = freqBand(frq, bnc)
    const kind = coarseKind(tags)
    const fallback = TAG_FALLBACK[kind]
    if (!band && !fallback) { stats.skipShape += 1; continue } // 无频次也无有效标签

    let level = band ? band.level : fallback.level
    let grade = band ? band.grade : fallback.grade
    // 牛津核心三千词不超过 B2
    if (isOxford && level === 'C1') { level = 'B2'; grade = 'g12' }
    // PEP 教材年级优先，但只在等级自洽时采用
    const pep = pepGrade.get(key)
    if (pep && GRADE_LEVEL[pep] === level) grade = pep

    kept.push({
      word,
      key,
      ipa: cleanIpa(row),
      pos: cleanPos(row),
      meaning,
      frq: frq || bnc || 999999,
      grade,
      level,
      src: band ? 'freq' : kind,
      // 核心词 = 牛津核心 or 命中考纲标签；其余是按词频补的扩展词
      core: isOxford || hasExamTag,
    })
  }

  const all = kept.sort((a, b) => a.frq - b.frq)

  /* ---- 写文件：核心词进主包，扩展词懒加载 ---- */
  fs.mkdirSync(OUT_DIR, { recursive: true })
  // 清理旧版按等级拆分的文件与旧聚合入口，避免残留被误引用
  for (const f of fs.readdirSync(OUT_DIR)) {
    if (/^ecdict-(prea1|a1|a2|b1|b2|c1)\.ts$/.test(f) || f === 'ecdict.ts') {
      fs.rmSync(path.join(OUT_DIR, f), { force: true })
    }
  }

  // 紧凑元组 + 运行时 map：避免上万个对象字面量触发 TS2590，产物也更小
  const toRows = (list) =>
    list.map((w) => `  [${[
      JSON.stringify(w.word),
      JSON.stringify(w.level),
      JSON.stringify(w.ipa),
      JSON.stringify(w.pos),
      JSON.stringify(w.meaning),
      JSON.stringify(w.grade),
      JSON.stringify(w.core ? 'core' : 'extra'),
    ].join(', ')}],`).join('\n')

  const writeChunk = (fileName, varName, list, note) => {
    const content = `// AUTO-GENERATED by scripts/gen-ecdict.cjs — 请勿手工编辑。\n` +
      `// 来源：ECDICT (MIT License, Copyright © 2025 Linwei)\n` +
      `// ${note}，共 ${list.length} 词\n` +
      `import type { Word, Level, GradeRung } from '../types'\n\n` +
      `type Row = readonly [word: string, level: string, ipa: string, pos: string, meaning: string, grade: string, tier: string]\n\n` +
      `const RAW: Row[] = [\n${toRows(list)}\n]\n\n` +
      `export const ${varName}: Word[] = RAW.map(([word, lv, ipa, pos, meaning, grade, tier]) => ({\n` +
      `  word, level: lv as Level, ipa, pos, meaning, examples: [], grade: grade as GradeRung,\n` +
      `  tier: tier as 'core' | 'extra',\n` +
      `}))\n`
    fs.writeFileSync(path.join(OUT_DIR, fileName), content, 'utf8')
    return { fileName, count: list.length }
  }

  const coreList = all.filter((w) => w.core)
  const extraList = all.filter((w) => !w.core)
  const coreFile = writeChunk('ecdict-core.ts', 'ECDICT_CORE', coreList, '课程词表补充（随主包加载）')
  const extraFile = writeChunk('ecdict-extra.ts', 'ECDICT_EXTRA', extraList, '词典扩展词（懒加载）')
  const fileNames = [coreFile, extraFile]

  /* ---- 报告 ---- */
  const countBy = (arr, key) => arr.reduce((m, w) => {
    const k = typeof key === 'function' ? key(w) : w[key]
    m[k] = (m[k] || 0) + 1
    return m
  }, {})
  const report = {
    generatedAt: new Date().toISOString(),
    source: 'ECDICT (MIT)',
    csv: path.relative(ROOT, CSV_PATH),
    thresholds: { maxFrq: MAX_FRQ, maxBnc: MAX_BNC },
    stats,
    kept: all.length,
    /** freq = 有词频、按词频定级；其余为无词频时按标签兜底 */
    bySource: countBy(all, 'src'),
    byLevel: countBy(all, 'level'),
    byGrade: countBy(all, 'grade'),
    /** 核心词（牛津/考纲）与扩展词（词频补充）的分级分布 */
    core: {
      total: all.filter((w) => w.core).length,
      byLevel: countBy(all.filter((w) => w.core), 'level'),
      byGrade: countBy(all.filter((w) => w.core), 'grade'),
    },
    extra: {
      total: all.filter((w) => !w.core).length,
      byLevel: countBy(all.filter((w) => !w.core), 'level'),
    },
    tagCounts,
    topTags: Object.entries(tagHist).sort((a, b) => b[1] - a[1]).slice(0, 15),
    files: fileNames,
  }
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8')

  console.log('\n✓ 生成完成')
  console.log(`  扫描 ${stats.total} 条；保留 ${all.length} 条（去重跳过 ${stats.dup}、变体 ${stats.skipVariant}、专有名词 ${stats.skipProper}、超频 ${stats.skipFreq}、格式/无释义 ${stats.skipShape}）`)
  console.log(`  按等级：${JSON.stringify(report.byLevel)}`)
  console.log(`  按年级：${JSON.stringify(report.byGrade)}`)
  console.log(`  定级来源：${JSON.stringify(report.bySource)}`)
  console.log(`  标签命中：${JSON.stringify(report.tagCounts)}`)
  console.log(`  核心词 ${report.core.total} 词：${JSON.stringify(report.core.byLevel)}`)
  console.log(`  扩展词 ${report.extra.total} 词：${JSON.stringify(report.extra.byLevel)}`)
  console.log(`  标签 Top：${report.topTags.slice(0, 6).map(([k, v]) => `${k}=${v}`).join('  ')}`)
  console.log(`  文件：${fileNames.map((f) => `${f.fileName}(${f.count})`).join(', ')}`)
  console.log(`  报告：${path.relative(ROOT, REPORT_PATH)}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
