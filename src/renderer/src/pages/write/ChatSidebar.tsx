import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  canReorderSessionsTogether,
  getSessionDisplayTitle,
  getSessionLifecycleGroup,
  getSessionListGroup,
  sessionCanRegenerate,
  sortSessions,
  type ChatSession,
  type SessionLifecycleGroup,
  type SessionListGroup
} from './types'
import {
  IconStartCreate,
  IconSettings,
  IconRename,
  IconPin,
  IconPinnedSession,
  IconClear,
  IconDelete,
  IconRegenerate,
  IconPageCompleted,
  IconMoveToActive
} from '../../components/Icons'
import { WRITE_MODE_OPTIONS, type WriteMode } from '../../constants/writeMode'
import SessionRenameDialog from './SessionRenameDialog'
import SessionConfirmDialog, { type SessionConfirmAction } from './SessionConfirmDialog'

interface ChatSidebarProps {
  sessions: ChatSession[]
  activeSessionId: string
  runningSessionId?: string
  onSelect: (id: string) => void
  onSelectMode: (mode: WriteMode) => void
  onClear: (id: string) => void
  onDelete: (id: string) => void
  onRename: (id: string, title: string) => void
  onTogglePin: (id: string) => void
  onMarkCompleted: (id: string) => void
  onRegenerate: (id: string) => void
  onReorder: (
    group: SessionListGroup,
    draggedId: string,
    targetId: string,
    position: 'before' | 'after'
  ) => void
  onOpenSettings: () => void
  isRunning?: boolean
}

interface SessionContextMenuState {
  sessionId: string
  x: number
  y: number
}

const LIFECYCLE_STORAGE_KEY = 'sidebar.lifecycleGroup'

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  if (sameDay) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

function readStoredLifecycleGroup(): SessionLifecycleGroup {
  try {
    const value = localStorage.getItem(LIFECYCLE_STORAGE_KEY)
    return value === 'completed' ? 'completed' : 'active'
  } catch {
    return 'active'
  }
}

export default function ChatSidebar({
  sessions,
  activeSessionId,
  runningSessionId,
  onSelect,
  onSelectMode,
  onClear,
  onDelete,
  onRename,
  onTogglePin,
  onMarkCompleted,
  onRegenerate,
  onReorder,
  onOpenSettings,
  isRunning = false
}: ChatSidebarProps) {
  const [modeMenuOpen, setModeMenuOpen] = useState(false)
  const [lifecycleGroup, setLifecycleGroup] = useState<SessionLifecycleGroup>(readStoredLifecycleGroup)
  const [contextMenu, setContextMenu] = useState<SessionContextMenuState | null>(null)
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null)
  const [pendingConfirm, setPendingConfirm] = useState<{
    sessionId: string
    action: SessionConfirmAction
  } | null>(null)
  const [createCollapsed, setCreateCollapsed] = useState(false)
  const [optimizeCollapsed, setOptimizeCollapsed] = useState(false)
  const [batchOptimizeCollapsed, setBatchOptimizeCollapsed] = useState(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{
    id: string
    position: 'before' | 'after'
  } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const modeMenuRef = useRef<HTMLDivElement>(null)
  const newChatWrapRef = useRef<HTMLDivElement>(null)

  const lifecycleSessions = useMemo(
    () => sessions.filter((session) => getSessionLifecycleGroup(session) === lifecycleGroup),
    [sessions, lifecycleGroup]
  )

  const createSessions = useMemo(
    () =>
      sortSessions(lifecycleSessions.filter((session) => getSessionListGroup(session) === 'create')),
    [lifecycleSessions]
  )
  const optimizeSessions = useMemo(
    () =>
      sortSessions(
        lifecycleSessions.filter((session) => getSessionListGroup(session) === 'optimize')
      ),
    [lifecycleSessions]
  )
  const batchOptimizeSessions = useMemo(
    () =>
      sortSessions(
        lifecycleSessions.filter((session) => getSessionListGroup(session) === 'batch-optimize')
      ),
    [lifecycleSessions]
  )

  const sessionGroups = useMemo(
    () => [
      {
        key: 'create' as const,
        sessions: createSessions,
        collapsible: true,
        collapsed: createCollapsed
      },
      {
        key: 'optimize' as const,
        sessions: optimizeSessions,
        collapsible: true,
        collapsed: optimizeCollapsed
      },
      {
        key: 'batch-optimize' as const,
        sessions: batchOptimizeSessions,
        collapsible: true,
        collapsed: batchOptimizeCollapsed
      }
    ],
    [
      batchOptimizeCollapsed,
      batchOptimizeSessions,
      createCollapsed,
      createSessions,
      optimizeCollapsed,
      optimizeSessions
    ]
  )

  const visibleSessionGroups = sessionGroups.filter((group) => group.sessions.length > 0)

  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  function setLifecycleGroupAndPersist(next: SessionLifecycleGroup): void {
    setLifecycleGroup(next)
    try {
      localStorage.setItem(LIFECYCLE_STORAGE_KEY, next)
    } catch {
      /* ignore */
    }
  }

  function toggleSessionGroupCollapse(group: SessionListGroup): void {
    if (group === 'create') setCreateCollapsed((value) => !value)
    if (group === 'optimize') setOptimizeCollapsed((value) => !value)
    if (group === 'batch-optimize') setBatchOptimizeCollapsed((value) => !value)
  }

  function sessionGroupLabel(group: SessionListGroup): string {
    if (group === 'create') return '文章创作'
    if (group === 'optimize') return '文章优化'
    return '批量优化'
  }

  function sessionGroupCollapseLabel(group: SessionListGroup, collapsed: boolean): string {
    const label = sessionGroupLabel(group)
    return collapsed ? `展开${label}对话` : `收起${label}对话`
  }

  function sessionGroupCollapseTitle(group: SessionListGroup, collapsed: boolean): string {
    const label = sessionGroupLabel(group)
    return collapsed ? `展开${label}` : `收起${label}`
  }

  useEffect(() => {
    const active = sessions.find((session) => session.id === activeSessionId)
    if (active?.writeMode === 'create') setCreateCollapsed(false)
    if (active?.writeMode === 'optimize') setOptimizeCollapsed(false)
    if (active?.writeMode === 'batch-optimize') setBatchOptimizeCollapsed(false)
  }, [activeSessionId, sessions])

  useEffect(() => {
    if (!modeMenuOpen) return

    function handlePointerDown(event: MouseEvent): void {
      const target = event.target as Node
      if (modeMenuRef.current?.contains(target)) return
      if (newChatWrapRef.current?.contains(target)) return
      setModeMenuOpen(false)
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setModeMenuOpen(false)
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [modeMenuOpen])

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

    const menuWidth = 160
    const menuHeight = 240
    const padding = 8
    const x = Math.min(event.clientX, window.innerWidth - menuWidth - padding)
    const y = Math.min(event.clientY, window.innerHeight - menuHeight - padding)

    setContextMenu({ sessionId, x, y })
  }

  function handleMenuAction(
    action: 'rename' | 'pin' | 'complete' | 'regenerate' | 'clear' | 'delete'
  ): void {
    if (!contextMenu) return
    const { sessionId } = contextMenu
    closeContextMenu()
    if (action === 'rename') {
      setRenamingSessionId(sessionId)
      return
    }
    if (action === 'pin') {
      onTogglePin(sessionId)
      return
    }
    if (action === 'complete') {
      onMarkCompleted(sessionId)
      return
    }
    setPendingConfirm({ sessionId, action })
  }

  function handleDragStart(event: React.DragEvent<HTMLButtonElement>, sessionId: string): void {
    if (runningSessionId === sessionId) {
      event.preventDefault()
      return
    }
    setDraggingId(sessionId)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', sessionId)
  }

  function handleDragOver(
    event: React.DragEvent<HTMLButtonElement>,
    session: ChatSession
  ): void {
    if (!draggingId || draggingId === session.id) return
    const dragged = sessions.find((item) => item.id === draggingId)
    if (!dragged || !canReorderSessionsTogether(dragged, session)) return

    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    const rect = event.currentTarget.getBoundingClientRect()
    const position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
    setDropTarget({ id: session.id, position })
  }

  function handleDrop(event: React.DragEvent<HTMLButtonElement>, group: SessionListGroup): void {
    event.preventDefault()
    if (!draggingId || !dropTarget) return
    onReorder(group, draggingId, dropTarget.id, dropTarget.position)
    setDraggingId(null)
    setDropTarget(null)
  }

  function handleDragEnd(): void {
    setDraggingId(null)
    setDropTarget(null)
  }

  function renderSessionItem(session: ChatSession, group: SessionListGroup) {
    const isActive = session.id === activeSessionId
    const isRunning = runningSessionId === session.id
    const displayTitle = getSessionDisplayTitle(session)
    const isDragging = draggingId === session.id
    const isDropBefore = dropTarget?.id === session.id && dropTarget.position === 'before'
    const isDropAfter = dropTarget?.id === session.id && dropTarget.position === 'after'
    return (
      <button
        key={session.id}
        type="button"
        className={[
          'session-item',
          isActive ? 'active' : '',
          isRunning ? 'running' : '',
          session.pinned ? 'pinned' : '',
          isDragging ? 'is-dragging' : '',
          isDropBefore ? 'is-drop-before' : '',
          isDropAfter ? 'is-drop-after' : ''
        ]
          .filter(Boolean)
          .join(' ')}
        title={`${displayTitle} · ${formatTime(session.updatedAt)}`}
        draggable={!isRunning}
        onDragStart={(event) => handleDragStart(event, session.id)}
        onDragOver={(event) => handleDragOver(event, session)}
        onDrop={(event) => handleDrop(event, group)}
        onDragEnd={handleDragEnd}
        onDragLeave={(event) => {
          if (dropTarget?.id === session.id && !event.currentTarget.contains(event.relatedTarget as Node)) {
            setDropTarget(null)
          }
        }}
        onClick={() => onSelect(session.id)}
        onContextMenu={(event) => handleContextMenu(event, session.id)}
      >
        <span className="session-dot" aria-hidden="true" />
        <span className="session-title">{displayTitle}</span>
        {session.pinned ? (
          <IconPinnedSession size={12} className="session-pin-indicator" aria-hidden="true" />
        ) : null}
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
  const contextCanRegenerate = contextSession ? sessionCanRegenerate(contextSession) : false
  const contextCompleted = contextSession
    ? getSessionLifecycleGroup(contextSession) === 'completed'
    : false
  const regenerateDisabled = isRunning || contextRunning || !contextCanRegenerate
  const regenerateDisabledReason = isRunning
    ? '当前有任务正在运行'
    : contextRunning
      ? '生成中无法重新生成'
      : !contextCanRegenerate
        ? '尚无初始请求'
        : undefined
  const emptyLabel = lifecycleGroup === 'completed' ? '暂无已完成对话' : '暂无进行中对话'

  return (
    <aside className="chat-sidebar">
      <nav className="sidebar-nav" aria-label="侧栏导航">
        <div className="sidebar-lifecycle-switch" role="tablist" aria-label="对话分组">
          <button
            type="button"
            role="tab"
            aria-selected={lifecycleGroup === 'active'}
            className={`sidebar-lifecycle-tab${lifecycleGroup === 'active' ? ' is-active' : ''}`}
            onClick={() => setLifecycleGroupAndPersist('active')}
          >
            进行中
          </button>
          <span className="sidebar-lifecycle-divider" aria-hidden="true" />
          <button
            type="button"
            role="tab"
            aria-selected={lifecycleGroup === 'completed'}
            className={`sidebar-lifecycle-tab${lifecycleGroup === 'completed' ? ' is-active' : ''}`}
            onClick={() => setLifecycleGroupAndPersist('completed')}
          >
            已完成
          </button>
        </div>
      </nav>

      <div className="sidebar-section">
        <div className="session-list">
          {lifecycleSessions.length === 0 ? (
            <p className="sidebar-empty">{emptyLabel}</p>
          ) : (
            visibleSessionGroups.map((group) => (
              <div key={group.key} className="session-group-block">
                <button
                  type="button"
                  className="session-group-divider"
                  aria-expanded={!group.collapsed}
                  aria-label={sessionGroupCollapseLabel(group.key, group.collapsed)}
                  title={sessionGroupCollapseTitle(group.key, group.collapsed)}
                  onClick={() => toggleSessionGroupCollapse(group.key)}
                >
                  <span className="session-group-divider-line" aria-hidden="true" />
                  <span className="session-group-divider-label">{sessionGroupLabel(group.key)}</span>
                  <span className="session-group-divider-line" aria-hidden="true" />
                </button>

                <div
                  className={[
                    'session-group',
                    group.collapsed ? 'is-collapsed' : ''
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  data-group={group.key}
                >
                  {!group.collapsed
                    ? group.sessions.map((session) => renderSessionItem(session, group.key))
                    : null}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="sidebar-bottom">
        <div className="sidebar-new-chat-wrap" ref={newChatWrapRef}>
          <button
            type="button"
            className={`sidebar-nav-item sidebar-new-chat${modeMenuOpen ? ' is-open' : ''}`}
            aria-expanded={modeMenuOpen}
            aria-haspopup="menu"
            onClick={() => setModeMenuOpen((open) => !open)}
          >
            <IconStartCreate size={14} />
            <span>点击开始新对话</span>
          </button>

          {modeMenuOpen ? (
            <div
              ref={modeMenuRef}
              className="sidebar-mode-menu"
              role="menu"
              aria-label="选择对话类型"
            >
              {WRITE_MODE_OPTIONS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className="sidebar-mode-menu-item"
                  role="menuitem"
                  onClick={() => {
                    setModeMenuOpen(false)
                    onSelectMode(item.value)
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <span className="sidebar-bottom-divider" aria-hidden="true" />

        <button
          type="button"
          className="sidebar-nav-item sidebar-settings"
          onClick={onOpenSettings}
        >
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
            onClick={() => handleMenuAction('pin')}
          >
            <IconPin size={14} className="session-context-menu-icon" />
            <span>{contextSession.pinned ? '取消置顶' : '置顶'}</span>
          </button>
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
            onClick={() => handleMenuAction('complete')}
          >
            {contextCompleted ? (
              <IconMoveToActive size={14} className="session-context-menu-icon" />
            ) : (
              <IconPageCompleted size={14} className="session-context-menu-icon" />
            )}
            <span>{contextCompleted ? '移回进行中' : '页面已完成'}</span>
          </button>
          <button
            type="button"
            className="session-context-menu-item"
            role="menuitem"
            disabled={regenerateDisabled}
            title={regenerateDisabledReason}
            onClick={() => handleMenuAction('regenerate')}
          >
            <IconRegenerate size={14} className="session-context-menu-icon" />
            <span>重新生成</span>
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
          else if (pendingConfirm.action === 'delete') onDelete(pendingConfirm.sessionId)
          else onRegenerate(pendingConfirm.sessionId)
          setPendingConfirm(null)
        }}
      />
    </aside>
  )
}
