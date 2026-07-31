import { api } from './client'
import type { TaskList, Task, Subtask } from './types'

export const taskListsApi = {
  list: () => api.get('tasks/lists').json<TaskList[]>(),
  listWithStats: () => api.get('tasks/lists', { searchParams: { stats: '1' } }).json<TaskList[]>(),
  create: (data: { name: string; color?: string }) => api.post('tasks/lists', { json: data }).json<TaskList>(),
  update: (id: string, data: { name?: string; color?: string }) => api.put(`tasks/lists/${id}`, { json: data }).json<TaskList>(),
  delete: (id: string) => api.delete(`tasks/lists/${id}`).json(),
}

export const tasksApi = {
  stats: () => api.get('tasks/stats').json<{ total: number; completed: number; important: number; myDay: number; todayCompleted: number; overdue: number }>(),
  wip: () => api.get('tasks/wip').json<{ committed: number; inProgress: number; total: number; limit: number; available: number }>(),
  stale: () => api.get('tasks/stale').json<Task[]>(),
  list: () => api.get('tasks').json<Task[]>(),
  byList: (listId: string) => api.get(`tasks/lists/${listId}/tasks`).json<Task[]>(),
  myDay: () => api.get('tasks/myday').json<Task[]>(),
  important: () => api.get('tasks/important').json<Task[]>(),
  planned: () => api.get('tasks/planned').json<Task[]>(),
  search: (q: string) => api.get(`tasks/search`, { searchParams: { q } }).json<Task[]>(),
  get: (id: string) => api.get(`tasks/${id}`).json<Task>(),
  create: (data: Partial<Task>) =>
    api.post('tasks', { json: data }).json<Task>(),
  update: (id: string, data: Partial<Task>) => api.put(`tasks/${id}`, { json: data }).json<Task>(),
  delete: (id: string) => api.delete(`tasks/${id}`).json(),
  addToMyDay: (id: string) => api.post(`tasks/${id}/myday`).json(),
  removeFromMyDay: (id: string) => api.delete(`tasks/${id}/myday`).json(),
  reorder: (orders: { id: string; sortOrder: number }[]) => api.put('tasks/reorder', { json: { orders } }).json(),
  // 行动承诺系统
  commit: (id: string) => api.post(`tasks/${id}/commit`).json(),
  start: (id: string) => api.post(`tasks/${id}/start`).json(),
  abandon: (id: string) => api.post(`tasks/${id}/abandon`).json(),
  // 心理学干预
  energyMatch: () => api.get('tasks/energy-match').json<{ timeContext: string; recommendedEnergy: string; tasks: Task[]; tip: string }>(),
  commitmentCheck: () => api.get('tasks/commitment-check').json<{ overdueTasks: Task[]; message: string }>(),
  // 两分钟规则
  markQuick: (id: string) => api.post(`tasks/${id}/mark-quick`).json<{ ok: boolean; deadline: string }>(),
  unmarkQuick: (id: string) => api.post(`tasks/${id}/unmark-quick`).json(),
  quickPool: () => api.get('tasks/quick-pool').json<Task[]>(),
  quickExpire: () => api.post('tasks/quick-expire').json<{ expired: number }>(),
}

export const subtasksApi = {
  byTask: (taskId: string) => api.get(`subtasks/${taskId}`).json<Subtask[]>(),
  create: (taskId: string, title: string, sortOrder?: number) => api.post(`subtasks/${taskId}`, { json: { title, sortOrder } }).json<Subtask>(),
  toggle: (id: string) => api.patch(`subtasks/${id}/toggle`).json<Subtask>(),
  reorder: (orders: { id: string; sortOrder: number }[]) => api.put('subtasks/reorder', { json: { orders } }).json(),
  delete: (id: string) => api.delete(`subtasks/${id}`).json(),
}
