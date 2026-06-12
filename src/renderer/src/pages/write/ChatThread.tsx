import { useEffect, useRef } from 'react'
import type { ChatMessage } from './types'
import ChatMessageItem from './ChatMessageItem'
import { IconSparkles } from '../../components/Icons'

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
}

export default function ChatThread({ messages, onCopy, onSuggest }: ChatThreadPropsWithSuggest) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (messages.length === 0) {
    return (
      <div className="chat-empty">
        <div className="empty-glow empty-glow-a" aria-hidden="true" />
        <div className="empty-glow empty-glow-b" aria-hidden="true" />
        <div className="empty-logo">
          <IconSparkles size={22} />
        </div>
        <h2>今天想写什么？</h2>
        <p>输入主题即可开始，Agent 会结合 Skills 与提示词模板为你创作。</p>
        <div className="suggestion-grid">
          {SUGGESTIONS.map((item) => (
            <button key={item} type="button" className="suggestion-chip" onClick={() => onSuggest(item)}>
              <span className="chip-label">推荐主题</span>
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
          <ChatMessageItem key={message.id} message={message} onCopy={onCopy} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
