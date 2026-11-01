import { useState } from 'react'
import {
  DEFAULT_LLM_CONFIG,
  isConfigReady,
  loadLlmConfig,
  saveLlmConfig,
  type LlmConfig,
} from '../config/llm'
import { chatJSON, llmErrorMessage } from '../lib/llm'
import { buildTestMessages } from '../lib/prompt'
import { CheckIcon, SpinnerIcon } from './icons'

/** 大模型 API 配置表单（整页内使用；配置只存本机 localStorage，Key 不出设备）。 */
export function AiSettingsFields({
  onToast,
}: {
  onToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}) {
  const [cfg, setCfg] = useState<LlmConfig>(loadLlmConfig)
  const [testing, setTesting] = useState(false)

  const field = (label: string, key: keyof LlmConfig, opts?: { type?: string; placeholder?: string; hint?: string }) => (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</span>
      <input
        type={opts?.type ?? 'text'}
        value={String(cfg[key] ?? '')}
        placeholder={opts?.placeholder}
        onChange={(e) => {
          const v = key === 'wordsPerLesson' ? Number(e.target.value) : e.target.value
          setCfg((prev) => ({ ...prev, [key]: v }))
        }}
        className="field"
      />
      {opts?.hint && <span className="mt-1.5 block text-[11px] text-slate-400">{opts.hint}</span>}
    </label>
  )

  const save = () => {
    if (!isConfigReady(cfg)) {
      onToast('API 地址 / Key / 模型 不能为空', 'error')
      return
    }
    saveLlmConfig(cfg)
    onToast('设置已保存', 'success')
  }

  const test = async () => {
    if (testing) return
    setTesting(true)
    try {
      await chatJSON(cfg, buildTestMessages(), { maxTokens: 128, temperature: 0, timeoutMs: 30_000 })
      onToast('连接成功，配置可用 🎉', 'success')
    } catch (e) {
      onToast(`连接失败：${llmErrorMessage(e)}`, 'error')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-4">
      {field('API 地址（Base URL）', 'baseUrl', {
        placeholder: DEFAULT_LLM_CONFIG.baseUrl,
        hint: '不含 /chat/completions，末尾不带斜杠',
      })}
      {field('API Key', 'apiKey', {
        type: 'password',
        placeholder: 'sk-...',
        hint: '仅存于本机，不会上传',
      })}
      {field('模型名', 'model', { placeholder: DEFAULT_LLM_CONFIG.model })}
      {field('每篇重点词数', 'wordsPerLesson', {
        hint: '建议 15-25；越小篇数越多，越大单篇越长',
      })}

      <button
        onClick={() => setCfg({ ...DEFAULT_LLM_CONFIG })}
        className="text-xs text-slate-400 underline underline-offset-4 transition hover:text-slate-600 dark:hover:text-slate-300"
      >
        恢复内置默认配置
      </button>

      <div className="flex gap-2 pt-1">
        <button onClick={test} disabled={testing} className="btn-soft flex-1 disabled:opacity-60">
          {testing ? (
            <SpinnerIcon width={16} height={16} className="animate-spin" />
          ) : (
            <CheckIcon width={16} height={16} />
          )}
          测试连接
        </button>
        <button onClick={save} className="btn-primary flex-1">
          保存设置
        </button>
      </div>
    </div>
  )
}
