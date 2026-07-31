import { api } from './client'

export interface NightlyReviewResponse {
  date: string
  review: string
  stats: {
    completed: number
    pending: number
    mood: string
    decisions: number
  }
}

export const nightlyReviewApi = {
  generate: () => api.post('nightly-review').json<NightlyReviewResponse>(),
  history: () => api.get('nightly-review/history').json<NightlyReviewResponse[]>(),
}
