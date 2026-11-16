/**
 * 预生成音标发音音频（48 个音标 + 每条拼读规则的首个音）。
 *
 *   npx tsx tools/gen-ipa-clips.ts
 *
 * 原理：Piper 模型吃的是「音素 id 序列」，phoneme_id_map 里就是 IPA 字符 → id，
 * 所以可以绕开文本→音素这一步，直接把 /iː/、/tʃ/ 这样的音标喂进 ONNX 得到声音。
 * 生成的 wav 落在 public/audio/ipa/，随应用打包，运行时点一下即播（无需再加载 60MB 模型）。
 *
 * 记号约定：
 *   - 单个辅音会补一个弱读 /ə/（p → pə），否则孤立辅音几乎听不见；
 *   - 纯元音不能单独喂给模型（/æ/ 会读成 /ə/），要放进 h ˈ V d 音节里合成再裁出元音段；
 *   - 长元音、双元音自动放慢（length_scale），保证听清；
 *   - 每个音频做峰值归一 + 静音裁剪 + 首尾淡入淡出，避免忽大忽小和爆音。
 */
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PHONEMES } from '../src/data/phonics/ipa'
import { PHONICS_RULES } from '../src/data/phonics/rules'
import { collectClipTokens, ipaClipSlug, IPA_CLIP_DIR } from '../src/data/phonics/clips'

const require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ort = require('onnxruntime-web')

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MODEL = resolve(root, 'public/tts/model/en/en_US/lessac/medium/en_US-lessac-medium.onnx')
const OUT_DIR = resolve(root, 'public', IPA_CLIP_DIR)
const SAMPLE_RATE = 22050
/** Piper 的声学模型要求输入带 BOS/EOS 与音素间 pad，缺了会读成噪音 */
const BOS = 1
const EOS = 2
const PAD = 0

const VOWELS = new Set(['i', 'ɪ', 'e', 'ɛ', 'æ', 'ɑ', 'ɒ', 'ɔ', 'ʊ', 'u', 'ʌ', 'ɜ', 'ə', 'a', 'o'])

/** IPA → Piper phoneme_id_map 的键（表里没有 ASCII g / r） */
function normalizeChar(ch: string): string {
  if (ch === 'g') return 'ɡ'
  if (ch === 'r') return 'ɹ'
  return ch
}

function basePhonemes(token: string): string[] {
  const body = token.replace(/\//g, '').trim()
  return Array.from(body).map(normalizeChar)
}

interface Spec {
  token: string
  phonemes: string[]
  lengthScale: number
  /** 需要从 h V d 的合成结果里裁出元音段 */
  cropVowel?: boolean
}

function specFor(token: string): Spec {
  const chars = basePhonemes(token)
  const bases = chars.filter((c) => c !== 'ː')
  const last = bases[bases.length - 1]
  const endsWithConsonant = !!last && !VOWELS.has(last)
  const vowelCount = bases.filter((c) => VOWELS.has(c)).length

  // 元音（含 /ɪr/ /ɛr/ /ʊr/ 这类卷舌元音）：孤立音素会让模型读偏（实测 /æ/ 变成 /ə/、/ɪ/ 变成 /eɪ/）。
  // 放进真实的 h ˈ V d 音节里合成，再按能量裁出元音段，10 个元音全部与目标音最匹配。
  const startsWithVowel = !!bases[0] && VOWELS.has(bases[0])
  if (startsWithVowel) {
    return { token, phonemes: ['h', 'ˈ', ...chars, 'd', ' '], lengthScale: 1.3, cropVowel: true }
  }

  // 纯辅音（不含元音）才补弱读 ə 让声音站得住（p → pə）。
  // 已经带元音的音标串（如 /ɪz/、/ʃən/）不能再补，否则会读成 /ɪzə/、/ʃənə/。
  const hasVowel = bases.some((c) => VOWELS.has(c))
  const withSchwa = endsWithConsonant && !hasVowel && chars.length <= 3 ? [...chars, 'ə'] : chars

  let lengthScale = 1.5
  if (vowelCount >= 2) lengthScale = 1.7 // 双元音：给足滑动时间
  else if (endsWithConsonant && vowelCount === 0) lengthScale = 1.4 // 纯辅音 + ə

  // 结尾必须补一个词界空格：只喂单个音素时模型几乎不出声（测得 peak 仅 0.04），
  // 有词界才会正常发声。结尾的静音会在后面的裁剪里被去掉。
  return { token, phonemes: [...withSchwa, ' '], lengthScale }
}

/**
 * 从 h V d 里裁出元音：以 2% 峰值能量为界，前后各多留 60ms，
 * 这样双元音的滑动尾部不会被切掉。
 */
function cropVowel(samples: Float32Array): Float32Array {
  const win = 220
  const energy: number[] = []
  for (let s = 0; s + win < samples.length; s += win / 2) {
    let e = 0
    for (let i = s; i < s + win; i += 1) e += samples[i] * samples[i]
    energy.push(e)
  }
  const peak = Math.max(...energy)
  if (peak <= 0) return samples
  const threshold = peak * 0.02
  const first = energy.findIndex((e) => e > threshold)
  let last = energy.length - 1
  while (last >= 0 && energy[last] < threshold) last -= 1
  if (first < 0 || last < first) return samples

  const pad = Math.round(SAMPLE_RATE * 0.06)
  const start = Math.max(0, first * (win / 2) - pad)
  const end = Math.min(samples.length, (last + 1) * (win / 2) + pad)
  return samples.subarray(start, end)
}

function encodeWav(samples: Float32Array): Buffer {
  const bytes = samples.length * 2
  const buf = Buffer.alloc(44 + bytes)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + bytes, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20) // PCM
  buf.writeUInt16LE(1, 22) // mono
  buf.writeUInt32LE(SAMPLE_RATE, 24)
  buf.writeUInt32LE(SAMPLE_RATE * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(bytes, 40)
  for (let i = 0; i < samples.length; i += 1) {
    const v = Math.max(-1, Math.min(1, samples[i]))
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2)
  }
  return buf
}

/** 归一化 + 裁掉首尾静音 + 5ms 淡入淡出，返回最终采样 */
function polish(raw: Float32Array): Float32Array {
  let peak = 0
  for (const v of raw) peak = Math.max(peak, Math.abs(v))
  const gain = peak > 0.01 ? 0.9 / peak : 1

  const threshold = 0.008
  let start = 0
  let end = raw.length - 1
  while (start < raw.length && Math.abs(raw[start] * gain) < threshold) start += 1
  while (end > start && Math.abs(raw[end] * gain) < threshold) end -= 1
  start = Math.max(0, start - Math.round(SAMPLE_RATE * 0.01))
  end = Math.min(raw.length - 1, end + Math.round(SAMPLE_RATE * 0.04))

  const out = new Float32Array(end - start + 1)
  for (let i = 0; i < out.length; i += 1) out[i] = raw[start + i] * gain

  const fade = Math.min(Math.round(SAMPLE_RATE * 0.005), Math.floor(out.length / 4))
  for (let i = 0; i < fade; i += 1) {
    const k = i / fade
    out[i] *= k
    out[out.length - 1 - i] *= k
  }
  return out
}

async function main() {
  const cfg = JSON.parse(readFileSync(`${MODEL}.json`, 'utf8')) as {
    audio: { sample_rate: number }
    inference: { noise_scale: number; noise_w: number }
    phoneme_id_map: Record<string, number[]>
  }
  const idMap = cfg.phoneme_id_map

  const tokens = collectClipTokens(
    PHONEMES.map((p) => p.id),
    PHONICS_RULES.map((r) => r.sound),
  )
  console.log(`模型采样率 ${cfg.audio.sample_rate}，待生成 ${tokens.length} 条音频`)

  console.log('加载 ONNX 模型…')
  ort.env.wasm.numThreads = 1
  ort.env.wasm.wasmPaths = resolve(root, 'public/tts/onnx') + '/'
  const session = await ort.InferenceSession.create(readFileSync(MODEL), {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  })

  mkdirSync(OUT_DIR, { recursive: true })

  const slugs = new Map<string, string>()
  let written = 0
  let totalBytes = 0

  for (const token of tokens) {
    const slug = ipaClipSlug(token)
    const clash = slugs.get(slug)
    if (clash && clash !== token) throw new Error(`文件名冲突：${clash} 与 ${token} 都映射到 ${slug}`)
    slugs.set(slug, token)

    const spec = specFor(token)
    const missing = spec.phonemes.filter((ch) => !idMap[ch])
    if (missing.length) throw new Error(`${token} 含模型不支持的音素：${missing.join(' ')}`)

    const ids: number[] = [BOS]
    for (const ch of spec.phonemes) {
      ids.push(...idMap[ch])
      ids.push(PAD)
    }
    ids.push(EOS)

    const out = await session.run({
      input: new ort.Tensor('int64', BigInt64Array.from(ids.map((v) => BigInt(v))), [1, ids.length]),
      input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
      scales: new ort.Tensor(
        'float32',
        Float32Array.from([cfg.inference.noise_scale, spec.lengthScale, cfg.inference.noise_w]),
        [3],
      ),
    })

    const raw = out.output.data as Float32Array
    const samples = polish(spec.cropVowel ? cropVowel(raw) : raw)
    const wav = encodeWav(samples)
    writeFileSync(resolve(OUT_DIR, `${slug}.wav`), wav)
    written += 1
    totalBytes += wav.length

    let peak = 0
    for (const v of samples) peak = Math.max(peak, Math.abs(v))
    console.log(
      `${token.padEnd(8)} → ${slug.padEnd(6)} ${spec.phonemes.join(' ').padEnd(10)} ` +
        `${(samples.length / SAMPLE_RATE).toFixed(2)}s  peak ${peak.toFixed(2)}  ${(wav.length / 1024).toFixed(0)}KB`,
    )
  }

  // 落盘校验：Windows/macOS 文件系统不区分大小写，slug 一旦出现大小写差异，
  // 后写的会覆盖前面的而不会报错。这里按「实际文件名」核对，保证 83 个音一个都不少。
  const actual = new Set(readdirSync(OUT_DIR))
  for (const slug of slugs.keys()) {
    if (!actual.has(`${slug}.wav`)) throw new Error(`写入后找不到 ${slug}.wav（可能与其它文件大小写冲突）`)
  }

  console.log(`\n完成：${written} 个文件，共 ${(totalBytes / 1024 / 1024).toFixed(2)} MB → public/${IPA_CLIP_DIR}`)
}

main().catch((err) => {
  console.error('生成失败：', err)
  process.exit(1)
})
