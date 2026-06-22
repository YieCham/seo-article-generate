import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChatSession } from './types'
import { getSessionDisplayTitle } from './types'
import { IconPlus, IconSettings, IconRename, IconClear, IconDelete } from '../../components/Icons'
import SessionRenameDialog from './SessionRenameDialog'
import SessionConfirmDialog, { type SessionConfirmAction } from './SessionConfirmDialog'

interface ChatSidebarProps {
  sessions: ChatSession[]
  activeSessionId: string
  runningSessionId?: string
  onSelect: (id: string) => void
  onNew: () => void
  onClear: (id: string) => void
  onDelete: (id: string) => void
  onRename: (id: string, title: string) => void
  onOpenSettings: () => void
}

interface SessionContextMenuState {
  sessionId: string
  x: number
  y: number
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  if (sameDay) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

function sortSessions(items: ChatSession[]): ChatSession[] {
  return [...items].sort((a, b) => b.updatedAt - a.updatedAt)
}

export default function ChatSidebar({
  sessions,
  activeSessionId,
  runningSessionId,
  onSelect,
  onNew,
  onClear,
  onDelete,
  onRename,
  onOpenSettings
}: ChatSidebarProps) {
  const [contextMenu, setContextMenu] = useState<SessionContextMenuState | null>(null)
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null)
  const [pendingConfirm, setPendingConfirm] = useState<{
    sessionId: string
    action: SessionConfirmAction
  } | null>(null)
  const [optimizeCollapsed, setOptimizeCollapsed] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const createSessions = useMemo(
    () => sortSessions(sessions.filter((session) => session.writeMode !== 'optimize')),
    [sessions]
  )
  const optimizeSessions = useMemo(
    () => sortSessions(sessions.filter((session) => session.writeMode === 'optimize')),
    [sessions]
  )
  const showDivider = createSessions.length > 0 && optimizeSessions.length > 0

  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  useEffect(() => {
    const active = sessions.find((session) => session.id === activeSessionId)
    if (active?.writeMode === 'optimize') setOptimizeCollapsed(false)
  }, [activeSessionId, sessions])

  useEffect(() => {
    if (!contextMenu) return

    function handlePointerDown(event: MouseEvent): void {
      if (menuRef.current?.contains(event.target as Node)) return
      closeContextMenu()
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') closeContextMenu()
    }

    function handleScroll(): void {
      closeContextMenu()
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('resize', closeContextMenu)

    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', closeContextMenu)
    }
  }, [contextMenu, closeContextMenu])

  function handleContextMenu(event: React.MouseEvent, sessionId: string): void {
    event.preventDefault()
    event.stopPropagation()

    const menuWidth = 148
    const menuHeight = 132
    const padding = 8
    const x = Math.min(event.clientX, window.innerWidth - menuWidth - padding)
    const y = Math.min(event.clientY, window.innerHeight - menuHeight - padding)

    setContextMenu({ sessionId, x, y })
  }

  function handleMenuAction(action: 'rename' | 'clear' | 'delete'): void {
    if (!contextMenu) return
    const { sessionId } = contextMenu
    closeContextMenu()
    if (action === 'rename') {
      setRenamingSessionId(sessionId)
      return
    }
    setPendingConfirm({ sessionId, action })
  }

  function renderSessionItem(session: ChatSession) {
    const isActive = session.id === activeSessionId
    const isRunning = runningSessionId === session.id
    const displayTitle = getSessionDisplayTitle(session)
    return (
      <button
        key={session.id}
        type="button"
        className={['session-item', isActive ? 'active' : '', isRunning ? 'running' : '']
          .filter(Boolean)
          .join(' ')}
        title={`${displayTitle} · ${formatTime(session.updatedAt)}`}
        onClick={() => onSelect(session.id)}
        onContextMenu={(event) => handleContextMenu(event, session.id)}
      >
        <span className="session-dot" aria-hidden="true" />
        <span className="session-title">{displayTitle}</span>
      </button>
    )
  }

  const contextSession = contextMenu
    ? sessions.find((session) => session.id === contextMenu.sessionId)
    : null
  const renamingSession = renamingSessionId
    ? sessions.find((session) => session.id === renamingSessionId)
    : null
  const confirmSession = pendingConfirm
    ? sessions.find((session) => session.id === pendingConfirm.sessionId)
    : null
  const contextRunning = contextMenu ? runningSessionId === contextMenu.sessionId : false

  return (
    <aside className="chat-sidebar">
      <nav className="sidebar-nav" aria-label="侧栏导航">
        <button type="button" className="sidebar-nav-item" onClick={onNew}>
          <IconPlus size={14} />
          <span>新对话</span>
        </button>
      </nav>

      <div className="sidebar-section">
        <div className="sidebar-section-head">
          <span className="sidebar-section-title">对话记录</span>
        </div>
        <div className="session-list">
          {sessions.length === 0 ? (
            <p className="sidebar-empty">暂无对话</p>
          ) : (
            <>
              {createSessions.length > 0 ? (
                <div className="session-group" data-group="create">
                  {createSessions.map(renderSessionItem)}
                </div>
              ) : null}

              {showDivider ? (
                <button
                  type="button"
                  className="session-group-divider"
                  aria-expanded={!optimizeCollapsed}
                  aria-label={
                    optimizeCollapsed ? '展开文章优化对话' : '收起文章优化对话'
                  }
                  title={optimizeCollapsed ? '展开文章优化' : '收起文章优化'}
                  onClick={() => setOptimizeCollapsed((value) => !value)}
                >
                  <span className="session-group-divider-line" aria-hidden="true" />
                </button>
              ) : null}

              {optimizeSessions.length > 0 ? (
                <div
                  className={`session-group${optimizeCollapsed ? ' is-collapsed' : ''}`}
                  data-group="optimize"
                >
                  {!optimizeCollapsed ? optimizeSessions.map(renderSessionItem) : null}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      <div className="sidebar-bottom">
        <button type="button" className="sidebar-nav-item" onClick={onOpenSettings}>
          <IconSettings size={14} />
          <span>设置</span>
        </button>
      </div>

      {contextMenu && contextSession ? (
        <div
          ref={menuRef}
          className="session-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          role="menu"
          aria-label={`对话操作：${contextSession.title}`}
        >
          <button
            type="button"
            className="session-context-menu-item"
            role="menuitem"
            onClick={() => handleMenuAction('rename')}
          >
            <IconRename size={14} className="session-context-menu-icon" />
            <span>重命名</span>
          </button>
          <button
            type="button"
            className="session-context-menu-item"
            role="menuitem"
            disabled={contextRunning}
            title={contextRunning ? '生成中无法清空' : undefined}
            onClick={() => handleMenuAction('clear')}
          >
            <IconClear size={14} className="session-context-menu-icon" />
            <span>清空话题</span>
          </button>
          <button
            type="button"
            className="session-context-menu-item danger"
            role="menuitem"
            disabled={contextRunning}
            title={contextRunning ? '生成中无法删除' : undefined}
            onClick={() => handleMenuAction('delete')}
          >
            <IconDelete size={14} className="session-context-menu-icon" />
            <span>删除话题</span>
          </button>
        </div>
      ) : null}

      <SessionRenameDialog
        open={renamingSession != null}
        initialTitle={renamingSession ? getSessionDisplayTitle(renamingSession) : ''}
        onClose={() => setRenamingSessionId(null)}
        onConfirm={(title) => {
          if (renamingSessionId) onRename(renamingSessionId, title)
          setRenamingSessionId(null)
        }}
      />

      <SessionConfirmDialog
        open={confirmSession != null}
        action={pendingConfirm?.action ?? null}
        sessionTitle={confirmSession ? getSessionDisplayTitle(confirmSession) : ''}
        onClose={() => setPendingConfirm(null)}
        onConfirm={() => {
          if (!pendingConfirm) return
          if (pendingConfirm.action === 'clear') onClear(pendingConfirm.sessionId)
          else onDelete(pendingConfirm.sessionId)
          setPendingConfirm(null)
        }}
      />
    </aside>
  )
}
