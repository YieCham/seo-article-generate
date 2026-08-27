import type { AppConfig } from '../../env.d'

interface NetworkProxyPanelProps {
  config: AppConfig
  saving: boolean
  onConfigChange: (config: AppConfig) => void
  onSave: () => void
}

const DEFAULT_PROXY = {
  enabled: false,
  host: '127.0.0.1',
  port: 8889
}

export default function NetworkProxyPanel({
  config,
  saving,
  onConfigChange,
  onSave
}: NetworkProxyPanelProps) {
  const proxy = config.networkProxy ?? DEFAULT_PROXY

  function patchProxy(partial: Partial<AppConfig['networkProxy']>): void {
    onConfigChange({
      ...config,
      networkProxy: {
        ...DEFAULT_PROXY,
        ...proxy,
        ...partial
      }
    })
  }

  return (
    <>
      <p className="field-hint" style={{ marginTop: 0 }}>
        开启后，LLM、调研（Tavily / Firecrawl）、绘图等主进程出站请求将经 HTTP 代理转发。默认端口{' '}
        {DEFAULT_PROXY.port}。界面资源（设置图标等）始终直连，不受代理影响。关闭时全部直连。
      </p>

      <label className="skill-toggle inline-toggle">
        <input
          type="checkbox"
          className="toggle-input"
          checked={proxy.enabled}
          onChange={(event) => patchProxy({ enabled: event.target.checked })}
        />
        <span className="toggle-switch" aria-hidden="true" />
        <span className="toggle-label">启用 HTTP 代理</span>
      </label>

      <label htmlFor="networkProxyHost">主机</label>
      <input
        id="networkProxyHost"
        type="text"
        value={proxy.host}
        disabled={!proxy.enabled}
        placeholder="127.0.0.1"
        autoComplete="off"
        onChange={(event) => patchProxy({ host: event.target.value })}
      />

      <label htmlFor="networkProxyPort">端口</label>
      <input
        id="networkProxyPort"
        type="number"
        min={1}
        max={65535}
        value={proxy.port}
        disabled={!proxy.enabled}
        placeholder="8889"
        onChange={(event) => {
          const next = Number(event.target.value)
          patchProxy({ port: Number.isFinite(next) ? next : DEFAULT_PROXY.port })
        }}
      />

      <div className="actions">
        <button type="button" disabled={saving} onClick={onSave}>
          保存代理设置
        </button>
      </div>
    </>
  )
}
