import type { AppConfig, ImageGenConfig } from '../../env.d'

interface ImageGenPanelProps {
  config: AppConfig
  saving: boolean
  onConfigChange: (config: AppConfig) => void
  onSave: () => void
}

const SIZE_PRESETS = ['1024x1024', '1024x1536', '1536x1024', '512x512']

export default function ImageGenPanel({
  config,
  saving,
  onConfigChange,
  onSave
}: ImageGenPanelProps) {
  const imageGen: ImageGenConfig = config.imageGen ?? {
    apiUrl: 'https://uuapi.net/v1/images/generations',
    apiKey: '',
    model: 'gpt-image-2.5',
    size: '1024x1024',
    defaultPrompt: ''
  }

  function patch(partial: Partial<ImageGenConfig>): void {
    onConfigChange({
      ...config,
      imageGen: { ...imageGen, ...partial }
    })
  }

  return (
    <>
      <p className="field-hint" style={{ marginTop: 0 }}>
        文生图使用下方地址（/v1/images/generations）。图生图、编辑和「保持风格」会自动改用同主机的
        /v1/images/edits。
      </p>

      <label>
        文生图 API 地址（完整 URL）
        <input
          type="text"
          value={imageGen.apiUrl}
          onChange={(event) => patch({ apiUrl: event.target.value })}
          placeholder="https://uuapi.net/v1/images/generations"
          autoComplete="off"
        />
      </label>

      <label>
        API Key
        <input
          type="password"
          value={imageGen.apiKey}
          onChange={(event) => patch({ apiKey: event.target.value })}
          placeholder="sk-…"
          autoComplete="off"
        />
      </label>

      <div className="form-row">
        <label>
          模型
          <input
            type="text"
            value={imageGen.model}
            onChange={(event) => patch({ model: event.target.value })}
            placeholder="gpt-image-2.5"
            autoComplete="off"
          />
        </label>
        <label>
          默认尺寸
          <select
            className="select-input"
            value={SIZE_PRESETS.includes(imageGen.size) ? imageGen.size : '__custom__'}
            onChange={(event) => {
              if (event.target.value === '__custom__') {
                patch({ size: SIZE_PRESETS.includes(imageGen.size) ? '' : imageGen.size })
                return
              }
              patch({ size: event.target.value })
            }}
          >
            {SIZE_PRESETS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
            <option value="__custom__">自定义…</option>
          </select>
        </label>
      </div>

      {!SIZE_PRESETS.includes(imageGen.size) ? (
        <label>
          自定义尺寸
          <input
            type="text"
            value={imageGen.size}
            onChange={(event) => patch({ size: event.target.value })}
            placeholder="1024x1024"
            autoComplete="off"
          />
        </label>
      ) : null}

      <label>
        文章封面提示词（可选）
        <textarea
          rows={4}
          value={imageGen.defaultPrompt}
          onChange={(event) => patch({ defaultPrompt: event.target.value })}
          placeholder="点击绘图页「文章封面」时填入的 prompt"
        />
      </label>

      <div className="actions">
        <button type="button" disabled={saving} onClick={onSave}>
          保存绘图设置
        </button>
      </div>
    </>
  )
}
