import { api } from './client'
import type { CoinFlip } from './types'

export const coinApi = {
  flip: () => api.post('coin/flip').json<{ result: string; source: string; rawValue: number; interpretation: string }>(),
  history: () => api.get('coin/history').json<CoinFlip[]>(),
}
