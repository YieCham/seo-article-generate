import { orderByArticleModule } from './articleModules'
import { isSeoMetaHeading, plainHeadingText } from './inPageNav'
import type { PipelineCheckpoint, PipelineStep } from './pipelineCheckpoint'

export type ProgressTaskStatus = 'pending' | 'active' | 'done'

export type ProgressBoardPhase = 'empty' | 'preparing' | 'outlined' | 'drafting' | 'finishing' | 'done'

export interface ProgressBoardTask {
  id: string
  title: string
  status: ProgressTaskStatus
}

export interface ArticleProgressBoard {
  phase: ProgressBoardPhase
  caption: string
  completedCount: number
  totalCount: number
  tasks: ProgressBoardTask[]
}

const PREP_TASKS: Array<{ id: string; title: string; steps: PipelineStep[] }> = [
  { id: 'prep-research', title: '调研资料', steps: ['skills', 'expand', 'search', 'scrape', 'extract'] },
  { id: 'prep-plan', title: '内容规划', steps: ['plan'] },
  { id: 'prep-outline', title: '生成大纲', steps: ['outline'] }
]

const FINISH_STEPS = new Set<PipelineStep>(['polish', 'length', 'meta'])

function fenceMask(lines: string[]): boolean[] {
  const mask: boolean[] = []
  let open = false
  for (const line of lines) {
    if (/^\s*(`{3,}|~{3,})/.test(line)) {
      mask.push(true)
      open = !open
      continue
    }
    mask.push(open)
  }
  return mask
}

/** Split markdown on `##` headings. Empty when none exist (unlike llmClient fallback). */
export function parseH2Sections(markdown: string): Array<{ title: string; body: string }> {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const inFence = fenceMask(lines)
  const sections: Array<{ title: string; body: string }> = []
  let current: { title: string; body: string } | null = null

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!inFence[index] && /^##(?!#)\s+/.test(line)) {
      const title = plainHeadingText(line.replace(/^##\s+/, ''))
      if (isSeoMetaHeading(title)) {
        current = null
        continue
      }
      if (current) sections.push(current)
      current = { title, body: '' }
      continue
    }
    if (current) current.body += `${line}\n`
  }
  if (current) sections.push(current)
  return sections
}

export function outlineSectionTitles(markdown: string): string[] {
  return parseH2Sections(markdown)
    .map((item) => item.title)
    .filter((title) => title.length > 0 && title !== '正文')
}

function normalizeTitle(title: string): string {
  return plainHeadingText(title)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function progressTitlesMatch(a: string, b: string): boolean {
  const left = normalizeTitle(a)
  const right = normalizeTitle(b)
  if (!left || !right) return false
  if (left === right) return true
  return left.includes(right) || right.includes(left)
}

function sequentialWrittenCount(article: string, titles: string[]): number {
  let count = 0
  const headings = parseH2Sections(article)
  for (const title of titles) {
    if (!headings.some((item) => progressTitlesMatch(item.title, title))) break
    count += 1
  }
  return count
}

function asPipelineStep(value: string | undefined): PipelineStep | undefined {
  if (!value) return undefined
  const steps: PipelineStep[] = [
    'skills',
    'expand',
    'search',
    'scrape',
    'extract',
    'plan',
    'outline',
    'draft',
    'polish',
    'length',
    'meta'
  ]
  return steps.find((step) => step === value)
}

function prepStatus(taskSteps: PipelineStep[], current?: PipelineStep): ProgressTaskStatus {
  if (!current) return taskSteps[0] === 'skills' ? 'active' : 'pending'
  const order: PipelineStep[] = PREP_TASKS.flatMap((item) => item.steps)
  const currentIndex = order.indexOf(current)
  const lastTaskIndex = Math.max(...taskSteps.map((step) => order.indexOf(step)))
  const firstTaskIndex = Math.min(...taskSteps.map((step) => order.indexOf(step)))
  if (currentIndex < 0) {
    return FINISH_STEPS.has(current) || current === 'draft' ? 'done' : 'pending'
  }
  if (currentIndex > lastTaskIndex) return 'done'
  if (currentIndex >= firstTaskIndex) return 'active'
  return 'pending'
}

function checkpointWrittenCount(checkpoint?: PipelineCheckpoint | null): number | null {
  if (!checkpoint) return null
  if (FINISH_STEPS.has(checkpoint.nextStep)) {
    return (
      checkpoint.draftSectionCount ??
      outlineSectionTitles(checkpoint.outline ?? '').length
    )
  }
  if (checkpoint.nextStep === 'draft') {
    return checkpoint.draftSectionIndex ?? 0
  }
  return null
}

function buildPrepBoard(currentStep?: PipelineStep, statusMessage?: string): ArticleProgressBoard {
  const tasks = PREP_TASKS.map((item) => ({
    id: item.id,
    title: item.title,
    status: prepStatus(item.steps, currentStep)
  }))
  const completedCount = tasks.filter((item) => item.status === 'done').length
  const active = tasks.find((item) => item.status === 'active')
  return {
    phase: 'preparing',
    caption: statusMessage?.trim() || (active ? `正在${active.title}…` : '正在准备大纲…'),
    completedCount,
    totalCount: tasks.length,
    tasks
  }
}

export function buildArticleProgressBoard(input: {
  outline?: string
  articleMarkdown?: string
  checkpoint?: PipelineCheckpoint | null
  pipelineStep?: string
  statusMessage?: string
  isRunning: boolean
  articleComplete: boolean
}): ArticleProgressBoard {
  const outline = input.outline?.trim() || input.checkpoint?.outline?.trim() || ''
  const outlineTitles = outlineSectionTitles(outline)
  const articleTitles = outlineSectionTitles(input.articleMarkdown ?? '')
  const titles = orderByArticleModule(
    outlineTitles.length > 0 ? outlineTitles : articleTitles,
    (title) => title
  )
  const currentStep = asPipelineStep(input.pipelineStep) ?? input.checkpoint?.nextStep

  if (titles.length === 0) {
    if (input.isRunning) return buildPrepBoard(currentStep, input.statusMessage)
    return {
      phase: 'empty',
      caption: '输入主题后，大纲会显示在这里',
      completedCount: 0,
      totalCount: 0,
      tasks: []
    }
  }

  const fromArticle = sequentialWrittenCount(input.articleMarkdown ?? '', titles)
  const fromCheckpoint = checkpointWrittenCount(input.checkpoint)
  let completed = Math.max(fromArticle, fromCheckpoint ?? 0)

  let phase: ProgressBoardPhase = 'drafting'
  if (!input.isRunning && input.articleComplete) {
    completed = titles.length
    phase = 'done'
  } else if (input.isRunning && (currentStep ? FINISH_STEPS.has(currentStep) : false)) {
    completed = Math.max(completed, titles.length)
    phase = 'finishing'
  } else if (!input.isRunning && completed >= titles.length) {
    phase = 'done'
  } else if (!input.isRunning) {
    phase = completed > 0 ? 'drafting' : 'outlined'
  }

  completed = Math.max(0, Math.min(titles.length, completed))

  const tasks = titles.map((title, index) => {
    let status: ProgressTaskStatus = 'pending'
    if (index < completed) status = 'done'
    else if (index === completed && phase === 'drafting' && input.isRunning) {
      status = 'active'
    }
    return { id: `section-${index}`, title, status }
  })

  const active = tasks.find((item) => item.status === 'active')
  let caption = input.statusMessage?.trim() || ''
  if (!caption) {
    if (phase === 'done') caption = '全部章节已完成'
    else if (phase === 'finishing') caption = '结构性检查…'
    else if (phase === 'outlined') caption = '大纲已生成'
    else if (active) caption = `正在撰写：${active.title}`
    else caption = '等待开始撰写…'
  }

  return {
    phase,
    caption,
    completedCount: tasks.filter((item) => item.status === 'done').length,
    totalCount: tasks.length,
    tasks
  }
}
