import { CapacitorHttp } from '@capacitor/core'
import type { LlmConfig } from '../config/llm'

export type LlmErrorKind = 'auth' | 'rate' | 'network' | 'server' | 'json' | 'empty' | 'badrequest'

/** 带分类的 LLM 错误，UI 据此给出可操作提示。 */
export class LlmError extends Error {
  kind: LlmErrorKind
  constructor(kind: LlmErrorKind, message: string) {
    super(message)
    this.name = 'LlmError'
    this.kind = kind
  }
}

export function llmErrorMessage(err: unknown): string {
  if (err instanceof LlmError) {
    switch (err.kind) {
      case 'auth':
        return 'API Key 无效或余额不足，请到「设置」检查配置'
      case 'rate':
        return '请求过于频繁，已超出服务端速率限制，请稍后重试'
      case 'network':
        return '网络连接失败。若是电脑浏览器预览，第三方接口受跨域(CORS)限制会被拦截，请改用 App（APK）内测试；若在 App 内仍失败，请检查 API 地址、密钥与网络'
      case 'server':
        return '服务端返回错误，请稍后重试'
      case 'badrequest':
        return '请求被服务端拒绝（HTTP 400/404）。多为模型名不存在、接口路径错误或参数不合法，请核对模型名与 Base URL'
      case 'json':
        return '模型返回内容无法解析，请重试'
      case 'empty':
        return '模型返回内容为空，请重试'
    }
  }
  if (err instanceof Error && err.message === 'canceled') return '已取消'
  return '生成失败，请重试'
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatJsonOptions {
  temperature?: number
  maxTokens?: number
  /** 毫秒；仅作为 CapacitorHttp 的 readTimeout（原生 HTTP 生效） */
  timeoutMs?: number
}

const DEFAULT_TIMEOUT = 90_000

/**
 * 调用 OpenAI 兼容 chat/completions 并解析出 JSON。
 * 全程走 CapacitorHttp（绕过 WebView CORS）。CapacitorHttp 不支持 AbortSignal，
 * 因此「取消生成」由上层 useAiLessons 在请求间隙检查 shouldCancel 实现：
 * 已经发出的请求无法中断，但返回后不会解析、重试或写库。
 */
export async function chatJSON(
  cfg: LlmConfig,
  messages: ChatMessage[],
  opts: ChatJsonOptions = {},
): Promise<Record<string, unknown>> {
  const url = `${cfg.baseUrl}/chat/completions`
  const body = {
    model: cfg.model,
    messages,
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens ?? 3000,
    response_format: { type: 'json_object' },
  }
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${cfg.apiKey}`,
  }

  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT
  let raw: string

  try {
    const resp = await CapacitorHttp.request({
      url,
      method: 'POST',
      headers,
      data: body,
      responseType: 'text',
      connectTimeout: 15_000,
      readTimeout: timeout,
    })
    if (resp.status === 401 || resp.status === 403) throw new LlmError('auth', `HTTP ${resp.status}`)
    if (resp.status === 429) throw new LlmError('rate', 'HTTP 429')
    // 400/404 通常是模型名不存在、接口路径错误或参数不合法，单独归类以区分 CORS
    if (resp.status === 400 || resp.status === 404)
      throw new LlmError('badrequest', `HTTP ${resp.status}: ${excerpt(resp.data)}`)
    if (resp.status >= 500) throw new LlmError('server', `HTTP ${resp.status}`)
    if (resp.status >= 400) throw new LlmError('network', `HTTP ${resp.status}: ${excerpt(resp.data)}`)
    raw = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data)
  } catch (e) {
    if (e instanceof LlmError) throw e
    if (isTimeout(e)) throw new LlmError('network', 'request timeout')
    throw new LlmError('network', errorText(e))
  }

  const content = extractContent(raw)
  if (!content) throw new LlmError('empty', 'empty content')
  return extractJson(content)
}

/** 从响应体里取出 assistant 文本（兼容 data 已是对象 / 字符串两种情况）。 */
function extractContent(raw: string): string {
  let parsed: any
  try {
    parsed = JSON.parse(raw)
  } catch {
    return raw.trim()
  }
  const msg = parsed?.choices?.[0]?.message
  const content = msg?.content
  if (typeof content === 'string') return content.trim()
  if (Array.isArray(content)) {
    // 某些服务返回分片 content: [{type:'text', text:'...'}]
    return content
      .map((c: any) => (typeof c?.text === 'string' ? c.text : ''))
      .join('')
      .trim()
  }
  return ''
}

/** 容错提取 JSON 对象：剥掉代码块围栏、截取首尾大括号。 */
function extractJson(content: string): Record<string, unknown> {
  const cleaned = content.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim()
  const candidates = [cleaned]
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start >= 0 && end > start) candidates.push(cleaned.slice(start, end + 1))

  for (const c of candidates) {
    try {
      const obj = JSON.parse(c)
      if (obj && typeof obj === 'object') return obj as Record<string, unknown>
    } catch {
      /* try next */
    }
  }
  throw new LlmError('json', 'JSON parse failed')
}

function isTimeout(e: unknown): boolean {
  const msg = errorText(e).toLowerCase()
  return msg.includes('timeout') || msg.includes('timed out') || msg.includes('aborted')
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function excerpt(v: unknown): string {
  const s = typeof v === 'string' ? v : JSON.stringify(v ?? '')
  return s.slice(0, 200)
}
