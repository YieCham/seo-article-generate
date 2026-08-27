import { useEffect, useRef, useState } from 'react'
import type { AppConfig, LlmPreset, LlmReasoningEffort } from '../../env.d'
import LlmModelDiscoverDialog from './LlmModelDiscoverDialog'
import { LlmModelIcon } from '../../components/LlmBrandIcon'
import { IconNewPreset } from '../../components/Icons'
import { resolveLlmBrandFromModel } from '../../utils/llmIcons'
import {
  labelForReasoningEffort,
  LLM_REASONING_EFFORT_OPTIONS,
  type LlmReasoningEffortChoice
} from '../../constants/llmReasoningEffort'

const DISCOVER_MODELS_ICON = '/查找大模型.svg'
const TEST_MODEL_ICON = '/连通性测试.svg'
const DELETE_MODEL_ICON = '/删除.svg'
const REASONING_MODEL_ICON = '/思考强度.svg'

interface LlmPresetPanelProps {
  config: AppConfig
  editingPresetId: string
  saving: boolean
  testing: boolean
  testingModel: string
  onConfigChange: (config: AppConfig) => void
  onSave: () => void
  onPersistPresets: (presets: LlmPreset[]) => void | Promise<void>
  onStatus?: (message: string) => void
  onTest: (presetId: string, model: string) => void
  onSelectPreset: (id: string) => void
  onAddPreset: () => void
  onDeletePreset: (id: string) => void
}

function getEditingPreset(config: AppConfig, editingPresetId: string): LlmPreset {
  return (
    config.llmPresets.find((item) => item.id === editingPresetId) ??
    config.llmPresets[0]
  )
}

function resolveModelEffort(
  preset: LlmPreset,
  model: string
): LlmReasoningEffortChoice {
  return preset.modelReasoningEffort?.[model] ?? 'default'
}

export default function LlmPresetPanel({
  config,
  editingPresetId,
  saving,
  testing,
  testingModel,
  onConfigChange,
  onSave,
  onPersistPresets,
  onStatus,
  onTest,
  onSelectPreset,
  onAddPreset,
  onDeletePreset
}: LlmPresetPanelProps) {
  const preset = getEditingPreset(config, editingPresetId)
  const [newModelName, setNewModelName] = useState('')
  const [discoverOpen, setDiscoverOpen] = useState(false)
  const [reasoningMenuModel, setReasoningMenuModel] = useState<string | null>(null)
  const reasoningMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!reasoningMenuModel) return

    function handlePointerDown(event: MouseEvent): void {
      if (!reasoningMenuRef.current?.contains(event.target as Node)) {
        setReasoningMenuModel(null)
      }
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setReasoningMenuModel(null)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [reasoningMenuModel])

  function updatePreset(partial: Partial<LlmPreset>): void {
    onConfigChange({
      ...config,
      llmPresets: config.llmPresets.map((item) =>
        item.id === preset.id ? { ...item, ...partial } : item
      )
    })
  }

  function updatePresetModels(
    models: string[],
    modelReasoningEffort?: LlmPreset['modelReasoningEffort']
  ): LlmPreset[] {
    const nextEffort =
      modelReasoningEffort !== undefined
        ? modelReasoningEffort
        : (() => {
            const modelSet = new Set(models)
            const current = preset.modelReasoningEffort ?? {}
            const cleaned: Record<string, LlmReasoningEffort> = {}
            for (const [model, effort] of Object.entries(current)) {
              if (modelSet.has(model)) cleaned[model] = effort
            }
            return Object.keys(cleaned).length > 0 ? cleaned : undefined
          })()

    const nextPresets = config.llmPresets.map((item) =>
      item.id === preset.id
        ? { ...item, models, modelReasoningEffort: nextEffort }
        : item
    )
    onConfigChange({ ...config, llmPresets: nextPresets })
    return nextPresets
  }

  async function persistPresetModels(
    models: string[],
    modelReasoningEffort?: LlmPreset['modelReasoningEffort']
  ): Promise<boolean> {
    const nextPresets = updatePresetModels(models, modelReasoningEffort)
    try {
      await onPersistPresets(nextPresets)
      return true
    } catch {
      onStatus?.('模型设置保存失败')
      return false
    }
  }

  async function setModelReasoningEffort(
    model: string,
    choice: LlmReasoningEffortChoice
  ): Promise<void> {
    const nextMap: Record<string, LlmReasoningEffort> = {
      ...(preset.modelReasoningEffort ?? {})
    }
    if (choice === 'default') {
      delete nextMap[model]
    } else {
      nextMap[model] = choice
    }
    const ok = await persistPresetModels(
      preset.models,
      Object.keys(nextMap).length > 0 ? nextMap : undefined
    )
    setReasoningMenuModel(null)
    if (!ok) return

    const label = labelForReasoningEffort(choice)
    onStatus?.(
      choice === 'default'
        ? `已清除「${model}」思考强度，恢复接口默认`
        : `已将「${model}」思考强度设为「${label}」`
    )
  }

  function addModelByName(model: string): void {
    const trimmed = model.trim()
    if (!trimmed || preset.models.includes(trimmed)) return
    void persistPresetModels([...preset.models, trimmed])
  }

  function addModel(): void {
    addModelByName(newModelName)
    setNewModelName('')
  }

  function removeModel(model: string): void {
    void persistPresetModels(preset.models.filter((item) => item !== model))
    if (reasoningMenuModel === model) setReasoningMenuModel(null)
  }

  return (
    <>
      <div className="llm-preset-toolbar">
        <label htmlFor="editingPreset">编辑预设</label>
        <select
          id="editingPreset"
          value={preset.id}
          onChange={(e) => onSelectPreset(e.target.value)}
        >
          {config.llmPresets.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="llm-preset-add-btn"
          onClick={onAddPreset}
          aria-label="新建预设"
          title="新建预设"
        >
          <IconNewPreset size={18} />
        </button>
      </div>

      <label htmlFor="presetName">预设名称</label>
      <input
        id="presetName"
        value={preset.name}
        onChange={(e) => updatePreset({ name: e.target.value })}
        placeholder="例如：OpenAI / DeepSeek"
      />

      <label htmlFor="apiKey">API Key</label>
      <input
        id="apiKey"
        type="password"
        value={preset.apiKey}
        onChange={(e) => updatePreset({ apiKey: e.target.value })}
        placeholder="sk-...（留空则使用 .env）"
      />

      <label htmlFor="baseUrl">Base URL</label>
      <input
        id="baseUrl"
        value={preset.baseUrl}
        onChange={(e) => updatePreset({ baseUrl: e.target.value })}
        placeholder="https://api.openai.com/v1"
      />

      <div className="actions llm-preset-actions">
        <button type="button" disabled={saving} onClick={onSave}>
          保存预设
        </button>
        <button
          type="button"
          className="danger"
          disabled={saving || config.llmPresets.length <= 1}
          onClick={() => onDeletePreset(preset.id)}
        >
          删除此预设
        </button>
      </div>

      <label className="llm-model-list-title">模型列表</label>
      <div className="llm-model-list">
        {preset.models.length === 0 ? (
          <p className="llm-model-empty">尚未添加模型</p>
        ) : (
          preset.models.map((model) => {
            const effort = resolveModelEffort(preset, model)
            const effortLabel = labelForReasoningEffort(effort)
            const menuOpen = reasoningMenuModel === model

            return (
              <div key={model} className="llm-model-item">
                <div className="llm-model-item-main">
                  <LlmModelIcon
                    model={model}
                    brand={resolveLlmBrandFromModel(model)}
                    size={16}
                    className="llm-model-item-icon"
                  />
                  <span className="llm-model-name">{model}</span>
                  {effort !== 'default' ? (
                    <span className="llm-model-effort-badge" title={`思考强度：${effortLabel}`}>
                      {effortLabel}
                    </span>
                  ) : null}
                </div>
                <div className="llm-model-item-actions">
                  <div className="llm-model-reasoning-wrap" ref={menuOpen ? reasoningMenuRef : undefined}>
                    <button
                      type="button"
                      className={`llm-model-icon-btn llm-model-reasoning${effort !== 'default' ? ' is-active' : ''}${menuOpen ? ' is-open' : ''}`}
                      disabled={testing}
                      onClick={() =>
                        setReasoningMenuModel((current) => (current === model ? null : model))
                      }
                      aria-label={`设置 ${model} 思考强度（当前：${effortLabel}）`}
                      aria-expanded={menuOpen}
                      aria-haspopup="menu"
                      title={`思考强度：${effortLabel}`}
                    >
                      <img src={REASONING_MODEL_ICON} alt="" width={16} height={16} />
                    </button>
                    {menuOpen ? (
                      <div className="ui-menu llm-reasoning-menu" role="menu" aria-label={`${model} 思考强度`}>
                        <p className="llm-reasoning-menu-title">思考强度</p>
                        <p className="llm-reasoning-menu-note">
                          使用该模型时全局生效；仅推理模型支持，普通模型设置后可能被接口忽略或报错。
                        </p>
                        {LLM_REASONING_EFFORT_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            role="menuitemradio"
                            aria-checked={effort === option.value}
                            className={`llm-reasoning-menu-item${effort === option.value ? ' is-selected' : ''}`}
                            onClick={() => void setModelReasoningEffort(model, option.value)}
                          >
                            <span className="llm-reasoning-menu-item-label">{option.label}</span>
                            <span className="llm-reasoning-menu-item-hint">{option.hint}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className={`llm-model-icon-btn llm-model-test${testing && testingModel === model ? ' is-testing' : ''}`}
                    disabled={testing}
                    onClick={() => onTest(preset.id, model)}
                    aria-label={testing && testingModel === model ? `正在测试 ${model}` : `测试 ${model}`}
                    title={testing && testingModel === model ? '测试中…' : '测试连通性'}
                  >
                    <img src={TEST_MODEL_ICON} alt="" width={16} height={16} />
                  </button>
                  <button
                    type="button"
                    className="llm-model-icon-btn llm-model-remove"
                    onClick={() => removeModel(model)}
                    disabled={testing}
                    aria-label={`删除 ${model}`}
                    title="删除模型"
                  >
                    <img src={DELETE_MODEL_ICON} alt="" width={16} height={16} />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
      <div className="llm-model-add">
        <input
          value={newModelName}
          onChange={(e) => setNewModelName(e.target.value)}
          placeholder="例如：gpt-4o、claude-sonnet-4"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addModel()
            }
          }}
        />
        <button
          type="button"
          className="secondary llm-model-add-btn"
          onClick={addModel}
          disabled={!newModelName.trim()}
        >
          添加模型
        </button>
        <button
          type="button"
          className="llm-model-discover-btn"
          onClick={() => setDiscoverOpen(true)}
          aria-label="检索模型"
          title="检索模型"
        >
          <img src={DISCOVER_MODELS_ICON} alt="" width={18} height={18} />
        </button>
      </div>

      <LlmModelDiscoverDialog
        open={discoverOpen}
        presetId={preset.id}
        existingModels={preset.models}
        onClose={() => setDiscoverOpen(false)}
        onAddModel={addModelByName}
      />
    </>
  )
}
