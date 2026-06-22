import type { ReactNode, Ref } from 'react'
import ReactMarkdown, { type Components, type ExtraProps } from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface MarkdownContentProps {
  content: string
  streaming?: boolean
  sourceMapping?: boolean
  editableSelection?: boolean
  className?: string
  bodyRef?: Ref<HTMLDivElement>
}

type MarkdownNode = {
  position?: {
    start?: { offset?: number }
    end?: { offset?: number }
  }
}

function getNodeOffsets(node?: MarkdownNode): { start?: number; end?: number } {
  return {
    start: node?.position?.start?.offset,
    end: node?.position?.end?.offset
  }
}

function createSourceMappingComponents(): Components {
  const block = (
    Tag: 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'li' | 'blockquote' | 'td' | 'th' | 'pre'
  ) => {
    return ({ node, children, ...props }: ExtraProps & { node?: MarkdownNode; children?: ReactNode }) => {
      const { start, end } = getNodeOffsets(node)
      const mappedProps = {
        ...props,
        'data-md-start': start,
        'data-md-end': end,
        children
      }

      switch (Tag) {
        case 'p':
          return <p {...mappedProps} />
        case 'h1':
          return <h1 {...mappedProps} />
        case 'h2':
          return <h2 {...mappedProps} />
        case 'h3':
          return <h3 {...mappedProps} />
        case 'h4':
          return <h4 {...mappedProps} />
        case 'h5':
          return <h5 {...mappedProps} />
        case 'h6':
          return <h6 {...mappedProps} />
        case 'li':
          return <li {...mappedProps} />
        case 'blockquote':
          return <blockquote {...mappedProps} />
        case 'td':
          return <td {...mappedProps} />
        case 'th':
          return <th {...mappedProps} />
        case 'pre':
          return <pre {...mappedProps} />
      }
    }
  }

  return {
    p: block('p'),
    h1: block('h1'),
    h2: block('h2'),
    h3: block('h3'),
    h4: block('h4'),
    h5: block('h5'),
    h6: block('h6'),
    li: block('li'),
    blockquote: block('blockquote'),
    td: block('td'),
    th: block('th'),
    pre: block('pre'),
    text: ({ node, children }) => {
      const { start, end } = getNodeOffsets(node)
      if (start == null || end == null) return <>{children}</>
      return (
        <span className="md-source-span" data-md-start={start} data-md-end={end}>
          {children}
        </span>
      )
    },
    code: ({ node, className, children, ...props }) => {
      const { start, end } = getNodeOffsets(node)
      return (
        <code className={className} data-md-start={start} data-md-end={end} {...props}>
          {children}
        </code>
      )
    }
  }
}

const sourceMappingComponents = createSourceMappingComponents()

function createLinkComponent(): Components['a'] {
  return ({ href, children, ...props }) => {
    const isExternal =
      typeof href === 'string' &&
      (/^https?:\/\//i.test(href) || /^mailto:/i.test(href))

    return (
      <a
        {...props}
        href={href}
        target={isExternal ? '_blank' : undefined}
        rel={isExternal ? 'noopener noreferrer' : undefined}
      >
        {children}
      </a>
    )
  }
}

const linkComponent = createLinkComponent()

function mergeMarkdownComponents(base?: Components): Components {
  return {
    ...base,
    a: linkComponent
  }
}

export default function MarkdownContent({
  content,
  streaming,
  sourceMapping = false,
  editableSelection = false,
  className,
  bodyRef
}: MarkdownContentProps) {
  if (!content && streaming) {
    return (
      <div className="thinking-row">
        <span className="thinking-dot" />
        <span className="thinking-dot" />
        <span className="thinking-dot" />
      </div>
    )
  }

  const bodyClass = [
    'markdown-body',
    streaming ? 'is-streaming' : '',
    sourceMapping ? 'has-source-map' : '',
    editableSelection ? 'is-section-editable' : '',
    className ?? ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div ref={bodyRef} className={bodyClass}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={mergeMarkdownComponents(sourceMapping ? sourceMappingComponents : undefined)}
      >
        {content}
      </ReactMarkdown>
      {streaming ? <span className="stream-cursor" aria-hidden="true" /> : null}
    </div>
  )
}
