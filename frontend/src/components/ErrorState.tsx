import { useState, useEffect, useCallback } from 'react'
import { AlertCircle, RefreshCw, WifiOff, ServerOff, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getFriendlyErrorMessage } from '@/lib/api'

interface ErrorStateProps {
  title?: string
  description?: string
  error?: unknown
  onRetry?: () => void
  /** 是否显示自动重试倒计时（秒），为 0 时不自动重试 */
  autoRetrySeconds?: number
  className?: string
}

/**
 * 根据错误类型推断图标
 */
function getErrorIcon(error: unknown) {
  if (error instanceof TypeError && error.message === 'Failed to fetch') {
    return WifiOff
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return Clock
  }
  if (error && typeof error === 'object') {
    const msg = String(error)
    if (msg.includes('500') || msg.includes('服务器')) return ServerOff
    if (msg.includes('网络') || msg.includes('连接')) return WifiOff
  }
  return AlertCircle
}

export function ErrorState({
  title,
  description,
  error,
  onRetry,
  autoRetrySeconds = 0,
  className,
}: ErrorStateProps) {
  const [countdown, setCountdown] = useState(autoRetrySeconds)
  const [retrying, setRetrying] = useState(false)

  // 自动重试倒计时
  useEffect(() => {
    if (autoRetrySeconds <= 0 || !onRetry) return

    setCountdown(autoRetrySeconds)
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          onRetry()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [autoRetrySeconds, onRetry])

  // 根据 error 对象自动推断友好描述
  const resolvedTitle = title || (error ? '操作失败' : '加载失败')
  const [resolvedDescription, setResolvedDescription] = useState<string>(
    description || '请检查网络连接后重试',
  )

  useEffect(() => {
    if (description) {
      setResolvedDescription(description)
      return
    }
    if (!error) {
      setResolvedDescription('请检查网络连接后重试')
      return
    }
    let cancelled = false
    getFriendlyErrorMessage(error).then((msg) => {
      if (!cancelled) setResolvedDescription(msg)
    })
    return () => {
      cancelled = true
    }
  }, [description, error])

  const ErrorIcon = error ? getErrorIcon(error) : AlertCircle

  const handleRetry = useCallback(() => {
    if (!onRetry) return
    setRetrying(true)
    // 通过 setTimeout 让按钮先显示 loading 状态
    setTimeout(() => {
      onRetry()
      setRetrying(false)
    }, 100)
  }, [onRetry])

  return (
    <div className={cn('empty-state px-4 sm:px-6', className)}>
      <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-destructive/10 text-destructive transition-transform duration-300 hover:scale-105">
        <ErrorIcon className="size-8" />
      </div>
      <h3 className="mb-1 text-lg font-semibold">{resolvedTitle}</h3>
      <p className="mb-4 max-w-xs text-center text-sm text-muted-foreground sm:max-w-sm">
        {resolvedDescription}
      </p>
      {onRetry && (
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            onClick={handleRetry}
            disabled={retrying}
            className="gap-1.5 rounded-lg"
          >
            <RefreshCw className={cn('size-4', retrying && 'animate-spin')} />
            {retrying ? '重试中...' : '重试'}
          </Button>
          {countdown > 0 && (
            <span className="text-xs text-muted-foreground">{countdown}s 后自动重试</span>
          )}
        </div>
      )}
    </div>
  )
}