import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Clock, Loader2 } from 'lucide-react'
import { syncLogsApi, type SyncLog } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { formatCST } from '@/lib/datetime'

const SOURCE_LABELS: Record<SyncLog['source'], string> = {
  ms_todo: 'MS Todo',
  ima_notes: 'IMA 笔记',
  ima_kb: 'IMA 知识库',
  news_fetch: '新闻抓取',
  news_digest: '每日简报',
  news_ai: '新闻 AI',
  news_push: '新闻推送',
  monitor: '监控',
  monitor_push: '监控推送',
  daily_suggestion: '每日建议',
  weekly_report: '周报',
}

const STATUS_VARIANTS: Record<SyncLog['status'], { label: string; className: string }> = {
  success: { label: '成功', className: 'bg-emerald-500 hover:bg-emerald-500 text-white' },
  partial: { label: '部分', className: 'bg-amber-500 hover:bg-amber-500 text-white' },
  error: {
    label: '失败',
    className: 'bg-destructive hover:bg-destructive text-destructive-foreground',
  },
}

export function SyncLogCenter() {
  const [source, setSource] = useState<'all' | SyncLog['source']>('all')
  const [status, setStatus] = useState<'all' | SyncLog['status']>('all')

  const {
    data = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['syncLogs', source, status],
    queryFn: () =>
      syncLogsApi.list(
        source === 'all' && status === 'all'
          ? undefined
          : {
              ...(source !== 'all' ? { source } : {}),
              ...(status !== 'all' ? { status } : {}),
            },
      ),
  })
  const logs = Array.isArray(data) ? data : []

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <div className="icon-badge size-8 bg-gradient-to-br from-slate-500 to-slate-400">
            <Clock className="size-4" />
          </div>
          同步日志
        </CardTitle>
        <CardDescription>查看所有同步事件与结果</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={source} onValueChange={(v) => setSource(v as 'all' | SyncLog['source'])}>
            <SelectTrigger className="h-8 w-[140px] rounded-lg text-xs">
              <SelectValue placeholder="来源" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部来源</SelectItem>
              <SelectItem value="ms_todo">MS Todo</SelectItem>
              <SelectItem value="ima_notes">IMA 笔记</SelectItem>
              <SelectItem value="ima_kb">IMA 知识库</SelectItem>
              <SelectItem value="news_fetch">新闻抓取</SelectItem>
              <SelectItem value="news_digest">每日简报</SelectItem>
              <SelectItem value="news_ai">新闻 AI</SelectItem>
              <SelectItem value="news_push">新闻推送</SelectItem>
              <SelectItem value="monitor">监控</SelectItem>
              <SelectItem value="monitor_push">监控推送</SelectItem>
              <SelectItem value="daily_suggestion">每日建议</SelectItem>
              <SelectItem value="weekly_report">周报</SelectItem>
            </SelectContent>
          </Select>

          <Select value={status} onValueChange={(v) => setStatus(v as 'all' | SyncLog['status'])}>
            <SelectTrigger className="h-8 w-[120px] rounded-lg text-xs">
              <SelectValue placeholder="状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="success">成功</SelectItem>
              <SelectItem value="partial">部分</SelectItem>
              <SelectItem value="error">失败</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            className="ml-auto h-8 rounded-lg text-xs"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            {isLoading ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
            刷新
          </Button>
        </div>

        <ScrollArea className="h-64 rounded-xl border">
          {isLoading ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              加载中…
            </div>
          ) : logs.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              暂无同步日志
            </div>
          ) : (
            <div className="divide-y">
              {logs.map((log) => (
                <div key={log.id} className="p-3 text-sm transition-colors hover:bg-accent/40">
                  <div className="flex items-center gap-2">
                    <Badge
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs',
                        STATUS_VARIANTS[log.status].className,
                      )}
                    >
                      {STATUS_VARIANTS[log.status].label}
                    </Badge>
                    <Badge variant="outline" className="rounded-full px-2 py-0.5 text-xs">
                      {SOURCE_LABELS[log.source]}
                    </Badge>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {formatCST(log.createdAt, 'compact')}
                    </span>
                  </div>
                  <p className="mt-1.5 font-medium">{log.message || '无消息'}</p>
                  {(log.synced > 0 || log.failed > 0 || log.skipped > 0) && (
                    <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {log.synced > 0 && <span>成功 {log.synced}</span>}
                      {log.failed > 0 && (
                        <span className="text-destructive">失败 {log.failed}</span>
                      )}
                      {log.skipped > 0 && <span>跳过 {log.skipped}</span>}
                    </div>
                  )}
                  {log.details && (
                    <p className="mt-1.5 whitespace-pre-wrap text-xs text-muted-foreground">
                      {log.details}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
