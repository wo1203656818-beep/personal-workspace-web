import { api } from './client'

export interface Expense {
  id: string
  amount: number
  category: string
  note: string | null
  date: string
  createdAt: string
}

export interface ExpenseSummary {
  total: number
  byCategory: { category: string; amount: number; count: number }[]
  trend: { date: string; amount: number }[]
}

export interface ExpenseAiAnalysis {
  generatedAt: string
  fromCache: boolean
  report: {
    summary: string
    totalSpent: number
    avgDaily: number
    topCategory: string
    pattern: string
    suggestions: string[]
  }
}

export interface HealthMetric {
  id: string
  metric: string
  value: number
  unit: string | null
  note: string | null
  date: string
  createdAt: string
}

export interface HealthSeries {
  series: { id: string; date: string; value: number; note: string | null }[]
  raw: HealthMetric[]
}

export interface HealthAiAnalysis {
  generatedAt: string
  fromCache: boolean
  report: {
    summary: string
    metrics: { metric: string; avg: number; min: number; max: number; latest: number; trend: string; unit: string; count: number }[]
    findings: string
    suggestions: string[]
  }
}

export interface BudgetData {
  budget: number
  spent: number
  remaining: number
  avgDaily: number
  projected: number
  progress: number
  daysPassed: number
  daysInMonth: number
}

export const recordsApi = {
  // 记账
  expenses: {
    budget: {
      get: () => api.get('records/expenses/budget').json<BudgetData>(),
      set: (amount: number) => api.post('records/expenses/budget', { json: { amount } }).json<{ ok: boolean }>(),
      aiTip: () => api.get('records/expenses/budget/ai-tip').json<{ tip: string; fromCache?: boolean }>(),
    },
    list: (params?: { from?: string; to?: string; category?: string }) => {
      const q = new URLSearchParams()
      if (params?.from) q.set('from', params.from)
      if (params?.to) q.set('to', params.to)
      if (params?.category) q.set('category', params.category)
      const qs = q.toString()
      return api.get(`records/expenses${qs ? `?${qs}` : ''}`).json<Expense[]>()
    },
    summary: (from?: string, to?: string) => {
      const q = new URLSearchParams()
      if (from) q.set('from', from)
      if (to) q.set('to', to)
      const qs = q.toString()
      return api.get(`records/expenses/summary${qs ? `?${qs}` : ''}`).json<ExpenseSummary>()
    },
    categories: () => api.get('records/expenses/categories').json<string[]>(),
    aiAnalysis: () => api.get('records/expenses/ai-analysis').json<ExpenseAiAnalysis>(),
    create: (data: { amount: number; category?: string; note?: string; date?: string }) =>
      api.post('records/expenses', { json: data }).json<Expense>(),
    update: (id: string, data: { amount?: number; category?: string; note?: string; date?: string }) =>
      api.put(`records/expenses/${id}`, { json: data }).json<Expense>(),
    remove: (id: string) => api.delete(`records/expenses/${id}`).json<{ ok: boolean }>(),
  },

  // 健康
  health: {
    list: (metric = 'weight', days = 90) =>
      api.get(`records/health?metric=${metric}&days=${days}`).json<HealthSeries>(),
    metrics: () => api.get('records/health/metrics').json<{ metric: string; unit: string | null }[]>(),
    aiAnalysis: () => api.get('records/health/ai-analysis').json<HealthAiAnalysis>(),
    create: (data: { metric: string; value: number; unit?: string; note?: string; date?: string }) =>
      api.post('records/health', { json: data }).json<HealthMetric>(),
    update: (id: string, data: { metric?: string; value?: number; unit?: string; note?: string; date?: string }) =>
      api.put(`records/health/${id}`, { json: data }).json<HealthMetric>(),
    remove: (id: string) => api.delete(`records/health/${id}`).json<{ ok: boolean }>(),
  },
}