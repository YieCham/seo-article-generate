export type LengthHunkOp = 'delete' | 'insert_after' | 'replace'

export interface LengthHunk {
  id: string
  op: LengthHunkOp
  sectionTitle: string
  find: string
  with?: string
  wordDelta: number
  preview: string
}

export type LengthWorkbenchStatus = 'idle' | 'in_range' | 'patched' | 'skipped'

export interface LengthWorkbenchState {
  status: LengthWorkbenchStatus
  words: number
  min: number
  max: number
  label: string
  hunks: LengthHunk[]
  pending: boolean
  baseline?: string
}

export function defaultLengthBounds(
  articleType?: string,
  pipeline?: 'create' | 'optimize' | 'batch-optimize'
): { min: number; max: number; label: string } {
  if (pipeline === 'optimize' || pipeline === 'batch-optimize') {
    return { min: 1100, max: 2500, label: '1100–2500' }
  }
  if (articleType === 'top-rank') {
    return { min: 1200, max: 2000, label: '1200–2000' }
  }
  return { min: 1000, max: 1800, label: '1000–1800' }
}

export function formatLengthHunkDelta(delta: number): string {
  if (delta > 0) return `+${delta} 词`
  if (delta < 0) return `−${Math.abs(delta)} 词`
  return '0 词'
}

export function previewLengthHunkText(text: string, max = 72): string {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= max) return collapsed
  return `${collapsed.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

function replaceFirst(source: string, needle: string, replacement: string): string | null {
  if (!needle) return null
  const index = source.indexOf(needle)
  if (index < 0) return null
  return `${source.slice(0, index)}${replacement}${source.slice(index + needle.length)}`
}

export function lengthInsertMarker(id: string): string {
  return `[[+${id}]] `
}

export function parseLengthInsertMarker(text: string): { id: string; rest: string } | null {
  const match = text.match(/^\[\[\+([^\]]+)\]\]\s*/)
  if (!match) return null
  return { id: match[1], rest: text.slice(match[0].length) }
}

/** Visual preview of unpatched baseline: deleted sentences struck through, inserts marked. */
export function buildLengthHighlightMarkdown(baseline: string, hunks: LengthHunk[]): string {
  let text = baseline
  for (const hunk of hunks) {
    const find = hunk.find.trim()
    if (!find) continue
    if (hunk.op === 'delete') {
      const next = replaceFirst(text, find, `~~${find}~~`)
      if (next != null) text = next
      continue
    }
    if (hunk.op === 'replace') {
      const inserted = (hunk.with ?? '').trim()
      if (!inserted) continue
      const next = replaceFirst(text, find, `${lengthInsertMarker(hunk.id)}${inserted}`)
      if (next != null) text = next
      continue
    }
    const inserted = (hunk.with ?? '').trim()
    if (!inserted) continue
    const next = replaceFirst(text, find, `${find}\n\n${lengthInsertMarker(hunk.id)}${inserted}`)
    if (next != null) text = next
  }
  return text
}

function asHunk(value: unknown, index: number): LengthHunk | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<LengthHunk>
  const op =
    raw.op === 'insert_after' ? 'insert_after' : raw.op === 'replace' ? 'replace' : raw.op === 'delete' ? 'delete' : null
  if (!op) return null
  const find = typeof raw.find === 'string' ? raw.find : ''
  if (!find.trim()) return null
  const wordDelta = typeof raw.wordDelta === 'number' && Number.isFinite(raw.wordDelta) ? raw.wordDelta : 0
  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id : `hunk-${index}`,
    op,
    sectionTitle: typeof raw.sectionTitle === 'string' ? raw.sectionTitle : '',
    find,
    with: typeof raw.with === 'string' ? raw.with : undefined,
    wordDelta,
    preview: typeof raw.preview === 'string' ? raw.preview : previewLengthHunkText(raw.with || find)
  }
}

export function normalizeLengthWorkbench(value: unknown): LengthWorkbenchState | undefined {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Partial<LengthWorkbenchState>
  const min = typeof raw.min === 'number' && Number.isFinite(raw.min) ? raw.min : NaN
  const max = typeof raw.max === 'number' && Number.isFinite(raw.max) ? raw.max : NaN
  if (!Number.isFinite(min) || !Number.isFinite(max)) return undefined

  const status: LengthWorkbenchStatus =
    raw.status === 'in_range' || raw.status === 'patched' || raw.status === 'skipped' || raw.status === 'idle'
      ? raw.status
      : 'idle'

  return {
    status,
    words: typeof raw.words === 'number' && Number.isFinite(raw.words) ? raw.words : 0,
    min,
    max,
    label: typeof raw.label === 'string' && raw.label.trim() ? raw.label : `${min}–${max}`,
    hunks: Array.isArray(raw.hunks)
      ? raw.hunks.map((item, index) => asHunk(item, index)).filter((item): item is LengthHunk => item != null)
      : [],
    pending: raw.pending === true,
    baseline: typeof raw.baseline === 'string' && raw.baseline.trim() ? raw.baseline : undefined
  }
}
