import type { AppConfig, LlmPreset } from '../../env.d'

interface LlmPresetPanelProps {
  config: AppConfig
  editingPresetId: string
  saving: boolean
  testing: boolean
  onConfigChange: (config: AppConfig) => void
  onSave: () => void
  onTest: () => void
  onSwitchActive: (id: string) => void
  onAddPreset: () => void
  onDeletePreset: (id: string) => void
}

function getEditingPreset(config: AppConfig, editingPresetId: string): LlmPreset {
  return (
    config.llmPresets.find((item) => item.id === editingPresetId) ??
    config.llmPresets.find((item) => item.id === config.activeLlmPresetId) ??
    config.llmPresets[0]
  )
}

export default function LlmPresetPanel({
  config,
  editingPresetId,
  saving,
  testing,
  onConfigChange,
  onSave,
  onTest,
  onSwitchActive,
  onAddPreset,
  onDeletePreset
}: LlmPresetPanelProps) {
  const preset = getEditingPreset(config, editingPresetId)

  function updatePreset(partial: Partial<LlmPreset>): void {
    onConfigChange({
      ...config,
      llmPresets: config.llmPresets.map((item) =>
        item.id === preset.id ? { ...item, ...partial } : item
      )
    })
  }

  return (
    <>
      <div className="llm-preset-toolbar">
        <label htmlFor="activePreset">当前使用</label>
        <select
          id="activePreset"
          value={config.activeLlmPresetId}
          onChange={(e) => onSwitchActive(e.target.value)}
        >
          {config.llmPresets.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} ({item.model})
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
        placeholder="例如：Claude Sonnet / DeepSeek"
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

      <div className="form-row">
        <div>
          <label htmlFor="model">模型</label>
          <input
            id="model"
            value={preset.model}
            onChange={(e) => updatePreset({ model: e.target.value })}
            placeholder="gpt-4o"
          />
        </div>
        <div>
          <label htmlFor="temperature">Temperature ({preset.temperature})</label>
          <input
            id="temperature"
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={preset.temperature}
            onChange={(e) => updatePreset({ temperature: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="actions">
        <button type="button" disabled={saving} onClick={onSave}>
          保存预设
        </button>
        <button type="button" className="secondary" disabled={testing} onClick={onTest}>
          {testing ? '测试中…' : '测试当前预设'}
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
    </>
  )
}
