import { Component, Suspense, useState, type ErrorInfo, type ReactNode } from 'react'
import { TriangleAlert, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageSkeleton } from '@/components/PageSkeleton'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} />
    }
    return this.props.children
  }
}

function ErrorFallback({ error }: { error?: Error }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <TriangleAlert className="size-16 text-destructive" />
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">出错了</h1>
        <p className="text-muted-foreground">应用遇到了意外错误，请尝试刷新页面。</p>
      </div>
      {error && (
        <div className="w-full max-w-md text-left">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            错误详情
          </button>
          {expanded && (
            <pre className="mt-2 max-h-60 overflow-auto rounded-md bg-muted p-3 text-left text-xs text-muted-foreground">
              {error.message || '未知错误'}
              {import.meta.env.DEV && error.stack ? `\n\n${error.stack}` : ''}
            </pre>
          )}
        </div>
      )}
      <Button onClick={() => window.location.reload()}>
        <RefreshCw className="size-4" />
        刷新页面
      </Button>
    </div>
  )
}

export function RouteBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
    </ErrorBoundary>
  )
}

export { ErrorBoundary }
