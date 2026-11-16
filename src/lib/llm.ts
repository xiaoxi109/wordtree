import { CapacitorHttp } from '@capacitor/core'
import type { LlmConfig } from '../config/llm'

export type LlmErrorKind = 'auth' | 'rate' | 'network' | 'server' | 'json' | 'empty' | 'badrequest'

/** 带分类的 LLM 错误，UI 据此给出可操作提示。 */
export class LlmError extends Error {
  kind: LlmErrorKind
  /** 面向用户的补充诊断（已截断、不含密钥） */
  detail?: string
  constructor(kind: LlmErrorKind, message: string, detail?: string) {
    super(message)
    this.name = 'LlmError'
    this.kind = kind
    this.detail = detail
  }
}

function withDetail(base: string, detail?: string): string {
  if (!detail) return base
  return `${base} · ${detail}`
}

export function llmErrorMessage(err: unknown): string {
  if (err instanceof LlmError) {
    switch (err.kind) {
      case 'auth':
        return 'API Key 无效或余额不足，请到「设置」检查配置'
      case 'rate':
        return '请求过于频繁，已超出服务端速率限制，请稍后重试'
      case 'network':
        return withDetail(
          '网络连接失败。若是电脑浏览器预览，第三方接口受跨域(CORS)限制会被拦截，请改用 App（APK）内测试；若在 App 内仍失败，请检查 API 地址、密钥与网络',
          err.detail,
        )
      case 'server':
        return withDetail('服务端返回错误，请稍后重试', err.detail)
      case 'badrequest':
        return withDetail(
          '请求被服务端拒绝（HTTP 400/404）：多为模型名不存在、接口路径错误或参数不合法，请核对模型名与 Base URL',
          err.detail,
        )
      case 'json':
        return withDetail('模型返回内容无法解析，可换用指令遵循更稳定的模型后重试', err.detail)
      case 'empty':
        return withDetail(
          '模型返回内容为空：推理型模型（*-reasoner / R1）常把正文留在思考过程里，建议改用对话型模型（如 deepseek-chat），或确认接口返回标准 chat/completions 格式',
          err.detail,
        )
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
  /** 是否请求服务端强制 JSON 输出；默认 true，失败时自动降级 */
  jsonMode?: boolean
}

const DEFAULT_TIMEOUT = 90_000

/**
 * 自定义模型兼容性差异很大：
 *  - 推理型 / 中转接口常把正文放在 reasoning_content，或不支持 response_format、temperature；
 *  - 新模型只接受 max_completion_tokens；
 *  - 部分代理返回 SSE 帧、Anthropic/Responses 风格结构，或把响应包在 data 里。
 * 因此按顺序尝试若干「请求变体」：首次用标准参数，遇到参数被拒或正文为空就自动降级重试，
 * 最后仍失败则抛出带响应结构诊断的错误，而不是笼统的「内容为空」。
 */
interface RequestVariant {
  jsonMode: boolean
  temperature: boolean
  tokenParam: 'max_tokens' | 'max_completion_tokens'
  /** token 上限倍数：空正文常见于推理过程耗尽额度，降级时放宽 */
  scale: number
}

export interface ExtractedContent {
  content: string
  reasoning: string
  finishReason: string
  /** 响应结构描述，用于向用户说明为什么没取到正文 */
  shape: string
}

/**
 * 调用 OpenAI 兼容 chat/completions 并解析出 JSON。
 * 全程走 CapacitorHttp（绕过 WebView CORS）。CapacitorHttp 不支持 AbortSignal，
 * 因此「取消生成」由上层 useAiLessons 在请求间隙检查 shouldCancel 实现。
 */
export async function chatJSON(
  cfg: LlmConfig,
  messages: ChatMessage[],
  opts: ChatJsonOptions = {},
): Promise<Record<string, unknown>> {
  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT
  const variants: RequestVariant[] = [
    { jsonMode: opts.jsonMode ?? true, temperature: true, tokenParam: 'max_tokens', scale: 1 },
    { jsonMode: false, temperature: false, tokenParam: 'max_tokens', scale: 2 },
    { jsonMode: false, temperature: false, tokenParam: 'max_completion_tokens', scale: 2 },
  ]

  let lastEmpty: ExtractedContent | null = null
  let lastUnparsable = ''

  for (let i = 0; i < variants.length; i += 1) {
    const v = variants[i]
    const body: Record<string, unknown> = {
      model: cfg.model,
      messages,
      [v.tokenParam]: Math.max(256, Math.round((opts.maxTokens ?? 3000) * v.scale)),
    }
    if (v.temperature) body.temperature = opts.temperature ?? 0.7
    if (v.jsonMode) body.response_format = { type: 'json_object' }

    const { status, raw } = await request(cfg, body, timeout)

    if (status === 401 || status === 403) throw new LlmError('auth', `HTTP ${status}`)
    if (status === 429) throw new LlmError('rate', 'HTTP 429')
    if (status === 400 || status === 404) {
      const detail = excerpt(raw)
      // 仅当服务端明确指出参数问题时降级重试，模型名/路径错误不浪费请求
      if (i < variants.length - 1 && isParamUnsupported(detail)) continue
      throw new LlmError('badrequest', `HTTP ${status}`, detail)
    }
    if (status >= 500) throw new LlmError('server', `HTTP ${status}`, excerpt(raw))
    if (status >= 400) throw new LlmError('network', `HTTP ${status}`, excerpt(raw))

    const extracted = extractContent(raw)
    if (!extracted.content) {
      lastEmpty = extracted
      if (i < variants.length - 1) continue
      throw new LlmError('empty', 'empty content', emptyDetail(extracted))
    }

    try {
      return extractJson(extracted.content)
    } catch {
      // 少数代理把最终 JSON 放在思考字段里
      if (extracted.reasoning) {
        try {
          return extractJson(extracted.reasoning)
        } catch {
          /* 继续降级 */
        }
      }
      lastUnparsable = extracted.content
      if (i < variants.length - 1) continue
      throw new LlmError('json', 'JSON parse failed', excerpt(lastUnparsable))
    }
  }

  throw new LlmError('empty', 'empty content', lastEmpty ? emptyDetail(lastEmpty) : lastUnparsable)
}

async function request(
  cfg: LlmConfig,
  body: Record<string, unknown>,
  timeout: number,
): Promise<{ status: number; raw: string }> {
  try {
    const resp = await CapacitorHttp.request({
      url: `${cfg.baseUrl}/chat/completions`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      data: body,
      responseType: 'text',
      connectTimeout: 15_000,
      readTimeout: timeout,
    })
    return {
      status: resp.status,
      raw: typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data ?? ''),
    }
  } catch (e) {
    if (e instanceof LlmError) throw e
    if (isTimeout(e)) throw new LlmError('network', 'request timeout')
    throw new LlmError('network', errorText(e))
  }
}

/** 把任意形态的字段转成文本：字符串 / 分片数组 / {text} / {content} 对象。 */
function asText(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return v.map(asText).join('')
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if (typeof o.text === 'string') return o.text
    if (typeof o.content === 'string') return o.content
    if (Array.isArray(o.content)) return asText(o.content)
  }
  return ''
}

/** 从一个已解析的响应对象里尽力找出正文、思考内容与结束原因。 */
function pickFromObject(input: any): Omit<ExtractedContent, 'shape'> {
  // 部分中转服务把真正的响应包在 data / response / result 里
  const wrapped = input?.data
  const root =
    wrapped && typeof wrapped === 'object' && (wrapped.choices || wrapped.output_text || wrapped.content)
      ? wrapped
      : input
  const choices: any[] = Array.isArray(root?.choices)
    ? root.choices
    : Array.isArray(input?.choices)
      ? input.choices
      : []
  const first = choices[0]
  const msg = first?.message ?? first?.delta ?? first

  let content = asText(msg?.content)
  if (!content) content = asText(first?.text)
  if (!content) {
    // Responses API / Anthropic / 各类代理的顶层字段
    content =
      asText(root?.output_text) ||
      asText(root?.output?.[0]?.content) ||
      asText(root?.content) ||
      asText(root?.text) ||
      asText(root?.answer) ||
      asText(root?.message?.content) ||
      ''
  }
  const reasoning = asText(
    msg?.reasoning_content ?? msg?.reasoning ?? msg?.thinking ?? msg?.reasoning_details ?? '',
  )
  const finishReason = String(first?.finish_reason ?? root?.finish_reason ?? '')
  return { content: content.trim(), reasoning: reasoning.trim(), finishReason }
}

/** 流式（SSE）响应：逐帧拼接 delta/message 的正文。 */
function fromSse(text: string): ExtractedContent | null {
  const lines = text.split(/\r?\n/).filter((l) => /^\s*data\s*:/i.test(l))
  if (!lines.length) return null
  let content = ''
  let reasoning = ''
  let finishReason = ''
  for (const line of lines) {
    const payload = line.replace(/^\s*data\s*:/i, '').trim()
    if (!payload || payload === '[DONE]') continue
    try {
      const picked = pickFromObject(JSON.parse(payload))
      content += picked.content
      reasoning += picked.reasoning
      if (picked.finishReason) finishReason = picked.finishReason
    } catch {
      /* 忽略非 JSON 帧 */
    }
  }
  return {
    content: content.trim(),
    reasoning: reasoning.trim(),
    finishReason,
    shape: `SSE ${lines.length} 帧`,
  }
}

function shapeOf(parsed: any): string {
  if (!parsed || typeof parsed !== 'object') return '非对象响应'
  const keys = Object.keys(parsed).slice(0, 8).join(',')
  return Array.isArray(parsed.choices) ? `choices=${parsed.choices.length} · 键:${keys}` : `无 choices · 键:${keys}`
}

/** 从响应体里取出 assistant 文本（兼容各种自定义模型 / 代理）。 */
export function extractContent(raw: string): ExtractedContent {
  const text = (raw ?? '').trim()
  if (!text) return { content: '', reasoning: '', finishReason: '', shape: '空响应' }
  const sse = fromSse(text)
  if (sse) return sse
  let parsed: any
  try {
    parsed = JSON.parse(text)
  } catch {
    return { content: text, reasoning: '', finishReason: '', shape: '纯文本响应' }
  }
  const picked = pickFromObject(parsed)
  if (!picked.content && !picked.reasoning && !parsed?.choices && !parsed?.error) {
    // 极简代理可能直接返回业务 JSON（没有 chat/completions 包装），整段交给 JSON 解析
    return { content: text, reasoning: '', finishReason: '', shape: '业务 JSON 直返' }
  }
  return { ...picked, shape: shapeOf(parsed) }
}

function emptyDetail(ex: ExtractedContent): string {
  const bits: string[] = []
  if (ex.reasoning) bits.push(`仅有思考内容 ${ex.reasoning.length} 字`)
  if (ex.finishReason === 'length') bits.push('输出被 token 上限截断')
  else if (ex.finishReason) bits.push(`finish_reason=${ex.finishReason}`)
  bits.push(ex.shape)
  return bits.join('，').slice(0, 140)
}

/** 容错提取 JSON 对象：剥掉思考标签、代码块围栏、截取首尾大括号。 */
function extractJson(content: string): Record<string, unknown> {
  const cleaned = content
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^\s*```(?:json)?/i, '')
    .replace(/```\s*$/, '')
    .trim()
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

function isParamUnsupported(text: string): boolean {
  return /response_format|json_object|max_tokens|max_completion_tokens|temperature|unsupported|not support|unknown (?:field|parameter)|extra field/i.test(
    text.toLowerCase(),
  )
}

function isTimeout(e: unknown): boolean {
  const msg = errorText(e).toLowerCase()
  return msg.includes('timeout') || msg.includes('timed out') || msg.includes('aborted')
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function excerpt(v: unknown): string {
  const s = (typeof v === 'string' ? v : JSON.stringify(v ?? ''))
    // 避免把密钥等长串原样展示给用户
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-***')
    .slice(0, 140)
  return s.trim()
}
