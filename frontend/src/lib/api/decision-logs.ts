import { api } from './client'

export interface DecisionLog {
  id: string
  taskId: string | null
  category: string
  title: string
  options: string | null
  chosenOption: string | null
  durationSec: number | null
  satisfaction: number | null
  ruleApplied: string | null
  createdAt: string
}

export interface DecisionPatterns {
  byCategory: {
    category: string
    count: number
    avgDuration: number | null
    avgSatisfaction: number | null
  }[]
  recentWeek: {
    date: string
    count: number
    avgDuration: number | null
  }[]
  ruleUsage: {
    ruleApplied: string
    count: number
    avgSatisfaction: number | null
  }[]
}

export const decisionLogsApi = {
  list: () => api.get('decision-logs').json<DecisionLog[]>(),
  create: (data: {
    taskId?: string
    category: string
    title: string
    options?: string[]
    chosenOption?: string
    durationSec?: number
    satisfaction?: number
    ruleApplied?: string
  }) => api.post('decision-logs', { json: data }).json<{ id: string }>(),
  updateSatisfaction: (id: string, satisfaction: number) =>
    api.put(`decision-logs/${id}/satisfaction`, { json: { satisfaction } }).json(),
  patterns: () => api.get('decision-logs/patterns').json<DecisionPatterns>(),
}
