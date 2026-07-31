import { memo, useState, useRef, type MouseEvent as ReactMouseEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { type DraggableProvided } from '@hello-pangea/dnd'
import { Star, Calendar, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { tasksApi, subtasksApi, type Task, type Subtask } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { formatCST } from '@/lib/datetime'
import { useSwipeGesture } from '@/hooks/use-swipe-gesture'

// 任务列表项（支持拖拽 + 子任务展开）
export const TaskRow = memo(function TaskRow({
  task,
  provided,
  isExpanded,
  onToggleExpand,
  onSelect,
  onToggleComplete,
  onDelete,
  isCompleting,
  selected,
  onToggleSelect,
}: {
  task: Task
  provided?: DraggableProvided
  isExpanded: boolean
  onToggleExpand: (id: string) => void
  onSelect: (id: string) => void
  onToggleComplete: (id: string) => void
  onDelete: (id: string) => void
  isCompleting?: boolean
  selected?: boolean
  onToggleSelect?: (id: string) => void
}) {
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(task.title)
  const editInputRef = useRef<HTMLInputElement>(null)

  // P2-14: 移动端手势 — 左滑删除，右滑完成
  const swipeHandlers = useSwipeGesture({
    onSwipeLeft: () => onDelete(task.id),
    onSwipeRight: () => onToggleComplete(task.id),
    threshold: 80,
  })

  // 拉取子任务（用于显示数量 badge + 展开时渲染）。仅在展开时拉取，避免列表 N+1 并发请求。
  const { data: subtasks = [] } = useQuery<Subtask[]>({
    queryKey: ['subtasks', task.id],
    queryFn: () => subtasksApi.byTask(task.id),
    enabled: isExpanded,
  })

  const toggleSubtaskMutation = useMutation({
    mutationFn: (id: string) => subtasksApi.toggle(id),
    onSuccess: () => {
      // 子任务完成态会反向决定父任务是否完成
      queryClient.invalidateQueries({ queryKey: ['subtasks', task.id] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['task', task.id] })
    },
  })

  // 重命名任务（双击标题进入编辑）
  const renameMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Task> }) => tasksApi.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
    onError: (err: Error) => toast.error(`重命名失败: ${err.message}`),
  })

  const commitRename = () => {
    const trimmed = editTitle.trim()
    if (trimmed && trimmed !== task.title) {
      renameMutation.mutate({ id: task.id, data: { title: trimmed } })
    } else {
      setEditTitle(task.title)
    }
    setIsEditing(false)
  }

  const startEditing = (e: ReactMouseEvent) => {
    e.stopPropagation()
    setEditTitle(task.title)
    setIsEditing(true)
    requestAnimationFrame(() => editInputRef.current?.focus())
  }

  // 逾期判断：dueDate 视为当天结束（北京时间 23:59:59）才算逾期，避免"今天到期"一早就显示红色
  const isOverdue =
    task.dueDate &&
    !task.isCompleted &&
    (() => {
      // 规范化日期为 yyyy-MM-dd
      const dateStr = task.dueDate.split('T')[0]
      // 当天结束 = 次日 00:00 UTC（因为 dateStr 无时区，按 UTC 解析）
      const dueEnd = new Date(`${dateStr}T23:59:59+08:00`)
      return dueEnd < new Date()
    })()

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* P2-14: 滑动操作提示 (CSS hover/focus 时显示) */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-between px-4 opacity-0 transition-opacity md:hidden">
        <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          完成
        </span>
      </div>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-end px-4 opacity-0 transition-opacity md:hidden">
        <span className="rounded-full bg-destructive/20 px-3 py-1 text-xs font-medium text-destructive">
          删除
        </span>
      </div>
      <div
        ref={provided?.innerRef}
        {...(provided?.draggableProps ?? {})}
        {...(provided?.dragHandleProps ?? {})}
        {...swipeHandlers}
        className={cn(
          'group relative overflow-hidden rounded-xl border bg-card transition-all duration-200 hover:bg-accent/30 hover:shadow-sm',
          task.isImportant &&
            !task.isCompleted &&
            'before:content-[""] before:absolute before:left-0 before:top-3 before:bottom-3 before:w-1 before:rounded-r-full before:bg-yellow-400',
        )}
        onClick={() => onSelect(task.id)}
      >
        <div className="flex items-center gap-3 px-3 py-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect?.(task.id)}
            className="size-4 rounded border-muted-foreground/30"
            onClick={(e) => e.stopPropagation()}
          />
          <Checkbox
            checked={task.isCompleted}
            onCheckedChange={() => onToggleComplete(task.id)}
            onClick={(e) => e.stopPropagation()}
            disabled={isCompleting}
          />
          {isEditing ? (
            <Input
              ref={editInputRef}
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  commitRename()
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  setEditTitle(task.title)
                  setIsEditing(false)
                }
              }}
              className="flex-1 h-7"
            />
          ) : (
            <span
              onDoubleClick={startEditing}
              className={cn(
                'flex-1 transition-all duration-300 cursor-text',
                task.isCompleted && 'line-through opacity-60',
              )}
              title="双击编辑标题"
            >
              {task.title}
            </span>
          )}
          {/* 子任务展开/收起按钮；有子任务时展示完成进度 x/y，避免 N+1 拉取再算进度 */}
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground"
            onClick={(e) => {
              e.stopPropagation()
              onToggleExpand(task.id)
            }}
          >
            {isExpanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            {(task.subtaskCount ?? 0) > 0 &&
              (() => {
                const total = task.subtaskCount!
                const done = task.completedSubtaskCount ?? 0
                if (total === 1) return <span className="ml-0.5 text-xs tabular-nums">{total}</span>
                return (
                  <span
                    className={cn(
                      'ml-0.5 text-xs tabular-nums',
                      done === total && 'text-emerald-600 dark:text-emerald-400',
                    )}
                  >
                    {done}/{total}
                  </span>
                )
              })()}
          </Button>
          {task.isImportant && <Star className="size-4 fill-yellow-400 text-yellow-400" />}
          {task.dueDate && (
            <Badge variant={isOverdue ? 'destructive' : 'secondary'} className="gap-1">
              <Calendar className="size-3" />
              {formatCST(task.dueDate, 'cnDate')}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="icon-xs"
            className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(task.id)
            }}
          >
            <Trash2 className="size-3" />
          </Button>
        </div>
        {/* 展开的子任务列表 */}
        {isExpanded && (
          <div className="ml-8 space-y-0.5 pb-2">
            {subtasks.length === 0 ? (
              <p className="px-2 py-1 text-xs text-muted-foreground">暂无子任务</p>
            ) : (
              subtasks.map((st: Subtask) => (
                <div
                  key={st.id}
                  className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-accent"
                >
                  <Checkbox
                    checked={st.isCompleted}
                    onCheckedChange={() => toggleSubtaskMutation.mutate(st.id)}
                    onClick={(e) => e.stopPropagation()}
                    disabled={toggleSubtaskMutation.isPending}
                  />
                  <span
                    className={cn(
                      'flex-1 text-sm',
                      st.isCompleted && 'line-through text-muted-foreground',
                    )}
                  >
                    {st.title}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
})
