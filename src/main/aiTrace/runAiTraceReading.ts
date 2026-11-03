import { chatCompletion, type LlmConfig } from '../agent/llmClient'
import { loadSkillBundleById, HUMANIZER_SKILL_ID } from '../agent/skillManager'
import { loadChatStore } from '../chat/chatStore'
import { getEffectiveConfig, loadConfig } from '../config/configStore'
import { createTokenRunContext, runWithTokenContext } from '../token/tokenUsageContext'
import {
  listCompletedArticles,
  scanAiTracePages,
  type AiTraceCounterexample,
  type AiTracePattern,
  type AiTraceQuote,
  type AiTraceReading,
  type AiTraceReport,
  type CompletedArticle
} from '../../shared/aiTrace'
import {
  buildArticleExcerpt,
  describeReading,
  judgePattern,
  normalizeMatchText,
  quoteAnchoredInText,
  quoteRepeatsDiscovery,
  type ArticleExcerpt
} from '../../shared/aiTraceReading'
import { loadAiTraceReport, saveAiTraceReport } from './aiTraceStore'

const BATCH_SIZE = 8
const MAX_POOL = 16
const MAX_PATTERNS = 8

interface DiscoveryDraft {
  name: string
  why: string
  suggestion: string
  evidence: AiTraceQuote[]
}

function chunk<T>(items: T[], size: number): T[][] {
  const groups: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size))
  }
  return groups
}

function preparePages(articles: CompletedArticle[]): ArticleExcerpt[] {
  return articles.map((article) => {
    const excerpt = buildArticleExcerpt(article.markdown)
    return {
      ...article,
      excerpt,
      plain: `${article.title}\n${article.markdown}`
    }
  })
}

function splitPools(pages: ArticleExcerpt[]): {
  discovery: ArticleExcerpt[]
  verify: ArticleExcerpt[]
  holdout: boolean
} {
  const sorted = [...pages].sort(
    (a, b) => a.title.localeCompare(b.title, 'zh-CN') || a.sessionId.localeCompare(b.sessionId)
  )
  if (sorted.length < BATCH_SIZE) {
    return { discovery: sorted, verify: sorted, holdout: false }
  }
  const mid = Math.ceil(sorted.length / 2)
  return {
    discovery: sorted.slice(0, mid).slice(0, MAX_POOL),
    verify: sorted.slice(mid).slice(0, MAX_POOL),
    holdout: true
  }
}

function humanizerRubric(content: string): string {
  const lines = content.split('\n').filter((line) => {
    const trimmed = line.trim()
    return (
      /^#{1,3}\s/.test(trimmed) ||
      trimmed.startsWith('**Words to watch:**') ||
      trimmed.startsWith('**Phrases to watch:**') ||
      trimmed.startsWith('**Problem:**')
    )
  })
  const text = lines.join('\n').trim()
  return text.slice(0, 5000)
}

function clip(text: string, max: number): string {
  const trimmed = text.replace(/\s+/g, ' ').trim()
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max).trim()
}

function parseJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  const slice = start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed
  let parsed: unknown
  try {
    parsed = JSON.parse(slice)
  } catch {
    throw new Error('模型没有返回可解析的 JSON')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('模型没有返回 JSON 对象')
  }
  return parsed as Record<string, unknown>
}

function asRecords(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
}

function textField(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  return typeof value === 'string' ? value.trim() : ''
}

function formatPages(pages: ArticleExcerpt[]): string {
  return pages
    .map(
      (page) =>
        `ID: ${page.sessionId}\n标题: ${page.title}\n摘录:\n${page.excerpt}`
    )
    .join('\n\n----\n\n')
}

function resolvePage(pages: ArticleExcerpt[], record: Record<string, unknown>): ArticleExcerpt | null {
  const id = textField(record, 'id') || textField(record, 'sessionId')
  if (id) {
    const match = pages.find((page) => page.sessionId === id)
    if (match) return match
  }
  const title = textField(record, 'title') || textField(record, '标题')
  if (!title) return null
  return (
    pages.find((page) => page.title === title) ??
    pages.find((page) => page.title.includes(title) || title.includes(page.title)) ??
    null
  )
}

function quotesFrom(records: Array<Record<string, unknown>>, pages: ArticleExcerpt[]): AiTraceQuote[] {
  const quotes: AiTraceQuote[] = []
  for (const record of records) {
    const page = resolvePage(pages, record)
    const quote = clip(textField(record, 'quote') || textField(record, '原句'), 400)
    if (!page || !quote) continue
    if (!quoteAnchoredInText(quote, page.plain)) continue
    if (quotes.some((item) => item.sessionId === page.sessionId && normalizeMatchText(item.quote) === normalizeMatchText(quote))) {
      continue
    }
    quotes.push({ sessionId: page.sessionId, title: page.title, quote })
  }
  return quotes
}

function parseDiscovery(text: string, pages: ArticleExcerpt[]): DiscoveryDraft[] {
  const parsed = parseJsonObject(text)
  const drafts: DiscoveryDraft[] = []
  for (const record of asRecords(parsed.patterns)) {
    const name = clip(textField(record, 'name'), 80)
    if (!name) continue
    const evidence = quotesFrom(asRecords(record.evidence), pages)
    const pagesHit = new Set(evidence.map((item) => item.sessionId))
    if (pagesHit.size < 2) continue
    drafts.push({
      name,
      why: clip(textField(record, 'why'), 400),
      suggestion: clip(textField(record, 'suggestion'), 400),
      evidence: evidence.slice(0, 6)
    })
  }
  return drafts.slice(0, MAX_PATTERNS)
}

function mergeDrafts(groups: DiscoveryDraft[][]): DiscoveryDraft[] {
  const merged: DiscoveryDraft[] = []
  for (const draft of groups.flat()) {
    const key = normalizeMatchText(draft.name)
    const existing = merged.find((item) => normalizeMatchText(item.name) === key)
    if (!existing) {
      merged.push({ ...draft, evidence: [...draft.evidence] })
      continue
    }
    for (const quote of draft.evidence) {
      if (existing.evidence.some((item) => item.sessionId === quote.sessionId && item.quote === quote.quote)) continue
      existing.evidence.push(quote)
    }
    if (!existing.why && draft.why) existing.why = draft.why
    if (!existing.suggestion && draft.suggestion) existing.suggestion = draft.suggestion
  }
  return merged.slice(0, MAX_PATTERNS)
}

function matchDraft(name: string, drafts: DiscoveryDraft[]): DiscoveryDraft | undefined {
  const key = normalizeMatchText(name)
  if (!key) return undefined
  return (
    drafts.find((item) => normalizeMatchText(item.name) === key) ??
    drafts.find((item) => {
      const other = normalizeMatchText(item.name)
      return other.length >= 4 && (other.includes(key) || key.includes(other))
    })
  )
}

async function complete(llm: LlmConfig, system: string, user: string, label: string): Promise<string> {
  return chatCompletion(
    llm,
    [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    {
      temperature: 0.2,
      maxTokens: 3500,
      step: 'ai-trace-read',
      label
    }
  )
}

function discoverySystem(rubric: string): string {
  return `你是编辑。比较多篇已完成文章的摘录，找出跨篇反复出现、而且换了说法仍然相同的写法习惯。不要评价单篇好不好，不要改写文章。

用这些 Humanizer 特征帮助识别，不要把清单本身当成结论：
${rubric || '套话起手、销售腔、空洞总结、标题复述、均匀的三段式、机器人收尾。'}

不要报告：产品名、合规免责声明、FAQ / Conclusion 等结构标题、菜单路径和操作步骤本身。本地字面扫描已经负责完全相同的句子；你要找的是措辞不同、腔调相同的规律。

只输出一个 JSON 对象，不要 Markdown：
{"patterns":[{"name":"不超过24字","why":"为什么像生成文本","suggestion":"以后可以怎么写","evidence":[{"id":"页面ID","quote":"从摘录里逐字复制的原句"}]}]}

每条规律至少引用 2 个不同页面。quote 必须能在对应摘录里原样找到。凑不齐两篇就不要写这条。最多 8 条。`
}

function verifySystem(): string {
  return `你要复核一组写作规律是否在这批文章里普遍成立。你看不到提出这些规律时用过的原句。请只根据下面的摘录自己寻找新原句，并指出哪些文章看不出这个习惯。

只输出一个 JSON 对象，不要 Markdown：
{"patterns":[{"name":"与给定名称完全一致","evidence":[{"id":"页面ID","quote":"摘录中的新原句"}],"absent":[{"id":"页面ID","note":"这篇文章实际怎么写"}]}]}

对每一条给定规律都要回答，name 必须原样照抄。evidence 只放摘录里逐字存在的句子，没有就用空数组。absent 写下这批摘录里看不出该习惯的页面；如果每一篇都有，absent 用空数组。不要编造原句。`
}

async function discoverBatch(
  llm: LlmConfig,
  pages: ArticleExcerpt[],
  rubric: string,
  clues: string[],
  ignored: string[]
): Promise<DiscoveryDraft[]> {
  const clueText = clues.length
    ? `本地字面扫描看到这些重复，只作线索，不要只把它们换个说法再交回来：\n${clues.map((item) => `- ${item}`).join('\n')}`
    : '本地字面扫描这次没有交出高频句。'
  const ignoreText = ignored.length ? `这些短语请忽略：\n${ignored.map((item) => `- ${item}`).join('\n')}` : ''
  const raw = await complete(
    llm,
    discoverySystem(rubric),
    `${clueText}\n\n${ignoreText}\n\n${formatPages(pages)}`.trim(),
    'AI 痕迹发现'
  )
  return parseDiscovery(raw, pages)
}

async function verifyBatch(
  llm: LlmConfig,
  pages: ArticleExcerpt[],
  drafts: DiscoveryDraft[]
): Promise<Map<string, { evidence: AiTraceQuote[]; absent: AiTraceCounterexample[] }>> {
  const names = drafts.map((draft, index) => `${index + 1}. ${draft.name}`).join('\n')
  const raw = await complete(
    llm,
    verifySystem(),
    `待复核的规律（只有名称）：\n${names}\n\n${formatPages(pages)}`,
    'AI 痕迹复核'
  )
  const parsed = parseJsonObject(raw)
  const found = new Map<string, { evidence: AiTraceQuote[]; absent: AiTraceCounterexample[] }>()
  for (const draft of drafts) found.set(draft.name, { evidence: [], absent: [] })

  for (const record of asRecords(parsed.patterns)) {
    const draft = matchDraft(textField(record, 'name'), drafts)
    if (!draft) continue
    const bucket = found.get(draft.name)
    if (!bucket) continue
    const discoveryTexts = draft.evidence.map((item) => item.quote)
    for (const quote of quotesFrom(asRecords(record.evidence), pages)) {
      if (quoteRepeatsDiscovery(quote.quote, discoveryTexts)) continue
      if (bucket.evidence.some((item) => item.sessionId === quote.sessionId && item.quote === quote.quote)) continue
      bucket.evidence.push(quote)
    }
    for (const absent of asRecords(record.absent)) {
      const page = resolvePage(pages, absent)
      const note = clip(textField(absent, 'note') || textField(absent, '说明'), 240)
      if (!page || !note) continue
      if (bucket.evidence.some((item) => item.sessionId === page.sessionId)) continue
      if (bucket.absent.some((item) => item.sessionId === page.sessionId)) continue
      bucket.absent.push({ sessionId: page.sessionId, title: page.title, note })
    }
  }
  return found
}

function combineVerify(
  maps: Array<Map<string, { evidence: AiTraceQuote[]; absent: AiTraceCounterexample[] }>>,
  drafts: DiscoveryDraft[]
): Map<string, { evidence: AiTraceQuote[]; absent: AiTraceCounterexample[] }> {
  const combined = new Map<string, { evidence: AiTraceQuote[]; absent: AiTraceCounterexample[] }>()
  for (const draft of drafts) combined.set(draft.name, { evidence: [], absent: [] })
  for (const map of maps) {
    for (const [name, bucket] of map) {
      const target = combined.get(name)
      if (!target) continue
      for (const quote of bucket.evidence) {
        if (target.evidence.some((item) => item.sessionId === quote.sessionId && item.quote === quote.quote)) continue
        target.evidence.push(quote)
      }
      for (const absent of bucket.absent) {
        if (target.evidence.some((item) => item.sessionId === absent.sessionId)) continue
        if (target.absent.some((item) => item.sessionId === absent.sessionId)) continue
        target.absent.push(absent)
      }
    }
  }
  return combined
}

async function readCompletedArticles(
  llm: LlmConfig,
  articles: CompletedArticle[],
  clues: string[],
  ignored: string[],
  minDocuments: number,
  minRatio: number
): Promise<AiTraceReading> {
  const pages = preparePages(articles)
  const pools = splitPools(pages)
  const bundle = await loadSkillBundleById(HUMANIZER_SKILL_ID)
  const rubric = bundle ? humanizerRubric(bundle.content) : ''
  const discoveryGroups: DiscoveryDraft[][] = []
  for (const group of chunk(pools.discovery, BATCH_SIZE)) {
    discoveryGroups.push(await discoverBatch(llm, group, rubric, clues, ignored))
  }
  const drafts = mergeDrafts(discoveryGroups)
  if (drafts.length === 0) {
    return {
      scannedAt: Date.now(),
      status: 'ok',
      message: `模型读了发现阶段 ${pools.discovery.length} 篇，没有归纳出能在原文里对上的跨篇规律。`,
      holdout: pools.holdout,
      discoveryPageCount: pools.discovery.length,
      verifyPageCount: 0,
      patterns: []
    }
  }

  const verifyMaps = []
  for (const group of chunk(pools.verify, BATCH_SIZE)) {
    verifyMaps.push(await verifyBatch(llm, group, drafts))
  }
  const verified = combineVerify(verifyMaps, drafts)
  const patterns: AiTracePattern[] = drafts.map((draft) => {
    const bucket = verified.get(draft.name) ?? { evidence: [], absent: [] }
    return judgePattern({
      name: draft.name,
      why: draft.why,
      suggestion: draft.suggestion,
      discoveryQuotes: draft.evidence,
      support: bucket.evidence,
      counterexamples: bucket.absent,
      checkedCount: pools.verify.length,
      minDocuments,
      minRatio
    })
  })
  const order: Record<AiTracePattern['verdict'], number> = {
    universal: 0,
    insufficient: 1,
    partial: 2,
    rejected: 3
  }
  patterns.sort((a, b) => order[a.verdict] - order[b.verdict] || b.supportCount - a.supportCount)

  return {
    scannedAt: Date.now(),
    status: 'ok',
    message: describeReading(patterns, pools.holdout, pools.discovery.length, pools.verify.length),
    holdout: pools.holdout,
    discoveryPageCount: pools.discovery.length,
    verifyPageCount: pools.verify.length,
    patterns
  }
}

function emptyReading(status: AiTraceReading['status'], message: string): AiTraceReading {
  return {
    scannedAt: Date.now(),
    status,
    message,
    holdout: false,
    discoveryPageCount: 0,
    verifyPageCount: 0,
    patterns: []
  }
}

export async function runAiTraceReading(): Promise<AiTraceReport> {
  const config = await loadConfig()
  const store = await loadChatStore()
  const productNames = config.quickPicks.products.map((item) => item.label)
  const scanned = scanAiTracePages(store.sessions, {
    config: config.aiTrace,
    productNames
  })
  const articles = listCompletedArticles(store.sessions)
  const minPages = config.aiTrace.minCorpusPages
  const preset = config.llmPresets.find((item) => item.id === config.aiTrace.readPresetId)
  const selectedModel = config.aiTrace.readModel
  const selectionReady = Boolean(preset && selectedModel && preset.models.includes(selectedModel))

  if (articles.length < minPages) {
    const report = {
      ...scanned,
      reading: emptyReading(
        'insufficient',
        `已完成成稿只有 ${articles.length} 篇，少于最低样本 ${minPages} 篇，模型先不读。`
      )
    }
    await saveAiTraceReport(report)
    return report
  }

  if (!selectionReady || !preset) {
    const report = {
      ...scanned,
      reading: emptyReading('error', '请先在「模型归纳」旁选择阅读模型。')
    }
    await saveAiTraceReport(report)
    return report
  }

  const effective = await getEffectiveConfig({ presetId: preset.id, model: selectedModel })
  const llm = effective.llm
  if (llm.model !== selectedModel || !llm.apiKey) {
    const report = {
      ...scanned,
      reading: emptyReading(
        'error',
        llm.model !== selectedModel
          ? '所选阅读模型不可用，请重新选择。'
          : `「${selectedModel}」没有 API Key，请先在 LLM 配置里填写该预设的密钥。`
      )
    }
    await saveAiTraceReport(report)
    return report
  }

  try {
    const reading = await runWithTokenContext(
      createTokenRunContext('other', `AI 痕迹阅读 · ${selectedModel}`),
      () =>
      readCompletedArticles(
        llm,
        articles,
        [...scanned.hits, ...scanned.knownHits].slice(0, 12).map((hit) => hit.phrase),
        [...productNames, ...config.aiTrace.ignorePhrases],
        config.aiTrace.minDocuments,
        config.aiTrace.minRatio
      )
    )
    const report = {
      ...scanned,
      reading: { ...reading, message: `使用 ${selectedModel}。${reading.message}` }
    }
    await saveAiTraceReport(report)
    return report
  } catch (error) {
    const previous = await loadAiTraceReport()
    const reading: AiTraceReading = {
      scannedAt: Date.now(),
      status: 'error',
      message: error instanceof Error ? error.message : '模型阅读失败',
      holdout: false,
      discoveryPageCount: 0,
      verifyPageCount: 0,
      patterns: previous?.reading?.patterns ?? []
    }
    const report = { ...scanned, reading }
    await saveAiTraceReport(report)
    return report
  }
}
