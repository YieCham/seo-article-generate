import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface MarkdownContentProps {
  content: string
  streaming?: boolean
}

export default function MarkdownContent({ content, streaming }: MarkdownContentProps) {
  if (!content && streaming) {
    return (
      <div className="thinking-row">
        <span className="thinking-dot" />
        <span className="thinking-dot" />
        <span className="thinking-dot" />
      </div>
    )
  }

  return (
    <div className={`markdown-body${streaming ? ' is-streaming' : ''}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      {streaming ? <span className="stream-cursor" aria-hidden="true" /> : null}
    </div>
  )
}
