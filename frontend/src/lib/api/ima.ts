import { api } from './client'

export const imaApi = {
  status: () => api.get('ima/status').json<{ authorized: boolean; lastSync: string | null }>(),
  syncNotes: () =>
    api.post('ima/sync-notes', { timeout: 120000 }).json<{
      ok: boolean
      synced?: number
      partial?: boolean
      skipped?: number
      error?: string
    }>(),
  syncKb: () =>
    api.post('ima/sync-kb', { timeout: 120000 }).json<{
      ok: boolean
      synced?: number
      partial?: boolean
      skipped?: number
      error?: string
    }>(),
  appendNote: (id: string, content: string) =>
    api
      .post(`ima/notes/${id}/append`, { json: { content } })
      .json<{ ok: boolean; error?: string }>(),
}
