import { useCallback, useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react'
import type { ChatMessage, ReviseArticleSelection } from './types'
import MarkdownContent from './MarkdownContent'
import CollapsibleMarkdownCard from './CollapsibleMarkdownCard'
import { formatPlanningMarkdown } from './planningContent'
import { getMarkdownRangeFromDomSelection } from '../../utils/markdownSourceMap'
import { getArticleCopyMarkdown } from '../../utils/articleCopy'
import { IconCopyArticle, IconMessage } from '../../components/Icons'

interface ChatMessageItemProps {
  message: ChatMessage
  onCopy?: (content: string) => void
  onContextMenu?: (event: ReactMouseEvent) => void
  waitingLabel?: string
  waitingElapsedSec?: number
  reviseSelectionEnabled?: boolean
  reviseSelection?: ReviseArticleSelection | null
  onReviseSelectionChange?: (selection: ReviseArticleSelection | null) => void
  onApplyRevision?: (assistantMessageId: string) => void
  onCancelRevision?: (assistantMessageId: string) => void
}

export default function ChatMessageItem({
  message,
  onCopy,
  onContextMenu,
  waitingLabel,
  waitingElapsedSec = 0,
  reviseSelectionEnabled = false,
  reviseSelection = null,
  onReviseSelectionChange,
  onApplyRevision,
  onCancelRevision
}: ChatMessageItemProps) {
  const markdownRef = useRef<HTMLDivElement>(null)
  const lastSelectionRef = useRef<ReviseArticleSelection | null>(null)

  const applyDomSelection = useCallback((): boolean => {
    const root = markdownRef.current
    if (!root || !onReviseSelectionChange) return false

    const domText = window.getSelection()?.toString().trim() ?? ''
    const range = getMarkdownRangeFromDomSelection(root, message.content)
    if (!range) {
      if (domText.length > (lastSelectionRef.current?.displayText.length ?? 0)) {
        lastSelectionRef.current = null
        onReviseSelectionChange(null)
      }
      return false
    }

    const next = { start: range.start, end: range.end, text: range.text, displayText: range.displayText }
    lastSelectionRef.current = next
    onReviseSelectionChange(next)
    return true
  }, [message.content, onReviseSelectionChange])

  const restoreLastSelection = useCallback((): void => {
    if (lastSelectionRef.current) {
      onReviseSelectionChange?.(lastSelectionRef.current)
    }
  }, [onReviseSelectionChange])

  useEffect(() => {
    if (!reviseSelectionEnabled) {
      lastSelectionRef.current = null
      onReviseSelectionChange?.(null)
      return
    }

    const handleSelectionChange = (): void => {
      applyDomSelection()
    }

    const handlePointerUp = (event: globalThis.MouseEvent): void => {
      window.requestAnimationFrame(() => {
        if (!markdownRef.current || !onReviseSelectionChange) return

        if (applyDomSelection()) return

        const target = event.target
        const inArticle = target instanceof Node && markdownRef.current.contains(target)
        const selection = window.getSelection()
        const visibleText = selection?.toString().trim() ?? ''
        const hasVisibleSelection = Boolean(selection && !selection.isCollapsed && visibleText)

        if (inArticle) {
          if (hasVisibleSelection || lastSelectionRef.current) {
            if (
              !hasVisibleSelection ||
              visibleText.length <= (lastSelectionRef.current?.displayText.length ?? 0) + 2
            ) {
              restoreLastSelection()
            }
            return
          }

          lastSelectionRef.current = null
          onReviseSelectionChange(null)
          return
        }

        restoreLastSelection()
      })
    }

    document.addEventListener('selectionchange', handleSelectionChange)
    document.addEventListener('mouseup', handlePointerUp)

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange)
      document.removeEventListener('mouseup', handlePointerUp)
      lastSelectionRef.current = null
    }
  }, [applyDomSelection, onReviseSelectionChange, restoreLastSelection, reviseSelectionEnabled])

  useEffect(() => {
    if (!reviseSelectionEnabled) return
    if (reviseSelection === null) {
      lastSelectionRef.current = null
    } else {
      lastSelectionRef.current = reviseSelection
    }
  }, [reviseSelection, reviseSelectionEnabled])

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
  const interrupted = message.status === 'interrupted'
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

  const showArticleCopy =
    Boolean(message.content.trim()) &&
    message.status !== 'streaming' &&
    message.status !== 'error' &&
    message.status !== 'interrupted'

  return (
    <article className="chat-message is-assistant" onContextMenu={onContextMenu}>
      <div className="assistant-block">
        <div
          className={[
            'assistant-card',
            reviseSelectionEnabled ? 'is-revise-selectable' : '',
            revising ? 'is-revising' : '',
            pendingApply ? 'is-pending-apply' : '',
            interrupted ? 'is-interrupted' : ''
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <div className={`section-editor-article${reviseSelectionEnabled ? ' is-active' : ''}`}>
            <MarkdownContent
              bodyRef={markdownRef}
              content={message.content}
              streaming={streaming}
              waitingLabel={waitingLabel}
              waitingElapsedSec={waitingElapsedSec}
              sourceMapping={reviseSelectionEnabled}
              editableSelection={reviseSelectionEnabled}
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
          {interrupted ? (
            <div className="assistant-interrupted-badge" aria-live="polite">
              生成已中断 · 可点击下方继续生成
            </div>
          ) : null}
        </div>
        {showArticleCopy ? (
          <div className="assistant-copy-footer">
            <button
              type="button"
              className="assistant-copy-mini-btn"
              onClick={() => onCopy?.(getArticleCopyMarkdown(message.content))}
              aria-label="复制全文"
              title="复制全文（Markdown）"
            >
              <IconCopyArticle size={13} />
            </button>
          </div>
        ) : null}
        {message.status === 'error' ? <p className="message-error">生成失败，请检查 AI 配置后重试。</p> : null}
      </div>
    </article>
  )
}
