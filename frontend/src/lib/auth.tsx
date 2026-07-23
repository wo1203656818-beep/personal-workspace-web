import { createContext, useContext, useState, type ReactNode } from 'react'
import { authApi } from './api'

interface AuthContextValue {
  isAuthenticated: boolean
  login: (password: string) => Promise<{ success: boolean; error?: string }>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => !!localStorage.getItem('token')
  )

  const login = async (password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const data = await authApi.login(password)
      localStorage.setItem('token', data.token)
      setIsAuthenticated(true)
      return { success: true }
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 401) return { success: false, error: '密码错误' }
      return { success: false, error: '网络错误，请检查后端服务' }
    }
  }

  const logout = () => {
    localStorage.removeItem('token')
    setIsAuthenticated(false)
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
