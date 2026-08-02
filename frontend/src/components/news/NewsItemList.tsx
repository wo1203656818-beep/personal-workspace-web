import { type RefObject } from 'react'
import {
  Newspaper,
  ExternalLink,
  Lightbulb,
  ThumbsUp,
  ThumbsDown,
  Bookmark,
  Loader2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  RefreshCw,
  CheckCheck,
  Copy,
  Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useState } from 'react'

interface FeedItem {
  id: string
  sourceId: string
  title: string
  titleZh: string | null
  url: string
  summary: string | null
  category: string
  aiScore: number
  aiSummary: string | null
  aiReason: string | null
  aiTags: string | null
  briefedAt: string | null
  publishedAt: string | null
  fetchedAt: string
}

export function NewsItemList({
  items,
  isLoading,
  isError,
  showSaved,
  total,
  isFetchingNextPage,
  hasNextPage,
  loadMoreRef,
  expandedItemId,
  onExpandItem,
  feedbackMap,
  onFeedback,
  onSave,
  compactView = false,
  readItems,
  onToggleRead,
}: {
  items: FeedItem[]
  isLoading: boolean
  isError: boolean
  showSaved: boolean
  total: number
  isFetchingNextPage: boolean
  hasNextPage: boolean
  loadMoreRef: RefObject<HTMLDivElement | null>
  expandedItemId: string | null
  onExpandItem: (id: string | null) => void
  feedbackMap: Map<string, string>
  onFeedback: (item: FeedItem, type: 'up' | 'down', reason?: string) => void
  onSave: (item: FeedItem) => void
  compactView?: boolean
  readItems?: Set<string>
  onToggleRead?: (id: string) => void
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null)
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="border rounded-lg p-4 animate-pulse">
            <div className="h-4 bg-muted rounded w-3/4 mb-2" />
            <div className="h-3 bg-muted rounded w-1/2 mb-2" />
            <div className="h-3 bg-muted rounded w-1/4" />
          </div>
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Newspaper className="w-8 h-8 text-destructive mb-2" />
        <p className="text-muted-foreground mb-4">加载失败，请重试</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.location.reload()}
          className="gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          重试
        </Button>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Newspaper className="w-8 h-8 text-muted-foreground/50 mb-2" />
        <p className="text-muted-foreground">{showSaved ? '还没有收藏的新闻' : '暂无新闻'}</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const isExpanded = expandedItemId === item.id
        const isRead = readItems?.has(item.id)
        const parsedTags = (() => {
          try {
            return JSON.parse(item.aiTags || '[]')
          } catch {
            return []
          }
        })()
        return (
          <div
            key={item.id}
            className={cn(
              'border rounded-lg hover:bg-muted/20 transition-colors',
              isRead && 'opacity-60',
            )}
          >
            <div className={cn('p-3 sm:p-4', compactView && 'py-2')}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      'font-medium hover:underline block',
                      compactView ? 'text-sm' : 'text-sm',
                    )}
                  >
                    {item.titleZh || item.title}
                  </a>
                  {!compactView && item.summary && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {item.summary}
                    </p>
                  )}
                  {!compactView && isExpanded && (item.aiSummary || item.aiReason) && (
                    <div className="mt-2 p-2 rounded-lg bg-blue-50/50 dark:bg-blue-950/20 text-xs space-y-1">
                      {item.aiSummary && (
                        <p className="text-foreground">
                          <Sparkles className="w-3 h-3 inline text-blue-500 mr-1" />
                          {item.aiSummary}
                        </p>
                      )}
                      {item.aiReason && (
                        <p className="text-muted-foreground italic">{item.aiReason}</p>
                      )}
                      {item.aiSummary && (
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(item.aiSummary as string)
                            setCopiedId(item.id)
                            toast.success('摘要已复制')
                            setTimeout(() => setCopiedId(null), 1500)
                          }}
                          className="inline-flex items-center gap-1 text-[10px] text-blue-500 hover:text-blue-600"
                        >
                          {copiedId === item.id ? (
                            <Check className="w-3 h-3" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          {copiedId === item.id ? '已复制' : '复制摘要'}
                        </button>
                      )}
                    </div>
                  )}
                  {!compactView && (
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap text-xs text-muted-foreground">
                      <span className="px-1.5 py-0.5 rounded bg-muted">{item.category}</span>
                      {item.aiScore > 0 && (
                        <span className="flex items-center gap-0.5">
                          <Lightbulb className="w-3 h-3 text-yellow-500" />
                          {item.aiScore}
                        </span>
                      )}
                      {parsedTags.length > 0 &&
                        parsedTags.slice(0, 2).map((t: string, i: number) => (
                          <Badge key={i} variant="secondary" className="text-[10px] px-1 py-0">
                            {t}
                          </Badge>
                        ))}
                      {item.publishedAt && (
                        <span>
                          {formatDistanceToNow(new Date(item.publishedAt), {
                            addSuffix: true,
                            locale: zhCN,
                          })}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  {!compactView && (item.aiSummary || item.aiReason) && (
                    <button
                      onClick={() => onExpandItem(isExpanded ? null : item.id)}
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                      title={isExpanded ? '收起详情' : '查看详情'}
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => onFeedback(item, 'up')}
                    className={cn(
                      'p-1.5 rounded hover:bg-muted',
                      feedbackMap.get(item.id) === 'up'
                        ? 'text-green-500'
                        : 'text-muted-foreground',
                    )}
                    title="有用"
                  >
                    <ThumbsUp className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onFeedback(item, 'down')}
                    className={cn(
                      'p-1.5 rounded hover:bg-muted',
                      feedbackMap.get(item.id) === 'down'
                        ? 'text-red-500'
                        : 'text-muted-foreground',
                    )}
                    title="没用"
                  >
                    <ThumbsDown className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onSave(item)}
                    className={cn(
                      'p-1.5 rounded hover:bg-muted',
                      feedbackMap.get(item.id) === 'save'
                        ? 'text-blue-500'
                        : 'text-muted-foreground',
                    )}
                    title="收藏"
                  >
                    <Bookmark className="w-4 h-4" />
                  </button>
                  {onToggleRead && (
                    <button
                      onClick={() => onToggleRead(item.id)}
                      className={cn(
                        'p-1.5 rounded hover:bg-muted',
                        isRead ? 'text-emerald-500' : 'text-muted-foreground',
                      )}
                      title={isRead ? '标记为未读' : '标记为已读'}
                    >
                      <CheckCheck className="w-4 h-4" />
                    </button>
                  )}
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        )
      })}

      <div ref={loadMoreRef} className="flex items-center justify-center py-4">
        {isFetchingNextPage && <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />}
        {!hasNextPage && items.length > 0 && (
          <span className="text-xs text-muted-foreground">已加载全部 {total} 条</span>
        )}
      </div>
    </div>
  )
}