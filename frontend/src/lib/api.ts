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
}

export interface Task {
  id: string
  listId: string
  title: string
  note: string
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
  sourceFile?: string | null
  importedAt?: string | null
  updatedAt: string
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

export interface CoinFlip {
  id: string
  result: 'heads' | 'tails'
  entropySource: string
  rawValue: string
  interpretation: string
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
}

// 子任务
export const subtasksApi = {
  byTask: (taskId: string) => api.get(`subtasks/${taskId}`).json<Subtask[]>(),
  create: (taskId: string, title: string) => api.post(`subtasks/${taskId}`, { json: { title } }).json<Subtask>(),
  toggle: (id: string) => api.patch(`subtasks/${id}/toggle`).json<Subtask>(),
  delete: (id: string) => api.delete(`subtasks/${id}`).json(),
}

// AI
export const aiApi = {
  breakdown: (taskTitle: string) => api.post('ai/breakdown', { json: { taskTitle } }).json<{ subtasks: { title: string }[] }>(),
  analysis: (range?: string) => api.post(`ai/analysis${range ? `?range=${range}` : ''}`).json<{ analysis: string; stats: AiAnalysisStats }>(),
  weeklyReport: () => api.post('ai/weekly-report').json<{ report: string; week: string }>(),
  weeklyReports: () => api.get('ai/weekly-reports').json<WeeklyReport[]>(),
}

// 天意硬币
export const coinApi = {
  flip: () => api.post('coin/flip').json<{ result: string; source: string; rawValue: number; interpretation: string }>(),
  history: () => api.get('coin/history').json<CoinFlip[]>(),
}

// 笔记
export const notesApi = {
  list: () => api.get('notes').json<Note[]>(),
  get: (id: string) => api.get(`notes/${id}`).json<Note>(),
  import: (data: { title: string; content: string; sourceFile?: string }) => api.post('notes/import', { json: data }).json<Note>(),
  update: (id: string, data: Partial<Note>) => api.put(`notes/${id}`, { json: data }).json<Note>(),
  search: (q: string) => api.get('notes/search', { searchParams: { q } }).json<Note[]>(),
  delete: (id: string) => api.delete(`notes/${id}`).json(),
}

// 知识库
export const kbApi = {
  list: () => api.get('kb').json<KbDocument[]>(),
  get: (id: string) => api.get(`kb/${id}`).json<KbDocument>(),
  upload: (file: File, title?: string, onProgress?: (pct: number) => void) => {
    return new Promise<{ id: string }>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      const fd = new FormData()
      fd.append('file', file)
      if (title) fd.append('title', title)
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
  search: (q: string) => api.get('kb/search', { searchParams: { q } }).json<KbDocument[]>(),
  // 带 Authorization 头获取 ArrayBuffer（避免裸 fetch 401）
  getArrayBuffer: (id: string) =>
    api.get(`kb/${id}/download`).arrayBuffer(),
  // 带 Authorization 头生成 Blob URL（供 PDF Viewer / img / a download 使用）
  getBlobUrl: async (id: string): Promise<string> => {
    const buf = await kbApi.getArrayBuffer(id)
    return URL.createObjectURL(new Blob([buf]))
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

// IMA 同步
export const imaApi = {
  status: () => api.get('ima/status').json<{ authorized: boolean; lastSync: string | null }>(),
  syncNotes: () => api.post('ima/sync-notes').json<{ ok: boolean; synced?: number; error?: string }>(),
  syncKb: () => api.post('ima/sync-kb').json<{ ok: boolean; synced?: number; error?: string }>(),
  // 笔记写回：新建笔记并同步到 IMA
  createNote: (data: { title: string; content: string }) =>
    api.post('ima/notes', { json: data }).json<{ ok: boolean; id: string; error?: string }>(),
  // 笔记写回：追加内容到已有 IMA 笔记
  appendNote: (id: string, content: string) =>
    api.post(`ima/notes/${id}/append`, { json: { content } }).json<{ ok: boolean; error?: string }>(),
}
