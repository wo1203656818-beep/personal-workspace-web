import { api, API_BASE } from './client'
import type { KbDocument, KbSummary } from './types'

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
      const token = localStorage.getItem('token') || sessionStorage.getItem('token')
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
  summary: (id: string) => api.post(`kb/${id}/summary`).json<{ summary: string }>(),
  ask: (id: string, question: string) =>
    api.post(`kb/${id}/ask`, { json: { question } }).json<{ answer: string }>(),
  globalAsk: (question: string, topK?: number) =>
    api
      .post('kb/ask', { json: { question, topK } })
      .json<{ answer: string; sources: { title: string; snippet: string; score: number }[] }>(),
  search: (q: string) => api.get('kb/search', { searchParams: { q } }).json<KbDocument[]>(),
  getArrayBuffer: (id: string) => api.get(`kb/${id}/download`).arrayBuffer(),
  getBlob: (id: string) => api.get(`kb/${id}/download`).blob(),
  getBlobUrl: async (id: string): Promise<string> => {
    const blob = await kbApi.getBlob(id)
    return URL.createObjectURL(blob)
  },
  delete: (id: string) => api.delete(`kb/${id}`).json(),
}
