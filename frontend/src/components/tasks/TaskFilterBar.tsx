import { Search, Star, X, ListFilter } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { TaskFilter, TaskView } from '@/lib/task-filters'
import type { TaskList } from '@/lib/api'

export function TaskFilterBar({
  filter,
  onChange,
  lists,
  view,
  onViewChange,
  totalCount,
  filteredCount,
}: {
  filter: TaskFilter
  onChange: (f: TaskFilter) => void
  lists: TaskList[]
  view: TaskView
  onViewChange: (v: TaskView) => void
  totalCount: number
  filteredCount: number
}) {
  const hasFilter =
    filter.q !== '' ||
    filter.listId !== '' ||
    filter.important ||
    filter.due !== 'all' ||
    filter.status !== 'active' ||
    filter.energy !== ''

  const views: { key: TaskView; label: string }[] = [
    { key: 'list', label: '列表' },
    { key: 'board', label: '看板' },
    { key: 'matrix', label: '四象限' },
  ]

  const dueOptions: { key: TaskFilter['due']; label: string }[] = [
    { key: 'all', label: '全部日期' },
    { key: 'overdue', label: '已逾期' },
    { key: 'today', label: '今天' },
    { key: 'thisWeek', label: '本周' },
    { key: 'next7', label: '未来7天' },
    { key: 'noDate', label: '无日期' },
  ]

  return (
    <div className="mb-3 space-y-2 rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* 视图切换 */}
        <div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
          {views.map((v) => (
            <button
              key={v.key}
              onClick={() => onViewChange(v.key)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                view === v.key
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className="ml-auto text-xs text-muted-foreground">
          {filteredCount}/{totalCount} 项
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* 搜索 */}
        <div className="relative min-w-0 flex-1 sm:max-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filter.q}
            onChange={(e) => onChange({ ...filter, q: e.target.value })}
            placeholder="搜索任务..."
            className="h-8 pl-8 text-sm"
          />
        </div>

        {/* 清单 */}
        <Select
          value={filter.listId || 'all'}
          onValueChange={(v) => onChange({ ...filter, listId: v === 'all' ? '' : v })}
        >
          <SelectTrigger className="h-8 w-[110px] text-xs sm:w-[120px]">
            <SelectValue placeholder="全部清单" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部清单</SelectItem>
            {lists.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* 日期 */}
        <Select
          value={filter.due}
          onValueChange={(v) => onChange({ ...filter, due: v as TaskFilter['due'] })}
        >
          <SelectTrigger className="h-8 w-[104px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {dueOptions.map((o) => (
              <SelectItem key={o.key} value={o.key}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* 精力 */}
        <Select
          value={filter.energy || 'all'}
          onValueChange={(v) =>
            onChange({ ...filter, energy: v === 'all' ? '' : (v as TaskFilter['energy']) })
          }
        >
          <SelectTrigger className="h-8 w-[86px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部精力</SelectItem>
            <SelectItem value="low">低精力</SelectItem>
            <SelectItem value="medium">中精力</SelectItem>
            <SelectItem value="high">高精力</SelectItem>
          </SelectContent>
        </Select>

        {/* 只看重要 */}
        <Button
          variant={filter.important ? 'default' : 'outline'}
          size="sm"
          className={cn('h-8 gap-1 rounded-lg px-2.5 text-xs', !filter.important && 'text-muted-foreground')}
          onClick={() => onChange({ ...filter, important: !filter.important })}
        >
          <Star className={cn('size-3.5', filter.important && 'fill-current')} />
          重要
        </Button>

        {/* 状态 */}
        <div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
          {(
            [
              { key: 'active', label: '未完成' },
              { key: 'completed', label: '已完成' },
              { key: 'all', label: '全部' },
            ] as const
          ).map((s) => (
            <button
              key={s.key}
              onClick={() => onChange({ ...filter, status: s.key })}
              className={cn(
                'rounded-md px-2 py-1 text-xs transition-colors',
                filter.status === s.key
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        {hasFilter && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 rounded-lg px-2 text-xs text-muted-foreground"
            onClick={() =>
              onChange({
                q: '',
                listId: '',
                important: false,
                due: 'all',
                status: 'active',
                energy: '',
              })
            }
          >
            <X className="size-3.5" />
            清除
          </Button>
        )}
      </div>

      {hasFilter && (
        <div className="flex flex-wrap items-center gap-1.5">
          <ListFilter className="size-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">筛选：</span>
          {filter.q && (
            <Badge variant="secondary" className="gap-1 text-xs">
              搜索「{filter.q}」<X className="size-3 cursor-pointer" onClick={() => onChange({ ...filter, q: '' })} />
            </Badge>
          )}
          {filter.listId && (
            <Badge variant="secondary" className="text-xs">
              {lists.find((l) => l.id === filter.listId)?.name}
            </Badge>
          )}
          {filter.due !== 'all' && (
            <Badge variant="secondary" className="text-xs">
              {dueOptions.find((o) => o.key === filter.due)?.label}
            </Badge>
          )}
          {filter.energy && (
            <Badge variant="secondary" className="text-xs">
              {filter.energy}精力
            </Badge>
          )}
          {filter.important && <Badge variant="secondary" className="text-xs">重要</Badge>}
          {filter.status !== 'active' && (
            <Badge variant="secondary" className="text-xs">
              {filter.status === 'completed' ? '已完成' : '全部'}
            </Badge>
          )}
        </div>
      )}
    </div>
  )
}
