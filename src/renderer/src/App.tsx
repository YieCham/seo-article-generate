import { useState } from 'react'
import WritePage from './pages/WritePage'
import SettingsPage from './pages/SettingsPage'
import { IconArrowLeft, IconSparkles } from './components/Icons'

type Page = 'write' | 'settings'

export default function App() {
  const [page, setPage] = useState<Page>('write')
  const [configRevision, setConfigRevision] = useState(0)

  return (
    <div className="app-root">
      <div className={page === 'write' ? 'app-page app-page-active' : 'app-page app-page-hidden'}>
        <WritePage
          onOpenSettings={() => setPage('settings')}
          configRevision={configRevision}
        />
      </div>

      <div className={page === 'settings' ? 'settings-shell app-page app-page-active' : 'app-page app-page-hidden'}>
        <header className="settings-topbar">
          <div className="settings-topbar-left">
            <div className="brand-mark brand-mark-sm">
              <IconSparkles size={14} />
            </div>
            <div>
              <h1>AI 配置</h1>
              <p>管理模型、快捷选项、提示词与 Skills</p>
            </div>
          </div>
          <button type="button" className="ghost-btn" onClick={() => setPage('write')}>
            <IconArrowLeft size={15} />
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
  )
}
