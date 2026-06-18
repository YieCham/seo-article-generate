import { useEffect, useRef, useState, type MouseEvent } from 'react'
import type { ChatMessage } from './types'
import ChatMessageItem from './ChatMessageItem'
import MessageContextMenu from './MessageContextMenu'

interface ChatThreadProps {
  messages: ChatMessage[]
  onCopy: (content: string) => void
}

const SUGGESTIONS = [
  '2026 年 AI Agent 在企业内容生产中的应用',
  '如何用 Skills 提升 AI 写作质量',
  '写一篇面向产品经理的 RAG 入门科普'
]

interface ChatThreadPropsWithSuggest extends ChatThreadProps {
  onSuggest: (text: string) => void
  isRunning?: boolean
  sectionEditDisabled?: boolean
  sectionEditTopic?: string
  outputLanguage?: string
  onSectionEditApply?: (messageId: string, content: string) => void
  onSectionEditBusyChange?: (busy: boolean) => void
  onDeleteMessage?: (messageId: string) => void
  onApplyRevision?: (assistantMessageId: string) => void
  onCancelRevision?: (assistantMessageId: string) => void
}

export default function ChatThread({
  messages,
  onCopy,
  onSuggest,
  isRunning = false,
  sectionEditDisabled,
  sectionEditTopic,
  outputLanguage,
  onSectionEditApply,
  onSectionEditBusyChange,
  onDeleteMessage,
  onApplyRevision,
  onCancelRevision
}: ChatThreadPropsWithSuggest) {
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
    return (
      <div className="chat-empty">
        <h2>今天想写什么？</h2>
        <p>输入主题即可开始，Agent 会结合 Skills 与提示词模板为你创作。</p>
        <div className="suggestion-list">
          {SUGGESTIONS.map((item) => (
            <button key={item} type="button" className="suggestion-item" onClick={() => onSuggest(item)}>
              {item}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="chat-thread">
        <div className="chat-thread-inner">
          {messages.map((message) => (
            <ChatMessageItem
              key={message.id}
              message={message}
              onCopy={onCopy}
              onContextMenu={(event) => handleContextMenu(event, message)}
              sectionEditDisabled={sectionEditDisabled}
              sectionEditTopic={sectionEditTopic}
              outputLanguage={outputLanguage}
              onSectionEditApply={onSectionEditApply}
              onSectionEditBusyChange={onSectionEditBusyChange}
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
