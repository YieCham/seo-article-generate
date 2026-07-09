import { useEffect, useRef, useState } from 'react'
import WritePage from './pages/WritePage'
import SettingsPage from './pages/SettingsPage'
import TitleBar from './components/TitleBar'
import CloseConfirmDialog from './components/CloseConfirmDialog'
import { IconArrowLeft } from './components/Icons'
import {
  DEFAULT_WINDOW_CLOSE,
  windowCloseBehaviorFromMode
} from './constants/windowClose'
import type { WindowCloseAction, WindowCloseBehavior } from './env.d'

type Page = 'write' | 'settings'

export default function App() {
  const [page, setPage] = useState<Page>('write')
  const [configRevision, setConfigRevision] = useState(0)
  const [closeDialogOpen, setCloseDialogOpen] = useState(false)
  const [closeBehavior, setCloseBehavior] = useState<WindowCloseBehavior>(DEFAULT_WINDOW_CLOSE)
  const closeBehaviorRef = useRef(closeBehavior)

  closeBehaviorRef.current = closeBehavior

  useEffect(() => {
    void window.app.getConfig().then((config) => {
      setCloseBehavior(config.windowClose ?? DEFAULT_WINDOW_CLOSE)
    })
  }, [configRevision])

  useEffect(() => {
    function executeCloseAction(action: WindowCloseAction): void {
      if (action === 'minimize-to-tray') {
        window.app.windowMinimizeToTray()
      } else {
        window.app.windowQuit()
      }
    }

    return window.app.onCloseRequested(() => {
      const behavior = closeBehaviorRef.current
      if (behavior.skipPrompt) {
        executeCloseAction(behavior.defaultAction)
        return
      }
      setCloseDialogOpen(true)
    })
  }, [])

  async function persistCloseBehavior(action: WindowCloseAction, remember: boolean): Promise<void> {
    if (!remember) return
    const next = windowCloseBehaviorFromMode(action)
    setCloseBehavior(next)
    await window.app.saveConfig({ windowClose: next })
    setConfigRevision((value) => value + 1)
  }

  async function handleMinimizeToTray(remember: boolean): Promise<void> {
    setCloseDialogOpen(false)
    await persistCloseBehavior('minimize-to-tray', remember)
    window.app.windowMinimizeToTray()
  }

  async function handleQuit(remember: boolean): Promise<void> {
    setCloseDialogOpen(false)
    await persistCloseBehavior('quit', remember)
    window.app.windowQuit()
  }

  return (
    <div className="app-root">
      <TitleBar />
      <div className="app-body">
        <div className={page === 'write' ? 'app-page app-page-active' : 'app-page app-page-hidden'}>
          <WritePage
            onOpenSettings={() => setPage('settings')}
            configRevision={configRevision}
          />
        </div>

        <div className={page === 'settings' ? 'settings-shell app-page app-page-active' : 'app-page app-page-hidden'}>
          <header className="settings-topbar">
            <button type="button" className="settings-back-btn" onClick={() => setPage('write')}>
              <IconArrowLeft size={14} />
              返回创作
            </button>
          </header>
          <main className="settings-main">
            <SettingsPage
              visible={page === 'settings'}
              onConfigSaved={() => setConfigRevision((value) => value + 1)}
            />
          </main>
        </div>
      </div>

      <CloseConfirmDialog
        open={closeDialogOpen}
        onClose={() => setCloseDialogOpen(false)}
        onMinimizeToTray={(remember) => void handleMinimizeToTray(remember)}
        onQuit={(remember) => void handleQuit(remember)}
      />
    </div>
  )
}
