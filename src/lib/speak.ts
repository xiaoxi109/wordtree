/** 英文单词 / 例句朗读（浏览器原生 TTS，与原型行为一致）。 */
export function speak(text: string): void {
  try {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const u = new SpeechSynthesisUtterance(text)
      u.lang = 'en-US'
      u.rate = 0.9
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(u)
    }
  } catch {
    /* 不支持 TTS 时静默忽略 */
  }
}
