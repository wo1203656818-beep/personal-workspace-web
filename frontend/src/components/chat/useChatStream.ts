import { useState, useRef, useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { aiApi } from '@/lib/api'
import { useTheme } from '@/lib/theme'
import type { Msg } from './types'
import { genId } from './types'

const CHAT_REFRESH_KEYS = new Set(['tasks', 'taskLists', 'notes', 'kb', 'task', 'note', 'subtasks'])

function invalidateChatRefresh(client: QueryClient) {
  return client.invalidateQueries({
    predicate: (query) => CHAT_REFRESH_KEYS.has(String(query.queryKey[0])),
  })
}

export function useChatStream({
  sessionIdRef,
  deepThinkRef,
  customPromptRef,
  imagesRef,
  setMessages,
  setSessionId,
}: {
  sessionIdRef: React.MutableRefObject<string | null>
  deepThinkRef: React.MutableRefObject<boolean>
  customPromptRef: React.MutableRefObject<string>
  imagesRef: React.MutableRefObject<{ id: string; dataUrl: string; name: string }[]>
  setMessages: Dispatch<SetStateAction<Msg[]>>
  setSessionId: Dispatch<SetStateAction<string | null>>
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { setTheme } = useTheme()
  const [loading, setLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // 处理 AI 返回的 action（主题切换 / 页面跳转）
  const handleAction = useCallback(
    (action: any) => {
      if (!action) return
      if (action.type === 'theme' && action.payload) setTheme(action.payload)
      else if (action.type === 'navigate' && action.payload) navigate(action.payload)
    },
    [navigate, setTheme],
  )

  const send = useCallback(
    (text: string) => {
      const t = text.trim()
      if (!t || loading) return
      const imgs = imagesRef.current.map((i) => i.dataUrl)
      const userMsg: Msg = { id: genId(), role: 'user', content: t }
      const aiMsg: Msg = { id: genId(), role: 'assistant', content: '', pending: true }
      setMessages((m) => [...m, userMsg, aiMsg])
      setLoading(true)

      const ctrl = aiApi.chatStream(t, sessionIdRef.current, {
        deepThink: deepThinkRef.current,
        systemPrompt: customPromptRef.current,
        images: imgs,
        onDelta: (chunk) => {
          setMessages((m) =>
            m.map((msg) => (msg.id === aiMsg.id ? { ...msg, content: msg.content + chunk } : msg)),
          )
        },
        onReasoning: (chunk) => {
          setMessages((m) =>
            m.map((msg) =>
              msg.id === aiMsg.id ? { ...msg, reasoning: (msg.reasoning || '') + chunk } : msg,
            ),
          )
        },
        onDone: (ev) => {
          setMessages((m) =>
            m.map((msg) =>
              msg.id === aiMsg.id
                ? {
                    ...msg,
                    pending: false,
                    // CF 非流式模式下 content 为空，用 ev.reply 回填
                    content: msg.content || ev.reply || '',
                  }
                : msg,
            ),
          )
          if (ev.sessionId) setSessionId(ev.sessionId)
          if (ev.refresh) invalidateChatRefresh(queryClient)
          handleAction(ev.action)
          setLoading(false)
        },
        onError: (msg) => {
          setMessages((m) =>
            m.map((msg2) =>
              msg2.id === aiMsg.id
                ? { ...msg2, content: msg2.content || `⚠️ ${msg}`, pending: false }
                : msg2,
            ),
          )
          setLoading(false)
        },
      })
      abortRef.current = ctrl
    },
    [
      loading,
      queryClient,
      sessionIdRef,
      deepThinkRef,
      customPromptRef,
      imagesRef,
      setMessages,
      setSessionId,
      handleAction,
    ],
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
    setLoading(false)
    setMessages((m) => m.map((msg) => ({ ...msg, pending: false })))
  }, [setMessages])

  const regenerate = useCallback(() => {
    let userText = ''
    setMessages((m) => {
      const reversed = [...m].reverse()
      const lastUser = reversed.find((msg) => msg.role === 'user')
      if (!lastUser) return m
      userText = lastUser.content
      const lastUserIdx = m.indexOf(lastUser)
      return m.slice(0, lastUserIdx + 1)
    })
    setTimeout(() => {
      if (!userText) return
      const aiMsg: Msg = { id: genId(), role: 'assistant', content: '', pending: true }
      const imgs = imagesRef.current.map((i) => i.dataUrl)
      setLoading(true)
      setMessages((m) => [...m, aiMsg])

      const ctrl = aiApi.chatStream(userText, sessionIdRef.current, {
        deepThink: deepThinkRef.current,
        systemPrompt: customPromptRef.current,
        images: imgs,
        onDelta: (chunk) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === aiMsg.id ? { ...msg, content: msg.content + chunk } : msg,
            ),
          )
        },
        onReasoning: (chunk) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === aiMsg.id ? { ...msg, reasoning: (msg.reasoning || '') + chunk } : msg,
            ),
          )
        },
        onDone: (ev) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === aiMsg.id
                ? {
                    ...msg,
                    pending: false,
                    content: msg.content || ev.reply || '',
                  }
                : msg,
            ),
          )
          if (ev.sessionId) setSessionId(ev.sessionId)
          if (ev.refresh) invalidateChatRefresh(queryClient)
          handleAction(ev.action)
          setLoading(false)
        },
        onError: (msg) => {
          setMessages((prev) =>
            prev.map((msg2) =>
              msg2.id === aiMsg.id
                ? { ...msg2, content: msg2.content || `⚠️ ${msg}`, pending: false }
                : msg2,
            ),
          )
          setLoading(false)
        },
      })
      abortRef.current = ctrl
    }, 0)
  }, [
    queryClient,
    sessionIdRef,
    deepThinkRef,
    customPromptRef,
    imagesRef,
    setMessages,
    setSessionId,
    setLoading,
    handleAction,
  ])

  return { loading, setLoading, send, stop, regenerate, abortRef }
}
