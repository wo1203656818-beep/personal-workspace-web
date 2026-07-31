import { api } from './client'

export interface DecisionTemplate {
  id: string
  category: string
  title: string
  condition: string
  action: string
  description: string | null
  sortOrder: number
  createdAt: string
}

export const decisionTemplatesApi = {
  list: () => api.get('decision-templates').json<DecisionTemplate[]>(),
  byCategory: (category: string) => api.get(`decision-templates/${category}`).json<DecisionTemplate[]>(),
  apply: (id: string) => api.post(`decision-templates/apply/${id}`).json<{ ruleId: string; message: string }>(),
  batchApply: (ids: string[]) => api.post('decision-templates/batch-apply', { json: { ids } }).json<{ applied: string[]; count: number }>(),
}
