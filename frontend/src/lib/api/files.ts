import { api } from './client'

export interface R2FileItem {
  key: string
  size: number
  uploaded: string
  contentType: string
}

export interface R2FileListResponse {
  items: R2FileItem[]
  cursor: string | null
  truncated: boolean
}

export const filesApi = {
  list: (params?: { prefix?: string; limit?: number; cursor?: string }) => {
    const q = new URLSearchParams()
    if (params?.prefix) q.set('prefix', params.prefix)
    if (params?.limit) q.set('limit', String(params.limit))
    if (params?.cursor) q.set('cursor', params.cursor)
    const qs = q.toString()
    return api.get(`files${qs ? `?${qs}` : ''}`).json<R2FileListResponse>()
  },
  remove: (key: string) => api.delete(`files/${encodeURIComponent(key)}`).json<{ ok: boolean }>(),
  rename: (key: string, newKey: string) =>
    api.put(`files/${encodeURIComponent(key)}/rename`, { json: { newKey } }).json<R2FileItem>(),
  upload: (file: File, key?: string) => {
    const formData = new FormData()
    formData.append('file', file)
    if (key) formData.append('key', key)
    return api.post('files/upload', { body: formData }).json<{ key: string; size: number; contentType: string }>()
  },
}