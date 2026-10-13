import { insertInlineInternalLinks, urlsInMarkdown } from '../../shared/internalLinks'
import { resolveInternalLinkDocs } from '../internalLink/internalLinkStore'

export interface InsertInlineInternalLinksOptions {
  markdown: string
  topic: string
  outline?: string
  productId?: string
  productName?: string
  searchHints?: string[]
  language?: string
}

export interface InsertInlineInternalLinksResult {
  markdown: string
  matched: number
  inserted: number
  skippedReason?: string
}

export async function insertInlineInternalLinksIntoArticle(
  options: InsertInlineInternalLinksOptions
): Promise<InsertInlineInternalLinksResult> {
  const resolved = await resolveInternalLinkDocs({
    productId: options.productId,
    productName: options.productName
  })
  const documents = resolved.documents
  if (documents.length === 0) {
    return {
      markdown: options.markdown,
      matched: 0,
      inserted: 0,
      skippedReason: '该产品尚未导入内链库'
    }
  }

  const inserted = insertInlineInternalLinks(options.markdown, documents, {
    topic: options.topic,
    excludeUrls: urlsInMarkdown(options.markdown)
  })

  if (inserted.inserted === 0) {
    return {
      markdown: options.markdown,
      matched: 0,
      inserted: 0,
      skippedReason: '正文没有可自然对应的短语'
    }
  }

  return {
    markdown: inserted.markdown,
    matched: inserted.inserted,
    inserted: inserted.inserted
  }
}
