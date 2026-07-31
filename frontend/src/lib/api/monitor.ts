import { api } from './client'
import type { MonitorTarget, MonitorSnapshot, MonitorBrief } from './types'

export const monitorApi = {
  listTargets: () => api.get('monitor/targets').json<MonitorTarget[]>(),
  createTarget: (data: Partial<MonitorTarget>) => api.post('monitor/targets', { json: data }).json<{ ok: boolean; id: string }>(),
  updateTarget: (id: string, data: Partial<MonitorTarget>) => api.put(`monitor/targets/${id}`, { json: data }).json(),
  deleteTarget: (id: string) => api.delete(`monitor/targets/${id}`).json(),
  getBrief: () => api.get('monitor/brief').json<MonitorBrief | { ok: false; message: string }>(),
  getSnapshots: (params?: { date?: string; type?: string }) => {
    const qs = new URLSearchParams()
    if (params?.date) qs.set('date', params.date)
    if (params?.type) qs.set('type', params.type)
    const q = qs.toString()
    return api.get(`monitor/snapshots${q ? `?${q}` : ''}`).json<MonitorSnapshot[]>()
  },
  runNow: () => api.post('monitor/run-now', { json: {} }).json(),
  runPlatform: (platform: string) => api.post('monitor/run-platform', { json: { platform } }).json<{ ok: boolean; fetched: number; platform: string; error?: string }>(),
  push: () => api.post('monitor/push', { json: {} }).json(),
}
