import { useState } from 'react'
import WritePage from './pages/WritePage'
import SettingsPage from './pages/SettingsPage'
import TitleBar from './components/TitleBar'
import { IconArrowLeft } from './components/Icons'

type Page = 'write' | 'settings'

export default function App() {
  const [page, setPage] = useState<Page>('write')
  const [configRevision, setConfigRevision] = useState(0)

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
    </div>
  )
}
