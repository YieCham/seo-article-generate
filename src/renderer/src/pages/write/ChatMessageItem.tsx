import type { ChatMessage } from './types'
import MarkdownContent from './MarkdownContent'
import { IconBot, IconCopy, IconUser } from '../../components/Icons'

interface ChatMessageItemProps {
  message: ChatMessage
  onCopy?: (content: string) => void
}

export default function ChatMessageItem({ message, onCopy }: ChatMessageItemProps) {
  if (message.role === 'status') {
    return (
      <div className="chat-status">
        <span className="status-pill">
          <span className="status-pill-dot" />
          {message.content}
        </span>
      </div>
    )
  }

  if (message.role === 'planning') {
    return (
      <article className="chat-message is-planning">
        <div className="message-avatar avatar-planning" aria-hidden="true">
          📋
        </div>
        <div className="message-body">
          <div className="message-meta">
            <span className="message-role">创作规划</span>
          </div>
          <div className="planning-card">
            <MarkdownContent content={message.content} />
          </div>
        </div>
      </article>
    )
  }

  if (message.role === 'research') {
    return (
      <article className="chat-message is-research">
        <div className="message-avatar avatar-research" aria-hidden="true">
          🔍
        </div>
        <div className="message-body">
          <div className="message-meta">
            <span className="message-role">竞品调研</span>
          </div>
          <div className="research-card">
            <MarkdownContent content={message.content} />
          </div>
        </div>
      </article>
    )
  }

  const isUser = message.role === 'user'
  const streaming = message.status === 'streaming'

  return (
    <article className={`chat-message ${isUser ? 'is-user' : 'is-assistant'}`}>
      <div className={`message-avatar ${isUser ? 'avatar-user' : 'avatar-agent'}`} aria-hidden="true">
        {isUser ? <IconUser size={15} /> : <IconBot size={15} />}
      </div>
      <div className="message-body">
        <div className="message-meta">
          <span className="message-role">{isUser ? '你' : 'Agent'}</span>
          {!isUser && message.content ? (
            <button type="button" className="message-action" onClick={() => onCopy?.(message.content)}>
              <IconCopy size={13} />
              复制
            </button>
          ) : null}
        </div>
        {isUser ? (
          <div className="user-bubble">{message.content}</div>
        ) : (
          <div className="assistant-card">
            <MarkdownContent content={message.content} streaming={streaming} />
          </div>
        )}
        {message.status === 'error' ? <p className="message-error">生成失败，请检查 AI 配置后重试。</p> : null}
      </div>
    </article>
  )
}
