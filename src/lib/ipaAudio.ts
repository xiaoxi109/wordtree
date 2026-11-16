import { ipaClipSlug } from '../data/phonics/clips'
import { playPrepared, stopSharedAudio } from '../hooks/useSpeech'

/**
 * 音标发音播放器。
 *
 * 音频是随应用打包的离线小文件（public/audio/ipa/*.wav，见 tools/gen-ipa-clips.ts），
 * 不经过 TTS：单个音标符号交给 TTS 只会读出字母名，念不出真正的音。
 *
 * 播放走 useSpeech 的共享音频通道（playPrepared），因此：
 *   - 点击音标喇叭会自动打断正在朗读的单词；
 *   - 朗读单词时也会打断音标音，同一条通道不会叠音。
 */
const CLIP_BASE = `${import.meta.env.BASE_URL}audio/ipa/`

const cache = new Map<string, Promise<Blob | null>>()

function loadClip(slug: string): Promise<Blob | null> {
  const hit = cache.get(slug)
  if (hit) return hit
  const p = (async () => {
    try {
      const res = await fetch(`${CLIP_BASE}${slug}.wav`)
      if (!res.ok) return null
      return await res.blob()
    } catch {
      return null
    }
  })()
  cache.set(slug, p)
  return p
}

/** 预取：音标页打开时先把音频取到本地，点按立即出声（移动端不丢用户手势） */
export function prefetchIpaClips(tokens: readonly string[]): void {
  const slugs = Array.from(new Set(tokens.map((t) => ipaClipSlug(t)).filter(Boolean)))
  let cursor = 0
  const worker = () => {
    if (cursor >= slugs.length) return
    const slug = slugs[cursor]
    cursor += 1
    void loadClip(slug).then(worker, worker)
  }
  for (let i = 0; i < Math.min(4, slugs.length); i += 1) worker()
}

/** 停止音标音频（读单词前调用，避免两句声音叠在一起） */
export function stopIpaClip(): void {
  stopSharedAudio()
}

/**
 * 播一个音标（或音标串，如 /tʃ/、/sp/）。
 * 返回 false 表示没有对应音频（调用方可以退回到朗读例词）。
 */
export async function playIpaToken(token: string, rate = 1): Promise<boolean> {
  const slug = ipaClipSlug(token)
  if (!slug) return false
  const blob = await loadClip(slug)
  if (!blob) return false
  playPrepared({ blob, duration: 0 }, rate)
  return true
}
