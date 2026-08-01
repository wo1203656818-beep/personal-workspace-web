import { api } from './client'

export interface FocusSession {
  id: string
  taskId: string | null
  taskTitle: string | null
  minutes: number
  completed: boolean
  startedAt: string
  endedAt: string | null
  createdAt: string
}

export interface FocusStats {
  todayMinutes: number
  todayCount: number
  totalMinutes: number
  totalCount: number
}

export interface FocusListResponse {
  sessions: FocusSession[]
  stats: FocusStats
}

export interface FocusWeeklyItem {
  date: string
  minutes: number
  count: number
}

export interface FocusStatsResponse extends FocusStats {
  weekly: FocusWeeklyItem[]
}

export interface FocusAiReport {
  summary: string
  dailyTrend: string
  peakHours: string
  topTasks: { taskTitle: string; totalMinutes: number; sessionCount: number }[]
  suggestions: string[]
}

export interface FocusAiAnalysis {
  generatedAt: string
  fromCache: boolean
  report: FocusAiReport
}

export const focusApi = {
  list: (days = 14) => api.get(`focus?days=${days}`).json<FocusListResponse>(),
  stats: () => api.get('focus/stats').json<FocusStatsResponse>(),
  create: (data: { minutes: number; taskId?: string; taskTitle?: string; completed?: boolean; startedAt?: string; endedAt?: string }) =>
    api.post('focus', { json: data }).json<FocusSession>(),
  remove: (id: string) => api.delete(`focus/${id}`).json<{ ok: boolean }>(),
  aiAnalysis: () => api.get('focus/ai-analysis').json<FocusAiAnalysis>(),
}