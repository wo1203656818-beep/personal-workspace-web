import { api } from './client'

export interface Goal {
  id: string
  title: string
  description: string | null
  icon: string | null
  color: string | null
  currentValue: number | null
  targetValue: number | null
  unit: string | null
  targetDate: string | null
  status: 'active' | 'done' | 'archived'
  createdAt: string
  updatedAt: string
}

export interface Countdown {
  id: string
  title: string
  date: string
  note: string | null
  color: string | null
  isYearly: boolean
  createdAt: string
}

export interface GoalAiAnalysis {
  generatedAt: string
  fromCache: boolean
  report: {
    summary: string
    suggestions: string[]
    encouragement: string
  }
}

export interface GoalStats {
  total: number
  active: number
  done: number
  archived: number
}

export const goalsApi = {
  list: () => api.get('goals').json<Goal[]>(),
  stats: () => api.get('goals/stats').json<GoalStats>(),
  aiAnalysis: () => api.get('goals/ai-analysis').json<GoalAiAnalysis>(),
  create: (data: { title: string; description?: string; icon?: string; color?: string; currentValue?: number; targetValue?: number; unit?: string; targetDate?: string }) =>
    api.post('goals', { json: data }).json<Goal>(),
  update: (id: string, data: Partial<Goal>) =>
    api.put(`goals/${id}`, { json: data }).json<Goal>(),
  remove: (id: string) => api.delete(`goals/${id}`).json<{ ok: boolean }>(),

  // 倒数日
  countdowns: {
    list: () => api.get('goals/countdowns').json<Countdown[]>(),
    create: (data: { title: string; date: string; note?: string; color?: string; isYearly?: boolean }) =>
      api.post('goals/countdowns', { json: data }).json<Countdown>(),
    update: (id: string, data: Partial<{ title: string; date: string; note?: string; color?: string; isYearly?: boolean }>) =>
      api.put(`goals/countdowns/${id}`, { json: data }).json<Countdown>(),
    remove: (id: string) => api.delete(`goals/countdowns/${id}`).json<{ ok: boolean }>(),
  },
}