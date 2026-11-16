/**
 * 在 Node 里调用打包好的 piper_phonemize（espeak-ng），把英文单词转成音素序列。
 *
 *   const ids = await phonemizeIds('cat')    // [107,120,39,32]（去掉 BOS/EOS/pad）
 *   const sym = await phonemizeSymbols('cat') // 'kˈæt'
 *
 * 生成音标音频、校验音标表都依赖它：espeak 的 en-us 音素就是模型的「标准答案」，
 * 我们喂给模型的音素 id 必须与它完全一致，否则发音会偏。
 */
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'

const require = createRequire(import.meta.url)

const GLUE = resolve('node_modules/@realtimex/piper-tts-web/dist/piper-o91UDS6e.js')
const WASM = resolve('public/tts/piper/piper_phonemize.wasm')
const DATA = resolve('public/tts/piper/piper_phonemize.data')
const MODEL_CFG = resolve('public/tts/model/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json')

const cfg = JSON.parse(readFileSync(MODEL_CFG, 'utf8'))

/** 音素 id → 符号（与模型 phoneme_id_map 一一对应） */
export const ID_TO_SYMBOL: Map<number, string> = (() => {
  const m = new Map<number, string>()
  for (const [sym, ids] of Object.entries(cfg.phoneme_id_map as Record<string, number[]>)) {
    for (const id of ids) if (!m.has(id)) m.set(id, sym)
  }
  return m
})()

/** espeak-ng 的 IPA → 常见美式写法 */
export const IPA_NORMALIZE: Record<string, string> = {
  ɹ: 'r',
  ɐ: 'ə',
  ᵻ: 'ɪ',
  ɚ: 'ər',
  ɾ: 't',
  ɡ: 'g',
  ˈ: '',
  ˌ: '',
}

/**
 * 音素合并：espeak 的 en-us 把 door/more 标成 /oː/（更闭更圆），
 * 而查词典（Merriam-Webster、Cambridge）习惯统一记作 /ɔː/。
 * 学习阶段按词典记，避免同一个音在音标表和例词里写法不一致。
 */
export const IPA_MERGE: [string, string][] = [['oː', 'ɔː']]

/** 归一化：单字符替换 + 多字符合并 */
export function normalizeIpa(raw: string): string {
  let out = ''
  for (const ch of raw) out += IPA_NORMALIZE[ch] ?? ch
  for (const [from, to] of IPA_MERGE) out = out.split(from).join(to)
  return out
}

let glueSource: string | null = null

function glueSrc(): string {
  if (!glueSource) {
    glueSource = readFileSync(GLUE, 'utf8').replace(/\nexport\s*\{\s*createPiperPhonemize\s*\}\s*;?\s*$/, '\n')
  }
  return glueSource
}

/** 每次调用都新建一个 wasm 实例：espeak 是单实例状态，复用会串味 */
function newInstance(onPrint: (data: string) => void) {
  const sandbox: Record<string, unknown> = {
    require,
    process,
    Buffer,
    TextDecoder,
    TextEncoder,
    WebAssembly,
    console,
    setTimeout,
    clearTimeout,
    URL,
    URLSearchParams,
    __filename: GLUE,
    __dirname: resolve('node_modules/@realtimex/piper-tts-web/dist'),
    performance,
    queueMicrotask,
  }
  sandbox.globalThis = sandbox
  sandbox.self = sandbox
  vm.createContext(sandbox)
  vm.runInContext(glueSrc(), sandbox, { filename: GLUE })
  const create = sandbox.createPiperPhonemize as (opts: any) => Promise<any>
  return create({
    wasmBinary: readFileSync(WASM),
    noInitialRun: true,
    print: onPrint,
    printErr: () => {},
    locateFile: (url: string) => (url.endsWith('.data') ? DATA : url),
  })
}

/** 单词 → 音素 id 序列（去掉 BOS / EOS / pad） */
export async function phonemizeIds(word: string): Promise<number[]> {
  return new Promise<number[]>((resolveIds, reject) => {
    let settled = false
    newInstance((d: string) => {
      if (settled) return
      try {
        const parsed = JSON.parse(d)
        settled = true
        resolveIds((parsed.phoneme_ids as number[]).filter((id) => id !== 0 && id !== 1 && id !== 2))
      } catch {
        /* 忽略非 JSON 输出 */
      }
    })
      .then(async (module: any) => {
        await module.ready
        if (settled) return
        module.callMain([
          '-l',
          'en-us',
          '--input',
          JSON.stringify([{ text: word }]),
          '--espeak_data',
          '/espeak-ng-data',
        ])
      })
      .catch((e) => {
        if (settled) return
        settled = true
        reject(e)
      })
  })
}

/** 单词 → 音素符号串（原始 espeak IPA，带重音符） */
export async function phonemizeSymbols(word: string): Promise<string> {
  const ids = await phonemizeIds(word)
  let out = ''
  for (const id of ids) {
    const sym = ID_TO_SYMBOL.get(id)
    if (sym) out += sym
  }
  return out
}

/** 单词 → 归一化后的美式音标（不带斜杠） */
export async function phonemizeAmerican(word: string): Promise<string> {
  const raw = await phonemizeSymbols(word)
  return normalizeIpa(raw)
}
