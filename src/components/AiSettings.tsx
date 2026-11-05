import { useState, type ReactNode } from 'react'
import {
  addCustomModel,
  getActiveModelId,
  isConfigReady,
  listModels,
  removeCustomModel,
  setActiveModelId,
  updateCustomModel,
  type LlmConfig,
  type ModelEntry,
} from '../config/llm'
import { chatJSON, llmErrorMessage } from '../lib/llm'
import { buildTestMessages } from '../lib/prompt'
import { ActionSheet, Sheet } from './Sheet'
import {
  CheckIcon,
  EditIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  PlusIcon,
  SpinnerIcon,
  TrashIcon,
} from './icons'

type OnToast = (msg: string, type?: 'success' | 'error' | 'info') => void
type ModelInput = { name: string } & LlmConfig
type EditorState = { mode: 'add' } | { mode: 'edit'; model: ModelEntry }

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url || '未设置'
  }
}

/**
 * 模型列表配置。
 * - 首项恒为系统默认模型，只可启用，不可修改 / 删除 / 查看详情
 * - 自定义模型支持新增、编辑、删除、测试连接
 * - 点击卡片选中，选中项即 AI 生成课程时使用的配置
 */
export function AiSettingsFields({ onToast }: { onToast: OnToast }) {
  const [models, setModels] = useState<ModelEntry[]>(listModels)
  const [activeId, setActiveId] = useState<string>(getActiveModelId)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ModelEntry | null>(null)

  const refresh = () => {
    setModels(listModels())
    setActiveId(getActiveModelId())
  }

  const openAdd = () => {
    setEditor({ mode: 'add' })
    setEditorOpen(true)
  }

  const openEdit = (model: ModelEntry) => {
    setEditor({ mode: 'edit', model })
    setEditorOpen(true)
  }

  const handleSelect = (model: ModelEntry) => {
    if (model.id === activeId) return
    setActiveModelId(model.id)
    setActiveId(model.id)
    onToast(`已启用「${model.name}」生成课程`, 'success')
  }

  const handleSave = (input: ModelInput) => {
    if (editor?.mode === 'edit') {
      updateCustomModel(editor.model.id, input)
      onToast('模型配置已更新', 'success')
    } else {
      const created = addCustomModel(input)
      onToast(`已添加「${created.name}」，点击卡片即可启用`, 'success')
    }
    refresh()
    setEditorOpen(false)
  }

  const handleDelete = () => {
    if (!deleteTarget) return
    const name = deleteTarget.name
    removeCustomModel(deleteTarget.id)
    refresh()
    setDeleteTarget(null)
    onToast(`已删除「${name}」`, 'info')
  }

  const current = models.find((m) => m.id === activeId) ?? models[0]

  return (
    <>
      <div className="mb-3 rounded-[18px] border border-slate-200/60 bg-white/60 px-3.5 py-3 dark:border-slate-700/50 dark:bg-slate-800/40">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">当前启用</p>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-white">
            <CheckIcon width={13} height={13} />
          </span>
          <span className="font-display text-[15px] font-semibold text-slate-900 dark:text-slate-50">
            {current.name}
          </span>
          {current.isSystem && <Badge tone="system">系统默认</Badge>}
          <span className="ml-auto truncate text-[11px] text-slate-400">
            {current.isSystem ? '内置模型' : current.config.model}
          </span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
          点击模型卡片即可切换。系统默认模型由应用内置，仅可启用，不可修改或查看详情；
          自定义模型支持任意 OpenAI 兼容接口。
        </p>
      </div>

      <div role="radiogroup" aria-label="模型列表" className="space-y-2.5">
        {models.map((model) => {
          const selected = model.id === activeId
          const ready = isConfigReady(model.config)
          return (
            <div
              key={model.id}
              role="radio"
              aria-checked={selected}
              aria-label={`${model.name}${model.isSystem ? '，系统默认' : '，自定义'}`}
              tabIndex={0}
              onClick={() => handleSelect(model)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleSelect(model)
                }
              }}
              className={`flex cursor-pointer items-start gap-3 rounded-[20px] border p-3.5 text-left transition duration-200 active:scale-[0.995] ${
                selected
                  ? 'border-brand-400 bg-brand-50/70 shadow-soft dark:border-brand-500/60 dark:bg-brand-500/10'
                  : 'border-slate-200/70 bg-white/70 hover:border-slate-300 dark:border-slate-700/50 dark:bg-slate-800/40'
              }`}
            >
              <span
                aria-hidden="true"
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition ${
                  selected
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-slate-300 bg-transparent dark:border-slate-600'
                }`}
              >
                {selected && <CheckIcon width={12} height={12} />}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-display text-[15px] font-semibold text-slate-900 dark:text-slate-50">
                    {model.name}
                  </span>
                  {model.isSystem ? <Badge tone="system">系统默认</Badge> : <Badge tone="custom">自定义</Badge>}
                  {selected && <Badge tone="active">使用中</Badge>}
                </div>
                <p className="mt-1 truncate text-[12px] text-slate-500 dark:text-slate-400">
                  {model.isSystem
                    ? '应用内置配置'
                    : `${model.config.model || '未设置模型'} · ${hostOf(model.config.baseUrl)}`}
                </p>
                <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500">
                  {model.isSystem ? (
                    <>
                      <LockIcon width={11} height={11} />
                      只读 · 不可修改或查看详情
                    </>
                  ) : ready ? (
                    'OpenAI 兼容接口 · 可编辑'
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400">配置不完整，暂不可用于生成</span>
                  )}
                </p>
              </div>

              {model.isSystem ? (
                <LockIcon width={16} height={16} className="mt-0.5 shrink-0 text-slate-300 dark:text-slate-600" />
              ) : (
                <button
                  type="button"
                  aria-label={`编辑 ${model.name}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    openEdit(model)
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="icon-btn !h-8 !w-8 shrink-0"
                >
                  <EditIcon width={15} height={15} />
                </button>
              )}
            </div>
          )
        })}
      </div>

      <button
        type="button"
        onClick={openAdd}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-[20px] border-2 border-dashed border-slate-300/80 bg-white/40 py-3.5 text-[13px] font-semibold text-slate-500 transition hover:border-brand-400 hover:bg-brand-50/40 hover:text-brand-600 active:scale-[0.995] dark:border-slate-600 dark:bg-slate-800/30 dark:text-slate-300 dark:hover:border-brand-500/60"
      >
        <PlusIcon width={17} height={17} />
        添加自定义模型
      </button>

      <Sheet
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editor?.mode === 'edit' ? '编辑模型' : '添加自定义模型'}
        subtitle="OpenAI 兼容接口，配置仅保存在本机"
      >
        {editor && (
          <ModelForm
            key={editor.mode === 'edit' ? editor.model.id : 'add'}
            initial={editor.mode === 'edit' ? editor.model : undefined}
            onToast={onToast}
            onSave={handleSave}
            onCancel={() => setEditorOpen(false)}
            onDelete={
              editor.mode === 'edit'
                ? () => {
                    setDeleteTarget(editor.model)
                    setEditorOpen(false)
                  }
                : undefined
            }
          />
        )}
      </Sheet>

      <ActionSheet
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="删除模型？"
        message={`「${deleteTarget?.name ?? ''}」的配置将从本机移除。若它正在使用，会自动切换回系统默认模型。`}
        actions={[
          {
            label: '删除模型',
            tone: 'danger',
            icon: <TrashIcon width={18} height={18} />,
            onClick: handleDelete,
          },
          { label: '取消', onClick: () => setDeleteTarget(null) },
        ]}
      />
    </>
  )
}

function Badge({ tone, children }: { tone: 'system' | 'custom' | 'active'; children: ReactNode }) {
  const cls =
    tone === 'system'
      ? 'border-amber-300/70 bg-amber-100/70 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300'
      : tone === 'active'
        ? 'border-brand-500/50 bg-brand-600 text-white dark:border-brand-400/40 dark:bg-brand-500'
        : 'border-slate-300/70 bg-slate-100/80 text-slate-600 dark:border-slate-600 dark:bg-slate-700/60 dark:text-slate-300'
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold leading-tight ${cls}`}>
      {children}
    </span>
  )
}

function ModelForm({
  initial,
  onToast,
  onSave,
  onCancel,
  onDelete,
}: {
  initial?: ModelEntry
  onToast: OnToast
  onSave: (input: ModelInput) => void
  onCancel: () => void
  onDelete?: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [baseUrl, setBaseUrl] = useState(initial?.config.baseUrl ?? '')
  const [apiKey, setApiKey] = useState(initial?.config.apiKey ?? '')
  const [model, setModel] = useState(initial?.config.model ?? '')
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)

  const valid = [name, baseUrl, apiKey, model].every((v) => v.trim().length > 0)

  const testConnection = async () => {
    if (!valid || testing) return
    setTesting(true)
    try {
      await chatJSON(
        { baseUrl, apiKey, model },
        buildTestMessages(),
        { maxTokens: 128, temperature: 0, timeoutMs: 30_000 },
      )
      onToast('连接成功，配置可用', 'success')
    } catch (e) {
      onToast(`连接失败：${llmErrorMessage(e)}`, 'error')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-3.5 pt-1">
      <Field label="名称" value={name} onChange={setName} placeholder="例如：我的 GPT-4o" />
      <Field label="API 地址（Base URL）" value={baseUrl} onChange={setBaseUrl} placeholder="https://api.openai.com/v1" />
      <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
        只填到 /v1 或 /v2 即可，系统会自动拼接 /chat/completions，请勿填完整接口地址（如 …/chat/completions）
      </p>
      <div>
        <Field
          label="API Key"
          value={apiKey}
          onChange={setApiKey}
          placeholder="sk-..."
          type={showKey ? 'text' : 'password'}
        />
        <button
          type="button"
          onClick={() => setShowKey((v) => !v)}
          className="mt-1.5 flex items-center gap-1 text-[11px] text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-200"
        >
          {showKey ? <EyeOffIcon width={13} height={13} /> : <EyeIcon width={13} height={13} />}
          {showKey ? '隐藏密钥' : '显示密钥'}
        </button>
      </div>
      <Field label="模型名" value={model} onChange={setModel} placeholder="gpt-4o-mini" />

      <button
        type="button"
        onClick={testConnection}
        disabled={!valid || testing}
        className="btn-soft w-full disabled:opacity-50"
      >
        {testing ? <SpinnerIcon width={16} height={16} className="animate-spin" /> : <CheckIcon width={16} height={16} />}
        测试连接
      </button>

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className="btn-soft flex-1">
          取消
        </button>
        <button
          type="button"
          onClick={() => onSave({ name, baseUrl, apiKey, model })}
          disabled={!valid}
          className="btn-primary flex-1 disabled:opacity-50"
        >
          保存
        </button>
      </div>

      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="flex w-full items-center justify-center gap-1.5 pt-1 text-[12px] font-semibold text-rose-500 transition hover:text-rose-600 dark:text-rose-400"
        >
          <TrashIcon width={14} height={14} />
          删除此模型
        </button>
      )}
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="field"
        autoComplete="off"
        spellCheck={false}
      />
    </label>
  )
}
