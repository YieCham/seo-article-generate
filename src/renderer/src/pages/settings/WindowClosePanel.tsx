import type { AppConfig } from '../../env.d'
import {
  WINDOW_CLOSE_MODE_OPTIONS,
  windowCloseBehaviorFromMode,
  windowCloseModeFromBehavior
} from '../../constants/windowClose'

interface WindowClosePanelProps {
  config: AppConfig
  saving: boolean
  onConfigChange: (config: AppConfig) => void
  onSave: () => void
}

export default function WindowClosePanel({
  config,
  saving,
  onConfigChange,
  onSave
}: WindowClosePanelProps) {
  const mode = windowCloseModeFromBehavior(config.windowClose)

  return (
    <>
      <p className="field-hint" style={{ marginTop: 0 }}>
        与关闭窗口时的确认弹窗同步。若在弹窗中勾选「以后不再提示」，此处会自动更新为对应的默认行为。
      </p>

      <fieldset className="window-close-options">
        <legend className="sr-only">关闭窗口时的行为</legend>
        {WINDOW_CLOSE_MODE_OPTIONS.map((option) => (
          <label key={option.value} className="window-close-option">
            <input
              type="radio"
              name="windowCloseMode"
              value={option.value}
              checked={mode === option.value}
              onChange={() =>
                onConfigChange({
                  ...config,
                  windowClose: windowCloseBehaviorFromMode(option.value)
                })
              }
            />
            <span className="window-close-option-body">
              <span className="window-close-option-label">{option.label}</span>
              <span className="window-close-option-hint">{option.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="actions">
        <button type="button" disabled={saving} onClick={onSave}>
          保存关闭设置
        </button>
      </div>
    </>
  )
}
