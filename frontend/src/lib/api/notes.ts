import { api } from './client'
import type { Note, NoteSummary } from './types'

export const notesApi = {
  list: () => api.get('notes').json<Note[]>(),
  listSummary: () => api.get('notes/summary').json<NoteSummary[]>(),
  get: (id: string) => api.get(`notes/${id}`).json<Note>(),
  import: (data: { title: string; content: string; sourceFile?: string }) => api.post('notes/import', { json: data }).json<Note>(),
  update: (id: string, data: Partial<Note>) => api.put(`notes/${id}`, { json: data }).json<Note>(),
  search: (q: string) => api.get('notes/search', { searchParams: { q } }).json<Note[]>(),
  delete: (id: string) => api.delete(`notes/${id}`).json(),
}
