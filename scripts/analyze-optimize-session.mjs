import fs from 'fs'
import path from 'path'

const chatPath = path.join(process.env.APPDATA, 'ai-article-agent', 'chat-sessions.json')
const configPath = path.join(process.env.APPDATA, 'ai-article-agent', 'config.json')

const estTok = (chars) => Math.ceil(chars / 3.8)
const wc = (t) =>
  t
    .replace(/[^\w\u4e00-\u9fff]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length

const STEP_CAPS = {
  intentExpand: 4096,
  eeatExtract: 8192,
  optimizeAudit: 12288,
  outline: 16384,
  optimizeDraft: 16384,
  optimizeSectionDraft: 8192,
  optimizePolish: 16384,
  optimizeLengthAdjust: 12288,
  seoMeta: 1000
}

function resolveOptimize(step, globalMax, wordBudget) {
  const g = globalMax
  const cap = STEP_CAPS[step]
  const rules = {
    optimizeDraft: { m: 2.8, floor: 2048 },
    optimizeSectionDraft: { m: 2.8, floor: 1024 },
    optimizePolish: { m: 2.6, floor: 2048 },
    optimizeLengthAdjust: { m: 2.6, floor: 2048 }
  }
  if (rules[step] && wordBudget != null) {
    const { m, floor } = rules[step]
    return Math.min(g, cap, Math.max(floor, Math.ceil(wordBudget * m)))
  }
  return Math.min(g, cap)
}

const chat = JSON.parse(fs.readFileSync(chatPath, 'utf8'))
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
const globalMax = config.llmMaxTokens ?? 32768

const session = chat.sessions.find((s) => s.writeMode === 'optimize')
if (!session) {
  console.error('No optimize session')
  process.exit(1)
}

console.log('Session:', session.title)
console.log('Global llmMaxTokens:', globalMax)
console.log('')

for (const m of session.messages) {
  const c = m.content || ''
  console.log(
    `${m.role.padEnd(10)} chars=${String(c.length).padStart(6)} words≈${String(wc(c)).padStart(5)} estTok≈${estTok(c)}`
  )
}

const final = session.messages.find((m) => m.role === 'assistant')
const planning = session.messages.find((m) => m.role === 'planning')
const research = session.messages.find((m) => m.role === 'research')

const body = final.content.replace(/^## SEO Meta[\s\S]*?---\n\n/, '')
const bodyWords = wc(body)
const auditWords = wc(planning?.content || '')
const gapWords = wc(research?.content || '')

console.log('\n=== Step output need vs NEW cap (global=' + globalMax + ') ===')
const rows = [
  ['intentExpand', estTok(500), Math.min(globalMax, STEP_CAPS.intentExpand)],
  ['eeatExtract (竞品缺口)', estTok(research?.content?.length || 0), Math.min(globalMax, STEP_CAPS.eeatExtract)],
  ['optimizeAudit (诊断)', estTok(planning?.content?.length || 0), Math.min(globalMax, STEP_CAPS.optimizeAudit)],
  ['outline enrich', estTok(3000), Math.min(globalMax, STEP_CAPS.outline)],
  ['optimizeDraft (全文)', estTok(body.length), resolveOptimize('optimizeDraft', globalMax, bodyWords)],
  ['optimizeSectionDraft (450w节)', estTok(450 * 5), resolveOptimize('optimizeSectionDraft', globalMax, 450)],
  ['optimizePolish (终稿)', estTok(body.length), resolveOptimize('optimizePolish', globalMax, bodyWords)],
  ['optimizeLengthAdjust', estTok(body.length), resolveOptimize('optimizeLengthAdjust', globalMax, bodyWords)]
]

for (const [name, need, cap] of rows) {
  const ok = need <= cap ? 'OK' : 'TRUNCATED?'
  console.log(`${String(name).padEnd(32)} need≈${String(need).padStart(5)} cap=${String(cap).padStart(5)} ${ok}`)
}

console.log(`\nOLD per-section bug (200w budget): cap≈512 tok`)
console.log(`NEW per-section (450w original): cap=${resolveOptimize('optimizeSectionDraft', globalMax, 450)} tok`)

console.log('\n=== Content gaps vs diagnosis ===')
const out = body
const checks = [
  ['AudFun Step 1/2/3 tutorial', /Step 1:|Step 2:|Step 3:/i.test(out)],
  ['Hot Tips internal links', /Hot Tips|premium-crack|telegram/i.test(out)],
  ['Dedicated official trial H2', /^## .*(Safe Way|Official.*Trial)/im.test(out)],
  ['Dedicated family plan H2', /^## .*Save on Spotify/im.test(out)],
  ['Part 4 download CTAs', /MusicConverter\.(exe|dmg)/i.test(out)],
  ['FAQ ≥5 questions', (out.match(/\*\*Q\d+/g) || []).length >= 5]
]
for (const [label, ok] of checks) console.log(`${ok ? '✓' : '✗'} ${label}`)

console.log('\nEstimated source words (from final+diagnosis):', Math.round(bodyWords * 0.92))

// Quick test: parse new H2 from planning (requires built main - skip if unavailable)
try {
  const { createRequire } = await import('module')
  const require = createRequire(import.meta.url)
  const { parseAuditRecommendedH2s } = require('../out/main/agent/optimizeStructure.js')
  const newH2 = parseAuditRecommendedH2s(planning?.content || '')
  console.log('\n=== Parsed audit NEW H2 (from planning) ===')
  newH2.forEach((item) => console.log('-', item.title, item.insertBefore ? `(before ${item.insertBefore})` : ''))
} catch {
  console.log('\n(build app to test parseAuditRecommendedH2s in script)')
}
