import { Link } from 'react-router-dom'
import { Sun, CalendarClock, ListChecks, Sparkles, RefreshCw, CheckCircle2, AlertCircle, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

const viewConfig: Record<string, { tabActiveClass: string }> = {
  today: { tabActiveClass: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  planned: { tabActiveClass: 'bg-purple-500/15 text-purple-600 dark:text-purple-400' },
  all: { tabActiveClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
}

function ViewTab({
  to,
  icon: Icon,
  label,
  active,
  activeClass,
}: {
  to: string
  icon: LucideIcon
  label: string
  active: boolean
  activeClass: string
}) {
  return (
    <Link
      to={to}
      className={cn(
        'inline-flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-sm font-medium transition-all duration-200',
        active
          ? cn('shadow-sm', activeClass)
          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      )}
    >
      <Icon className="size-4" />
      {label}
    </Link>
  )
}

export function TasksHeader({
  pageTitle,
  isListView,
  completedCount,
  totalCount,
  syncMsTodoMutation,
  syncFeedback,
  onOpenNl,
  showCompleted,
  onShowCompletedChange,
}: {
  pageTitle: string
  isListView: boolean
  completedCount: number
  totalCount: number
  syncMsTodoMutation: { mutate: () => void; isPending: boolean }
  syncFeedback: { type: 'success' | 'error'; message: string } | null
  onOpenNl: () => void
  showCompleted: boolean
  onShowCompletedChange: (show: boolean) => void
}) {
  // Determine current view from URL
  const path = window.location.pathname
  const currentView = path.includes('/today') ? 'today' : path.includes('/planned') ? 'planned' : path.includes('/all') ? 'all' : 'today'

  return (
    <div className="border-b bg-card/50 px-4 py-4 backdrop-blur-sm md:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{pageTitle}</h1>
          <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">
            {completedCount}/{totalCount} 已完成
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => syncMsTodoMutation.mutate()}
            disabled={syncMsTodoMutation.isPending}
            className="gap-2 rounded-lg"
          >
            <RefreshCw className={`size-4 ${syncMsTodoMutation.isPending ? 'animate-spin' : ''}`} />
            同步
          </Button>
          {syncFeedback && (
            <div
              className={cn(
                'flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs',
                syncFeedback.type === 'success'
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'bg-red-500/10 text-red-600 dark:text-red-400'
              )}
              onClick={syncFeedback.type === 'error' ? () => syncMsTodoMutation.mutate() : undefined}
            >
              {syncFeedback.type === 'success' ? <CheckCircle2 className="size-3.5" /> : <AlertCircle className="size-3.5" />}
              {syncFeedback.message}
            </div>
          )}
          <Button variant="outline" size="sm" className="gap-1 rounded-lg" onClick={onOpenNl}>
            <Sparkles className="size-4" />
            AI 添加
          </Button>
          {completedCount > 0 && (
            <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-1.5">
              <span className="text-xs text-muted-foreground sm:text-sm">显示已完成</span>
              <Switch checked={showCompleted} onCheckedChange={onShowCompletedChange} />
            </div>
          )}
        </div>
      </div>

      {/* 分类标签 - 仅3个视图 */}
      {!isListView && (
        <div className="mt-4 flex flex-wrap gap-2">
          <ViewTab to="/tasks/today" icon={Sun} label="今天" active={currentView === 'today'} activeClass={viewConfig.today.tabActiveClass} />
          <ViewTab to="/tasks/planned" icon={CalendarClock} label="计划" active={currentView === 'planned'} activeClass={viewConfig.planned.tabActiveClass} />
          <ViewTab to="/tasks/all" icon={ListChecks} label="全部" active={currentView === 'all'} activeClass={viewConfig.all.tabActiveClass} />
        </div>
      )}
    </div>
  )
}
