import { api, API_BASE } from './client'
import type { AiAnalysisStats, ChatSessionPreview, ChatMessageRow } from './types'

export const aiApi = {
  breakdown: (taskTitle: string, taskId?: string) =>
    api
      .post('ai/breakdown', { json: { taskTitle, taskId } })
      .json<{ subtasks: { id?: string; title: string }[]; created?: boolean }>(),
  analysis: (range?: string) =>
    api
      .post(`ai/analysis${range ? `?range=${range}` : ''}`)
      .json<{ analysis: string; stats: AiAnalysisStats }>(),
  weeklyReport: () => api.post('ai/weekly-report').json<{ report: string; week: string }>(),
  noteSummary: (noteId: string, action: 'summary' | 'points' | 'to-task') =>
    api.post('ai/note-summary', { json: { noteId, action } }).json<{ result: string }>(),
  semanticSearch: (query: string, topK = 5) =>
    api.post('ai/semantic-search', { json: { query, topK } }).json<{
      results: { type: string; id: string; title: string; snippet: string; score: number }[]
    }>(),
  reindex: () => api.post('ai/reindex').json<{ ok: boolean; indexed: number }>(),
  parseTask: (text: string) =>
    api.post('ai/parse-task', { json: { text } }).json<{
      task: {
        title: string
        dueDate: string | null
        listName: string | null
        note: string | null
        listId: string | null
      }
    }>(),
  digest: () => api.post('ai/digest').json<{ digest: string; cached?: boolean }>(),
  prioritySuggestions: () =>
    api
      .post('ai/priority-suggestions')
      .json<{ suggestions: { taskId: string; reason: string }[]; cached?: boolean }>(),
  suggestList: (title: string) =>
    api
      .post('ai/suggest-list', { json: { title } })
      .json<{ listId: string | null; listName: string | null }>(),
  copywriting: (data: {
    platform: string
    topic: string
    style: string
    referenceUrl?: string
    count?: number
  }) =>
    api
      .post('ai/copywriting', { json: data })
      .json<{ results: { content: string; hashtags: string[]; hook: string }[] }>(),
  chatStream: (
    message: string,
    sessionId: string | null,
    handlers: {
      deepThink?: boolean
      webSearch?: boolean
      systemPrompt?: string
      role?: string
      images?: string[]
      onDelta?: (text: string) => void
      onReasoning?: (text: string) => void
      onTool?: (ev: { name: string; observation: string }) => void
      onSources?: (sources: { title: string; url: string }[]) => void
      onDone?: (ev: { reply: string; refresh: boolean; action: any; sessionId: string }) => void
      onError?: (msg: string) => void
    },
  ) => {
    const token = localStorage.getItem('token')
    const ctrl = new AbortController()
    ;(async () => {
      try {
        const res = await fetch(`${API_BASE}/ai/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            message,
            sessionId,
            deepThink: !!handlers.deepThink,
            webSearch: !!handlers.webSearch,
            systemPrompt: handlers.systemPrompt || '',
            role: handlers.role || '',
            images: handlers.images || [],
          }),
          signal: ctrl.signal,
        })
        if (!res.ok || !res.body) {
          let msg = `请求失败 (${res.status})`
          try {
            const j = await res.json()
            if (j?.error) msg = j.error
          } catch {}
          handlers.onError?.(msg)
          return
        }
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''
        let doneReceived = false
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const parts = buf.split('\n\n')
          buf = parts.pop() || ''
          for (const part of parts) {
            const line = part.trim()
            if (!line.startsWith('data:')) continue
            const data = line.slice(5).trim()
            if (!data) continue
            try {
              const ev = JSON.parse(data)
              if (ev.type === 'delta') handlers.onDelta?.(ev.text)
              else if (ev.type === 'reasoning') handlers.onReasoning?.(ev.text)
              else if (ev.type === 'tool')
                handlers.onTool?.({ name: ev.name, observation: ev.observation })
              else if (ev.type === 'sources') handlers.onSources?.(ev.sources)
              else if (ev.type === 'done') {
                doneReceived = true
                handlers.onDone?.(ev)
              } else if (ev.type === 'error') {
                doneReceived = true
                handlers.onError?.(ev.message)
              }
            } catch {}
          }
        }
        // 兜底：流结束但未收到 done/error 事件（网络中断 / 后端异常断开），避免 loading 永久卡住
        if (!doneReceived) handlers.onError?.('连接已结束')
      } catch (e: any) {
        if (e?.name === 'AbortError') return
        handlers.onError?.(e?.message || '网络错误')
      }
    })()
    return ctrl
  },
  listChatSessions: () => api.get('ai/chat/sessions').json<ChatSessionPreview[]>(),
  getChatSession: (id: string) =>
    api
      .get(`ai/chat/sessions/${id}`)
      .json<{ session: { id: string; title: string } | null; messages: ChatMessageRow[] }>(),
  deleteChatSession: (id: string) => api.delete(`ai/chat/sessions/${id}`).json<{ ok: boolean }>(),
  updateChatSession: (id: string, patch: { title?: string; tags?: string[]; pinned?: boolean }) =>
    api.patch(`ai/chat/sessions/${id}`, { json: patch }).json<{ ok: boolean }>(),
}
