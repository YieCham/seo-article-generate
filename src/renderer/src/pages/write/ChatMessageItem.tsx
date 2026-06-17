import { useEffect, useRef, useState } from 'react'
import type { ChatMessage } from './types'
import MarkdownContent from './MarkdownContent'
import CollapsibleMarkdownCard from './CollapsibleMarkdownCard'
import ArticleSectionEditor from './ArticleSectionEditor'
import { formatPlanningMarkdown } from './planningContent'
import { IconCopy, IconMessage } from '../../components/Icons'

interface ChatMessageItemProps {
  message: ChatMessage
  onCopy?: (content: string) => void
  sectionEditDisabled?: boolean
  sectionEditTopic?: string
  outputLanguage?: string
  onSectionEditApply?: (messageId: string, content: string) => void
  onSectionEditBusyChange?: (busy: boolean) => void
}

export default function ChatMessageItem({
  message,
  onCopy,
  sectionEditDisabled,
  sectionEditTopic,
  outputLanguage,
  onSectionEditApply,
  onSectionEditBusyChange
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
      <article className="chat-message is-planning">
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
      <article className="chat-message is-research">
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
  const canSectionEdit =
    !isUser && message.status === 'done' && Boolean(message.content.trim()) && Boolean(onSectionEditApply)
  const displayContent = sectionEditOpen ? editDraft : message.content

  if (isUser) {
    return (
      <article className="chat-message is-user">
        <div className="user-prompt-card">
          <span className="user-prompt-icon" aria-hidden="true">
            <IconMessage size={14} />
          </span>
          <p className="user-prompt-text">{message.content}</p>
        </div>
      </article>
    )
  }

  return (
    <article className="chat-message is-assistant">
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
        <div className={`assistant-card${sectionEditOpen ? ' is-section-editing' : ''}`}>
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
