import { Fragment, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search, FileText, ListTodo, BookOpen, Loader2, Sparkles } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { AIChatSheet } from '@/components/AIChatSheet'
import { ConfigDrawer } from '@/components/ConfigDrawer'
import { aiApi } from '@/lib/api'
import { cn } from '@/lib/utils'

const typeMeta: Record<string, { label: string; icon: typeof FileText; color: string }> = {
  note: { label: '笔记', icon: FileText, color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  task: { label: '任务', icon: ListTodo, color: 'bg-primary/10 text-primary' },
  kb: {
    label: '知识库',
    icon: BookOpen,
    color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  },
}

export function AppHeader({
  breadcrumbs,
  themeIcon: ThemeIcon,
  onToggleTheme,
}: {
  breadcrumbs: Array<{ label: string; href?: string }>
  themeIcon: React.ComponentType<{ className?: string }>
  onToggleTheme: () => void
}) {
  const navigate = useNavigate()
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')

  const searchMutation = useMutation({
    mutationFn: (q: string) => aiApi.semanticSearch(q, 8),
  })

  const handleSearch = () => {
    const q = query.trim()
    if (q) searchMutation.mutate(q)
  }

  const results = searchMutation.data?.results || []

  const go = (type: string, id: string) => {
    setSearchOpen(false)
    setQuery('')
    if (type === 'note') navigate(`/notes/${id}`)
    else if (type === 'kb') navigate(`/knowledge/${id}`)
    else navigate('/tasks')
  }

  return (
    <>
      <header className="sticky top-0 z-50 flex h-12 items-center gap-2 border-b bg-background/75 px-4 backdrop-blur-2xl backdrop-saturate-150 sm:px-6 shadow-[0_1px_0_0_rgba(255,255,255,0.06)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.04)]">
        <SidebarTrigger className="-ml-1 size-8" />
        <Separator orientation="vertical" className="h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            {breadcrumbs.map((crumb, idx) => {
              const isLast = idx === breadcrumbs.length - 1
              return (
                <Fragment key={idx}>
                  <BreadcrumbItem className={isLast ? '' : 'hidden sm:inline-flex'}>
                    {isLast || !crumb.href ? (
                      <BreadcrumbPage className="text-sm font-medium">{crumb.label}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink asChild>
                        <Link to={crumb.href} className="text-sm">
                          {crumb.label}
                        </Link>
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                  {!isLast && <BreadcrumbSeparator className="hidden sm:block" />}
                </Fragment>
              )
            })}
          </BreadcrumbList>
        </Breadcrumb>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 rounded-lg text-muted-foreground"
            onClick={() => setSearchOpen(true)}
          >
            <Search className="size-4" />
            <span className="hidden sm:inline text-xs">搜索</span>
          </Button>
          <Button variant="ghost" size="icon" className="size-9 sm:size-8" onClick={onToggleTheme}>
            <ThemeIcon className="size-4" />
            <span className="sr-only">切换主题</span>
          </Button>
          <AIChatSheet />
          <ConfigDrawer />
        </div>
      </header>

      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="max-w-2xl p-0 gap-0">
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <Search className="size-4 text-muted-foreground shrink-0" />
            <Input
              placeholder="搜索笔记、任务、知识库..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="border-0 focus-visible:ring-0 shadow-none"
              autoFocus
            />
            {searchMutation.isPending && (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            )}
          </div>
          <div className="max-h-[400px] overflow-auto p-2">
            {results.length > 0 ? (
              <div className="space-y-1">
                {results.map((r: any) => {
                  const meta = typeMeta[r.type] || typeMeta.note
                  const Icon = meta.icon
                  return (
                    <button
                      key={`${r.type}-${r.id}`}
                      onClick={() => go(r.type, r.id)}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent/50"
                    >
                      <div
                        className={cn(
                          'flex size-8 shrink-0 items-center justify-center rounded-lg',
                          meta.color,
                        )}
                      >
                        <Icon className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-1 text-sm font-medium">{r.title}</p>
                        {r.snippet && (
                          <p className="line-clamp-1 text-xs text-muted-foreground">{r.snippet}</p>
                        )}
                      </div>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {meta.label}
                      </span>
                    </button>
                  )
                })}
              </div>
            ) : query.trim() && !searchMutation.isPending ? (
              <div className="flex flex-col items-center py-8 text-center">
                <Sparkles className="mb-2 size-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">未找到匹配结果</p>
              </div>
            ) : !query.trim() ? (
              <div className="flex flex-col items-center py-8 text-center">
                <Search className="mb-2 size-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">输入关键词搜索笔记、任务和知识库</p>
                <p className="mt-1 text-xs text-muted-foreground">按 Enter 执行搜索</p>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
