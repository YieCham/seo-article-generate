import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import MarkdownContent from './MarkdownContent'

const COLLAPSED_MAX_HEIGHT = 260

interface CollapsibleMarkdownCardProps {
  content: string
  className?: string
  formatContent?: (raw: string) => string
  expandLabel?: string
  collapseLabel?: string
}

export default function CollapsibleMarkdownCard({
  content,
  className = '',
  formatContent,
  expandLabel = '展开全文',
  collapseLabel = '收起'
}: CollapsibleMarkdownCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [needsToggle, setNeedsToggle] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)

  const formatted = useMemo(
    () => (formatContent ? formatContent(content) : content),
    [content, formatContent]
  )

  useLayoutEffect(() => {
    const el = bodyRef.current
    if (!el) return

    const prevMaxHeight = el.style.maxHeight
    el.style.maxHeight = 'none'
    const fullHeight = el.scrollHeight
    el.style.maxHeight = prevMaxHeight

    setNeedsToggle(fullHeight > COLLAPSED_MAX_HEIGHT + 4)
  }, [formatted])

  const collapsed = needsToggle && !expanded

  return (
    <div
      className={[
        'collapsible-markdown-card',
        className,
        collapsed ? 'is-collapsed' : '',
        expanded ? 'is-expanded' : ''
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div ref={bodyRef} className="collapsible-markdown-card-body">
        <MarkdownContent content={formatted} />
      </div>
      {needsToggle ? (
        <div className="collapsible-markdown-card-footer">
          {collapsed ? <div className="collapsible-markdown-card-fade" aria-hidden="true" /> : null}
          <button
            type="button"
            className="collapsible-markdown-card-toggle"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
          >
            {expanded ? collapseLabel : expandLabel}
          </button>
        </div>
      ) : null}
    </div>
  )
}
