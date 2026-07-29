import ky from 'ky'
import { toast } from 'sonner'

// ========== 类型定义（对齐 backend/src/schema.ts）==========
export interface TaskList {
  id: string
  name: string
  color: string
  sortOrder: number
  isSystem: boolean
  msTodoListId?: string | null
  createdAt: string
  updatedAt: string
  taskCount?: number
  activeTaskCount?: number
  completedTaskCount?: number
}

export interface Task {
  id: string
  listId: string
  title: string
  note?: string | null
  isCompleted: boolean
  isImportant: boolean
  isMyDay: boolean
  myDayDate?: string | null
  dueDate?: string | null
  reminder?: string | null
  recurrence?: string | null
  sortOrder: number
  msTodoId?: string | null
  createdAt: string
  updatedAt: string
  subtaskCount?: number
  completedSubtaskCount?: number
}

export interface Subtask {
  id: string
  taskId: string
  title: string
  isCompleted: boolean
  sortOrder: number
}

export interface Note {
  id: string
  title: string
  content: string
  contentHtml?: string | null
  sourceFile?: string | null
  importedAt?: string | null
  updatedAt: string
}

export interface NoteSummary {
  id: string
  title: string
  sourceFile?: string | null
  importedAt?: string | null
  updatedAt: string
  snippet: string
}

export interface KbDocument {
  id: string
  title: string
  content?: string | null
  sourceFile?: string | null
  fileType?: string | null
  fileSize?: number | null
  r2Key?: string | null
  importedAt?: string | null
  updatedAt?: string | null
}

export interface KbSummary {
  id: string
  title: string
  fileType?: string | null
  fileSize?: number | null
  r2Key?: string | null
  importedAt?: string | null
  updatedAt?: string | null
}

export interface CoinFlip {
  id: string
  result: 'heads' | 'tails'
  entropySource: string
  rawValue: string
  interpretation: string
  createdAt: string
}

export interface AnswerBookDraw {
  id: string
  result: string
  entropySource: string
  rawValue: number
  interpretation?: string | null
  createdAt: string
}

export interface DailyFortune {
  id: string
  date: string
  result: string
  level?: string
  poem?: string
  interpret?: string
  entropySource: string
  rawValue: number
  interpretation?: string
  createdAt: string
}

export interface SyncLog {
  id: string
  source: 'ms_todo' | 'ima_notes' | 'ima_kb' | 'news_fetch' | 'news_digest'
  status: 'success' | 'partial' | 'error'
  synced: number
  failed: number
  skipped: number
  message?: string | null
  details?: string | null
  createdAt: string
}

export interface SyncStatus {
  lastSyncAt: string | null
  status: 'idle' | 'syncing' | 'success' | 'error'
  message?: string
}

export interface AiAnalysisStats {
  totalTasks: number
  completedTasks: number
  importantTasks: number
  notesCount: number
  dailyCompleted: { date: string; count: number }[]
}

export interface WeeklyReport {
  week: string
  report: string
}

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

export const api = ky.create({
  prefix: API_BASE,
  retry: 0,
  timeout: 120000,
  hooks: {
    beforeRequest: [
      ({ request }) => {
        const token = localStorage.getItem('token')
        if (token) {
          request.headers.set('Authorization', `Bearer ${token}`)
        }
      },
    ],
    afterResponse: [
      async ({ request, response }) => {
        if (response.status !== 401) return
        // 登录接口的 401 由调用方处理，不在此全局拦截（避免错误密码触发"登录已过期"误导）
        const url = new URL(request.url)
        if (url.pathname.endsWith('/api/auth/login')) return
        localStorage.removeItem('token')
        // 保存当前路由，登录后跳回
        const current = window.location.pathname + window.location.search
        if (!current.startsWith('/login')) {
          sessionStorage.setItem('redirect-after-login', current)
        }
        toast.error('登录已过期，请重新登录')
        window.location.href = '/login'
      },
    ],
  },
})

// 认证
export const authApi = {
  login: (password: string) => api.post('auth/login', { json: { password } }).json<{ token: string }>(),
  changePassword: (data: { oldPassword: string; newPassword: string }) =>
    api.post('auth/change-password', { json: data }).json<{ ok: boolean }>(),
}

// 任务列表
export const taskListsApi = {
  list: () => api.get('tasks/lists').json<TaskList[]>(),
  listWithStats: () => api.get('tasks/lists', { searchParams: { stats: '1' } }).json<TaskList[]>(),
  create: (data: { name: string; color?: string }) => api.post('tasks/lists', { json: data }).json<TaskList>(),
  update: (id: string, data: { name?: string; color?: string }) => api.put(`tasks/lists/${id}`, { json: data }).json<TaskList>(),
  delete: (id: string) => api.delete(`tasks/lists/${id}`).json(),
}

// 任务
export const tasksApi = {
  list: () => api.get('tasks').json<Task[]>(),
  byList: (listId: string) => api.get(`tasks/lists/${listId}/tasks`).json<Task[]>(),
  myDay: () => api.get('tasks/myday').json<Task[]>(),
  important: () => api.get('tasks/important').json<Task[]>(),
  planned: () => api.get('tasks/planned').json<Task[]>(),
  search: (q: string) => api.get(`tasks/search`, { searchParams: { q } }).json<Task[]>(),
  get: (id: string) => api.get(`tasks/${id}`).json<Task>(),
  create: (data: Partial<Task>) =>
    api.post('tasks', { json: data }).json<Task>(),
  update: (id: string, data: Partial<Task>) => api.put(`tasks/${id}`, { json: data }).json<Task>(),
  delete: (id: string) => api.delete(`tasks/${id}`).json(),
  addToMyDay: (id: string) => api.post(`tasks/${id}/myday`).json(),
  removeFromMyDay: (id: string) => api.delete(`tasks/${id}/myday`).json(),
  reorder: (orders: { id: string; sortOrder: number }[]) => api.put('tasks/reorder', { json: { orders } }).json(),
}

// 子任务
export const subtasksApi = {
  byTask: (taskId: string) => api.get(`subtasks/${taskId}`).json<Subtask[]>(),
  create: (taskId: string, title: string, sortOrder?: number) => api.post(`subtasks/${taskId}`, { json: { title, sortOrder } }).json<Subtask>(),
  toggle: (id: string) => api.patch(`subtasks/${id}/toggle`).json<Subtask>(),
  reorder: (orders: { id: string; sortOrder: number }[]) => api.put('subtasks/reorder', { json: { orders } }).json(),
  delete: (id: string) => api.delete(`subtasks/${id}`).json(),
}

// AI
export const aiApi = {
  breakdown: (taskTitle: string, taskId?: string) => api.post('ai/breakdown', { json: { taskTitle, taskId } }).json<{ subtasks: { id?: string; title: string }[]; created?: boolean }>(),
  analysis: (range?: string) => api.post(`ai/analysis${range ? `?range=${range}` : ''}`).json<{ analysis: string; stats: AiAnalysisStats }>(),
  weeklyReport: () => api.post('ai/weekly-report').json<{ report: string; week: string }>(),
  weeklyReports: () => api.get('ai/weekly-reports').json<WeeklyReport[]>(),
  // 笔记 AI 辅助：总结 / 要点 / 转任务
  noteSummary: (noteId: string, action: 'summary' | 'points' | 'to-task') =>
    api.post('ai/note-summary', { json: { noteId, action } }).json<{ result: string }>(),
  // 跨模块语义检索
  semanticSearch: (query: string, topK = 5) =>
    api.post('ai/semantic-search', { json: { query, topK } }).json<{
      results: { type: string; id: string; title: string; snippet: string; score: number }[]
    }>(),
  // 一次性重建全部语义向量（批量预热，新建内容已自动增量索引）
  reindex: () => api.post('ai/reindex').json<{ ok: boolean; indexed: number }>(),
  // 自然语言解析为结构化任务
  parseTask: (text: string) =>
    api.post('ai/parse-task', { json: { text } }).json<{
      task: { title: string; dueDate: string | null; listName: string | null; note: string | null; listId: string | null }
    }>(),
  // 每日简报
  digest: () => api.post('ai/digest').json<{ digest: string; cached?: boolean }>(),
  // AI 优先级建议：推荐今天最值得做的 1-3 件事
  prioritySuggestions: () =>
    api.post('ai/priority-suggestions').json<{ suggestions: { taskId: string; reason: string }[]; cached?: boolean }>(),
  // AI 列表推荐：根据任务标题推荐最合适的列表
  suggestList: (title: string) =>
    api.post('ai/suggest-list', { json: { title } }).json<{ listId: string | null; listName: string | null }>(),
  // AI 聊天：流式（SSE）。返回 AbortController 以便取消。
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
    }
  ) => {
    const token = localStorage.getItem('token')
    const ctrl = new AbortController()
    ;(async () => {
      try {
        const res = await fetch(`${API_BASE}/ai/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
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
          try { const j = await res.json(); if (j?.error) msg = j.error } catch {}
          handlers.onError?.(msg)
          return
        }
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''
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
              else if (ev.type === 'tool') handlers.onTool?.({ name: ev.name, observation: ev.observation })
              else if (ev.type === 'sources') handlers.onSources?.(ev.sources)
              else if (ev.type === 'done') handlers.onDone?.(ev)
              else if (ev.type === 'error') handlers.onError?.(ev.message)
            } catch {}
          }
        }
      } catch (e: any) {
        if (e?.name === 'AbortError') return
        handlers.onError?.(e?.message || '网络错误')
      }
    })()
    return ctrl
  },
  // 聊天历史
  listChatSessions: () => api.get('ai/chat/sessions').json<ChatSessionPreview[]>(),
  getChatSession: (id: string) => api.get(`ai/chat/sessions/${id}`).json<{ session: { id: string; title: string } | null; messages: ChatMessageRow[] }>(),
  deleteChatSession: (id: string) => api.delete(`ai/chat/sessions/${id}`).json<{ ok: boolean }>(),
  updateChatSession: (id: string, patch: { title?: string; tags?: string[]; pinned?: boolean }) =>
    api.patch(`ai/chat/sessions/${id}`, { json: patch }).json<{ ok: boolean }>(),
}

// 聊天相关类型
export interface ChatSessionPreview {
  id: string
  title: string
  updatedAt: string | null
  preview: string
  pinned?: number
  tags?: string[]
}
export interface ChatMessageRow {
  role: string
  content: string
  toolCalls: string | null
  createdAt: string | null
}

// 天意硬币
export const coinApi = {
  flip: () => api.post('coin/flip').json<{ result: string; source: string; rawValue: number; interpretation: string }>(),
  history: () => api.get('coin/history').json<CoinFlip[]>(),
}

// 决策小工具：答案之书 & 每日一签
export const toolsApi = {
  answer: () => api.post('tools/answer').json<{ result: string; source: string; rawValue: number }>(),
  answerHistory: () => api.get('tools/answer/history').json<AnswerBookDraw[]>(),
  fortune: () => api.post('tools/fortune').json<{ result: string; level: string; poem: string; interpret: string; source: string; rawValue: number; cached?: boolean }>(),
  fortuneHistory: () => api.get('tools/fortune/history').json<DailyFortune[]>(),
}

// 同步日志
export const syncLogsApi = {
  list: (params?: { source?: string; status?: string; limit?: number }) =>
    api.get('sync-logs', { searchParams: params }).json<SyncLog[]>(),
}

// 笔记
export const notesApi = {
  list: () => api.get('notes').json<Note[]>(),
  listSummary: () => api.get('notes/summary').json<NoteSummary[]>(),
  get: (id: string) => api.get(`notes/${id}`).json<Note>(),
  import: (data: { title: string; content: string; sourceFile?: string }) => api.post('notes/import', { json: data }).json<Note>(),
  update: (id: string, data: Partial<Note>) => api.put(`notes/${id}`, { json: data }).json<Note>(),
  search: (q: string) => api.get('notes/search', { searchParams: { q } }).json<Note[]>(),
  delete: (id: string) => api.delete(`notes/${id}`).json(),
}

// 知识库
export const kbApi = {
  list: () => api.get('kb').json<KbDocument[]>(),
  listSummary: () => api.get('kb/summary').json<KbSummary[]>(),
  get: (id: string) => api.get(`kb/${id}`).json<KbDocument>(),
  upload: (file: File, title?: string, onProgress?: (pct: number) => void, content?: string) => {
    return new Promise<{ id: string }>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      const fd = new FormData()
      fd.append('file', file)
      if (title) fd.append('title', title)
      if (content) fd.append('content', content)
      xhr.open('POST', `${API_BASE}/kb/upload`)
      const token = localStorage.getItem('token')
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100))
        }
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText))
          } catch {
            reject(new Error('解析响应失败'))
          }
        } else {
          reject(new Error(`上传失败: ${xhr.status}`))
        }
      }
      xhr.onerror = () => reject(new Error('网络错误'))
      xhr.send(fd)
    })
  },
  // AI 总结知识库文档
  summary: (id: string) => api.post(`kb/${id}/summary`).json<{ summary: string }>(),
  // 向知识库文档提问
  ask: (id: string, question: string) => api.post(`kb/${id}/ask`, { json: { question } }).json<{ answer: string }>(),
  // 跨文档知识库全局问答（RAG）
  globalAsk: (question: string, topK?: number) => api.post('kb/ask', { json: { question, topK } }).json<{ answer: string; sources: { title: string; snippet: string; score: number }[] }>(),
  search: (q: string) => api.get('kb/search', { searchParams: { q } }).json<KbDocument[]>(),
  // 带 Authorization 头获取 ArrayBuffer（避免裸 fetch 401）
  getArrayBuffer: (id: string) =>
    api.get(`kb/${id}/download`).arrayBuffer(),
  // 保留后端返回的 MIME，供音频/图片等原生预览使用
  getBlob: (id: string) =>
    api.get(`kb/${id}/download`).blob(),
  // 带 Authorization 头生成 Blob URL（供 PDF Viewer / img / a download 使用）
  getBlobUrl: async (id: string): Promise<string> => {
    const blob = await kbApi.getBlob(id)
    return URL.createObjectURL(blob)
  },
  delete: (id: string) => api.delete(`kb/${id}`).json(),
}

// 设置
export const settingsApi = {
  get: () => api.get('settings').json<Record<string, string>>(),
  update: (data: Record<string, string>) => api.put('settings', { json: data }).json(),
  testAi: (data: { baseUrl: string; apiKey: string; model: string }) =>
    api.post('settings/ai/test', { json: data }).json<{ ok: boolean; latency_ms?: number; model?: string; error?: string }>(),
  msTodoStatus: () => api.get('settings/ms-todo/status').json<{ authorized: boolean; lastSync: string | null }>(),
  msTodoSync: () => api.post('settings/ms-todo/sync').json<{ ok: boolean; synced?: number; error?: string }>(),
  msTodoCallback: (code: string, redirectUri?: string) => api.get('settings/ms-todo/callback', { searchParams: { code, ...(redirectUri ? { redirect_uri: redirectUri } : {}) } }).json<{ ok: boolean; error?: string }>(),
  resetData: () => api.delete('settings/reset').json(),
}

// AI 配置（多条目 + 默认）
export interface AiConfig {
  id: string
  name: string
  type: 'cloudflare' | 'openai'
  baseUrl: string
  model: string
  isDefault: boolean
  apiKeySet: boolean
  createdAt: string | null
}

export const aiConfigsApi = {
  list: () => api.get('ai-configs').json<AiConfig[]>(),
  create: (data: { name: string; type: 'cloudflare' | 'openai'; baseUrl?: string; apiKey?: string; model?: string; isDefault?: boolean }) =>
    api.post('ai-configs', { json: data }).json<{ ok: boolean; id: string }>(),
  update: (id: string, data: { name?: string; type?: 'cloudflare' | 'openai'; baseUrl?: string; apiKey?: string; model?: string; isDefault?: boolean }) =>
    api.put(`ai-configs/${id}`, { json: data }).json<{ ok: boolean }>(),
  remove: (id: string) => api.delete(`ai-configs/${id}`).json<{ ok: boolean }>(),
  setDefault: (id: string) => api.post(`ai-configs/${id}/default`, {}).json<{ ok: boolean }>(),
  test: (data: { id?: string; type?: 'cloudflare' | 'openai'; baseUrl?: string; apiKey?: string; model?: string }) =>
    api.post('ai-configs/test', { json: data }).json<{ ok: boolean; latency_ms?: number; model?: string; error?: string }>(),
}

// IMA 同步
export const imaApi = {
  status: () => api.get('ima/status').json<{ authorized: boolean; lastSync: string | null }>(),
  // syncNotes/syncKb 加 120s timeout（后端墙钟预算 18s，但网络抖动留余量）
  // partial=true 表示墙钟/子请求预算耗尽，部分同步，剩余下次自动完成
  syncNotes: () => api.post('ima/sync-notes', { timeout: 120000 }).json<{ ok: boolean; synced?: number; partial?: boolean; skipped?: number; error?: string }>(),
  syncKb: () => api.post('ima/sync-kb', { timeout: 120000 }).json<{ ok: boolean; synced?: number; partial?: boolean; skipped?: number; error?: string }>(),
  // 笔记写回：新建笔记并同步到 IMA
  createNote: (data: { title: string; content: string }) =>
    api.post('ima/notes', { json: data }).json<{ ok: boolean; id: string; error?: string }>(),
  // 笔记写回：追加内容到已有 IMA 笔记
  appendNote: (id: string, content: string) =>
    api.post(`ima/notes/${id}/append`, { json: { content } }).json<{ ok: boolean; error?: string }>(),

  // 方案 A：浏览器侧下载 + 上传 R2
  // 批量查询 R2 缺失（优先 GET，避免代理对 POST body 的 reset/截断；超长时 fallback POST）
  checkAttachments: (mediaIds: string[]) => {
    if (mediaIds.length <= 100) {
      return api.get(`ima/attachments/check?mediaIds=${encodeURIComponent(mediaIds.join(','))}`, { timeout: 120000 })
        .json<{ missing: string[]; inCooldown: string[] }>()
    }
    return api.post('ima/attachments/check', { json: { mediaIds }, timeout: 120000 })
      .json<{ missing: string[]; inCooldown: string[] }>()
  },
  // 获取单个媒体的新鲜 CDN URL（后端走 KV 缓存，30 分钟）
  getMediaInfo: (mediaId: string) =>
    api.get(`ima/media-info/${mediaId}`).json<{ url: string; headers?: Record<string, string> }>(),
  // 上传浏览器下载好的 blob 到 R2（mediaId 通过 query 传，body 是原始 blob）
  uploadAttachment: (mediaId: string, blob: Blob, contentType: string) =>
    api.post(`ima/attachments/upload?mediaId=${encodeURIComponent(mediaId)}`, {
      body: blob,
      headers: { 'Content-Type': contentType },
      timeout: 60000,
    }).json<{ ok: boolean; r2Key?: string; size?: number; skipped?: boolean; error?: string }>(),
}

// 标签
export interface Tag { id: string; name: string; color: string }
export const tagsApi = {
  list: () => api.get('tags').json<Tag[]>(),
  create: (data: { name: string; color?: string }) => api.post('tags', { json: data }).json<Tag>(),
  delete: (id: string) => api.delete(`tags/${id}`).json(),
  assign: (data: { tagId: string; targetType: string; targetId: string }) => api.post('tags/assign', { json: data }).json(),
  unassign: (data: { tagId: string; targetType: string; targetId: string }) => api.delete('tags/unassign', { json: data }).json(),
  of: (targetType: string, targetId: string) => api.get(`tags/of/${targetType}/${targetId}`).json<Tag[]>(),
}
