/**
 * 音标发音音频（离线小音频）命名规则。
 *
 * 为什么不用 TTS 直接念音标：系统 TTS / Piper 都只吃「文字」，
 * 单个音标符号念不出正确音（/ʃ/ 会被读成字母名）。
 * 所以用同一套 Piper 模型按音素 id 预生成 47 个音标 + 各条拼读规则的短音频，
 * 随应用一起打包（public/audio/ipa/*.wav），点一下即播。
 *
 * 文件名由音标符号转写而来（IPA → ASCII），生成脚本与前端共用本文件，
 * 保证「写出的文件名」与「运行时要的文件名」永远一致。
 */

/** 生成脚本写入的目录（相对 public） */
export const IPA_CLIP_DIR = 'audio/ipa'

/**
 * 音标 → 文件名字母。全部小写且互不为前缀：
 * Windows / macOS 的文件系统不区分大小写，'V' 与 'v' 会互相覆盖（曾经踩过），
 * 所以这里禁用大写字母，也用足够长的转写避免歧义。
 */
const SLUG_MAP: Record<string, string> = {
  'ː': 'long', // 长音符号
  'ɪ': 'ii',
  'ʊ': 'uu',
  'æ': 'ae',
  'ɑ': 'aa',
  'ɒ': 'oo',
  'ɔ': 'aw',
  'ʌ': 'uh',
  'ɜ': 'er',
  'ə': 'schwa',
  'ɛ': 'eh',
  'θ': 'th',
  'ð': 'dh',
  'ʃ': 'sh',
  'ʒ': 'zh',
  'ŋ': 'ng',
  'ɹ': 'r',
  'ɡ': 'g',
  'ˈ': 'stress',
  'ˌ': 'secondary',
}

/** `/iː/` → `ilong`；`/tʃ/` → `tsh`。非 ASCII 且未登记的音标字符退化为 u+码点。 */
export function ipaClipSlug(token: string): string {
  const body = token.replace(/\//g, '').trim()
  return Array.from(body)
    .map((ch) => {
      if (/[a-z0-9]/.test(ch)) return ch
      if (SLUG_MAP[ch]) return SLUG_MAP[ch]
      // 大写字母同样降级：文件系统不区分大小写，保留大小写只会造成互相覆盖
      if (/[A-Z]/.test(ch)) return ch.toLowerCase()
      return `u${(ch.codePointAt(0) ?? 0).toString(16)}`
    })
    .join('')
}

/** 从 `'/sp/ /st/ /sk/'` 这类字段里取出全部音标 token */
export function ipaTokensIn(sound: string): string[] {
  return sound.match(/\/[^/\s]+\//g) ?? []
}

/** 规则卡片喇叭只播第一个音（多音规则如 /sp/ /st/ 取 /sp/） */
export function primaryIpaToken(sound: string): string | null {
  return ipaTokensIn(sound)[0] ?? null
}

/** 需要预生成的音标 token（去重、按 slug 归并） */
export function collectClipTokens(phonemeIds: string[], ruleSounds: string[]): string[] {
  const bySlug = new Map<string, string>()
  const add = (token: string) => {
    const slug = ipaClipSlug(token)
    if (!slug || bySlug.has(slug)) return
    bySlug.set(slug, token)
  }
  for (const id of phonemeIds) add(`/${id}/`)
  for (const sound of ruleSounds) for (const token of ipaTokensIn(sound)) add(token)
  return [...bySlug.values()]
}
