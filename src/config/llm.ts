/**
 * 大模型（LLM）连接配置 + 模型列表。
 *
 * 系统默认模型由应用内置，只读、不可编辑、不可查看详情；
 * 用户可添加任意 OpenAI 兼容的自定义模型，并选中其中一个作为生成课程时使用的模型。
 *
 * 注意：内置 API Key 会随 APK 分发、可被反编译提取，务必使用带额度限制的 Key；
 * 若改为公开分发，建议改由服务端代理转发并做配额控制。
 *
 * 本模块只负责「连哪个服务、用什么凭据」。教学内容参数（每篇重点词数、难度等）
 * 由 src/lib/planner.ts 依据学习者画像动态推荐，不属于连接配置。
 */

export interface LlmConfig {
  /** OpenAI 兼容基地址，末尾不带 /chat/completions */
  baseUrl: string
  apiKey: string
  model: string
}

export const DEFAULT_LLM_CONFIG: LlmConfig = {
  baseUrl: 'https://api.agnes-ai.cn/v1',
  apiKey: 'sk-aEU1HGX7B9EyIxOztZEiv8Zj7iZYbgejgzq0zkwkqqxDBunC',
  model: 'agnes-3.0-flash',
}

export const SYSTEM_MODEL_ID = '__system_default__'

export interface ModelEntry {
  id: string
  name: string
  config: LlmConfig
  /** 系统内置默认项：不可编辑、不可删除、不可查看详情 */
  isSystem: boolean
  createdAt: number
}

export const SYSTEM_MODEL: ModelEntry = {
  id: SYSTEM_MODEL_ID,
  name: '默认',
  config: DEFAULT_LLM_CONFIG,
  isSystem: true,
  createdAt: 0,
}

/** 自定义模型列表 */
const MODELS_KEY = 'lexicore-ai-models'
/** 当前选中的模型 id */
const ACTIVE_KEY = 'lexicore-ai-active-model'
/** 旧版单配置存储键，仅用于一次性迁移 */
export const LLM_CONFIG_STORAGE_KEY = 'lexicore-ai-config'
/** 选中模型变化时广播，供已挂载的 AI 页面即时刷新 */
export const LLM_CONFIG_CHANGED_EVENT = 'lexicore-llm-config-changed'

function normalize(cfg: LlmConfig): LlmConfig {
  return {
    baseUrl: (cfg.baseUrl || '').trim().replace(/\/+$/, ''),
    apiKey: (cfg.apiKey || '').trim(),
    model: (cfg.model || '').trim(),
  }
}

export function isConfigReady(cfg: LlmConfig): boolean {
  return !!cfg.baseUrl && !!cfg.apiKey && !!cfg.model
}

function newId(): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  return uuid ?? `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function readCustomModels(): ModelEntry[] {
  let custom: ModelEntry[] = []
  try {
    const raw = localStorage.getItem(MODELS_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        custom = parsed
          .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
          .filter((m) => typeof m.id === 'string' && m.id !== SYSTEM_MODEL_ID && !!m.config)
          .map((m) => {
            const c = m.config as LlmConfig
            return {
              id: m.id as string,
              name: typeof m.name === 'string' && m.name.trim() ? m.name : '自定义模型',
              config: normalize(c),
              isSystem: false,
              createdAt: typeof m.createdAt === 'number' ? m.createdAt : 0,
            }
          })
      }
    }
    // 旧版单配置迁移：有可用 Key 且与内置默认不同，转成一条自定义模型并设为选中。
    const legacy = localStorage.getItem(LLM_CONFIG_STORAGE_KEY)
    if (legacy) {
      const parsed = JSON.parse(legacy) as Partial<LlmConfig>
      const cfg = normalize({ ...DEFAULT_LLM_CONFIG, ...parsed })
      const differs =
        cfg.baseUrl !== DEFAULT_LLM_CONFIG.baseUrl ||
        cfg.apiKey !== DEFAULT_LLM_CONFIG.apiKey ||
        cfg.model !== DEFAULT_LLM_CONFIG.model
      if (cfg.apiKey && differs) {
        custom.push({
          id: newId(),
          name: '我的模型',
          config: cfg,
          isSystem: false,
          createdAt: Date.now(),
        })
        localStorage.setItem(ACTIVE_KEY, custom[custom.length - 1].id)
      }
      localStorage.removeItem(LLM_CONFIG_STORAGE_KEY)
      localStorage.setItem(MODELS_KEY, JSON.stringify(custom))
    }
  } catch {
    custom = []
  }
  return custom
}

function writeCustomModels(models: ModelEntry[]): void {
  localStorage.setItem(MODELS_KEY, JSON.stringify(models.filter((m) => !m.isSystem)))
}

/** 列表首项恒为系统默认模型。 */
export function listModels(): ModelEntry[] {
  return [SYSTEM_MODEL, ...readCustomModels()]
}

export function getActiveModelId(): string {
  let id: string
  try {
    id = localStorage.getItem(ACTIVE_KEY) || SYSTEM_MODEL_ID
  } catch {
    return SYSTEM_MODEL_ID
  }
  if (id === SYSTEM_MODEL_ID) return id
  return readCustomModels().some((m) => m.id === id) ? id : SYSTEM_MODEL_ID
}

export function getActiveModel(): ModelEntry {
  const id = getActiveModelId()
  return listModels().find((m) => m.id === id) ?? SYSTEM_MODEL
}

/** 选中模型；非法 id 或系统项之外不存在模型时忽略。 */
export function setActiveModelId(id: string): void {
  const target = listModels().find((m) => m.id === id)
  if (!target) return
  localStorage.setItem(ACTIVE_KEY, target.id)
  window.dispatchEvent(new Event(LLM_CONFIG_CHANGED_EVENT))
}

export function addCustomModel(input: { name: string } & LlmConfig): ModelEntry {
  const entry: ModelEntry = {
    id: newId(),
    name: input.name.trim() || '自定义模型',
    config: normalize(input),
    isSystem: false,
    createdAt: Date.now(),
  }
  writeCustomModels([...readCustomModels(), entry])
  return entry
}

/** 系统默认项不可修改，返回 false。 */
export function updateCustomModel(id: string, input: { name: string } & LlmConfig): boolean {
  if (id === SYSTEM_MODEL_ID) return false
  const models = readCustomModels()
  const idx = models.findIndex((m) => m.id === id)
  if (idx < 0) return false
  models[idx] = {
    ...models[idx],
    name: input.name.trim() || '自定义模型',
    config: normalize(input),
  }
  writeCustomModels(models)
  return true
}

/** 删除自定义模型；若删的是当前选中项，自动回退到系统默认。 */
export function removeCustomModel(id: string): boolean {
  if (id === SYSTEM_MODEL_ID) return false
  const models = readCustomModels()
  const next = models.filter((m) => m.id !== id)
  if (next.length === models.length) return false
  writeCustomModels(next)
  if (getActiveModelId() === id) {
    localStorage.setItem(ACTIVE_KEY, SYSTEM_MODEL_ID)
    window.dispatchEvent(new Event(LLM_CONFIG_CHANGED_EVENT))
  }
  return true
}

/** 供 AI 生成链路使用：始终返回当前选中模型的连接配置。 */
export function loadLlmConfig(): LlmConfig {
  return { ...getActiveModel().config }
}

/** 兼容旧调用：更新当前选中的自定义模型，若当前是系统默认则创建一条自定义模型。 */
export function saveLlmConfig(cfg: LlmConfig): void {
  const active = getActiveModel()
  if (active.isSystem) {
    const created = addCustomModel({ name: '我的模型', ...cfg })
    setActiveModelId(created.id)
    return
  }
  updateCustomModel(active.id, { name: active.name, ...cfg })
}
