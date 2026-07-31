import { api } from './client'

export interface MoodLog {
  id: string
  weather: 'sunny' | 'cloudy' | 'rainy' | 'stormy' | 'snowy'
  note: string | null
  createdAt: string
}

export interface MoodTrends {
  byWeather: { weather: string; count: number }[]
  last7Days: { date: string; weather: string; count: number }[]
  streak: { date: string }[]
}

export const moodApi = {
  list: () => api.get('mood').json<MoodLog[]>(),
  today: () => api.get('mood/today').json<MoodLog | null>(),
  create: (data: { weather: string; note?: string }) =>
    api.post('mood', { json: data }).json<{ id: string }>(),
  trends: () => api.get('mood/trends').json<MoodTrends>(),
}
