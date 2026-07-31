import { api } from './client'

export interface NewsRefreshStatus {
  status: 'idle' | 'running' | 'done' | 'failed'
  startedAt?: number
  finishedAt?: number
  totalFetched: number
  totalErrors: string[]
  categories: Array<{
    name: string
    status: 'pending' | 'running' | 'done' | 'failed'
    fetched?: number
    errors?: string[]
    sourceCount?: number
  }>
}

export interface NewsFeedItem {
  id: string
  sourceId: string
  title: string
  titleZh: string | null
  url: string
  summary: string | null
  category: string
  aiScore: number
  aiSummary: string | null
  aiReason: string | null
  aiTags: string | null
  briefedAt: string | null
  publishedAt: string | null
  fetchedAt: string
}

export interface NewsFeedbackRow {
  id: string
  targetType: string
  targetId: string
  feedback: string
  reason: string | null
}

export interface NewsSource {
  id: string
  name: string
  url: string
  type: string
  category: string
  lang: string
  enabled: boolean
  weight: number
}

export interface NewsTodayBrief {
  id: string
  date: string
  title: string
  overview: string
  topItems: string
  pushedAt: string | null
}

export interface NewsDigestItem {
  id: string
  date: string
  title: string
  overview: string
  topItems: string
  pushedAt: string | null
}

export const newsApi = {
  list: (params: {
    category?: string
    search?: string
    page?: number
    pageSize?: number
    sort?: string
    saved?: string
  }) =>
    api
      .get('news', { searchParams: params })
      .json<{ items: NewsFeedItem[]; pagination: { page: number; pageSize: number; total: number } }>(),
  categories: () => api.get('news/categories').json<string[]>(),
  refresh: (category: string, offset = 0) =>
    api.post(`news/refresh?category=${encodeURIComponent(category)}&offset=${offset}`).json<{
      ok: boolean
      fetched: number
      errors?: string[]
      sourceCount?: number
      category?: string
      hasMore?: boolean
      nextOffset?: number
      error?: string
    }>(),
  refreshStatus: () => api.get('news/refresh-status').json<{ status: NewsRefreshStatus | null }>(),
  process: () =>
    api
      .post('news/process', { json: { limit: 5 } })
      .json<{ ok: boolean; processed: number; failed: number }>(),
  feedback: (body: {
    targetType: 'item' | 'brief'
    targetId: string
    feedback: 'up' | 'down' | 'save'
    reason?: string
  }) => api.post('news/feedback', { json: body }).json<{ ok: boolean }>(),
  feedbackList: () => api.get('news/feedback').json<NewsFeedbackRow[]>(),
  sources: () => api.get('news/sources').json<NewsSource[]>(),
  updateSources: (body: Array<{ id: string; enabled: boolean }>) =>
    api.put('news/sources', { json: body }).json<{ ok: boolean }>(),
  addSource: (body: {
    name: string
    url: string
    type: string
    category: string
    lang: string
    enabled: boolean
  }) => api.post('news/sources', { json: body }).json<{ ok: boolean; id: string }>(),
  deleteSource: (id: string) => api.delete(`news/sources/${id}`).json<{ ok: boolean }>(),
  resetSources: () =>
    api.post('news/reset-sources').json<{ ok: boolean; deleted: number; inserted: number }>(),
  today: () => api.get('news/today').json<NewsTodayBrief | null>(),
  digests: () => api.get('news/digests').json<NewsDigestItem[]>(),
}
