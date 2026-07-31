import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { HTTPError } from 'ky'
import { settingsApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

type State = 'loading' | 'success' | 'error'

export function MsTodoCallback() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [state, setState] = useState<State>('loading')
  const [error, setError] = useState('')
  const handledRef = useRef(false)

  useEffect(() => {
    if (handledRef.current) return
    handledRef.current = true

    const code = searchParams.get('code')
    if (!code) {
      setError('未收到授权码')
      setState('error')
      return
    }

    // 传入当前页面地址作为 redirect_uri，确保与授权时一致
    const redirectUri = `${window.location.origin}/oauth/ms-todo/callback`

    settingsApi
      .msTodoCallback(code, redirectUri)
      .then((res) => {
        if (res.ok) {
          setState('success')
          setTimeout(() => navigate('/settings'), 2000)
        } else {
          setError(res.error || '未知错误')
          setState('error')
        }
      })
      .catch(async (e: Error) => {
        // ky 对 500 状态码抛 HTTPError，需读取响应体中的 error 字段
        if (e instanceof HTTPError) {
          try {
            const body = (await e.response.json()) as { error?: string; ok?: boolean }
            setError(body.error || e.message)
          } catch {
            setError(e.message || '请求失败')
          }
        } else {
          setError(e.message || '请求失败')
        }
        setState('error')
      })
  }, [searchParams, navigate])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-4 pt-8 pb-8 text-center">
          {state === 'loading' && (
            <>
              <Loader2 className="size-12 animate-spin text-primary" />
              <div className="space-y-1">
                <p className="text-base font-medium">正在完成授权…</p>
                <p className="text-sm text-muted-foreground">请稍候，正在交换令牌</p>
              </div>
            </>
          )}

          {state === 'success' && (
            <>
              <CheckCircle2 className="size-12 text-green-500" />
              <div className="space-y-1">
                <p className="text-base font-medium">授权成功</p>
                <p className="text-sm text-muted-foreground">即将跳转…</p>
              </div>
            </>
          )}

          {state === 'error' && (
            <>
              <XCircle className="size-12 text-destructive" />
              <div className="space-y-1">
                <p className="text-base font-medium">授权失败</p>
                <p className="text-sm text-muted-foreground break-all">{error}</p>
              </div>
              <Button variant="outline" onClick={() => navigate('/settings')}>
                返回设置
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default MsTodoCallback
