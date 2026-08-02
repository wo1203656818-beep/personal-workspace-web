import { api } from './client'

export interface FocusSession {
  id: string
  taskId: string | null
  taskTitle: string | null
  minutes: number
  completed: boolean
  tags: string | null
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

export interface FocusCalendarItem {
  date: string
  minutes: number
}

export interface FocusBadge {
  id: string
  name: string
  icon: string
  desc: string
  achieved: boolean
  progress: number
  target: number
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

export interface FocusSessionInput {
  minutes: number
  taskId?: string
  taskTitle?: string
  completed?: boolean
  startedAt?: string
  endedAt?: string
  tags?: string[]
}

export const focusApi = {
  list: (days = 14) => api.get(`focus?days=${days}`).json<FocusListResponse>(),
  stats: () => api.get('focus/stats').json<FocusStatsResponse>(),
  create: (data: FocusSessionInput) => api.post('focus', { json: data }).json<FocusSession>(),
  remove: (id: string) => api.delete(`focus/${id}`).json<{ ok: boolean }>(),
  calendar: (days = 365) => api.get(`focus/calendar?days=${days}`).json<FocusCalendarItem[]>(),
  achievements: () => api.get('focus/achievements').json<{ badges: FocusBadge[] }>(),
  aiAnalysis: () => api.get('focus/ai-analysis').json<FocusAiAnalysis>(),
}