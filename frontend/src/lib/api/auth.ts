import { api } from './client'

export const authApi = {
  login: (password: string) =>
    api.post('auth/login', { json: { password } }).json<{ token: string }>(),
  changePassword: (data: { oldPassword: string; newPassword: string }) =>
    api.post('auth/change-password', { json: data }).json<{ ok: boolean }>(),
}
