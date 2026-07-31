import { api } from './client'
import type { AnswerBookDraw, DailyFortune } from './types'

export const toolsApi = {
  answer: () => api.post('tools/answer').json<{ result: string; source: string; rawValue: number }>(),
  answerHistory: () => api.get('tools/answer/history').json<AnswerBookDraw[]>(),
  fortune: () => api.post('tools/fortune').json<{ result: string; level: string; poem: string; interpret: string; source: string; rawValue: number; cached?: boolean }>(),
  fortuneHistory: () => api.get('tools/fortune/history').json<DailyFortune[]>(),
}
