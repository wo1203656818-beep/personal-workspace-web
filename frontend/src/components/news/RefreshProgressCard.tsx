import { Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react'

interface RefreshStatus {
  status: 'idle' | 'running' | 'done' | 'failed'
  startedAt?: number
  finishedAt?: number
  totalFetched: number
  totalErrors: string[]
  categories: Array<{
    name: string
    status: 'pending' | 'running' | 'done' | 'failed'
    fetched?: number
    errors?: string[]
    sourceCount?: number
  }>
}

export function RefreshProgressCard({ refreshStatus }: { refreshStatus: RefreshStatus }) {
  return (
    <div className="border rounded-xl p-4 bg-muted/30">
      <div className="flex items-center gap-2 mb-3">
        {refreshStatus.status === 'running' && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
        {refreshStatus.status === 'done' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
        {refreshStatus.status === 'failed' && <XCircle className="w-4 h-4 text-red-500" />}
        <span className="text-sm font-medium">
          {refreshStatus.status === 'running' && '正在抓取...'}
          {refreshStatus.status === 'done' && `抓取完成（共 ${refreshStatus.totalFetched} 条）`}
          {refreshStatus.status === 'failed' && '抓取失败'}
        </span>
        {refreshStatus.startedAt && (
          <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {refreshStatus.finishedAt
              ? `${Math.round((refreshStatus.finishedAt - refreshStatus.startedAt) / 1000)}s`
              : `${Math.round((Date.now() - refreshStatus.startedAt) / 1000)}s`}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {refreshStatus.categories.map((cat) => (
          <div key={cat.name} className="text-xs border rounded-lg p-2 bg-background">
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium">{cat.name}</span>
              {cat.status === 'running' && <Loader2 className="w-3 h-3 animate-spin text-blue-500" />}
              {cat.status === 'done' && <CheckCircle2 className="w-3 h-3 text-green-500" />}
              {cat.status === 'failed' && <XCircle className="w-3 h-3 text-red-500" />}
              {cat.status === 'pending' && <Clock className="w-3 h-3 text-muted-foreground" />}
            </div>
            <div className="text-muted-foreground">
              {cat.status === 'pending' && '等待中'}
              {cat.status === 'running' && '抓取中...'}
              {cat.status === 'done' && `${cat.fetched ?? 0} 条`}
              {cat.status === 'failed' && '失败'}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
