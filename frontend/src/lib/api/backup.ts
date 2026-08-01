import { api } from './client'

export const backupApi = {
  export: () => api.get('backup/export').json<{ version: string; exportedAt: string; data: Record<string, any[]> }>(),
  import: (data: { version: string; exportedAt: string; data: Record<string, any[]> }) =>
    api.post('backup/import', { json: data }).json<{ ok: boolean; imported: number }>(),
}