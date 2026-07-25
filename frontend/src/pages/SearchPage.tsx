import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Search, FileText, ListTodo, BookOpen, Sparkles, RefreshCw } from 'lucide-react'
import { aiApi } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/EmptyState'
import { cn } from '@/lib/utils'

const typeMeta: Record<string, { label: string; icon: typeof FileText; color: string }> = {
  note: { label: '笔记', icon: FileText, color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  task: { label: '任务', icon: ListTodo, color: 'bg-primary/10 text-primary' },
  kb: { label: '知识库', icon: BookOpen, color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
}

export function SearchPage() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  const searchMutation = useMutation({
    mutationFn: (q: string) => aiApi.semanticSearch(q, 8),
  })

  const reindexMutation = useMutation({
    mutationFn: () => aiApi.reindex(),
    onSuccess: (d) => toast.success(`已重建索引 ${d.indexed} 条`),
    onError: (e: Error) => toast.error('重建索引失败: ' + e.message),
  })

  const handleSearch = () => {
    const q = query.trim()
    if (q) searchMutation.mutate(q)
  }

  const results = searchMutation.data?.results || []

  const go = (type: string, id: string) => {
    if (type === 'note') navigate(`/notes/${id}`)
    else if (type === 'kb') navigate(`/knowledge/${id}`)
    else navigate('/tasks')
  }

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6">
      <div className="mb-1 flex items-center gap-3">
        <div className="icon-badge size-9 bg-gradient-to-br from-primary to-primary/80">
          <Sparkles className="size-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">语义搜索</h1>
          <p className="text-xs text-muted-foreground md:text-sm">跨笔记、任务、知识库用「意思」找内容</p>
        </div>
      </div>

      <div className="mb-4 mt-5 flex items-center justify-between gap-3 rounded-xl bg-muted/30 px-3 py-2">
        <span className="text-xs text-muted-foreground">新建/修改内容会自动增量索引；首次可点「重新索引」预热全部。</span>
        <Button variant="outline" size="sm" onClick={() => reindexMutation.mutate()} disabled={reindexMutation.isPending} className="shrink-0 rounded-lg gap-1">
          <RefreshCw className={cn('size-3.5', reindexMutation.isPending && 'animate-spin')} />
          {reindexMutation.isPending ? '索引中...' : '重新索引'}
        </Button>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="输入想找的内容（语义）..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSearch()
            }}
            className="rounded-xl pl-9"
          />
        </div>
        <Button onClick={handleSearch} disabled={searchMutation.isPending || !query.trim()} className="rounded-xl gap-2">
          {searchMutation.isPending ? '搜索中...' : '搜索'}
        </Button>
      </div>

      {searchMutation.isError && (
        <p className="mt-4 text-sm text-destructive">搜索失败，请确认后端已部署且嵌入模型可用。</p>
      )}

      <div className="mt-6 space-y-2">
        {results.map((r) => {
          const meta = typeMeta[r.type] || typeMeta.note
          const Icon = meta.icon
          return (
            <button
              key={`${r.type}:${r.id}`}
              onClick={() => go(r.type, r.id)}
              className="surface-card flex w-full items-start gap-3 p-3 text-left transition-colors hover:bg-accent/50"
            >
              <div className={cn('icon-badge size-9 shrink-0', meta.color)}>
                <Icon className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', meta.color)}>{meta.label}</span>
                  <p className="truncate text-sm font-medium">{r.title}</p>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">{Math.round(r.score * 100)}%</span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{r.snippet}</p>
              </div>
            </button>
          )
        })}
        {searchMutation.isSuccess && results.length === 0 && (
          <EmptyState
            icon={Search}
            title="没有找到语义相关的内容"
            description="试试换个说法，或减少限定词"
          />
        )}
      </div>
    </div>
  )
}
