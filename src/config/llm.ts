/**
 * 大模型（LLM）API 配置
 *
 * 内置默认值来自需求方提供的 Agnes AI 服务（OpenAI 兼容协议）。
 * 注意：内置 Key 会随 APK 打包、可被反编译提取，务必使用带限额的 Key；
 * 用户可在「AI 课 → 设置」中覆盖任意字段，覆盖值存于 localStorage。
 */

export interface LlmConfig {
  /** OpenAI 兼容基地址，末尾不带 /chat/completions */
  baseUrl: string
  apiKey: string
  model: string
  /** 每篇教程的重点词数（15-25 是 prompt 推荐区间） */
  wordsPerLesson: number
}

export const DEFAULT_LLM_CONFIG: LlmConfig = {
  baseUrl: 'https://api.agnes-ai.cn/v1',
  apiKey: 'sk-aEU1HGX7B9EyIxOztZEiv8Zj7iZYbgejgzq0zkwkqqxDBunC',
  model: 'agnes-3.0-flash',
  wordsPerLesson: 20,
}

export const LLM_CONFIG_STORAGE_KEY = 'lexicore-ai-config'

/** 合并：内置默认值 ← localStorage 覆盖值（仅接受合法字段）。 */
export function loadLlmConfig(): LlmConfig {
  try {
    const raw = localStorage.getItem(LLM_CONFIG_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_LLM_CONFIG }
    const parsed = JSON.parse(raw) as Partial<LlmConfig>
    return normalize({ ...DEFAULT_LLM_CONFIG, ...parsed })
  } catch {
    return { ...DEFAULT_LLM_CONFIG }
  }
}

export function saveLlmConfig(cfg: LlmConfig): void {
  localStorage.setItem(LLM_CONFIG_STORAGE_KEY, JSON.stringify(normalize(cfg)))
}

function normalize(cfg: LlmConfig): LlmConfig {
  const wordsPerLesson = Number(cfg.wordsPerLesson)
  return {
    baseUrl: (cfg.baseUrl || '').trim().replace(/\/+$/, ''),
    apiKey: (cfg.apiKey || '').trim(),
    model: (cfg.model || '').trim(),
    wordsPerLesson: Number.isFinite(wordsPerLesson)
      ? Math.min(30, Math.max(8, Math.round(wordsPerLesson)))
      : DEFAULT_LLM_CONFIG.wordsPerLesson,
  }
}

/** 配置是否可用于发起请求。 */
export function isConfigReady(cfg: LlmConfig): boolean {
  return !!cfg.baseUrl && !!cfg.apiKey && !!cfg.model
}
