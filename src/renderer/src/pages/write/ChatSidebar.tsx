import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  IconRename,
  IconPin,
  IconPinnedSession,
  IconClear,
  IconDelete,
  IconRegenerate,
  IconPageCompleted,
  IconMoveToActive
} from '../../components/Icons'
import type { WriteMode } from '../../constants/writeMode'
import SessionRenameDialog from './SessionRenameDialog'
import SessionConfirmDialog, {
  type RegenerateConfirmOptions,
  type SessionConfirmAction
} from './SessionConfirmDialog'

interface ChatSidebarProps {
  sessions: ChatSession[]
  activeSessionId: string
  writeMode: WriteMode
  runningSessionId?: string
  onSelect: (id: string) => void
  onNewChat: () => void
  onClear: (id: string) => void
  onDelete: (id: string) => void
  onRename: (id: string, title: string) => void
  onTogglePin: (id: string) => void
  onMarkCompleted: (id: string) => void
  onRegenerate: (id: string, options?: RegenerateConfirmOptions) => void
  onReorder: (
    group: SessionListGroup,
    draggedId: string,
    targetId: string,
    position: 'before' | 'after'
  ) => void
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
  writeMode,
  runningSessionId,
  onSelect,
  onNewChat,
  onClear,
  onDelete,
  onRename,
  onTogglePin,
  onMarkCompleted,
  onRegenerate,
  onReorder,
  isRunning = false
}: ChatSidebarProps) {
  const [lifecycleGroup, setLifecycleGroup] = useState<SessionLifecycleGroup>(readStoredLifecycleGroup)
  const [contextMenu, setContextMenu] = useState<SessionContextMenuState | null>(null)
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null)
  const [pendingConfirm, setPendingConfirm] = useState<{
    sessionId: string
    action: SessionConfirmAction
  } | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{
    id: string
    position: 'before' | 'after'
  } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const visibleSessions = useMemo(
    () =>
      sortSessions(
        sessions.filter(
          (session) =>
            getSessionLifecycleGroup(session) === lifecycleGroup &&
            getSessionListGroup(session) === writeMode
        )
      ),
    [sessions, lifecycleGroup, writeMode]
  )

  const listGroup: SessionListGroup = writeMode

  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  function setLifecycleGroupAndPersist(next: SessionLifecycleGroup): void {
    setLifecycleGroup(next)
    try {
      localStorage.setItem(LIFECYCLE_STORAGE_KEY, next)
    } catch {
      /* ignore */
    }
  }

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

    const menuWidth = 176
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

  function handleDrop(event: React.DragEvent<HTMLButtonElement>): void {
    event.preventDefault()
    if (!draggingId || !dropTarget) return
    onReorder(listGroup, draggingId, dropTarget.id, dropTarget.position)
    setDraggingId(null)
    setDropTarget(null)
  }

  function handleDragEnd(): void {
    setDraggingId(null)
    setDropTarget(null)
  }

  function renderSessionItem(session: ChatSession) {
    const isActive = session.id === activeSessionId
    const isRunningSession = runningSessionId === session.id
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
          isRunningSession ? 'running' : '',
          session.pinned ? 'pinned' : '',
          isDragging ? 'is-dragging' : '',
          isDropBefore ? 'is-drop-before' : '',
          isDropAfter ? 'is-drop-after' : ''
        ]
          .filter(Boolean)
          .join(' ')}
        title={`${displayTitle} · ${formatTime(session.updatedAt)}`}
        draggable={!isRunningSession}
        onDragStart={(event) => handleDragStart(event, session.id)}
        onDragOver={(event) => handleDragOver(event, session)}
        onDrop={handleDrop}
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

  const contextMenuNode =
    contextMenu && contextSession ? (
      <div
        ref={menuRef}
        className="ui-menu session-context-menu"
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
    ) : null

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
          {visibleSessions.length === 0 ? (
            <p className="sidebar-empty">{emptyLabel}</p>
          ) : (
            <div className="session-group" data-group={listGroup}>
              {visibleSessions.map((session) => renderSessionItem(session))}
            </div>
          )}
        </div>
      </div>

      <div className="sidebar-bottom">
        <button
          type="button"
          className="sidebar-nav-item sidebar-new-chat"
          onClick={onNewChat}
        >
          <IconStartCreate size={14} />
          <span>点击开始新对话</span>
        </button>
      </div>

      {contextMenuNode ? createPortal(contextMenuNode, document.body) : null}

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
        hasResearchPack={Boolean(confirmSession?.researchPack)}
        onClose={() => setPendingConfirm(null)}
        onConfirm={(options) => {
          if (!pendingConfirm) return
          if (pendingConfirm.action === 'clear') onClear(pendingConfirm.sessionId)
          else if (pendingConfirm.action === 'delete') onDelete(pendingConfirm.sessionId)
          else onRegenerate(pendingConfirm.sessionId, options)
          setPendingConfirm(null)
        }}
      />
    </aside>
  )
}
