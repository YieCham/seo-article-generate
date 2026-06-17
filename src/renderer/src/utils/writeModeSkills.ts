import { REVIEW_SKILL_ID, type ArticleType } from '../constants/articleTypes'

export async function syncReviewSkillForArticleType(articleType: ArticleType): Promise<void> {
  await window.app.setSkillEnabled(REVIEW_SKILL_ID, articleType === 'review', 'create')
}
