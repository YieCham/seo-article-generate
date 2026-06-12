import { useEffect, useRef, useState } from 'react'

import type { GenerateProgressEvent, QuickPicksConfig } from '../env.d'
import { buildExtraInstructions, formatUserMessageContent } from '../utils/extraInstructions'

import ChatSidebar from './write/ChatSidebar'

import ChatThread from './write/ChatThread'

import Composer from './write/Composer'

import { createMessage, createSession, sessionTitleFromPrompt, type ChatSession } from './write/types'



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
  const [quickPicks, setQuickPicks] = useState<QuickPicksConfig>({ products: [], audiences: [] })
  const [selectedProductId, setSelectedProductId] = useState('')
  const [selectedAudienceId, setSelectedAudienceId] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [runningSessionId, setRunningSessionId] = useState('')

  const [toast, setToast] = useState('')

  const generatingSessionIdRef = useRef<string>('')

  const saveTimerRef = useRef<number | null>(null)



  const activeSession =

    sessions.find((session) => session.id === activeSessionId) ?? sessions[0] ?? null



  useEffect(() => {

    let cancelled = false



    void window.app.loadChatStore().then((store) => {

      if (cancelled) return



      if (store.sessions.length > 0) {

        setSessions(store.sessions)

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
      const picks = config.quickPicks ?? { products: [], audiences: [] }
      setQuickPicks(picks)
      setSelectedProductId((prev) => (picks.products.some((item) => item.id === prev) ? prev : ''))
      setSelectedAudienceId((prev) => (picks.audiences.some((item) => item.id === prev) ? prev : ''))
    })
  }, [hydrated, configRevision])

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

    const unsubscribe = window.app.onProgress((event: GenerateProgressEvent) => {

      if (event.type === 'status' && event.message) {

        upsertStatusMessage(event.message)

      }

      if (event.type === 'research' && event.researchSummary) {

        upsertResearchMessage(event.researchSummary)

      }

      if (event.type === 'planning' && event.planningSummary) {

        upsertPlanningMessage(event.planningSummary)

      }

      if (event.type === 'reset') {

        resetAssistantContent()

      }

      if (event.type === 'chunk' && event.text) {

        appendAssistantChunk(event.text)

      }

      if (event.type === 'error' && event.message) {

        markAssistantError(event.message)
        setIsRunning(false)
        setRunningSessionId('')
        generatingSessionIdRef.current = ''
      }

      if (event.type === 'done') {
        finalizeAssistantMessage()
        setIsRunning(false)
        generatingSessionIdRef.current = ''
        setRunningSessionId('')
      }

    })

    return unsubscribe

  }, [activeSessionId])



  function updateSession(sessionId: string, updater: (session: ChatSession) => ChatSession): void {

    setSessions((prev) => prev.map((session) => (session.id === sessionId ? updater(session) : session)))

  }



  function getTargetSessionId(): string {

    return generatingSessionIdRef.current || activeSessionId

  }



  function upsertStatusMessage(content: string): void {

    updateSession(getTargetSessionId(), (session) => {

      const messages = [...session.messages]

      const last = messages[messages.length - 1]

      if (last?.role === 'status') {

        messages[messages.length - 1] = { ...last, content }

      } else {

        messages.push(createMessage('status', content))

      }

      return { ...session, messages, updatedAt: Date.now() }

    })

  }



  function upsertResearchMessage(content: string): void {

    updateSession(getTargetSessionId(), (session) => {

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



  function upsertPlanningMessage(content: string): void {

    updateSession(getTargetSessionId(), (session) => {

      const withoutStatus = session.messages.filter((item) => item.role !== 'status')

      const withoutPlanning = withoutStatus.filter((item) => item.role !== 'planning')

      const planningMessage = createMessage('planning', content)

      const last = withoutPlanning[withoutPlanning.length - 1]



      if (last?.role === 'assistant') {

        return {

          ...session,

          messages: [...withoutPlanning.slice(0, -1), planningMessage, last],

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



  function resetAssistantContent(): void {

    updateSession(getTargetSessionId(), (session) => ({

      ...session,

      messages: session.messages

        .filter((item) => item.role !== 'status')

        .map((item) =>

          item.role === 'assistant' && item.status === 'streaming' ? { ...item, content: '' } : item

        ),

      updatedAt: Date.now()

    }))

  }



  function appendAssistantChunk(text: string): void {

    updateSession(getTargetSessionId(), (session) => {

      const messages = [...session.messages]

      const filtered = messages.filter((item) => item.role !== 'status')

      const last = filtered[filtered.length - 1]

      if (last?.role === 'assistant' && last.status === 'streaming') {

        filtered[filtered.length - 1] = { ...last, content: last.content + text }

      }

      return { ...session, messages: filtered, updatedAt: Date.now() }

    })

  }



  function markAssistantError(message: string): void {

    updateSession(getTargetSessionId(), (session) => {

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



  function finalizeAssistantMessage(): void {

    updateSession(getTargetSessionId(), (session) => ({

      ...session,

      messages: session.messages

        .filter((item) => item.role !== 'status')

        .map((item) =>

          item.role === 'assistant' && item.status === 'streaming' ? { ...item, status: 'done' as const } : item

        ),

      updatedAt: Date.now()

    }))

  }



  function handleNewChat(): void {

    const session = createSession()

    setSessions((prev) => [session, ...prev])

    setActiveSessionId(session.id)

    setDraftTopic('')

    setDraftExtra('')

  }



  function handleSelectSession(id: string): void {
    setActiveSessionId(id)
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
        const sorted = [...next].sort((a, b) => b.updatedAt - a.updatedAt)
        setActiveSessionId(sorted[0].id)
      }

      return next
    })
  }

  async function handleSubmit(topic: string, manualExtra: string): Promise<void> {
    if (isRunning || !activeSession) return

    const product = quickPicks.products.find((item) => item.id === selectedProductId)?.label
    const audience = quickPicks.audiences.find((item) => item.id === selectedAudienceId)?.label
    const extraInstructions = buildExtraInstructions({ product, audience, manual: manualExtra })
    const userContent = formatUserMessageContent(topic, extraInstructions)
    const userMessage = createMessage('user', userContent)

    const assistantMessage = createMessage('assistant', '')

    const sessionId = activeSession.id



    updateSession(sessionId, (session) => ({

      ...session,

      title: session.messages.length === 0 ? sessionTitleFromPrompt(topic) : session.title,

      messages: [...session.messages, userMessage, assistantMessage],

      updatedAt: Date.now()

    }))



    setDraftTopic('')

    setDraftExtra('')

    setIsRunning(true)
    generatingSessionIdRef.current = sessionId
    setRunningSessionId(sessionId)



    const result = await window.app.generateArticle({
      topic,
      extraInstructions: extraInstructions || undefined
    })



    if (!result.ok) {

      markAssistantError(result.message ?? '生成失败')
      setIsRunning(false)
      generatingSessionIdRef.current = ''
      setRunningSessionId('')
    }
  }



  function handleSuggest(text: string): void {

    setDraftTopic(text)

  }



  async function handleCopy(content: string): Promise<void> {

    await navigator.clipboard.writeText(content)

    setToast('已复制到剪贴板')

    window.setTimeout(() => setToast(''), 1800)

  }



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
        onNew={handleNewChat}
        onDelete={handleDeleteSession}
        onOpenSettings={onOpenSettings}
      />



      <main className="write-main">

        <header className="write-topbar">

          <div>

            <h1>{activeSession.title}</h1>

            <p>{isRunning ? 'Pipeline 运行中…' : 'E-E-A-T · 差异化 · 分段撰写 Pipeline'}</p>

          </div>

        </header>



        <ChatThread messages={activeSession.messages} onCopy={(content) => void handleCopy(content)} onSuggest={handleSuggest} />



        <Composer
          disabled={isRunning}
          quickPicks={quickPicks}
          selectedProductId={selectedProductId}
          selectedAudienceId={selectedAudienceId}
          onProductChange={setSelectedProductId}
          onAudienceChange={setSelectedAudienceId}
          onSubmit={(topic, extra) => void handleSubmit(topic, extra)}
          draftTopic={draftTopic}
          draftExtra={draftExtra}
          onDraftTopicChange={setDraftTopic}
          onDraftExtraChange={setDraftExtra}
        />



        {toast ? <div className="toast">{toast}</div> : null}

      </main>

    </div>

  )

}

