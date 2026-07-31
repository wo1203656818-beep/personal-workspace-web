import { api } from './client'
import type { SyncLog } from './types'

export const syncLogsApi = {
  list: (params?: { source?: string; status?: string; limit?: number }) =>
    api.get('sync-logs', { searchParams: params }).json<SyncLog[]>(),
}
