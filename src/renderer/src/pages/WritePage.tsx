import { useEffect, useRef, useState } from 'react'

import type { GenerateProgressEvent, LlmPreset, QuickPicksConfig } from '../env.d'
import {
  ARTICLE_TYPE_STORAGE_KEY,
  isArticleType,
  type ArticleType
} from '../constants/articleTypes'
import { getWriteModeLabel, normalizeWriteMode, type BatchDialogMode, type BatchWriteMode, type WriteMode } from '../constants/writeMode'
import {
  DEFAULT_OUTPUT_LANGUAGE,
  OUTPUT_LANGUAGE_STORAGE_KEY,
  isOutputLanguageCode,
  type OutputLanguageCode
} from '../constants/outputLanguage'
import { syncSkillsForArticleType } from '../utils/writeModeSkills'
import {
  buildExtraInstructions,
  formatBatchOptimizeUserMessageContent,
  formatOptimizeUserMessageContent,
  parseBatchOptimizeUserMessage,
  formatReviseUserMessageContent,
  formatUserMessageContent,
  parseCreateUserMessage,
  parseOptimizeUserMessage
} from '../utils/extraInstructions'
import { parseBatchTopics } from '../utils/parseBatchTopics'
import {
  LLM_MODEL_STORAGE_KEY,
  formatLlmRoleRoutingHint,
  listUnionLlmModels,
  pickDefaultLlmModelOptionId,
  resolveBodyWorkModelOptionId,
  resolveLlmModelSelection,
  type LlmModelOption
} from '../utils/llmModels'
import ChatSidebar from './write/ChatSidebar'

import ChatThread from './write/ChatThread'

import Composer from './write/Composer'

import BatchWriteDialog from './write/BatchWriteDialog'

import type { PipelineCheckpoint } from '../../../shared/pipelineCheckpoint'
import {
  createMessage,
  createSession,
  getInterruptedAssistantMessage,
  getLatestDoneAssistantMessage,
  getResumeStatusLabel,
  getSessionDisplayTitle,
  getSessionTopbarTitle,
  getSessionInitialUserMessage,
  insertSessionAtListTop,
  normalizeAllSessionSortOrders,
  normalizeIdleStreamingAssistants,
  reorderSessions,
  sessionCanResume,
  sessionHasPendingRevision,
  sessionIsInFollowUpMode,
  sessionTitleFromPrompt,
  sessionTitleFromUrl,
  sortSessions,
  type ChatSession,
  type ReviseArticleSelection,
  type SessionListGroup
} from './write/types'



interface WritePageProps {
  onOpenSettings: () => void
  configRevision: number
}

export default function WritePage({ onOpenSettings, configRevision }: WritePageProps) {

  const [sessions, setSessions] = useState<ChatSession[]>([])

  const [activeSessionId, setActiveSessionId] = useState<string>('')

  const [hydrated, setHydrated] = useState(false)

  const [draftTopic, setDraftTopic] = useState('')

  const [draftExtra, setDraftExtra] = useState('')
  const [quickPicks, setQuickPicks] = useState<QuickPicksConfig>({
    products: [],
    defaultOutputLanguage: DEFAULT_OUTPUT_LANGUAGE
  })
  const [selectedProductId, setSelectedProductId] = useState('')
  const [outputLanguage, setOutputLanguage] = useState<OutputLanguageCode>(DEFAULT_OUTPUT_LANGUAGE)
  const [articleType, setArticleType] = useState<ArticleType>('how-to')
  const [llmPresets, setLlmPresets] = useState<LlmPreset[]>([])
  const [llmModels, setLlmModels] = useState<LlmModelOption[]>([])
  const [selectedLlmModelId, setSelectedLlmModelId] = useState('')
  const [llmRoleRoutingEnabled, setLlmRoleRoutingEnabled] = useState(false)
  const [llmRoleRoutingHint, setLlmRoleRoutingHint] = useState('')
  const [batchDialogMode, setBatchDialogMode] = useState<BatchDialogMode | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [pipelineStatusMessage, setPipelineStatusMessage] = useState('')
  const [pipelineElapsedSec, setPipelineElapsedSec] = useState(0)
  const [reviseSelection, setReviseSelection] = useState<ReviseArticleSelection | null>(null)
  const [runningSessionId, setRunningSessionId] = useState('')
  const [batchProgress, setBatchProgress] = useState<{
    mode: BatchWriteMode | 'batch-optimize'
    current: number
    total: number
    item: string
  } | null>(null)

  const [toast, setToast] = useState('')

  const generatingSessionIdRef = useRef<string>('')
  const batchActiveRef = useRef(false)
  const activeSessionIdRef = useRef(activeSessionId)
  const batchAbortRef = useRef(false)
  const finishedGenerationSessionsRef = useRef<Set<string>>(new Set())
  const pipelineStepStartedAtRef = useRef<number | null>(null)
  const pipelineCheckpointRef = useRef<Map<string, PipelineCheckpoint>>(new Map())

  const revisionBaselineRef = useRef<{
    messageId: string
    content: string
    userMessageId: string
  } | null>(null)

  const saveTimerRef = useRef<number | null>(null)



  const activeSession =

    sessions.find((session) => session.id === activeSessionId) ?? sessions[0] ?? null

  activeSessionIdRef.current = activeSessionId

  const activeWriteMode: WriteMode = activeSession?.writeMode ?? 'create'



  useEffect(() => {

    let cancelled = false



    void window.app.loadChatStore().then((store) => {

      if (cancelled) return



      if (store.sessions.length > 0) {

        setSessions(
          normalizeAllSessionSortOrders(
            store.sessions.map((session) => ({
              ...session,
              writeMode: normalizeWriteMode(session.writeMode)
            }))
          )
        )

        for (const session of store.sessions) {
          if (session.pipelineCheckpoint) {
            pipelineCheckpointRef.current.set(session.id, session.pipelineCheckpoint)
          }
        }

        setActiveSessionId(store.activeSessionId || store.sessions[0].id)

      } else {

        const session = createSession()

        setSessions([session])

        setActiveSessionId(session.id)

      }



      setHydrated(true)

    })



    return () => {

      cancelled = true

    }

  }, [])

  useEffect(() => {
    if (!hydrated) return
    void window.app.getConfig().then((config) => {
      const picks = config.quickPicks ?? { products: [], defaultOutputLanguage: DEFAULT_OUTPUT_LANGUAGE }
      setQuickPicks(picks)
      setSelectedProductId((prev) => (picks.products.some((item) => item.id === prev) ? prev : ''))
      const storedLang = localStorage.getItem(OUTPUT_LANGUAGE_STORAGE_KEY)
      const defaultLang = isOutputLanguageCode(picks.defaultOutputLanguage)
        ? picks.defaultOutputLanguage
        : DEFAULT_OUTPUT_LANGUAGE
      setOutputLanguage(isOutputLanguageCode(storedLang) ? storedLang : defaultLang)

      const presets = config.llmPresets ?? []
      setLlmPresets(presets)
      const models = listUnionLlmModels(presets)
      setLlmModels(models)
      const routing = config.llmRoleRouting
      const routingEnabled = Boolean(routing?.enabled)
      setLlmRoleRoutingEnabled(routingEnabled)
      setLlmRoleRoutingHint(routingEnabled ? formatLlmRoleRoutingHint(presets, routing) : '')
      const bodyWorkModelId = resolveBodyWorkModelOptionId(presets, routing)
      const storedModel = localStorage.getItem(LLM_MODEL_STORAGE_KEY)
      setSelectedLlmModelId((prev) => {
        if (routingEnabled && bodyWorkModelId) return bodyWorkModelId
        if (prev && models.some((item) => item.id === prev)) return prev
        return pickDefaultLlmModelOptionId(presets, storedModel)
      })
    })
  }, [hydrated, configRevision])

  useEffect(() => {
    if (!hydrated) return
    const storedType = localStorage.getItem(ARTICLE_TYPE_STORAGE_KEY)
    setArticleType(isArticleType(storedType) ? storedType : 'how-to')
  }, [hydrated])

  useEffect(() => {
    if (!hydrated || activeWriteMode !== 'create') return
    void syncSkillsForArticleType(articleType)
  }, [hydrated, activeWriteMode, articleType])

  useEffect(() => {

    if (!hydrated) return



    if (saveTimerRef.current) {

      window.clearTimeout(saveTimerRef.current)

    }



    saveTimerRef.current = window.setTimeout(() => {

      void window.app.saveChatStore({

        activeSessionId,

        sessions

      })

    }, 400)



    return () => {

      if (saveTimerRef.current) {

        window.clearTimeout(saveTimerRef.current)

      }

    }

  }, [sessions, activeSessionId, hydrated])

  useEffect(() => {
    if (!isRunning) {
      setPipelineStatusMessage('')
      setPipelineElapsedSec(0)
      pipelineStepStartedAtRef.current = null
      return
    }

    const timer = window.setInterval(() => {
      if (pipelineStepStartedAtRef.current != null) {
        setPipelineElapsedSec(
          Math.floor((Date.now() - pipelineStepStartedAtRef.current) / 1000)
        )
      }
    }, 1000)

    return () => window.clearInterval(timer)
  }, [isRunning])

  useEffect(() => {

    const unsubscribe = window.app.onProgress((event: GenerateProgressEvent) => {
      const targetSessionId = generatingSessionIdRef.current
      if (!targetSessionId) return

      const isStaleGenerationEvent =
        finishedGenerationSessionsRef.current.has(targetSessionId) &&
        (event.type === 'chunk' ||
          event.type === 'replace' ||
          event.type === 'prepend' ||
          event.type === 'reset' ||
          event.type === 'research' ||
          event.type === 'planning' ||
          event.type === 'checkpoint' ||
          event.type === 'clearCheckpoint')
      if (isStaleGenerationEvent) return

      if (event.type === 'status' && event.message) {
        setPipelineStatusMessage(event.message)
        pipelineStepStartedAtRef.current = Date.now()
        setPipelineElapsedSec(0)
      }

      if (event.type === 'research' && event.researchSummary) {
        upsertResearchMessage(event.researchSummary, targetSessionId)
      }

      if (event.type === 'planning' && event.planningSummary) {
        upsertPlanningMessage(event.planningSummary, targetSessionId)
      }

      if (event.type === 'reset') {
        resetAssistantContent(targetSessionId)
      }

      if (event.type === 'prepend' && event.text) {
        prependAssistantContent(event.text, targetSessionId)
      }

      if (event.type === 'chunk' && event.text) {
        appendAssistantChunk(event.text, targetSessionId)
      }

      if (event.type === 'replace' && event.text) {
        replaceAssistantContent(event.text, targetSessionId)
      }

      if (event.type === 'checkpoint' && event.checkpoint) {
        persistCheckpoint(event.checkpoint, targetSessionId)
      }

      if (event.type === 'clearCheckpoint') {
        clearSessionCheckpoint(targetSessionId)
      }

      if (event.type === 'cancelled') {
        if (batchActiveRef.current) return
        if (!abortRevisionAttempt(targetSessionId)) {
          finalizeOrInterruptAssistant(targetSessionId)
        }
        setIsRunning(false)
        generatingSessionIdRef.current = ''
        setRunningSessionId('')
        setToast('已中止生成')
        window.setTimeout(() => setToast(''), 1800)
      }

      if (event.type === 'error' && event.message) {
        if (batchActiveRef.current) return
        if (abortRevisionAttempt(targetSessionId)) {
          setToast(event.message)
          window.setTimeout(() => setToast(''), 2200)
        } else {
          markAssistantInterruptedOrError(event.message, targetSessionId)
        }
        setIsRunning(false)
        setRunningSessionId('')
        generatingSessionIdRef.current = ''
      }

      if (event.type === 'done') {
        if (batchActiveRef.current) return
        clearSessionCheckpoint(targetSessionId)
        if (revisionBaselineRef.current) {
          finalizePendingRevision(targetSessionId)
        } else {
          finalizeAssistantMessage(targetSessionId)
        }
        setIsRunning(false)
        generatingSessionIdRef.current = ''
        setRunningSessionId('')
      }
    })

    return unsubscribe
  }, [])



  function updateSession(sessionId: string, updater: (session: ChatSession) => ChatSession): void {

    setSessions((prev) => prev.map((session) => (session.id === sessionId ? updater(session) : session)))

  }



  function getTargetSessionId(): string {
    return generatingSessionIdRef.current || activeSessionIdRef.current
  }

  function upsertResearchMessage(content: string, sessionId = getTargetSessionId()): void {

    updateSession(sessionId, (session) => {

      const withoutStatus = session.messages.filter((item) => item.role !== 'status')

      const withoutResearch = withoutStatus.filter((item) => item.role !== 'research')

      const researchMessage = createMessage('research', content)

      const last = withoutResearch[withoutResearch.length - 1]



      if (last?.role === 'assistant') {

        return {

          ...session,

          messages: [...withoutResearch.slice(0, -1), researchMessage, last],

          updatedAt: Date.now()

        }

      }



      return {

        ...session,

        messages: [...withoutResearch, researchMessage],

        updatedAt: Date.now()

      }

    })

  }



  function upsertPlanningMessage(content: string, sessionId = getTargetSessionId()): void {

    updateSession(sessionId, (session) => {

      const withoutStatus = session.messages.filter((item) => item.role !== 'status')

      const withoutPlanning = withoutStatus.filter((item) => item.role !== 'planning')

      const planningMessage = createMessage('planning', content)

      const assistantIndex = withoutPlanning.findIndex((item) => item.role === 'assistant')

      if (assistantIndex >= 0) {

        return {

          ...session,

          messages: [
            ...withoutPlanning.slice(0, assistantIndex),
            planningMessage,
            ...withoutPlanning.slice(assistantIndex)
          ],

          updatedAt: Date.now()

        }

      }



      return {

        ...session,

        messages: [...withoutPlanning, planningMessage],

        updatedAt: Date.now()

      }

    })

  }



  function resetAssistantContent(sessionId = getTargetSessionId()): void {

    updateSession(sessionId, (session) => ({

      ...session,

      messages: session.messages

        .filter((item) => item.role !== 'status')

        .map((item) =>

          item.role === 'assistant' && item.status === 'streaming' ? { ...item, content: '' } : item

        ),

      updatedAt: Date.now()

    }))

  }



  function appendAssistantChunk(text: string, sessionId = getTargetSessionId()): void {

    updateSession(sessionId, (session) => {

      const filtered = session.messages.filter((item) => item.role !== 'status')

      const index = filtered.findIndex(
        (item) => item.role === 'assistant' && item.status === 'streaming'
      )

      if (index >= 0) {
        const current = filtered[index]
        filtered[index] = { ...current, content: current.content + text }
      } else {
        for (let i = filtered.length - 1; i >= 0; i -= 1) {
          const message = filtered[i]
          if (message.role !== 'assistant') continue
          if (message.status === 'done' || message.status === 'error') break
          filtered[i] = {
            ...message,
            content: message.content + text,
            status: 'streaming' as const
          }
          break
        }
      }

      return { ...session, messages: filtered, updatedAt: Date.now() }

    })

  }

  function replaceAssistantContent(text: string, sessionId = getTargetSessionId()): void {

    updateSession(sessionId, (session) => ({

      ...session,

      messages: session.messages

        .filter((item) => item.role !== 'status')

        .map((item) =>

          item.role === 'assistant' && (item.status === 'revising' || item.status === 'streaming')

            ? { ...item, content: text }

            : item

        ),

      updatedAt: Date.now()

    }))

  }

  function removeMessageById(messageId: string, sessionId = getTargetSessionId()): void {

    updateSession(sessionId, (session) => ({

      ...session,

      messages: session.messages.filter(

        (item) => item.role === 'status' || item.id !== messageId

      ),

      updatedAt: Date.now()

    }))

  }

  function abortRevisionAttempt(sessionId = getTargetSessionId()): boolean {

    const baseline = revisionBaselineRef.current

    if (!baseline) return false

    restoreRevisionBaseline(sessionId)

    removeMessageById(baseline.userMessageId, sessionId)

    revisionBaselineRef.current = null

    return true

  }

  function restoreRevisionBaseline(sessionId = getTargetSessionId()): boolean {

    const baseline = revisionBaselineRef.current

    if (!baseline) return false

    updateSession(sessionId, (session) => ({

      ...session,

      messages: session.messages

        .filter((item) => item.role !== 'status')

        .map((item) =>

          item.id === baseline.messageId

            ? { ...item, content: baseline.content, status: 'done' as const }

            : item

        ),

      updatedAt: Date.now()

    }))

    return true

  }

  function finalizePendingRevision(sessionId = getTargetSessionId()): void {

    const baseline = revisionBaselineRef.current

    if (!baseline) {

      finalizeAssistantMessage(sessionId)

      return

    }

    updateSession(sessionId, (session) => ({

      ...session,

      messages: session.messages

        .filter((item) => item.role !== 'status')

        .map((item) => {

          if (item.id === baseline.messageId) {

            return {

              ...item,

              status: 'pendingApply' as const,

              revisionBaseline: baseline.content,

              revisionUserMessageId: baseline.userMessageId

            }

          }

          if (item.id === baseline.userMessageId) {

            return { ...item, revisionTargetAssistantId: baseline.messageId }

          }

          return item

        }),

      updatedAt: Date.now()

    }))

    revisionBaselineRef.current = null

  }

  function prependAssistantContent(text: string, sessionId = getTargetSessionId()): void {

    updateSession(sessionId, (session) => {

      const filtered = session.messages.filter((item) => item.role !== 'status')

      const index = filtered.findIndex(
        (item) => item.role === 'assistant' && item.status === 'streaming'
      )

      if (index >= 0) {
        const current = filtered[index]
        filtered[index] = { ...current, content: text + current.content }
      }

      return { ...session, messages: filtered, updatedAt: Date.now() }

    })

  }



  function markAssistantError(message: string, sessionId = getTargetSessionId()): void {

    updateSession(sessionId, (session) => {

      const messages = session.messages

        .filter((item) => item.role !== 'status')

        .map((item) =>

          item.role === 'assistant' && item.status === 'streaming'

            ? { ...item, status: 'error' as const, content: item.content || message }

            : item

        )

      return { ...session, messages, updatedAt: Date.now() }

    })

  }

  function markAssistantInterruptedOrError(errorMessage: string, sessionId = getTargetSessionId()): void {
    const hasCheckpoint = pipelineCheckpointRef.current.has(sessionId)

    updateSession(sessionId, (session) => {
      const messages = session.messages
        .filter((item) => item.role !== 'status')
        .map((item) => {
          if (item.role !== 'assistant' || item.status !== 'streaming') return item
          if (hasCheckpoint) {
            return { ...item, status: 'interrupted' as const }
          }
          return { ...item, status: 'error' as const, content: item.content || errorMessage }
        })

      return { ...session, messages, updatedAt: Date.now() }
    })

    if (hasCheckpoint) {
      setToast(errorMessage)
      window.setTimeout(() => setToast(''), 2200)
    }
  }

  function persistCheckpoint(checkpoint: PipelineCheckpoint, sessionId = getTargetSessionId()): void {
    pipelineCheckpointRef.current.set(sessionId, checkpoint)

    updateSession(sessionId, (session) => {
      const assistantId =
        [...session.messages]
          .reverse()
          .find(
            (message) =>
              message.role === 'assistant' &&
              (message.status === 'streaming' || message.status === 'interrupted')
          )?.id ?? checkpoint.assistantMessageId

      return {
        ...session,
        pipelineCheckpoint: {
          ...checkpoint,
          assistantMessageId: assistantId || checkpoint.assistantMessageId
        },
        updatedAt: Date.now()
      }
    })
  }

  function clearSessionCheckpoint(sessionId = getTargetSessionId()): void {
    pipelineCheckpointRef.current.delete(sessionId)

    updateSession(sessionId, (session) => ({
      ...session,
      pipelineCheckpoint: undefined,
      updatedAt: Date.now()
    }))
  }

  function finalizeOrInterruptAssistant(sessionId = getTargetSessionId()): void {
    const hasCheckpoint = pipelineCheckpointRef.current.has(sessionId)

    updateSession(sessionId, (session) => ({
      ...session,
      messages: session.messages
        .filter((item) => item.role !== 'status')
        .map((item) => {
          if (item.role !== 'assistant' || item.status !== 'streaming') return item
          return {
            ...item,
            status: hasCheckpoint ? ('interrupted' as const) : ('done' as const)
          }
        }),
      updatedAt: Date.now()
    }))
  }



  function finalizeAssistantMessage(sessionId = getTargetSessionId()): void {

    updateSession(sessionId, (session) => ({

      ...session,

      messages: session.messages

        .filter((item) => item.role !== 'status')

        .map((item) =>

          item.role === 'assistant' && (item.status === 'streaming' || item.status === 'revising')

            ? { ...item, status: 'done' as const }

            : item

        ),

      updatedAt: Date.now()

    }))

  }

  function finishGenerationRun(
    sessionId: string,
    result: { ok: boolean; message?: string },
    errorLabel: string
  ): { ok: boolean; aborted: boolean; message?: string } {
    const aborted = !result.ok && result.message === '已中止生成'

    if (aborted) {
      finalizeOrInterruptAssistant(sessionId)
      return { ok: false, aborted: true, message: result.message }
    }

    if (!result.ok) {
      markAssistantError(result.message ?? errorLabel, sessionId)
      if (!batchActiveRef.current) {
        setIsRunning(false)
        generatingSessionIdRef.current = ''
        setRunningSessionId('')
      }
      return { ok: false, aborted: false, message: result.message }
    }

    clearSessionCheckpoint(sessionId)
    finalizeAssistantMessage(sessionId)
    finishedGenerationSessionsRef.current.add(sessionId)
    return { ok: true, aborted: false, message: result.message }
  }

  function buildBatchOptimizeSession(item: string, extraInstructions: string): ChatSession {
    const session = createSession('batch-optimize')
    const userContent = formatBatchOptimizeUserMessageContent(item, extraInstructions)
    const userMessage = createMessage('user', userContent)
    const assistantMessage = createMessage('assistant', '')
    const llmFields = resolveLlmRequestFields()

    return {
      ...session,
      title: sessionTitleFromUrl(item),
      messages: [userMessage, assistantMessage],
      llmPresetId: llmFields.llmPresetId,
      llmModel: llmFields.llmModel,
      updatedAt: Date.now()
    }
  }

  function buildBatchSession(
    mode: BatchWriteMode,
    item: string,
    extraInstructions: string
  ): ChatSession {
    const session = createSession(mode)
    const userContent =
      mode === 'create'
        ? formatUserMessageContent(item, extraInstructions, articleType)
        : formatOptimizeUserMessageContent(item, extraInstructions)
    const userMessage = createMessage('user', userContent)
    const assistantMessage = createMessage('assistant', '')
    const title =
      mode === 'create' ? sessionTitleFromPrompt(item) : sessionTitleFromUrl(item)
    const llmFields = resolveLlmRequestFields()

    return {
      ...session,
      title,
      messages: [userMessage, assistantMessage],
      llmPresetId: llmFields.llmPresetId,
      llmModel: llmFields.llmModel,
      updatedAt: Date.now()
    }
  }



  function handleModePick(mode: WriteMode): void {
    const session = createSession(mode)
    setSessions((prev) => insertSessionAtListTop(prev, session))
    setActiveSessionId(session.id)
    setDraftTopic('')
    setDraftExtra('')
  }

  function handleSelectSession(id: string): void {
    const isTargetRunning = isRunning && runningSessionId === id
    if (!isTargetRunning) {
      setSessions((prev) =>
        prev.map((session) =>
          session.id === id ? normalizeIdleStreamingAssistants(session) : session
        )
      )
    }
    setActiveSessionId(id)
    setReviseSelection(null)
  }

  function handleClearSession(id: string): void {
    if (generatingSessionIdRef.current === id) {
      setToast('该对话正在生成，无法清空')
      window.setTimeout(() => setToast(''), 1800)
      return
    }

    setSessions((prev) =>
      prev.map((session) =>
        session.id === id
          ? {
              ...session,
              title: '新对话',
              customTitle: undefined,
              messages: [],
              pipelineCheckpoint: undefined
            }
          : session
      )
    )

    pipelineCheckpointRef.current.delete(id)

    if (activeSessionId === id) {
      setDraftTopic('')
      setDraftExtra('')
    }
  }

  function handleRenameSession(id: string, nextTitle: string): void {
    setSessions((prev) =>
      prev.map((session) =>
        session.id === id
          ? {
              ...session,
              customTitle: nextTitle || undefined,
              updatedAt: Date.now()
            }
          : session
      )
    )
  }

  function handleTogglePinSession(id: string): void {
    setSessions((prev) =>
      prev.map((session) => {
        if (session.id !== id) return session
        const nextPinned = !session.pinned
        return {
          ...session,
          pinned: nextPinned,
          pinnedAt: nextPinned ? Date.now() : undefined
        }
      })
    )
  }

  function handleMarkSessionCompleted(id: string): void {
    setSessions((prev) =>
      prev.map((session) => {
        if (session.id !== id) return session
        const nextStatus =
          session.listStatus === 'completed' ? 'active' : 'completed'
        return {
          ...session,
          listStatus: nextStatus
        }
      })
    )
  }

  function handleReorderSessions(
    group: SessionListGroup,
    draggedId: string,
    targetId: string,
    position: 'before' | 'after'
  ): void {
    setSessions((prev) => reorderSessions(prev, group, draggedId, targetId, position))
  }

  async function handleRegenerateSession(id: string): Promise<void> {
    if (isRunning) {
      setToast('当前有任务正在运行，请稍后再试')
      window.setTimeout(() => setToast(''), 1800)
      return
    }

    const session = sessions.find((item) => item.id === id)
    if (!session) return

    const firstUser = getSessionInitialUserMessage(session)
    if (!firstUser) {
      setToast('找不到初始请求，无法重新生成')
      window.setTimeout(() => setToast(''), 1800)
      return
    }

    if (activeSessionId !== id) {
      setActiveSessionId(id)
    }

    pipelineCheckpointRef.current.delete(id)
    revisionBaselineRef.current = null
    setReviseSelection(null)

    const assistantMessage = createMessage('assistant', '')

    updateSession(id, (current) => ({
      ...current,
      messages: [firstUser, assistantMessage],
      pipelineCheckpoint: undefined,
      updatedAt: Date.now()
    }))

    setDraftTopic('')
    setDraftExtra('')

    setIsRunning(true)
    generatingSessionIdRef.current = id
    setRunningSessionId(id)

    if (session.writeMode === 'batch-optimize') {
      const parsed = parseBatchOptimizeUserMessage(firstUser.content)
      if (!parsed) {
        markAssistantError('无法解析页面批量优化请求')
        setIsRunning(false)
        generatingSessionIdRef.current = ''
        setRunningSessionId('')
        return
      }

      const result = await window.app.batchOptimizePage({
        sourceUrl: parsed.sourceUrl,
        extraInstructions: parsed.extraInstructions || undefined,
        outputLanguage
      })

      if (!result.ok && result.message !== '已中止生成') {
        markAssistantError(result.message ?? '页面批量优化失败')
        setIsRunning(false)
        generatingSessionIdRef.current = ''
        setRunningSessionId('')
      }
      return
    }

    if (session.writeMode === 'optimize') {
      const parsed = parseOptimizeUserMessage(firstUser.content)
      if (!parsed) {
        markAssistantError('无法解析优化请求')
        setIsRunning(false)
        generatingSessionIdRef.current = ''
        setRunningSessionId('')
        return
      }

      const result = await window.app.optimizeArticle({
        sourceUrl: parsed.sourceUrl,
        extraInstructions: parsed.extraInstructions || undefined,
        outputLanguage
      })

      if (!result.ok && result.message !== '已中止生成') {
        markAssistantError(result.message ?? '优化失败')
        setIsRunning(false)
        generatingSessionIdRef.current = ''
        setRunningSessionId('')
      }
      return
    }

    const parsed = parseCreateUserMessage(firstUser.content)
    if (!parsed) {
      markAssistantError('无法解析创作请求')
      setIsRunning(false)
      generatingSessionIdRef.current = ''
      setRunningSessionId('')
      return
    }

    await syncSkillsForArticleType(parsed.articleType)

    const result = await window.app.generateArticle({
      topic: parsed.topic,
      extraInstructions: parsed.extraInstructions || undefined,
      outputLanguage
    })

    if (!result.ok && result.message !== '已中止生成') {
      markAssistantError(result.message ?? '生成失败')
      setIsRunning(false)
      generatingSessionIdRef.current = ''
      setRunningSessionId('')
    }
  }

  function handleDeleteSession(id: string): void {
    if (generatingSessionIdRef.current === id) {
      setToast('该对话正在生成，无法删除')
      window.setTimeout(() => setToast(''), 1800)
      return
    }

    setSessions((prev) => {
      const next = prev.filter((session) => session.id !== id)
      if (next.length === 0) {
        const fresh = createSession()
        setActiveSessionId(fresh.id)
        return [fresh]
      }

      if (activeSessionId === id) {
        const sorted = sortSessions(next)
        setActiveSessionId(sorted[0]?.id ?? '')
      }

      return next
    })
  }

  async function handleArticleTypeChange(type: ArticleType): Promise<void> {
    setArticleType(type)
    localStorage.setItem(ARTICLE_TYPE_STORAGE_KEY, type)
    if (activeWriteMode === 'create') {
      await syncSkillsForArticleType(type)
    }
  }

  function handleOutputLanguageChange(code: OutputLanguageCode): void {
    setOutputLanguage(code)
    localStorage.setItem(OUTPUT_LANGUAGE_STORAGE_KEY, code)
  }

  function handleLlmModelChange(optionId: string): void {
    setSelectedLlmModelId(optionId)
    localStorage.setItem(LLM_MODEL_STORAGE_KEY, optionId)
  }

  function resolveLlmRequestFields(session?: ChatSession | null): {
    llmPresetId?: string
    llmModel?: string
  } {
    if (session?.llmPresetId && session.llmModel) {
      return { llmPresetId: session.llmPresetId, llmModel: session.llmModel }
    }

    const selection = resolveLlmModelSelection(llmPresets, selectedLlmModelId)
    if (!selection) return {}
    return { llmPresetId: selection.presetId, llmModel: selection.model }
  }

  function ensureLlmModelSelected(): boolean {
    if (llmRoleRoutingEnabled) return true
    if (selectedLlmModelId) return true
    setToast('请先在设置中添加模型，并在新对话中选择要使用的模型')
    window.setTimeout(() => setToast(''), 2200)
    return false
  }

  async function handleReviseSubmit(instruction: string): Promise<void> {
    if (isRunning || !activeSession) return

    if (sessionHasPendingRevision(activeSession)) {
      setToast('请先应用或取消当前修改')
      window.setTimeout(() => setToast(''), 1800)
      return
    }

    const articleMessage = getLatestDoneAssistantMessage(activeSession)
    if (!articleMessage) return

    const userMessage = createMessage(
      'user',
      formatReviseUserMessageContent(instruction, reviseSelection?.displayText ?? reviseSelection?.text)
    )
    const sessionId = activeSession.id
    const articleContent = articleMessage.content

    revisionBaselineRef.current = {
      messageId: articleMessage.id,
      content: articleContent,
      userMessageId: userMessage.id
    }

    updateSession(sessionId, (session) => {
      const filtered = session.messages.filter((item) => item.role !== 'status')
      const messages = filtered.map((item) =>
        item.id === articleMessage.id ? { ...item, status: 'revising' as const } : item
      )

      return {
        ...session,
        messages: [...messages, userMessage],
        updatedAt: Date.now()
      }
    })

    setDraftTopic('')
    setDraftExtra('')
    // Capture before clearing UI selection; submit uses this for partial revise.
    const selectionForRequest = reviseSelection
    setReviseSelection(null)
    window.getSelection()?.removeAllRanges()
    // Allow revise replace/chunk events — generation marks the session "finished".
    finishedGenerationSessionsRef.current.delete(sessionId)
    setIsRunning(true)
    generatingSessionIdRef.current = sessionId
    setRunningSessionId(sessionId)

    const result = await window.app.reviseArticle({
      article: articleContent,
      instruction,
      outputLanguage,
      pipeline:
        activeWriteMode === 'create' || activeWriteMode === 'optimize'
          ? activeWriteMode
          : 'optimize',
      topic: activeSession.messages.find((message) => message.role === 'user')?.content,
      selection: selectionForRequest ?? undefined,
      ...resolveLlmRequestFields()
    })

    if (!result.ok && result.message !== '已中止生成') {
      if (!abortRevisionAttempt()) {
        markAssistantError(result.message ?? '修订失败')
      } else {
        setToast(result.message ?? '修订失败')
        window.setTimeout(() => setToast(''), 2200)
      }
      setIsRunning(false)
      generatingSessionIdRef.current = ''
      setRunningSessionId('')
    }
  }

  function handleApplyRevision(assistantMessageId: string): void {
    if (!activeSession) return

    updateSession(activeSession.id, (session) => {
      const assistant = session.messages.find(
        (message) => message.id === assistantMessageId && message.status === 'pendingApply'
      )
      if (!assistant) return session

      const userMessageId = assistant.revisionUserMessageId

      return {
        ...session,
        messages: session.messages
          .filter((message) => message.role === 'status' || message.id !== userMessageId)
          .map((message) =>
            message.id === assistantMessageId
              ? {
                  ...message,
                  status: 'done' as const,
                  revisionBaseline: undefined,
                  revisionUserMessageId: undefined
                }
              : message
          ),
        updatedAt: Date.now()
      }
    })

    setToast('已应用修改')
    window.setTimeout(() => setToast(''), 1800)
  }

  function handleCancelRevision(assistantMessageId: string): void {
    if (!activeSession) return

    updateSession(activeSession.id, (session) => {
      const assistant = session.messages.find(
        (message) => message.id === assistantMessageId && message.status === 'pendingApply'
      )
      if (!assistant?.revisionBaseline) return session

      const userMessageId = assistant.revisionUserMessageId

      return {
        ...session,
        messages: session.messages
          .filter((message) => message.role === 'status' || message.id !== userMessageId)
          .map((message) =>
            message.id === assistantMessageId
              ? {
                  ...message,
                  content: assistant.revisionBaseline ?? message.content,
                  status: 'done' as const,
                  revisionBaseline: undefined,
                  revisionUserMessageId: undefined
                }
              : message
          ),
        updatedAt: Date.now()
      }
    })

    setToast('已取消修改')
    window.setTimeout(() => setToast(''), 1800)
  }

  function handleDeleteMessage(messageId: string): void {
    if (!activeSession || isRunning) return

    const linkedAssistant = activeSession.messages.find(
      (message) => message.status === 'pendingApply' && message.revisionUserMessageId === messageId
    )
    if (linkedAssistant) {
      handleCancelRevision(linkedAssistant.id)
      return
    }

    updateSession(activeSession.id, (session) => ({
      ...session,
      messages: session.messages.filter(
        (message) => message.role === 'status' || message.id !== messageId
      ),
      updatedAt: Date.now()
    }))
  }

  async function executeCreateArticle(
    sessionId: string,
    topic: string,
    extraInstructions: string,
    options?: { skipMessageSetup?: boolean }
  ): Promise<{ ok: boolean; aborted: boolean; message?: string }> {
    const llmFields = resolveLlmRequestFields()

    if (!options?.skipMessageSetup) {
      const userContent = formatUserMessageContent(topic, extraInstructions, articleType)
      const userMessage = createMessage('user', userContent)
      const assistantMessage = createMessage('assistant', '')

      updateSession(sessionId, (session) => ({
        ...session,
        title: session.messages.length === 0 ? sessionTitleFromPrompt(topic) : session.title,
        messages: [...session.messages, userMessage, assistantMessage],
        llmPresetId: llmFields.llmPresetId,
        llmModel: llmFields.llmModel,
        updatedAt: Date.now()
      }))
    } else {
      updateSession(sessionId, (session) => ({
        ...session,
        llmPresetId: llmFields.llmPresetId,
        llmModel: llmFields.llmModel,
        updatedAt: Date.now()
      }))
    }

    finishedGenerationSessionsRef.current.delete(sessionId)
    setIsRunning(true)
    generatingSessionIdRef.current = sessionId
    setRunningSessionId(sessionId)

    const result = await window.app.generateArticle({
      topic,
      extraInstructions: extraInstructions || undefined,
      outputLanguage,
      ...llmFields
    })

    return finishGenerationRun(sessionId, result, '生成失败')
  }

  async function handleSubmit(topic: string, manualExtra: string): Promise<void> {
    if (isRunning || !activeSession) return
    if (!ensureLlmModelSelected()) return

    await syncSkillsForArticleType(articleType)

    const product = quickPicks.products.find((item) => item.id === selectedProductId)?.label
    const extraInstructions = buildExtraInstructions({
      product,
      manual: manualExtra,
      articleType
    })

    setDraftTopic('')
    setDraftExtra('')

    await executeCreateArticle(activeSession.id, topic, extraInstructions)
  }

  async function executeOptimizeArticle(
    sessionId: string,
    sourceUrl: string,
    extraInstructions: string,
    options?: { skipMessageSetup?: boolean }
  ): Promise<{ ok: boolean; aborted: boolean; message?: string }> {
    const llmFields = resolveLlmRequestFields()

    if (!options?.skipMessageSetup) {
      const userContent = formatOptimizeUserMessageContent(sourceUrl, extraInstructions)
      const userMessage = createMessage('user', userContent)
      const assistantMessage = createMessage('assistant', '')

      updateSession(sessionId, (session) => ({
        ...session,
        title: session.messages.length === 0 ? sessionTitleFromUrl(sourceUrl) : session.title,
        messages: [...session.messages, userMessage, assistantMessage],
        llmPresetId: llmFields.llmPresetId,
        llmModel: llmFields.llmModel,
        updatedAt: Date.now()
      }))
    } else {
      updateSession(sessionId, (session) => ({
        ...session,
        llmPresetId: llmFields.llmPresetId,
        llmModel: llmFields.llmModel,
        updatedAt: Date.now()
      }))
    }

    finishedGenerationSessionsRef.current.delete(sessionId)
    setIsRunning(true)
    generatingSessionIdRef.current = sessionId
    setRunningSessionId(sessionId)

    const result = await window.app.optimizeArticle({
      sourceUrl,
      extraInstructions: extraInstructions || undefined,
      outputLanguage,
      ...llmFields
    })

    return finishGenerationRun(sessionId, result, '优化失败')
  }

  async function executeBatchOptimizePage(
    sessionId: string,
    sourceUrl: string,
    extraInstructions: string,
    options?: { skipMessageSetup?: boolean }
  ): Promise<{ ok: boolean; aborted: boolean; message?: string }> {
    const llmFields = resolveLlmRequestFields()

    if (!options?.skipMessageSetup) {
      const userContent = formatBatchOptimizeUserMessageContent(sourceUrl, extraInstructions)
      const userMessage = createMessage('user', userContent)
      const assistantMessage = createMessage('assistant', '')

      updateSession(sessionId, (session) => ({
        ...session,
        title: session.messages.length === 0 ? sessionTitleFromUrl(sourceUrl) : session.title,
        messages: [...session.messages, userMessage, assistantMessage],
        llmPresetId: llmFields.llmPresetId,
        llmModel: llmFields.llmModel,
        updatedAt: Date.now()
      }))
    } else {
      updateSession(sessionId, (session) => ({
        ...session,
        llmPresetId: llmFields.llmPresetId,
        llmModel: llmFields.llmModel,
        updatedAt: Date.now()
      }))
    }

    finishedGenerationSessionsRef.current.delete(sessionId)
    setIsRunning(true)
    generatingSessionIdRef.current = sessionId
    setRunningSessionId(sessionId)

    const result = await window.app.batchOptimizePage({
      sourceUrl,
      extraInstructions: extraInstructions || undefined,
      outputLanguage,
      ...llmFields
    })

    return finishGenerationRun(sessionId, result, '页面批量优化失败')
  }

  async function handleBatchOptimizeSingleSubmit(sourceUrl: string, manualExtra: string): Promise<void> {
    if (isRunning || !activeSession) return
    if (!ensureLlmModelSelected()) return

    const product = quickPicks.products.find((item) => item.id === selectedProductId)?.label
    const extraInstructions = buildExtraInstructions({ product, manual: manualExtra })

    setDraftTopic('')
    setDraftExtra('')

    await executeBatchOptimizePage(activeSession.id, sourceUrl, extraInstructions)
  }

  async function runBatchPageOptimize(urlsText: string, manualExtra: string): Promise<void> {
    if (isRunning) return
    if (!ensureLlmModelSelected()) return

    const urls = parseBatchTopics(urlsText)
    if (urls.length === 0) {
      setToast('请输入至少一个 URL')
      window.setTimeout(() => setToast(''), 1800)
      return
    }

    const product = quickPicks.products.find((item) => item.id === selectedProductId)?.label
    const extraInstructions = buildExtraInstructions({ product, manual: manualExtra })

    setDraftTopic('')
    setDraftExtra('')

    setBatchDialogMode(null)
    batchAbortRef.current = false
    batchActiveRef.current = true
    setIsRunning(true)

    let succeeded = 0
    let failed = 0
    let aborted = false

    try {
      for (let index = 0; index < urls.length; index += 1) {
        if (batchAbortRef.current) {
          aborted = true
          break
        }

        const sourceUrl = urls[index]
        setBatchProgress({
          mode: 'batch-optimize',
          current: index + 1,
          total: urls.length,
          item: sourceUrl
        })

        const session = buildBatchOptimizeSession(sourceUrl, extraInstructions)
        setSessions((prev) => insertSessionAtListTop(prev, session))
        activeSessionIdRef.current = session.id
        setActiveSessionId(session.id)
        generatingSessionIdRef.current = session.id
        setRunningSessionId(session.id)

        const result = await executeBatchOptimizePage(session.id, sourceUrl, extraInstructions, {
          skipMessageSetup: true
        })

        if (result.aborted) {
          aborted = true
          break
        }
        if (result.ok) {
          succeeded += 1
          setSessions((prev) =>
            prev.map((item) =>
              item.id === session.id ? normalizeIdleStreamingAssistants(item) : item
            )
          )
        } else failed += 1
      }
    } finally {
      if (batchAbortRef.current) aborted = true
      batchActiveRef.current = false
      setBatchProgress(null)
      batchAbortRef.current = false
      setIsRunning(false)
      generatingSessionIdRef.current = ''
      setRunningSessionId('')
      finishedGenerationSessionsRef.current.clear()
      setSessions((prev) => prev.map((session) => normalizeIdleStreamingAssistants(session)))
    }

    if (aborted) {
      setToast('页面批量优化已中止')
    } else if (failed > 0) {
      setToast(`页面批量优化完成：成功 ${succeeded} 篇，失败 ${failed} 篇`)
    } else {
      setToast(`页面批量优化完成：共 ${succeeded} 篇`)
    }
    window.setTimeout(() => setToast(''), 2800)
  }

  async function runBatchWrite(
    mode: BatchWriteMode,
    itemsText: string,
    manualExtra: string
  ): Promise<void> {
    if (isRunning) return
    if (!ensureLlmModelSelected()) return

    const items = parseBatchTopics(itemsText)
    const emptyHint = mode === 'optimize' ? '请输入至少一个 URL' : '请输入至少一个主题'
    if (items.length === 0) {
      setToast(emptyHint)
      window.setTimeout(() => setToast(''), 1800)
      return
    }

    setBatchDialogMode(null)
    batchAbortRef.current = false
    batchActiveRef.current = true
    setIsRunning(true)

    const product = quickPicks.products.find((item) => item.id === selectedProductId)?.label
    const extraInstructions =
      mode === 'create'
        ? buildExtraInstructions({ product, manual: manualExtra, articleType })
        : buildExtraInstructions({ product, manual: manualExtra })

    if (mode === 'create') {
      await syncSkillsForArticleType(articleType)
    }

    let succeeded = 0
    let failed = 0
    let aborted = false

    try {
      for (let index = 0; index < items.length; index += 1) {
        if (batchAbortRef.current) {
          aborted = true
          break
        }

        const item = items[index]
        setBatchProgress({ mode, current: index + 1, total: items.length, item })

        const session = buildBatchSession(mode, item, extraInstructions)
        setSessions((prev) => insertSessionAtListTop(prev, session))
        activeSessionIdRef.current = session.id
        setActiveSessionId(session.id)
        generatingSessionIdRef.current = session.id
        setRunningSessionId(session.id)

        const result =
          mode === 'create'
            ? await executeCreateArticle(session.id, item, extraInstructions, {
                skipMessageSetup: true
              })
            : await executeOptimizeArticle(session.id, item, extraInstructions, {
                skipMessageSetup: true
              })

        if (result.aborted) {
          aborted = true
          break
        }
        if (result.ok) {
          succeeded += 1
          setSessions((prev) =>
            prev.map((item) =>
              item.id === session.id ? normalizeIdleStreamingAssistants(item) : item
            )
          )
        } else failed += 1
      }
    } finally {
      if (batchAbortRef.current) aborted = true
      batchActiveRef.current = false
      setBatchProgress(null)
      batchAbortRef.current = false
      setIsRunning(false)
      generatingSessionIdRef.current = ''
      setRunningSessionId('')
      finishedGenerationSessionsRef.current.clear()
      setSessions((prev) => prev.map((session) => normalizeIdleStreamingAssistants(session)))
    }

    const actionLabel = mode === 'optimize' ? '批量优化' : '批量创作'
    if (aborted) {
      setToast(`${actionLabel}已中止`)
    } else if (failed > 0) {
      setToast(`${actionLabel}完成：成功 ${succeeded} 篇，失败 ${failed} 篇`)
    } else {
      setToast(`${actionLabel}完成：共 ${succeeded} 篇`)
    }
    window.setTimeout(() => setToast(''), 2800)
  }

  async function handleBatchCreate(topicsText: string, manualExtra: string): Promise<void> {
    await runBatchWrite('create', topicsText, manualExtra)
  }

  async function handleBatchOptimize(urlsText: string, manualExtra: string): Promise<void> {
    await runBatchWrite('optimize', urlsText, manualExtra)
  }

  async function handleOptimizeSubmit(sourceUrl: string, manualExtra: string): Promise<void> {
    if (isRunning || !activeSession) return
    if (!ensureLlmModelSelected()) return

    const product = quickPicks.products.find((item) => item.id === selectedProductId)?.label
    const extraInstructions = buildExtraInstructions({ product, manual: manualExtra })

    setDraftTopic('')
    setDraftExtra('')

    await executeOptimizeArticle(activeSession.id, sourceUrl, extraInstructions)
  }

  function handleComposerSubmit(input: string, manualExtra: string): void {
    if (activeSession && sessionIsInFollowUpMode(activeSession)) {
      void handleReviseSubmit(input)
      return
    }

    if (activeWriteMode === 'optimize') {
      void handleOptimizeSubmit(input, manualExtra)
    } else if (activeWriteMode === 'batch-optimize') {
      const urls = parseBatchTopics(input)
      if (urls.length > 1) {
        void runBatchPageOptimize(input, manualExtra)
      } else {
        void handleBatchOptimizeSingleSubmit(input, manualExtra)
      }
    } else {
      void handleSubmit(input, manualExtra)
    }
  }

  function handleStopGeneration(): void {
    if (!isRunning) return
    if (batchProgress) {
      batchAbortRef.current = true
    }
    void window.app.cancelArticle()
  }

  function handleDiscardResume(): void {
    if (!activeSession || isRunning) return

    pipelineCheckpointRef.current.delete(activeSession.id)

    updateSession(activeSession.id, (session) => ({
      ...session,
      pipelineCheckpoint: undefined,
      messages: session.messages.map((message) =>
        message.status === 'interrupted' ? { ...message, status: 'done' as const } : message
      ),
      updatedAt: Date.now()
    }))

    setToast('已放弃未完成的进度')
    window.setTimeout(() => setToast(''), 1800)
  }

  async function handleResumeGeneration(): Promise<void> {
    if (!activeSession || isRunning || !sessionCanResume(activeSession)) return

    const checkpoint = activeSession.pipelineCheckpoint!
    const assistant = getInterruptedAssistantMessage(activeSession)!
    const sessionId = activeSession.id

    if (checkpoint.kind === 'create' && checkpoint.plan?.trim()) {
      upsertPlanningMessage(checkpoint.plan, sessionId)
    }

    updateSession(sessionId, (session) => ({
      ...session,
      messages: session.messages
        .filter((message) => message.role !== 'status')
        .map((message) =>
          message.id === assistant.id ? { ...message, status: 'streaming' as const } : message
        ),
      updatedAt: Date.now()
    }))

    const assistantContent = assistant.content.trim()
    const mergedCheckpoint: PipelineCheckpoint = {
      ...checkpoint,
      assistantMessageId: assistant.id,
      partialDraft:
        assistantContent.length > (checkpoint.partialDraft?.length ?? 0)
          ? assistant.content
          : checkpoint.partialDraft,
      workText: assistantContent || checkpoint.workText
    }

    setIsRunning(true)
    generatingSessionIdRef.current = sessionId
    setRunningSessionId(sessionId)

    const result = await window.app.resumeArticle(mergedCheckpoint)

    if (!result.ok && result.message !== '已中止生成') {
      markAssistantInterruptedOrError(result.message ?? '继续生成失败')
      setIsRunning(false)
      generatingSessionIdRef.current = ''
      setRunningSessionId('')
    }
  }



  async function handleCopy(content: string): Promise<void> {

    await navigator.clipboard.writeText(content)

    setToast('已复制到剪贴板')

    window.setTimeout(() => setToast(''), 1800)

  }

  function handleClearReviseSelection(): void {
    setReviseSelection(null)
    window.getSelection()?.removeAllRanges()
  }

  const composerShowOptions = activeSession ? !sessionIsInFollowUpMode(activeSession) : true
  const canResumeSession = activeSession ? sessionCanResume(activeSession) : false
  const resumeStatusLabel = activeSession ? getResumeStatusLabel(activeSession) : '继续生成'
  const hasPendingRevision = activeSession ? sessionHasPendingRevision(activeSession) : false
  const isActiveSessionRunning = isRunning && runningSessionId === activeSession?.id
  const latestArticleMessage = activeSession ? getLatestDoneAssistantMessage(activeSession) : null
  const reviseTargetMessageId =
    composerShowOptions || hasPendingRevision || isActiveSessionRunning
      ? null
      : latestArticleMessage?.id ?? null
  const topbarTitle = activeSession ? getSessionTopbarTitle(activeSession) : null



  if (!hydrated || !activeSession) {

    return (

      <div className="write-shell">

        <main className="write-main">

          <header className="write-topbar">

            <div>

              <h1>加载中…</h1>

            </div>

          </header>

        </main>

      </div>

    )

  }



  return (

    <div className="write-shell">

      <ChatSidebar
        sessions={sessions}
        activeSessionId={activeSession.id}
        runningSessionId={runningSessionId}
        onSelect={handleSelectSession}
        onSelectMode={handleModePick}
        onClear={handleClearSession}
        onDelete={handleDeleteSession}
        onRename={handleRenameSession}
        onTogglePin={handleTogglePinSession}
        onMarkCompleted={handleMarkSessionCompleted}
        onReorder={handleReorderSessions}
        onRegenerate={(sessionId) => void handleRegenerateSession(sessionId)}
        isRunning={isRunning}
        onOpenSettings={onOpenSettings}
      />



      <main className="write-main">

        <header className="write-topbar">
          {topbarTitle ? <h1>{topbarTitle}</h1> : null}
        </header>



        <ChatThread
          messages={activeSession.messages}
          onCopy={(content) => void handleCopy(content)}
          writeMode={activeWriteMode}
          isRunning={isActiveSessionRunning}
          pipelineStatusMessage={isActiveSessionRunning ? pipelineStatusMessage : ''}
          pipelineElapsedSec={isActiveSessionRunning ? pipelineElapsedSec : 0}
          reviseTargetMessageId={reviseTargetMessageId}
          reviseSelection={reviseSelection}
          onReviseSelectionChange={setReviseSelection}
          onDeleteMessage={handleDeleteMessage}
          onApplyRevision={handleApplyRevision}
          onCancelRevision={handleCancelRevision}
        />



        <div className="composer-area">
          <Composer
            disabled={hasPendingRevision}
            isGenerating={isActiveSessionRunning}
            canResume={canResumeSession}
            resumeLabel={resumeStatusLabel}
            onResume={() => void handleResumeGeneration()}
            onDiscardResume={handleDiscardResume}
            showOptions={composerShowOptions}
            writeMode={activeWriteMode}
            quickPicks={quickPicks}
            selectedProductId={selectedProductId}
            outputLanguage={outputLanguage}
            articleType={articleType}
            onProductChange={setSelectedProductId}
            onOutputLanguageChange={handleOutputLanguageChange}
            onArticleTypeChange={(type) => void handleArticleTypeChange(type)}
            llmModels={llmModels}
            selectedLlmModelId={selectedLlmModelId}
            onLlmModelChange={handleLlmModelChange}
            llmRoleRoutingEnabled={llmRoleRoutingEnabled}
            llmRoleRoutingHint={llmRoleRoutingHint}
            onSubmit={(input, extra) => handleComposerSubmit(input, extra)}
            onStop={handleStopGeneration}
            draftInput={draftTopic}
            draftExtra={draftExtra}
            onDraftInputChange={setDraftTopic}
            onDraftExtraChange={setDraftExtra}
            reviseSelectionPreview={reviseSelection?.displayText ?? reviseSelection?.text ?? null}
            onClearReviseSelection={handleClearReviseSelection}
            onBatchWrite={
              composerShowOptions
                ? () =>
                    setBatchDialogMode(
                      activeWriteMode === 'batch-optimize'
                        ? 'batch-optimize'
                        : activeWriteMode === 'optimize'
                          ? 'optimize'
                          : 'create'
                    )
                : undefined
            }
          />

          <footer className="write-statusbar">
            <span className="write-status-label">{getWriteModeLabel(activeWriteMode)}</span>
            {isRunning ? (
              <span className="write-status-running">
                <span className="status-pill-dot" aria-hidden="true" />
                {batchProgress
                  ? batchProgress.mode === 'batch-optimize'
                    ? `页面批量优化 ${batchProgress.current}/${batchProgress.total}：${batchProgress.item}`
                    : `${batchProgress.mode === 'optimize' ? '批量优化' : '批量创作'} ${batchProgress.current}/${batchProgress.total}：${batchProgress.item}`
                  : composerShowOptions
                    ? '运行中'
                    : '正在修订文章…'}
              </span>
            ) : hasPendingRevision ? (
              <span className="write-status-running">待确认修改</span>
            ) : canResumeSession ? (
              <span className="write-status-running">生成已中断 · 可继续</span>
            ) : (
              <span className="write-status-idle">
                {composerShowOptions
                  ? '就绪'
                  : reviseSelection
                    ? '已选中片段 · 输入修改说明后发送'
                    : '继续对话修改文章 · 可选中片段进行局部重写'}
              </span>
            )}
          </footer>
        </div>



        {toast ? <div className="toast">{toast}</div> : null}

        <BatchWriteDialog
          open={batchDialogMode != null}
          mode={batchDialogMode ?? 'create'}
          disabled={isRunning}
          quickPicks={quickPicks}
          selectedProductId={selectedProductId}
          outputLanguage={outputLanguage}
          articleType={articleType}
          draftExtra={draftExtra}
          onClose={() => setBatchDialogMode(null)}
          onSubmit={(itemsText, extra) => {
            if (batchDialogMode === 'batch-optimize') {
              void runBatchPageOptimize(itemsText, extra)
            } else if (batchDialogMode === 'optimize') {
              void handleBatchOptimize(itemsText, extra)
            } else {
              void handleBatchCreate(itemsText, extra)
            }
          }}
        />

      </main>

    </div>

  )

}

