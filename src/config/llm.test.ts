// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_LLM_CONFIG,
  LLM_CONFIG_CHANGED_EVENT,
  SYSTEM_MODEL,
  SYSTEM_MODEL_ID,
  addCustomModel,
  getActiveModel,
  getActiveModelId,
  isConfigReady,
  listModels,
  loadLlmConfig,
  removeCustomModel,
  setActiveModelId,
  updateCustomModel,
} from './llm'

const custom = {
  name: '我的 GPT',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: 'sk-test-key',
  model: 'gpt-4o-mini',
}

describe('模型列表与启用状态', () => {
  beforeEach(() => localStorage.clear())

  it('首项恒为系统默认模型，且不可修改 / 删除', () => {
    const models = listModels()
    expect(models[0].id).toBe(SYSTEM_MODEL_ID)
    expect(models[0].name).toBe('默认')
    expect(models[0].isSystem).toBe(true)
    expect(isConfigReady(models[0].config)).toBe(true)
    expect(updateCustomModel(SYSTEM_MODEL_ID, custom)).toBe(false)
    expect(removeCustomModel(SYSTEM_MODEL_ID)).toBe(false)
    expect(listModels()[0]).toEqual(SYSTEM_MODEL)
  })

  it('默认启用系统默认模型', () => {
    expect(getActiveModelId()).toBe(SYSTEM_MODEL_ID)
    expect(loadLlmConfig()).toEqual(DEFAULT_LLM_CONFIG)
  })

  it('添加自定义模型不会自动改变当前启用项', () => {
    const created = addCustomModel(custom)
    expect(listModels()).toHaveLength(2)
    expect(getActiveModelId()).toBe(SYSTEM_MODEL_ID)
    expect(created.config.baseUrl).toBe('https://api.openai.com/v1')
    expect(created.name).toBe('我的 GPT')
  })

  it('选中后启用状态与生成配置立即反映', () => {
    const created = addCustomModel(custom)
    let fired = 0
    const onChanged = () => { fired += 1 }
    window.addEventListener(LLM_CONFIG_CHANGED_EVENT, onChanged)

    setActiveModelId(created.id)
    expect(fired).toBe(1)
    expect(getActiveModelId()).toBe(created.id)
    expect(getActiveModel().name).toBe('我的 GPT')
    expect(loadLlmConfig()).toEqual({
      baseUrl: custom.baseUrl,
      apiKey: custom.apiKey,
      model: custom.model,
    })
    window.removeEventListener(LLM_CONFIG_CHANGED_EVENT, onChanged)
  })

  it('不存在的 id 不会被选中', () => {
    setActiveModelId('not-exist')
    expect(getActiveModelId()).toBe(SYSTEM_MODEL_ID)
  })

  it('编辑自定义模型保留 id，且不影响系统默认项', () => {
    const created = addCustomModel(custom)
    expect(
      updateCustomModel(created.id, { ...custom, name: '改名后', model: 'gpt-4o' }),
    ).toBe(true)
    const edited = listModels().find((m) => m.id === created.id)
    expect(edited?.name).toBe('改名后')
    expect(edited?.config.model).toBe('gpt-4o')
    expect(listModels()[0]).toEqual(SYSTEM_MODEL)
  })

  it('删除当前启用项后自动回退到系统默认', () => {
    const created = addCustomModel(custom)
    setActiveModelId(created.id)
    expect(getActiveModelId()).toBe(created.id)
    expect(removeCustomModel(created.id)).toBe(true)
    expect(getActiveModelId()).toBe(SYSTEM_MODEL_ID)
    expect(loadLlmConfig()).toEqual(DEFAULT_LLM_CONFIG)
  })

  it('损坏的持久化数据回退到系统默认', () => {
    localStorage.setItem('lexicore-ai-models', '{not json')
    localStorage.setItem('lexicore-ai-active-model', 'ghost-id')
    expect(listModels()).toHaveLength(1)
    expect(getActiveModelId()).toBe(SYSTEM_MODEL_ID)
  })

  it('旧版单配置迁移为自定义模型并设为启用', () => {
    localStorage.setItem(
      'lexicore-ai-config',
      JSON.stringify({ baseUrl: custom.baseUrl, apiKey: custom.apiKey, model: custom.model }),
    )
    const models = listModels()
    expect(models).toHaveLength(2)
    expect(models[1].name).toBe('我的模型')
    expect(getActiveModelId()).toBe(models[1].id)
    expect(localStorage.getItem('lexicore-ai-config')).toBeNull()
  })
})
