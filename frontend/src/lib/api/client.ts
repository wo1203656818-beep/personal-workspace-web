import ky from 'ky'
import { toast } from 'sonner'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

export { API_BASE }

export const api = ky.create({
  prefix: API_BASE,
  retry: 0,
  timeout: 120000,
  hooks: {
    beforeRequest: [
      ({ request }) => {
        const token = localStorage.getItem('token')
        if (token) {
          request.headers.set('Authorization', `Bearer ${token}`)
        }
      },
    ],
    afterResponse: [
      async ({ request, response }) => {
        if (response.status !== 401) return
        const url = new URL(request.url)
        if (url.pathname.endsWith('/api/auth/login')) return
        localStorage.removeItem('token')
        const current = window.location.pathname + window.location.search
        if (!current.startsWith('/login')) {
          sessionStorage.setItem('redirect-after-login', current)
        }
        toast.error('登录已过期，请重新登录')
        window.location.href = '/login'
      },
    ],
  },
})
