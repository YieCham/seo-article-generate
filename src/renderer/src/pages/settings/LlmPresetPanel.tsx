import { useState } from 'react'
import type { AppConfig, LlmPreset } from '../../env.d'
import LlmModelDiscoverDialog from './LlmModelDiscoverDialog'
import { LlmModelIcon } from '../../components/LlmBrandIcon'
import { resolveLlmBrandFromModel } from '../../utils/llmIcons'

const DISCOVER_MODELS_ICON = '/查找大模型.svg'
const TEST_MODEL_ICON = '/连通性测试.svg'
const DELETE_MODEL_ICON = '/删除.svg'

interface LlmPresetPanelProps {
  config: AppConfig
  editingPresetId: string
  saving: boolean
  testing: boolean
  testingModel: string
  onConfigChange: (config: AppConfig) => void
  onSave: () => void
  onPersistPresets: (presets: LlmPreset[]) => void
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

export default function LlmPresetPanel({
  config,
  editingPresetId,
  saving,
  testing,
  testingModel,
  onConfigChange,
  onSave,
  onPersistPresets,
  onTest,
  onSelectPreset,
  onAddPreset,
  onDeletePreset
}: LlmPresetPanelProps) {
  const preset = getEditingPreset(config, editingPresetId)
  const [newModelName, setNewModelName] = useState('')
  const [discoverOpen, setDiscoverOpen] = useState(false)

  function updatePreset(partial: Partial<LlmPreset>): void {
    onConfigChange({
      ...config,
      llmPresets: config.llmPresets.map((item) =>
        item.id === preset.id ? { ...item, ...partial } : item
      )
    })
  }

  function updatePresetModels(models: string[]): void {
    const nextPresets = config.llmPresets.map((item) =>
      item.id === preset.id ? { ...item, models } : item
    )
    onConfigChange({ ...config, llmPresets: nextPresets })
    onPersistPresets(nextPresets)
  }

  function addModelByName(model: string): void {
    const trimmed = model.trim()
    if (!trimmed || preset.models.includes(trimmed)) return
    updatePresetModels([...preset.models, trimmed])
  }

  function addModel(): void {
    addModelByName(newModelName)
    setNewModelName('')
  }

  function removeModel(model: string): void {
    updatePresetModels(preset.models.filter((item) => item !== model))
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
        <button type="button" className="secondary" onClick={onAddPreset}>
          新建预设
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
          preset.models.map((model) => (
            <div key={model} className="llm-model-item">
              <div className="llm-model-item-main">
                <LlmModelIcon
                  model={model}
                  brand={resolveLlmBrandFromModel(model)}
                  size={16}
                  className="llm-model-item-icon"
                />
                <span className="llm-model-name">{model}</span>
              </div>
              <div className="llm-model-item-actions">
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
          ))
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
