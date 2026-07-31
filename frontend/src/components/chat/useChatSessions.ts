import { useState, useCallback, useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { aiApi, type ChatSessionPreview } from '@/lib/api'
import type { Msg } from './types'
import { genId } from './types'

export function useChatSessions({
  open,
  historyOpen,
  setHistoryOpen,
  setMessages,
  setSessionId,
}: {
  open: boolean
  historyOpen: boolean
  setHistoryOpen: Dispatch<SetStateAction<boolean>>
  setMessages: Dispatch<SetStateAction<Msg[]>>
  setSessionId: Dispatch<SetStateAction<string | null>>
}) {
  const [sessions, setSessions] = useState<ChatSessionPreview[]>([])

  const loadSessions = useCallback(async () => {
    try {
      const list = await aiApi.listChatSessions()
      setSessions(list)
    } catch {}
  }, [])

  useEffect(() => {
    if (open && historyOpen) loadSessions()
  }, [open, historyOpen, loadSessions])

  const newChat = useCallback((abortRef: React.MutableRefObject<AbortController | null>) => {
    abortRef.current?.abort()
    setSessionId(null)
    setMessages([])
    setHistoryOpen(false)
  }, [setSessionId, setMessages, setHistoryOpen])

  const openSession = useCallback(async (id: string) => {
    try {
      const { messages: rows } = await aiApi.getChatSession(id)
      const restored: Msg[] = rows.map((r) => ({
        id: genId(),
        role: r.role === 'assistant' ? 'assistant' : 'user',
        content: r.content || '',
        reasoning: undefined,
        pending: false,
      }))
      setSessionId(id)
      setMessages(restored)
      setHistoryOpen(false)
    } catch {}
  }, [setSessionId, setMessages, setHistoryOpen])

  const removeSession = useCallback(async (id: string, currentSessionId: string | null, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await aiApi.deleteChatSession(id)
      setSessions((s) => s.filter((x) => x.id !== id))
      if (id === currentSessionId) {
        setSessionId(null)
        setMessages([])
      }
    } catch {}
  }, [setSessionId, setMessages])

  const togglePin = useCallback(async (s: ChatSessionPreview) => {
    const next = s.pinned ? 0 : 1
    try {
      await aiApi.updateChatSession(s.id, { pinned: !!next })
      setSessions((list) => [...list.map((x) => x.id === s.id ? { ...x, pinned: next } : x)]
        .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)))
    } catch {}
  }, [])

  const saveTags = useCallback(async (editingSession: ChatSessionPreview | null, tags: string[]) => {
    if (!editingSession) return
    try {
      await aiApi.updateChatSession(editingSession.id, { tags })
      setSessions((list) => list.map((x) => x.id === editingSession.id ? { ...x, tags } : x))
    } catch {}
  }, [])

  return {
    sessions,
    setSessions,
    loadSessions,
    newChat,
    openSession,
    removeSession,
    togglePin,
    saveTags,
  }
}
