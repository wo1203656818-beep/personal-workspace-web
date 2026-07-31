import { api } from './client'
import type { AiConfig } from './types'

export const aiConfigsApi = {
  list: () => api.get('ai-configs').json<AiConfig[]>(),
  create: (data: {
    name: string
    type: 'cloudflare' | 'openai'
    baseUrl?: string
    apiKey?: string
    model?: string
    isDefault?: boolean
  }) => api.post('ai-configs', { json: data }).json<{ ok: boolean; id: string }>(),
  update: (
    id: string,
    data: {
      name?: string
      type?: 'cloudflare' | 'openai'
      baseUrl?: string
      apiKey?: string
      model?: string
      isDefault?: boolean
    },
  ) => api.put(`ai-configs/${id}`, { json: data }).json<{ ok: boolean }>(),
  remove: (id: string) => api.delete(`ai-configs/${id}`).json<{ ok: boolean }>(),
  setDefault: (id: string) => api.post(`ai-configs/${id}/default`, {}).json<{ ok: boolean }>(),
  test: (data: {
    id?: string
    type?: 'cloudflare' | 'openai'
    baseUrl?: string
    apiKey?: string
    model?: string
  }) =>
    api
      .post('ai-configs/test', { json: data })
      .json<{ ok: boolean; latency_ms?: number; model?: string; error?: string }>(),
}
