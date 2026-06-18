import { useEffect, useRef, useState, type MouseEvent } from 'react'
import type { ChatMessage } from './types'
import MarkdownContent from './MarkdownContent'
import CollapsibleMarkdownCard from './CollapsibleMarkdownCard'
import ArticleSectionEditor from './ArticleSectionEditor'
import { formatPlanningMarkdown } from './planningContent'
import { IconCopy, IconMessage } from '../../components/Icons'

interface ChatMessageItemProps {
  message: ChatMessage
  onCopy?: (content: string) => void
  onContextMenu?: (event: MouseEvent) => void
  sectionEditDisabled?: boolean
  sectionEditTopic?: string
  outputLanguage?: string
  onSectionEditApply?: (messageId: string, content: string) => void
  onSectionEditBusyChange?: (busy: boolean) => void
  onApplyRevision?: (assistantMessageId: string) => void
  onCancelRevision?: (assistantMessageId: string) => void
}

export default function ChatMessageItem({
  message,
  onCopy,
  onContextMenu,
  sectionEditDisabled,
  sectionEditTopic,
  outputLanguage,
  onSectionEditApply,
  onSectionEditBusyChange,
  onApplyRevision,
  onCancelRevision
}: ChatMessageItemProps) {
  const articleRef = useRef<HTMLDivElement>(null)
  const [sectionEditOpen, setSectionEditOpen] = useState(false)
  const [editDraft, setEditDraft] = useState(message.content)

  useEffect(() => {
    if (!sectionEditOpen) {
      setEditDraft(message.content)
    }
  }, [message.content, sectionEditOpen])

  if (message.role === 'status') {
    return (
      <div className="chat-status">
        <span className="status-line">
          <span className="status-pill-dot" aria-hidden="true" />
          {message.content}
        </span>
      </div>
    )
  }

  if (message.role === 'planning') {
    return (
      <article className="chat-message is-planning" onContextMenu={onContextMenu}>
        <div className="workspace-card">
          <div className="workspace-card-head">
            <span className="workspace-card-title">创作规划</span>
          </div>
          <CollapsibleMarkdownCard
            className="planning-card"
            content={message.content}
            formatContent={formatPlanningMarkdown}
          />
        </div>
      </article>
    )
  }

  if (message.role === 'research') {
    return (
      <article className="chat-message is-research" onContextMenu={onContextMenu}>
        <div className="workspace-card">
          <div className="workspace-card-head">
            <span className="workspace-card-title">竞品调研</span>
          </div>
          <div className="research-card">
            <CollapsibleMarkdownCard content={message.content} />
          </div>
        </div>
      </article>
    )
  }

  const isUser = message.role === 'user'
  const streaming = message.status === 'streaming'
  const revising = message.status === 'revising'
  const pendingApply = message.status === 'pendingApply'
  const canSectionEdit =
    !isUser && message.status === 'done' && Boolean(message.content.trim()) && Boolean(onSectionEditApply)
  const displayContent = sectionEditOpen ? editDraft : message.content
  const showRevisionActions =
    isUser &&
    Boolean(message.content.startsWith('**修改说明**')) &&
    Boolean(message.revisionTargetAssistantId)

  if (isUser) {
    return (
      <article className="chat-message is-user" onContextMenu={onContextMenu}>
        <div className="user-prompt-card">
          <span className="user-prompt-icon" aria-hidden="true">
            <IconMessage size={14} />
          </span>
          <p className="user-prompt-text">{message.content}</p>
        </div>
        {showRevisionActions ? (
          <div className="revision-action-bar">
            <button
              type="button"
              className="revision-action-btn is-primary"
              onClick={() => onApplyRevision?.(message.revisionTargetAssistantId!)}
            >
              应用修改
            </button>
            <button
              type="button"
              className="revision-action-btn"
              onClick={() => onCancelRevision?.(message.revisionTargetAssistantId!)}
            >
              取消修改
            </button>
          </div>
        ) : null}
      </article>
    )
  }

  return (
    <article className="chat-message is-assistant" onContextMenu={onContextMenu}>
      <div className="assistant-block">
        {message.content ? (
          <button
            type="button"
            className="assistant-copy-btn"
            onClick={() => onCopy?.(message.content)}
            aria-label="复制回复"
          >
            <IconCopy size={13} />
          </button>
        ) : null}
        <div
          className={[
            'assistant-card',
            sectionEditOpen ? 'is-section-editing' : '',
            revising ? 'is-revising' : '',
            pendingApply ? 'is-pending-apply' : ''
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <div
            ref={articleRef}
            className={`section-editor-article${sectionEditOpen ? ' is-active' : ''}`}
          >
            <MarkdownContent
              content={displayContent}
              streaming={streaming}
              sourceMapping={sectionEditOpen}
              editableSelection={sectionEditOpen}
            />
          </div>
          {revising ? (
            <div className="assistant-revising-overlay" aria-live="polite">
              <span className="status-pill-dot" aria-hidden="true" />
              正在修订…
            </div>
          ) : null}
          {pendingApply ? (
            <div className="assistant-pending-badge" aria-live="polite">
              待确认修改
            </div>
          ) : null}
          {canSectionEdit ? (
            <ArticleSectionEditor
              content={message.content}
              articleRef={articleRef}
              topic={sectionEditTopic}
              outputLanguage={outputLanguage}
              disabled={sectionEditDisabled}
              onOpenChange={setSectionEditOpen}
              onDraftChange={setEditDraft}
              onApply={(updatedContent) => onSectionEditApply?.(message.id, updatedContent)}
              onBusyChange={onSectionEditBusyChange}
            />
          ) : null}
        </div>
        {message.status === 'error' ? <p className="message-error">生成失败，请检查 AI 配置后重试。</p> : null}
      </div>
    </article>
  )
}
