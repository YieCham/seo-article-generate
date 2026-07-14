import { useEffect, useRef, useState, type MouseEvent } from 'react'
import type { WriteMode } from '../../constants/writeMode'
import type { ChatMessage, ReviseArticleSelection } from './types'
import ChatMessageItem from './ChatMessageItem'
import MessageContextMenu from './MessageContextMenu'

interface ChatThreadProps {
  messages: ChatMessage[]
  onCopy: (content: string) => void
  writeMode?: WriteMode
  isRunning?: boolean
  pipelineStatusMessage?: string
  pipelineElapsedSec?: number
  reviseTargetMessageId?: string | null
  reviseSelection?: ReviseArticleSelection | null
  onReviseSelectionChange?: (selection: ReviseArticleSelection | null) => void
  onDeleteMessage?: (messageId: string) => void
  onApplyRevision?: (assistantMessageId: string) => void
  onCancelRevision?: (assistantMessageId: string) => void
}

export default function ChatThread({
  messages,
  onCopy,
  writeMode = 'create',
  isRunning = false,
  pipelineStatusMessage = '',
  pipelineElapsedSec = 0,
  reviseTargetMessageId = null,
  reviseSelection = null,
  onReviseSelectionChange,
  onDeleteMessage,
  onApplyRevision,
  onCancelRevision
}: ChatThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const [contextMenu, setContextMenu] = useState<{ messageId: string; x: number; y: number } | null>(
    null
  )

  const contextMessage = contextMenu
    ? messages.find((message) => message.id === contextMenu.messageId) ?? null
    : null

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleContextMenu(event: MouseEvent, message: ChatMessage): void {
    if (message.role === 'status') return
    event.preventDefault()
    setContextMenu({ messageId: message.id, x: event.clientX, y: event.clientY })
  }

  if (messages.length === 0) {
    const emptyCopy =
      writeMode === 'optimize'
        ? {
            title: '今天想优化哪个页面？',
            desc: '输入页面 URL 即可开始，Agent 会自动为你进行优化。'
          }
        : writeMode === 'batch-optimize'
          ? {
              title: '今天要批量优化哪些页面？',
              desc: '每行输入一个页面 URL；多个 URL 将分别为每个页面创建独立对话。'
            }
          : {
              title: '今天想写什么？',
              desc: '输入主题即可开始，Agent 会结合 Skills 与提示词模板为你创作。'
            }

    return (
      <div className="chat-empty">
        <h2>{emptyCopy.title}</h2>
        <p>{emptyCopy.desc}</p>
      </div>
    )
  }

  const visibleMessages = messages.filter((message) => message.role !== 'status')

  return (
    <>
      <div className="chat-thread">
        <div className="chat-thread-inner">
          {visibleMessages.map((message) => (
            <ChatMessageItem
              key={message.id}
              message={message}
              onCopy={onCopy}
              onContextMenu={(event) => handleContextMenu(event, message)}
              waitingLabel={
                message.role === 'assistant' &&
                message.status === 'streaming' &&
                pipelineStatusMessage
                  ? pipelineStatusMessage
                  : undefined
              }
              waitingElapsedSec={pipelineElapsedSec}
              reviseSelectionEnabled={
                Boolean(reviseTargetMessageId) &&
                message.id === reviseTargetMessageId &&
                message.status === 'done'
              }
              reviseSelection={
                message.id === reviseTargetMessageId ? reviseSelection : null
              }
              onReviseSelectionChange={onReviseSelectionChange}
              onApplyRevision={onApplyRevision}
              onCancelRevision={onCancelRevision}
            />
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      <MessageContextMenu
        message={contextMessage}
        position={contextMenu}
        deleteDisabled={isRunning}
        onClose={() => setContextMenu(null)}
        onDelete={(messageId) => onDeleteMessage?.(messageId)}
      />
    </>
  )
}
