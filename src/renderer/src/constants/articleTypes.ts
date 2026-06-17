export type ArticleType = 'how-to' | 'review'

export const REVIEW_SKILL_ID = 'product-review'

export const ARTICLE_TYPE_OPTIONS: Array<{ value: ArticleType; label: string }> = [
  { value: 'how-to', label: 'How to' },
  { value: 'review', label: 'Review' }
]

export const ARTICLE_TYPE_STORAGE_KEY = 'composer.articleType'
