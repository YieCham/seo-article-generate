import { useEffect, useState } from 'react'
import { IconClose, IconMaximize, IconMinimize, IconRestore } from './Icons'

export default function TitleBar() {
  const [maximized, setMaximized] = useState(false)
  const showWinControls = window.app.platform !== 'darwin'

  useEffect(() => {
    void window.app.windowIsMaximized().then(setMaximized)
    return window.app.onWindowMaximized(setMaximized)
  }, [])

  return (
    <header className="title-bar">
      <div className="title-bar-leading">
        <span className="title-bar-brand">AI文章写作助手</span>
      </div>

      <div
        className="title-bar-drag"
        onDoubleClick={() => {
          if (showWinControls) window.app.windowMaximize()
        }}
      />

      {showWinControls && (
        <div className="title-bar-controls">
          <button
            type="button"
            className="title-bar-control"
            aria-label="最小化"
            onClick={() => window.app.windowMinimize()}
          >
            <IconMinimize size={10} />
          </button>
          <button
            type="button"
            className="title-bar-control"
            aria-label={maximized ? '还原' : '最大化'}
            onClick={() => window.app.windowMaximize()}
          >
            {maximized ? <IconRestore size={10} /> : <IconMaximize size={10} />}
          </button>
          <button
            type="button"
            className="title-bar-control title-bar-control-close"
            aria-label="关闭"
            onClick={() => window.app.windowRequestClose()}
          >
            <IconClose size={10} />
          </button>
        </div>
      )}
    </header>
  )
}
