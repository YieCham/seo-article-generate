import type { AppConfig, LlmModelRef, LlmPreset, LlmRoleRoutingConfig } from '../../env.d'
import { LlmModelIcon } from '../../components/LlmBrandIcon'
import { resolveLlmBrandFromModel } from '../../utils/llmIcons'

interface LlmRoleRoutingPanelProps {
  config: AppConfig
  onConfigChange: (config: AppConfig) => void
  onPersistRouting: (routing: LlmRoleRoutingConfig) => void
}

interface ModelOption {
  value: string
  presetId: string
  model: string
  label: string
}

function encodeModelValue(ref: LlmModelRef): string {
  if (!ref.presetId || !ref.model) return ''
  return `${ref.presetId}::${ref.model}`
}

function decodeModelValue(value: string): LlmModelRef {
  const sep = value.indexOf('::')
  if (sep <= 0) return { presetId: '', model: '' }
  return {
    presetId: value.slice(0, sep),
    model: value.slice(sep + 2)
  }
}

function collectModelOptions(presets: LlmPreset[]): ModelOption[] {
  const options: ModelOption[] = []
  for (const preset of presets) {
    for (const model of preset.models) {
      if (!model.trim()) continue
      options.push({
        value: encodeModelValue({ presetId: preset.id, model }),
        presetId: preset.id,
        model,
        label: `${preset.name} · ${model}`
      })
    }
  }
  return options
}

function RoleModelSelect({
  id,
  label,
  hint,
  value,
  options,
  onChange
}: {
  id: string
  label: string
  hint: string
  value: LlmModelRef
  options: ModelOption[]
  onChange: (next: LlmModelRef) => void
}) {
  const encoded = encodeModelValue(value)
  const valid = options.some((item) => item.value === encoded)

  return (
    <div className="llm-role-field">
      <label htmlFor={id}>{label}</label>
      <p className="field-hint">{hint}</p>
      <div className="llm-role-select-row">
        {value.model ? (
          <LlmModelIcon
            model={value.model}
            brand={resolveLlmBrandFromModel(value.model)}
            size={20}
            className="llm-role-model-icon"
          />
        ) : null}
        <select
          id={id}
          value={valid ? encoded : ''}
          onChange={(e) => onChange(decodeModelValue(e.target.value))}
        >
          <option value="">使用对话所选模型</option>
          {options.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

export default function LlmRoleRoutingPanel({
  config,
  onConfigChange,
  onPersistRouting
}: LlmRoleRoutingPanelProps) {
  const routing = config.llmRoleRouting ?? {
    enabled: false,
    preBodyAndMeta: { presetId: '', model: '' },
    bodyWork: { presetId: '', model: '' }
  }
  const options = collectModelOptions(config.llmPresets)

  function patchRouting(
    partial: Partial<{
      enabled: boolean
      preBodyAndMeta: LlmModelRef
      bodyWork: LlmModelRef
    }>
  ): void {
    const nextRouting: LlmRoleRoutingConfig = {
      ...routing,
      ...partial,
      preBodyAndMeta: partial.preBodyAndMeta ?? routing.preBodyAndMeta,
      bodyWork: partial.bodyWork ?? routing.bodyWork
    }
    onConfigChange({
      ...config,
      llmRoleRouting: nextRouting
    })
    onPersistRouting(nextRouting)
  }

  return (
    <>
      <label className="skill-toggle inline-toggle">
        <input
          type="checkbox"
          className="toggle-input"
          checked={routing.enabled}
          onChange={(e) => patchRouting({ enabled: e.target.checked })}
        />
        <span className="toggle-switch" aria-hidden="true" />
        <span className="toggle-label">启用多模型分工</span>
      </label>

      {routing.enabled ? (
        <div className="llm-role-routing-body">
          <RoleModelSelect
            id="llmRolePreBody"
            label="正文前工作 + Meta"
            hint="用于：搜索意图、竞品/E-E-A-T 萃取、写作简报、规划、SEO Meta。"
            value={routing.preBodyAndMeta}
            options={options}
            onChange={(preBodyAndMeta) => patchRouting({ preBodyAndMeta })}
          />
          <RoleModelSelect
            id="llmRoleBodyWork"
            label="正文与润色"
            hint="用于：大纲、分段撰写、润色、词数校准；文章优化中的大纲、分节改写与终稿校对同理。"
            value={routing.bodyWork}
            options={options}
            onChange={(bodyWork) => patchRouting({ bodyWork })}
          />
          {options.length === 0 ? (
            <p className="field-hint">请先在上方预设中添加可用模型，再配置分工。</p>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
