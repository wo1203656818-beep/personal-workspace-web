import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, LayoutDashboard } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

export function LoginPage() {
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
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
    <div className="dark relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-slate-950 via-violet-950/70 to-slate-950 px-4 py-8">
      <div className="relative w-full max-w-md space-y-6">
        {/* 品牌 Logo */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-lg shadow-primary/20 backdrop-blur-sm">
            <LayoutDashboard className="size-12" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">工作台</h1>
            <p className="text-sm text-muted-foreground">个人全能工作台</p>
          </div>
        </div>

        <Card className="glass border-border/60 shadow-xl">
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                  className="h-11 rounded-lg pr-10 transition-shadow focus:shadow-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
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
              <div className="flex items-center gap-2">
                <Checkbox
                  id="remember-me"
                  checked={rememberMe}
                  onCheckedChange={(v) => setRememberMe(v === true)}
                />
                <Label
                  htmlFor="remember-me"
                  className="text-sm text-muted-foreground cursor-pointer"
                >
                  记住我（30天免登录）
                </Label>
              </div>
              <Button
                type="submit"
                className="h-11 w-full rounded-lg"
                disabled={loading || !password}
              >
                {loading ? '登录中...' : '进入工作台'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
