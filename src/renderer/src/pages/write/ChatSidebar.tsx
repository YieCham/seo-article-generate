import type { ChatSession } from './types'
import { IconPlus, IconSettings, IconSparkles, IconTrash } from '../../components/Icons'

interface ChatSidebarProps {
  sessions: ChatSession[]
  activeSessionId: string
  runningSessionId?: string
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  onOpenSettings: () => void
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

export default function ChatSidebar({
  sessions,
  activeSessionId,
  runningSessionId,
  onSelect,
  onNew,
  onDelete,
  onOpenSettings
}: ChatSidebarProps) {
  const sorted = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)

  return (
    <aside className="chat-sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark">
          <IconSparkles size={16} />
        </div>
        <div>
          <strong>Article Agent</strong>
          <span>智能写作工作台</span>
        </div>
      </div>

      <button type="button" className="new-chat-btn" onClick={onNew}>
        <IconPlus size={15} />
        新对话
      </button>

      <div className="sidebar-section-label">最近对话</div>
      <div className="session-list">
        {sorted.length === 0 ? (
          <p className="sidebar-empty">开始你的第一次创作</p>
        ) : (
          sorted.map((session) => {
            const isRunning = runningSessionId === session.id
            return (
              <div key={session.id} className="session-row">
                <button
                  type="button"
                  className={session.id === activeSessionId ? 'session-item active' : 'session-item'}
                  onClick={() => onSelect(session.id)}
                >
                  <span className="session-dot" aria-hidden="true" />
                  <span className="session-title">{session.title}</span>
                  <span className="session-time">{formatTime(session.updatedAt)}</span>
                </button>
                <button
                  type="button"
                  className="session-delete-btn"
                  aria-label={`删除对话：${session.title}`}
                  title={isRunning ? '生成中无法删除' : '删除对话'}
                  disabled={isRunning}
                  onClick={() => onDelete(session.id)}
                >
                  <IconTrash size={14} />
                </button>
              </div>
            )
          })
        )}
      </div>

      <div className="sidebar-footer">
        <button type="button" className="sidebar-link" onClick={onOpenSettings}>
          <IconSettings size={15} />
          AI 配置
        </button>
      </div>
    </aside>
  )
}
