import { api } from './client'
import type { Tag } from './types'

export const tagsApi = {
  list: () => api.get('tags').json<Tag[]>(),
  create: (data: { name: string; color: string }) => api.post('tags', { json: data }).json<Tag>(),
  update: (id: string, data: { name?: string; color?: string }) =>
    api.put(`tags/${id}`, { json: data }).json(),
  delete: (id: string) => api.delete(`tags/${id}`).json(),
  assign: (data: { tagId: string; targetType: string; targetId: string }) =>
    api.post('tags/assign', { json: data }).json(),
  unassign: (data: { tagId: string; targetType: string; targetId: string }) =>
    api.delete('tags/unassign', { json: data }).json(),
  of: (targetType: string, targetId: string) =>
    api.get(`tags/of/${targetType}/${targetId}`).json<Tag[]>(),
}
