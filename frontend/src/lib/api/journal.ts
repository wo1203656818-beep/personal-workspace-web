import { api } from './client'

export interface JournalEntry {
  id: string
  title: string
  content: string
  mood: string | null
  tags: string | null
  date: string
  createdAt: string
  updatedAt: string
}

export interface JournalStats {
  total: number
  streak: number
  thisWeek: number
  thisMonthCount: number
  recentMoods: { date: string; mood: string | null }[]
}

export interface JournalAiAnalysis {
  generatedAt: string
  fromCache: boolean
  report: {
    summary: string
    pattern: string
    suggestions: string[]
  }
}

export const journalApi = {
  aiAnalysis: () => api.get('journal/ai-analysis').json<JournalAiAnalysis>(),
  stats: () => api.get('journal/stats').json<JournalStats>(),
  list: (params?: { date?: string; month?: string }) => {
    const q = new URLSearchParams()
    if (params?.date) q.set('date', params.date)
    if (params?.month) q.set('month', params.month)
    const qs = q.toString()
    return api.get(`journal${qs ? `?${qs}` : ''}`).json<JournalEntry[]>()
  },
  get: (id: string) => api.get(`journal/${id}`).json<JournalEntry>(),
  create: (data: { title?: string; content: string; mood?: string; tags?: string[]; date?: string }) =>
    api.post('journal', { json: data }).json<JournalEntry>(),
  update: (id: string, data: { title?: string; content?: string; mood?: string; tags?: string[]; date?: string }) =>
    api.put(`journal/${id}`, { json: data }).json<JournalEntry>(),
  remove: (id: string) => api.delete(`journal/${id}`).json<{ ok: boolean }>(),
}