import { useState } from 'react'
import { IconCheck } from '../../components/Icons'
import {
  buildArticleProgressBoard,
  parseH2Sections,
  progressTitlesMatch,
  type ProgressBoardTask
} from '../../../../shared/articleProgress'
import { isSeoMetaHeading, plainHeadingText } from '../../../../shared/inPageNav'
import type { PipelineCheckpoint } from '../../../../shared/pipelineCheckpoint'
import {
  defaultLengthBounds,
  formatLengthHunkDelta,
  type LengthHunk,
  type LengthWorkbenchState
} from '../../../../shared/lengthWorkbench'
import { countArticleWords } from '../../../../shared/wordCount'
import LengthShrinkDialog, { type LengthShrinkChoice } from './LengthShrinkDialog'
import type { AiVoiceFinding } from '../../../../shared/aiVoice'

interface ProgressBoardProps {
  outline?: string
  articleMarkdown?: string
  checkpoint?: PipelineCheckpoint | null
  pipelineStep?: string
  statusMessage?: string
  isRunning: boolean
  articleComplete: boolean
  articleType?: string
  writeMode?: 'create' | 'optimize' | 'batch-optimize'
  lengthWorkbench?: LengthWorkbenchState
  onCalibrateLength?: (focusShrinks: LengthShrinkChoice[]) => void
  calibrateDisabled?: boolean
  aiVoiceBusy?: boolean
  aiVoicePhase?: 'flagged' | 'review'
  aiVoiceFindings?: Array<AiVoiceFinding & { selected: boolean }>
  onScanAiVoice?: () => void
  onSuggestAiVoice?: () => void
  onToggleAiVoice?: (id: string) => void
  onApplyAiVoice?: () => void
  onClearAiVoice?: () => void
}

function articleMarkdownRoot(): Element | null {
  const bodies = document.querySelectorAll(
    '.chat-thread .chat-message.is-assistant .section-editor-article .markdown-body'
  )
  return bodies.item(bodies.length - 1)
}

function articleHeadings(root: Element): HTMLHeadingElement[] {
  return Array.from(root.querySelectorAll('h2')).filter(
    (heading) => !isSeoMetaHeading(heading.textContent ?? '')
  )
}

function partNumber(title: string): string | null {
  const match = plainHeadingText(title).match(/^part\s*(\d+)\b/i)
  return match?.[1] ?? null
}

function pickClosest(
  matches: HTMLHeadingElement[],
  headings: HTMLHeadingElement[],
  index: number
): HTMLHeadingElement {
  return matches.reduce((best, heading) => {
    const current = headings.indexOf(heading)
    const previous = headings.indexOf(best)
    return Math.abs(current - index) < Math.abs(previous - index) ? heading : best
  })
}

function findArticleHeading(title: string, index: number): HTMLHeadingElement | null {
  const root = articleMarkdownRoot()
  if (!root) return null
  const headings = articleHeadings(root)
  if (headings.length === 0) return null

  const want = plainHeadingText(title)
  const exact = headings.filter(
    (heading) => plainHeadingText(heading.textContent ?? '').toLowerCase() === want.toLowerCase()
  )
  if (exact.length === 1) return exact[0]
  if (exact.length > 1) return pickClosest(exact, headings, index)

  const number = partNumber(title)
  if (number) {
    const byPart = headings.filter((heading) =>
      new RegExp(`^part\\s*${number}\\b`, 'i').test(plainHeadingText(heading.textContent ?? ''))
    )
    if (byPart.length === 1) return byPart[0]
    if (byPart.length > 1) return pickClosest(byPart, headings, index)
  }

  const fuzzy = headings.filter((heading) =>
    progressTitlesMatch(heading.textContent ?? '', title)
  )
  if (fuzzy.length === 1) return fuzzy[0]
  if (fuzzy.length > 1) return pickClosest(fuzzy, headings, index)

  return headings[index] ?? null
}

function scrollThreadToElement(target: HTMLElement): void {
  const thread = document.querySelector('.chat-thread')
  if (!(thread instanceof HTMLElement)) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    return
  }

  const fade = Number.parseFloat(getComputedStyle(thread).getPropertyValue('--thread-fade-size')) || 44
  const nextTop =
    thread.scrollTop + (target.getBoundingClientRect().top - thread.getBoundingClientRect().top) - fade - 10
  thread.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' })
}

function jumpToArticleSection(title: string, index: number): void {
  const heading = findArticleHeading(title, index)
  if (heading) scrollThreadToElement(heading)
}

function findTextElement(root: Element, needle: string): HTMLElement | null {
  const sample = needle.replace(/\s+/g, ' ').trim()
  if (sample.length < 8) return null
  const haystack = sample.slice(0, 80)
  const blocks = root.querySelectorAll('p, li, h2, h3, td, blockquote, del')
  for (const el of blocks) {
    if ((el.textContent ?? '').includes(haystack)) return el as HTMLElement
  }
  return null
}

function jumpToLengthHunk(hunk: LengthHunk, sectionIndex: number): void {
  const root = articleMarkdownRoot()
  if (root) {
    const marked = root.querySelector(`[data-length-hunk="${hunk.id}"]`)
    if (marked instanceof HTMLElement) {
      scrollThreadToElement(marked)
      return
    }
    const needle = (hunk.op === 'delete' ? hunk.find : hunk.with) ?? ''
    const hit = findTextElement(root, needle)
    if (hit) {
      scrollThreadToElement(hit)
      return
    }
  }
  jumpToArticleSection(hunk.sectionTitle, sectionIndex)
}

function TaskMark({ task }: { task: ProgressBoardTask }) {
  if (task.status === 'done') {
    return (
      <span className="progress-board-mark is-done" aria-hidden="true">
        <IconCheck size={11} />
      </span>
    )
  }
  if (task.status === 'active') {
    return <span className="progress-board-mark is-active" aria-hidden="true" />
  }
  return <span className="progress-board-mark" aria-hidden="true" />
}

export default function ProgressBoard({
  outline,
  articleMarkdown,
  checkpoint,
  pipelineStep,
  statusMessage,
  isRunning,
  articleComplete,
  articleType,
  writeMode,
  lengthWorkbench,
  onCalibrateLength,
  calibrateDisabled = false,
  aiVoiceBusy = false,
  aiVoicePhase,
  aiVoiceFindings = [],
  onScanAiVoice,
  onSuggestAiVoice,
  onToggleAiVoice,
  onApplyAiVoice,
  onClearAiVoice
}: ProgressBoardProps) {
  const [shrinkOpen, setShrinkOpen] = useState(false)
  const board = buildArticleProgressBoard({
    outline,
    articleMarkdown,
    checkpoint,
    pipelineStep,
    statusMessage,
    isRunning,
    articleComplete
  })
  const bounds = lengthWorkbench
    ? { min: lengthWorkbench.min, max: lengthWorkbench.max, label: lengthWorkbench.label }
    : defaultLengthBounds(articleType, writeMode)
  const liveWords = countArticleWords(articleMarkdown ?? '')
  const words = lengthWorkbench?.words ?? liveWords
  const inRange = words >= bounds.min && words <= bounds.max
  const showWorkbench = liveWords > 0 || Boolean(lengthWorkbench)
  const hunks = lengthWorkbench?.hunks ?? []
  const shrinkSections = parseH2Sections(articleMarkdown ?? '')
    .filter((section) => section.title.trim() && !isSeoMetaHeading(section.title))
    .map((section) => ({
      title: section.title,
      words: countArticleWords(section.body)
    }))
    .filter((section) => section.words > 0)

  return (
    <aside className="progress-board" aria-label="写作进度">
      <header className="progress-board-header">
        <div className="progress-board-title-row">
          <h2>进度</h2>
          {board.totalCount > 0 ? (
            <span className="progress-board-count">
              {board.completedCount}/{board.totalCount}
            </span>
          ) : null}
        </div>
        <p className="progress-board-caption">{board.caption}</p>
        {onScanAiVoice && (articleComplete || aiVoicePhase || aiVoiceBusy) && !calibrateDisabled ? (
          <div className="progress-board-aivoice">
            <button
              type="button"
              className="progress-board-calibrate-btn"
              onClick={onScanAiVoice}
              disabled={aiVoiceBusy || isRunning || calibrateDisabled}
            >
              {aiVoiceBusy ? '处理中…' : '去 AI 味'}
            </button>
            {aiVoicePhase === 'flagged' && aiVoiceFindings.length > 0 ? (
              <>
                <p className="progress-board-workbench-note">
                  已用红底标出 {aiVoiceFindings.length} 处。要生成优化建议吗？建议不会直接改成稿。
                </p>
                <div className="progress-board-aivoice-actions">
                  <button type="button" className="progress-board-calibrate-btn" disabled={aiVoiceBusy} onClick={onSuggestAiVoice}>
                    生成建议
                  </button>
                  <button type="button" className="progress-board-aivoice-ghost" onClick={onClearAiVoice}>
                    清除标注
                  </button>
                </div>
              </>
            ) : null}
            {aiVoicePhase === 'review' && aiVoiceFindings.length > 0 ? (
              <>
                <p className="progress-board-workbench-note">勾选要写入的句子。未勾选的保持原文。</p>
                <ul className="progress-board-aivoice-list">
                  {aiVoiceFindings.map((item) => (
                    <li key={item.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={item.selected}
                          onChange={() => onToggleAiVoice?.(item.id)}
                        />
                        <span>
                          <strong>{item.pattern}</strong>
                          <span className="progress-board-hunk-preview">{item.quote}</span>
                          {item.replacement ? (
                            <span className="progress-board-hunk-preview">改为：{item.replacement}</span>
                          ) : null}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <div className="progress-board-aivoice-actions">
                  <button type="button" className="progress-board-calibrate-btn" onClick={onApplyAiVoice}>
                    写入选中
                  </button>
                  <button type="button" className="progress-board-aivoice-ghost" onClick={onClearAiVoice}>
                    放弃
                  </button>
                </div>
              </>
            ) : null}
          </div>
        ) : null}
        {board.totalCount > 0 ? (
          <div
            className="progress-board-meter"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={board.totalCount}
            aria-valuenow={board.completedCount}
          >
            <span
              style={{
                transform: `scaleX(${board.totalCount ? board.completedCount / board.totalCount : 0})`
              }}
            />
          </div>
        ) : null}
      </header>

      {board.tasks.length === 0 ? (
        <p className="progress-board-empty">调研完成后，各章节会作为任务列在这里。</p>
      ) : (
        <ul className="progress-board-list">
          {board.tasks.map((task, index) => {
            const canJump = task.status === 'done' || task.status === 'active'
            return (
              <li key={task.id}>
                <button
                  type="button"
                  className={`progress-board-task is-${task.status}`}
                  onClick={() => {
                    if (canJump && task.id.startsWith('section-')) {
                      jumpToArticleSection(task.title, index)
                    }
                  }}
                  disabled={!canJump}
                >
                  <TaskMark task={task} />
                  <span className="progress-board-task-title">{task.title}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {showWorkbench ? (
        <footer className="progress-board-workbench" aria-label="词数校准">
          <div className="progress-board-words">
            <strong>{words.toLocaleString('en-US')}</strong>
            <span>词 · {bounds.label}</span>
            {inRange ? (
              <span className="progress-board-words-flag is-ok">已达标</span>
            ) : (
              <span className="progress-board-words-flag is-warn">
                {words < bounds.min ? '偏短' : '偏长'}
              </span>
            )}
          </div>
          {hunks.length === 0 ? (
            <p className="progress-board-workbench-note">
              {lengthWorkbench?.status === 'skipped'
                ? '补丁未能落地，已保留校准前正文'
                : inRange
                  ? '点击调整词数，选择章节和消减幅度'
                  : isRunning
                    ? '完成后可手动调整词数'
                    : words < bounds.min
                      ? '点击调整词数，自动补充偏短的章节'
                      : '点击调整词数，在弹窗里选择章节和消减幅度'}
            </p>
          ) : (
            <ul className="progress-board-hunks">
              {hunks.map((hunk) => {
                const sectionIndex = board.tasks.findIndex((task) =>
                  progressTitlesMatch(task.title, hunk.sectionTitle)
                )
                return (
                  <li key={hunk.id}>
                    <button
                      type="button"
                      className={`progress-board-hunk is-${hunk.op === 'delete' ? 'del' : 'ins'}`}
                      onClick={() => jumpToLengthHunk(hunk, Math.max(0, sectionIndex))}
                    >
                      <span className="progress-board-hunk-meta">
                        <span className="progress-board-hunk-section">{hunk.sectionTitle}</span>
                        <span className="progress-board-hunk-delta">
                          {formatLengthHunkDelta(hunk.wordDelta)}
                        </span>
                      </span>
                      {hunk.preview ? (
                        <span className="progress-board-hunk-preview">{hunk.preview}</span>
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {onCalibrateLength ? (
            <button
              type="button"
              className="progress-board-calibrate-btn"
              onClick={() => {
                if (words < bounds.min) onCalibrateLength([])
                else setShrinkOpen(true)
              }}
              disabled={calibrateDisabled}
            >
              {isRunning && pipelineStep === 'length' ? '校准中…' : '调整词数'}
            </button>
          ) : null}
        </footer>
      ) : null}
      <LengthShrinkDialog
        open={shrinkOpen}
        sections={shrinkSections}
        onClose={() => setShrinkOpen(false)}
        onConfirm={(choices) => {
          setShrinkOpen(false)
          onCalibrateLength?.(choices)
        }}
      />
    </aside>
  )
}
