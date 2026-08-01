import { api } from './client'

export interface DecisionRule {
  id: string
  category: string
  title: string
  condition: string
  action: string
  createdAt: string
  updatedAt: string
}

export interface DecisionAnalysis {
  generatedAt: string
  fromCache: boolean
  report: string
  stats: {
    totalLogs: number
    categoryDist: Record<string, number>
    avgDuration: number
    avgSatisfaction: number
    ruleRate: number
  }
}

export const decisionRulesApi = {
  list: () => api.get('decision-rules').json<DecisionRule[]>(),
  create: (data: { category: string; title: string; condition: string; action: string }) =>
    api.post('decision-rules', { json: data }).json<{ id: string }>(),
  delete: (id: string) => api.delete(`decision-rules/${id}`).json(),
  decisionAnalysis: () => api.get('decision-logs/analysis').json<DecisionAnalysis>(),
}
