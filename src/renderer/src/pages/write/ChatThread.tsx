import { useEffect, useRef } from 'react'
import type { ChatMessage } from './types'
import ChatMessageItem from './ChatMessageItem'

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
  sectionEditDisabled?: boolean
  sectionEditTopic?: string
  outputLanguage?: string
  onSectionEditApply?: (messageId: string, content: string) => void
  onSectionEditBusyChange?: (busy: boolean) => void
}

export default function ChatThread({
  messages,
  onCopy,
  onSuggest,
  sectionEditDisabled,
  sectionEditTopic,
  outputLanguage,
  onSectionEditApply,
  onSectionEditBusyChange
}: ChatThreadPropsWithSuggest) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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
    <div className="chat-thread">
      <div className="chat-thread-inner">
        {messages.map((message) => (
          <ChatMessageItem
            key={message.id}
            message={message}
            onCopy={onCopy}
            sectionEditDisabled={sectionEditDisabled}
            sectionEditTopic={sectionEditTopic}
            outputLanguage={outputLanguage}
            onSectionEditApply={onSectionEditApply}
            onSectionEditBusyChange={onSectionEditBusyChange}
          />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
