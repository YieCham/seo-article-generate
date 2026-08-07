export interface ResearchSourcePreviewPack {
  title: string
  url: string
  snippet: string
  position: number
  scraped: boolean
  error?: string
}

export interface CreateResearchPack {
  kind: 'create'
  topic: string
  searchQueries: string[]
  searchIntentSummary: string
  extracted: string
  researchSummary: string
  sources?: ResearchSourcePreviewPack[]
}

export interface OptimizeResearchPack {
  kind: 'optimize'
  sourceUrl: string
  sourceTitle: string
  sourceMarkdown: string
  competitorInsights: string
  researchSummary: string
}

export type ResearchPack = CreateResearchPack | OptimizeResearchPack

export function isCreateResearchPack(pack: ResearchPack | undefined | null): pack is CreateResearchPack {
  return pack?.kind === 'create'
}

export function isOptimizeResearchPack(
  pack: ResearchPack | undefined | null
): pack is OptimizeResearchPack {
  return pack?.kind === 'optimize'
}

export function createResearchPackMatchesTopic(
  pack: CreateResearchPack | undefined | null,
  topic: string
): boolean {
  if (!pack || pack.kind !== 'create') return false
  return pack.topic.trim() === topic.trim() && Boolean(pack.extracted?.trim())
}

export function optimizeResearchPackMatchesUrl(
  pack: OptimizeResearchPack | undefined | null,
  sourceUrl: string
): boolean {
  if (!pack || pack.kind !== 'optimize') return false
  const normalize = (url: string): string => {
    try {
      return new URL(url).href.replace(/\/$/, '').toLowerCase()
    } catch {
      return url.trim().replace(/\/$/, '').toLowerCase()
    }
  }
  return (
    normalize(pack.sourceUrl) === normalize(sourceUrl) &&
    Boolean(pack.sourceMarkdown?.trim()) &&
    Boolean(pack.competitorInsights?.trim())
  )
}
