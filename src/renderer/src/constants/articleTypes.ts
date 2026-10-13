import type { ArticleType } from '../../../shared/domainPacks'

export type { ArticleType } from '../../../shared/domainPacks'
export { isArticleType } from '../../../shared/domainPacks'

export const REVIEW_SKILL_ID = 'product-review'

export const ARTICLE_TYPE_OPTIONS: Array<{ value: ArticleType; label: string }> = [
  { value: 'how-to', label: 'How to' },
  { value: 'top-rank', label: 'Top rank' },
  { value: 'review', label: 'Review' }
]

export const ARTICLE_TYPE_STORAGE_KEY = 'composer.articleType'
