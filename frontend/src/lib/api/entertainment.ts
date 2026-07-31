import { api } from './client'

export interface CyberFortune {
  id: string
  date: string
  content: string
  moodScore: number | null
  luckyColor: string | null
  cached?: boolean
}

export interface DailyPersona {
  id: string
  date: string
  name: string
  description: string
  luckyColor: string | null
  bgmStyle: string | null
  suitableFor: string | null
  cached?: boolean
}

export interface Inspiration {
  content: string
  category: string
}

export interface SavedInspiration {
  id: string
  content: string
  category: string
  createdAt: string
}

export interface DailyChallenge {
  challenge: string
  category: string
  date: string
  completed: boolean
  completedAt: string | null
}

export interface TarotReading {
  id: string
  question: string
  spread: string
  cards: { name: string; meaning: string }[]
  interpretation: string
}

export const entertainmentApi = {
  // 赛博运势
  cyberFortune: () => api.post('cyber-fortune').json<CyberFortune>(),
  cyberFortuneHistory: () => api.get('cyber-fortune/history').json<CyberFortune[]>(),

  // 今日人设
  dailyPersona: () => api.post('daily-persona').json<DailyPersona>(),
  dailyPersonaHistory: () => api.get('daily-persona/history').json<DailyPersona[]>(),

  // 灵感抽屉
  inspiration: () => api.post('inspiration').json<Inspiration>(),
  savedInspirations: () => api.get('inspiration/saved').json<SavedInspiration[]>(),
  saveInspiration: (data: { content: string; category: string }) =>
    api.post('inspiration/save', { json: data }).json<{ id: string }>(),
  deleteInspiration: (id: string) => api.delete(`inspiration/${id}`).json(),

  // 随机挑战
  dailyChallenge: () => api.post('daily-challenge').json<DailyChallenge>(),
  completeChallenge: (data: { challenge: string; category: string }) =>
    api.post('daily-challenge/complete', { json: data }).json(),
  challengeStats: () =>
    api
      .get('daily-challenge/stats')
      .json<{ total: number; last7: { date: string; count: number }[] }>(),

  // AI 写诗
  aiPoem: (data: { topic: string; style?: string }) =>
    api.post('ai-poem', { json: data }).json<{ poem: string; topic: string; style: string }>(),

  // 塔罗牌
  tarot: (data: { question: string; spread?: string }) =>
    api.post('tarot', { json: data }).json<TarotReading>(),
  tarotHistory: () => api.get('tarot/history').json<TarotReading[]>(),
}
