import { api } from './client'

export interface StaleTask {
  id: string
  title: string
  createdAt: string | null
  updatedAt: string | null
  status: string | null
  listId: string
}

export interface DeclutterStats {
  totalTasks: number
  staleTasks: number
  quickTasks: number
  totalRules: number
  totalNotes: number
  totalKb: number
}

export interface OrphanedRule {
  id: string
  category: string
  title: string
  condition: string
  action: string
}

export const declutterApi = {
  staleTasks: () => api.get('declutter/stale-tasks').json<StaleTask[]>(),
  orphanedRules: () => api.get('declutter/orphaned-rules').json<OrphanedRule[]>(),
  stats: () => api.get('declutter/stats').json<DeclutterStats>(),
  cleanup: (ids: string[]) => api.post('declutter/cleanup', { json: { ids } }).json<{ cleaned: number }>(),
}
