export type ArticleType = 'how-to' | 'review' | 'top-rank'

export const REVIEW_SKILL_ID = 'product-review'

export const ARTICLE_TYPE_OPTIONS: Array<{ value: ArticleType; label: string }> = [
  { value: 'how-to', label: 'How to' },
  { value: 'top-rank', label: 'Top rank' },
  { value: 'review', label: 'Review' }
]

export const ARTICLE_TYPE_STORAGE_KEY = 'composer.articleType'

export function isArticleType(value: string | null | undefined): value is ArticleType {
  return value === 'how-to' || value === 'review' || value === 'top-rank'
}
