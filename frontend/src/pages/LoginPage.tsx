import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { KeyRound, Eye, EyeOff, LogIn, LayoutDashboard } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { usePageTitle } from '@/hooks/use-page-title'

export function LoginPage() {
  usePageTitle('登录')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [errorKey, setErrorKey] = useState(0)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password.trim()) return
    setLoading(true)
    setError('')
    const result = await login(password.trim(), remember)
    if (result.success) {
      const redirect = sessionStorage.getItem('redirect-after-login')
      if (redirect) {
        sessionStorage.removeItem('redirect-after-login')
        navigate(redirect)
      } else {
        navigate('/')
      }
    } else {
      setError(result.error || '密码错误')
      setErrorKey((k) => k + 1)
    }
    setLoading(false)
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center bg-gradient-to-br from-slate-950 via-violet-950/70 to-slate-950 p-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-sm ring-1 ring-white/20">
            <LayoutDashboard className="size-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">个人工作台</h1>
          <p className="mt-1 text-sm text-white/60">输入密码以继续</p>
        </div>

        {/* Login Card */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm text-white/80">密码</Label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/40" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="请输入密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 rounded-xl border-white/10 bg-white/5 pl-10 text-white placeholder:text-white/30 focus:border-white/30 focus:ring-white/20"
                  autoFocus
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60"
                  tabIndex={-1}
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div
                key={errorKey}
                className="rounded-xl bg-red-500/10 px-4 py-2.5 text-sm text-red-400 animate-[shake_0.3s_ease-in-out]"
              >
                {error}
              </div>
            )}

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-white/60 cursor-pointer">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="rounded border-white/20 bg-white/5 accent-white"
                />
                记住我（30天免登录）
              </label>
            </div>

            <Button
              type="submit"
              disabled={loading || !password.trim()}
              className="h-11 w-full rounded-xl gap-2 bg-white text-slate-900 hover:bg-white/90"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="size-4 animate-spin rounded-full border-2 border-slate-900 border-t-transparent" />
                  验证中...
                </span>
              ) : (
                <>
                  <LogIn className="size-4" />
                  进入工作台
                </>
              )}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-white/30">
          个人工作空间 · 安全加密
        </p>
      </div>
    </div>
  )
}