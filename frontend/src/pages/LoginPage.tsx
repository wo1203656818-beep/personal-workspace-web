import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, LayoutDashboard } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Spotlight } from '@/components/effects/Spotlight'
import { Meteors } from '@/components/effects/Meteors'

export function LoginPage() {
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [errorKey, setErrorKey] = useState(0)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const result = await login(password)
    if (result.success) {
      // 登录成功后优先跳回原页面，无记录则回首页
      const redirect = sessionStorage.getItem('redirect-after-login')
      if (redirect) {
        sessionStorage.removeItem('redirect-after-login')
        navigate(redirect)
      } else {
        navigate('/')
      }
    } else {
      setError(result.error || '登录失败')
      setErrorKey((k) => k + 1)
    }
    setLoading(false)
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      {/* Linear 风背景特效：聚光 + 流星点缀 */}
      <Spotlight className="pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <Meteors number={12} />
      </div>

      <div className="relative w-full max-w-sm space-y-6">
        {/* 品牌 Logo */}
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-lg shadow-primary/20">
            <LayoutDashboard className="size-12" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">工作台</h1>
          <p className="text-sm text-muted-foreground">个人全能工作台</p>
        </div>

        <Card className="glass border-border/60">
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                  className="h-11 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex size-7 items-center justify-center text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {error && (
                <p
                  key={errorKey}
                  className="text-sm text-destructive animate-[shake_0.3s_ease-in-out]"
                >
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full h-11" disabled={loading || !password}>
                {loading ? '登录中...' : '进入'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
