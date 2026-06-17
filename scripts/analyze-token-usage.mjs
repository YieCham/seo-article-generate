import fs from 'fs'
import path from 'path'

const base = path.join(process.env.APPDATA, 'ai-article-agent')
const data = JSON.parse(fs.readFileSync(path.join(base, 'token-usage.json'), 'utf8'))
const config = JSON.parse(fs.readFileSync(path.join(base, 'config.json'), 'utf8'))

const STEP_CAPS = {
  sectionDraft: 12288,
  polish: 12288,
  lengthAdjust: 12288,
  outline: 24576,
  plan: 24576
}

const SECTION_DRAFT_RULES = {
  light: { multiplier: 3.6, floor: 1230 },
  default: { multiplier: 5.0, floor: 4096 },
  heavy: { multiplier: 5.5, floor: 6144 }
}

function resolveSectionDraft(words, globalMax, tier = 'default') {
  const g = globalMax
  const cap = STEP_CAPS.sectionDraft
  const rule = SECTION_DRAFT_RULES[tier]
  const estimated = Math.ceil(words * rule.multiplier)
  return Math.min(g, cap, Math.max(rule.floor, estimated))
}

console.log('=== Config ===')
console.log('Global llmMaxTokens:', config.llmMaxTokens)
console.log('Model:', config.llmPresets?.find((p) => p.id === config.activeLlmPresetId)?.model)
console.log('Records:', data.records.length)

console.log('\n=== Truncation risk (completion >= 95% of maxTokensRequested) ===')
const truncated = data.records.filter(
  (r) => r.maxTokensRequested && r.completionTokens >= r.maxTokensRequested * 0.95
)
for (const r of truncated) {
  const pct = ((r.completionTokens / r.maxTokensRequested) * 100).toFixed(1)
  console.log(
    `${pct}% | ${r.pipeline}/${r.step} | out=${r.completionTokens} cap=${r.maxTokensRequested} | ${r.label.slice(0, 70)}`
  )
}

console.log('\n=== Draft sections (chronological) ===')
const drafts = data.records.filter((r) => r.step === 'draft').reverse()
for (const r of drafts) {
  const pct = r.maxTokensRequested
    ? `${((r.completionTokens / r.maxTokensRequested) * 100).toFixed(0)}%`
    : 'n/a'
  const flag = r.maxTokensRequested && r.completionTokens >= r.maxTokensRequested ? ' ⚠ HIT CAP' : ''
  console.log(
    `${pct.padStart(4)} out=${String(r.completionTokens).padStart(5)} cap=${String(r.maxTokensRequested).padStart(5)}${flag} | ${r.label.replace('正在撰写第 ', '')}`
  )
}

console.log('\n=== Word budget → sectionDraft cap (typical 10-section outline) ===')
const budgets = [
  ['SEO Meta (flex)', 105],
  ['Quick Answer', 100],
  ['Introduction', 150],
  ['Part section (flex)', 105],
  ['Part w/ Step-by-Steps', 105],
  ['FAQ', 220],
  ['Conclusion', 150]
]
for (const [name, words] of budgets) {
  const cap = resolveSectionDraft(words, config.llmMaxTokens)
  console.log(`${name.padEnd(28)} ${words}w → max_tokens=${cap}`)
}
