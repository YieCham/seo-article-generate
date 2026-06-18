import type { ArticleType } from '../constants/articleTypes'

export async function syncSkillsForArticleType(articleType: ArticleType): Promise<void> {
  await window.app.syncArticleTypeSkills(articleType)
}

/** @deprecated Use syncSkillsForArticleType */
export async function syncReviewSkillForArticleType(articleType: ArticleType): Promise<void> {
  await syncSkillsForArticleType(articleType)
}
