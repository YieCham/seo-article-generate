import type { AppConfig } from '../../env.d'
import { DEFAULT_LLM_MAX_TOKENS, STEP_TOKEN_CAPS } from '../../constants/llmTokenLimits'

interface LlmMaxTokensPanelProps {
  config: AppConfig
  saving: boolean
  onConfigChange: (config: AppConfig) => void
  onSave: () => void
}

export default function LlmMaxTokensPanel({
  config,
  saving,
  onConfigChange,
  onSave
}: LlmMaxTokensPanelProps) {
  return (
    <>
      <label htmlFor="llmMaxTokens">全局 max_tokens 上限</label>
      <input
        id="llmMaxTokens"
        type="number"
        min={1024}
        max={128000}
        step={512}
        value={config.llmMaxTokens}
        onChange={(e) =>
          onConfigChange({
            ...config,
            llmMaxTokens: Number(e.target.value)
          })
        }
      />
      <p className="field-hint">
        全局上限：创作/优化 Pipeline 中每次 LLM 请求的实际 max_tokens 为 min(步骤上限, 全局上限)。默认{' '}
        {DEFAULT_LLM_MAX_TOKENS.toLocaleString()}；模型上下文较小时请适当调低。
      </p>
      <details className="field-hint" style={{ marginTop: '0.5rem' }}>
        <summary>各步骤默认输出上限</summary>
        <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem', fontSize: '0.9em' }}>
          {Object.entries(STEP_TOKEN_CAPS).map(([step, cap]) => (
            <li key={step}>
              {step}: {cap.toLocaleString()}
            </li>
          ))}
        </ul>
      </details>

      <div className="actions">
        <button type="button" disabled={saving} onClick={onSave}>
          保存 Token 设置
        </button>
        <button
          type="button"
          className="secondary"
          disabled={saving}
          onClick={() =>
            onConfigChange({
              ...config,
              llmMaxTokens: DEFAULT_LLM_MAX_TOKENS
            })
          }
        >
          恢复默认
        </button>
      </div>
    </>
  )
}
