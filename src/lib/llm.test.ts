import { describe, expect, it } from 'vitest'
import { extractContent } from './llm'

/** 覆盖自定义模型常见的响应形态：正文取不到时就会误报「模型返回内容为空」。 */
describe('extractContent 兼容多种模型响应', () => {
  it('标准 chat/completions', () => {
    const r = extractContent(
      JSON.stringify({ choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }] }),
    )
    expect(r.content).toBe('{"ok":true}')
    expect(r.finishReason).toBe('stop')
  })

  it('推理模型：content 为空但带 reasoning_content 与截断标记', () => {
    const r = extractContent(
      JSON.stringify({
        choices: [{ message: { content: '', reasoning_content: '让我想想…' }, finish_reason: 'length' }],
      }),
    )
    expect(r.content).toBe('')
    expect(r.reasoning).toBe('让我想想…')
    expect(r.finishReason).toBe('length')
  })

  it('content 为分片数组 / Anthropic 风格', () => {
    const r = extractContent(
      JSON.stringify({ content: [{ type: 'text', text: '{"ok":' }, { type: 'text', text: 'true}' }] }),
    )
    expect(r.content).toBe('{"ok":true}')
  })

  it('代理把响应包在 data 里', () => {
    const r = extractContent(
      JSON.stringify({ data: { choices: [{ message: { content: '{"ok":true}' } }] } }),
    )
    expect(r.content).toBe('{"ok":true}')
  })

  it('SSE 流式响应拼接 delta', () => {
    const frames = [
      { choices: [{ delta: { content: '{"ok":' } }] },
      { choices: [{ delta: { content: 'true}' }, finish_reason: 'stop' }] },
    ]
    const raw = [...frames.map((f) => `data: ${JSON.stringify(f)}`), 'data: [DONE]'].join('\n\n')
    const r = extractContent(raw)
    expect(r.content).toBe('{"ok":true}')
    expect(r.finishReason).toBe('stop')
  })

  it('无 choices 包装的业务 JSON 直返不应判为空', () => {
    const raw = '{"title":"A cat","segments":[]}'
    expect(extractContent(raw).content).toBe(raw)
  })

  it('错误响应与空响应不伪装成正文', () => {
    expect(extractContent('').content).toBe('')
    expect(extractContent('{"error":{"message":"bad model"}}').content).toBe('')
  })
})
