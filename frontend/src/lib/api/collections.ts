import { api } from './client'

export interface MediaItem {
  id: string
  kind: 'book' | 'movie' | 'tv' | 'game'
  title: string
  author: string | null
  status: 'want' | 'doing' | 'done'
  rating: number | null
  note: string | null
  createdAt: string
  updatedAt: string
}

export interface Bookmark {
  id: string
  url: string
  title: string | null
  summary: string | null
  tags: string | null
  readStatus: 'unread' | 'read' | 'archived'
  progress: number | null
  readingNote: string | null
  createdAt: string
}

export const collectionsApi = {
  // 书/影/剧/游戏
  media: {
    list: (params?: { kind?: string; status?: string }) => {
      const q = new URLSearchParams()
      if (params?.kind) q.set('kind', params.kind)
      if (params?.status) q.set('status', params.status)
      const qs = q.toString()
      return api.get(`collections/media${qs ? `?${qs}` : ''}`).json<MediaItem[]>()
    },
    create: (data: { kind: string; title: string; author?: string; status?: string; rating?: number; note?: string }) =>
      api.post('collections/media', { json: data }).json<MediaItem>(),
    update: (id: string, data: Partial<MediaItem>) =>
      api.put(`collections/media/${id}`, { json: data }).json<MediaItem>(),
    remove: (id: string) => api.delete(`collections/media/${id}`).json<{ ok: boolean }>(),
  },

  // 链接收藏
  bookmarks: {
    list: (status?: string) => {
      const qs = status ? `?status=${status}` : ''
      return api.get(`collections/bookmarks${qs}`).json<Bookmark[]>()
    },
    create: (data: { url: string; title?: string; summary?: string; tags?: string[]; readStatus?: string }) =>
      api.post('collections/bookmarks', { json: data }).json<Bookmark>(),
    update: (id: string, data: Partial<Bookmark>) =>
      api.put(`collections/bookmarks/${id}`, { json: data }).json<Bookmark>(),
    remove: (id: string) => api.delete(`collections/bookmarks/${id}`).json<{ ok: boolean }>(),
  },
}