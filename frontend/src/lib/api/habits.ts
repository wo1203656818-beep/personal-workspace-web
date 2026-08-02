import { api } from './client'

export interface Habit {
  id: string
  name: string
  icon: string | null
  color: string | null
  description: string | null
  isGood: boolean | null
  frequency: string | null
  targetPerWeek: number | null
  createdAt: string
  updatedAt: string
  doneToday: boolean
  streak: number
  bestStreak: number
  total: number
  weekDone: number
  weekTarget: number
  weekRate: number | null
}

export interface HabitStats {
  bestStreak: number
  streak: number
  total: number
  weekdayCount: number[]
  weekly: { week: string; done: number; target: number; rate: number | null }[]
  recent: { date: string; done: boolean }[]
}

export interface HabitBadge {
  id: string
  name: string
  icon: string
  desc: string
  achieved: boolean
  progress: number
  target: number
}

export interface HabitCheckin {
  date: string
  count: number
}

export interface HabitCorrelation {
  generatedAt: string
  fromCache: boolean
  pairs: [string, string, number][]
  report: string
}

export interface HabitInput {
  name: string
  icon?: string
  color?: string
  description?: string
  isGood?: boolean
  frequency?: string | null
  targetPerWeek?: number | null
}

export const habitsApi = {
  list: () => api.get('habits').json<Habit[]>(),
  create: (data: HabitInput) => api.post('habits', { json: data }).json<Habit>(),
  update: (id: string, data: Partial<HabitInput>) =>
    api.put(`habits/${id}`, { json: data }).json<Habit>(),
  remove: (id: string) => api.delete(`habits/${id}`).json<{ ok: boolean }>(),
  stats: (id: string) => api.get(`habits/${id}/stats`).json<HabitStats>(),
  achievements: () => api.get('habits/achievements').json<{ badges: HabitBadge[] }>(),
  checkin: (id: string, date?: string, note?: string) => {
    const body: Record<string, string> = {}
    if (date) body.date = date
    if (note) body.note = note
    return api.post(`habits/${id}/checkin`, { json: body }).json<{ done: boolean }>()
  },
  calendar: (days = 365) => api.get(`habits/calendar?days=${days}`).json<HabitCheckin[]>(),
  correlation: () => api.get('habits/correlation').json<HabitCorrelation>(),
}
