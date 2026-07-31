import { api } from './client'

export const settingsApi = {
  get: () => api.get('settings').json<Record<string, string>>(),
  update: (data: Record<string, string>) => api.put('settings', { json: data }).json(),
  msTodoStatus: () =>
    api.get('settings/ms-todo/status').json<{ authorized: boolean; lastSync: string | null }>(),
  msTodoSync: () =>
    api.post('settings/ms-todo/sync').json<{ ok: boolean; synced?: number; error?: string }>(),
  msTodoCallback: (code: string, redirectUri?: string) =>
    api
      .get('settings/ms-todo/callback', {
        searchParams: { code, ...(redirectUri ? { redirect_uri: redirectUri } : {}) },
      })
      .json<{ ok: boolean; error?: string }>(),
  resetData: () => api.delete('settings/reset').json(),
}
