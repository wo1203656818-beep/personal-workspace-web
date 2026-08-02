import {
  Sparkles,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Settings,
  MoreVertical,
  ListTodo,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

export function TasksHeader({
  pageTitle,
  completedCount,
  totalCount,
  syncMsTodoMutation,
  syncFeedback,
  onOpenNl,
  onManageLists,
  showCompleted,
  onShowCompletedChange,
}: {
  pageTitle: string
  completedCount: number
  totalCount: number
  syncMsTodoMutation: { mutate: () => void; isPending: boolean }
  syncFeedback: { type: 'success' | 'error'; message: string } | null
  onOpenNl: () => void
  onManageLists: () => void
  showCompleted: boolean
  onShowCompletedChange: (show: boolean) => void
}) {
  return (
    <div className="page-header">
      <div className="page-header-left">
        <div className="icon-badge size-9 bg-gradient-to-br from-blue-500 to-indigo-500 md:size-10">
          <ListTodo className="size-5" />
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight sm:text-xl md:text-2xl">{pageTitle}</h1>
          <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">
            {completedCount}/{totalCount} 已完成
          </p>
        </div>
      </div>
      <div className="page-header-right">
        {syncFeedback && (
          <div
            className={cn(
              'flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs',
              syncFeedback.type === 'success'
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-red-500/10 text-red-600 dark:text-red-400',
            )}
            onClick={
              syncFeedback.type === 'error' ? () => syncMsTodoMutation.mutate() : undefined
            }
          >
            {syncFeedback.type === 'success' ? (
              <CheckCircle2 className="size-3.5" />
            ) : (
              <AlertCircle className="size-3.5" />
            )}
            <span className="hidden sm:inline">{syncFeedback.message}</span>
          </div>
        )}

        {/* Desktop full buttons */}
        <div className="hidden items-center gap-2 sm:flex">
          <Button
            size="sm"
            variant="outline"
            onClick={() => syncMsTodoMutation.mutate()}
            disabled={syncMsTodoMutation.isPending}
            className="h-8 gap-2 rounded-lg sm:h-9"
          >
            <RefreshCw className={`size-4 ${syncMsTodoMutation.isPending ? 'animate-spin' : ''}`} />
            同步
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onManageLists}
            className="h-8 gap-2 rounded-lg sm:h-9"
          >
            <Settings className="size-4" />
            管理列表
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1 rounded-lg sm:h-9" onClick={onOpenNl}>
            <Sparkles className="size-4" />
            AI 添加
          </Button>
        </div>

        {/* Mobile compact buttons */}
        <div className="flex items-center gap-2 sm:hidden">
          <Button
            size="icon"
            variant="outline"
            className="size-8 rounded-lg"
            onClick={() => syncMsTodoMutation.mutate()}
            disabled={syncMsTodoMutation.isPending}
            aria-label="同步 MS Todo"
          >
            <RefreshCw className={`size-4 ${syncMsTodoMutation.isPending ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="size-8 rounded-lg"
            onClick={onOpenNl}
            aria-label="AI 添加任务"
          >
            <Sparkles className="size-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="outline" className="size-8 rounded-lg" aria-label="更多操作">
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onManageLists}>
                <Settings className="mr-2 size-4" />
                管理列表
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {completedCount > 0 && (
          <div className="flex items-center gap-2 rounded-lg border bg-background px-2.5 py-1.5">
            <span className="text-xs text-muted-foreground">显示已完成</span>
            <Switch
              checked={showCompleted}
              onCheckedChange={onShowCompletedChange}
              className="scale-90"
            />
          </div>
        )}
      </div>
    </div>
  )
}
