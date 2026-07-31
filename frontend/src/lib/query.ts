import type { QueryClient } from '@tanstack/react-query'

export const STALE_TIME = 2 * 60 * 1000

export const queryKeys = {
  tasks: ['tasks'] as const,
  task: (id: string) => ['task', id] as const,
  taskLists: ['taskLists'] as const,
  notes: ['notes'] as const,
  note: (id: string) => ['note', id] as const,
  kb: ['kb'] as const,
  settings: ['settings'] as const,
}

export function invalidateTasks(client: QueryClient) {
  return client.invalidateQueries({ queryKey: queryKeys.tasks })
}

export function invalidateTaskLists(client: QueryClient) {
  return client.invalidateQueries({ queryKey: queryKeys.taskLists })
}

export function invalidateTasksAndLists(client: QueryClient) {
  return Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.tasks }),
    client.invalidateQueries({ queryKey: queryKeys.taskLists }),
  ])
}
