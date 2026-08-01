import { api } from './client'

export interface Habit {
  id: string
  name: string
  icon: string | null
  color: string | null
  description: string | null
  createdAt: string
  updatedAt: string
  doneToday: boolean
  streak: number
  total: number
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

export const habitsApi = {
  list: () => api.get('habits').json<Habit[]>(),
  create: (data: { name: string; icon?: string; color?: string; description?: string }) =>
    api.post('habits', { json: data }).json<Habit>(),
  update: (id: string, data: { name: string; icon?: string; color?: string; description?: string }) =>
    api.put(`habits/${id}`, { json: data }).json<Habit>(),
  remove: (id: string) => api.delete(`habits/${id}`).json<{ ok: boolean }>(),
  checkin: (id: string, date?: string, note?: string) => {
    const body: Record<string, string> = {}
    if (date) body.date = date
    if (note) body.note = note
    return api.post(`habits/${id}/checkin`, { json: body }).json<{ done: boolean }>()
  },
  calendar: (days = 365) => api.get(`habits/calendar?days=${days}`).json<HabitCheckin[]>(),
  correlation: () => api.get('habits/correlation').json<HabitCorrelation>(),
}
