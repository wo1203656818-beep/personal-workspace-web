import { Link } from 'react-router-dom'
import { ListTodo, Trash2 } from 'lucide-react'
import { type Task } from '@/lib/api'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { EmptyState } from '@/components/EmptyState'
import { TaskRow } from '@/components/tasks/TaskRow'

export function ListsOverview({
  tasksByList,
  expandedTaskIds,
  onToggleExpand,
  onSelect,
  onToggleComplete,
  onDelete,
  onDeleteList,
  completingTaskId,
}: {
  tasksByList: { listId: string; listName: string; tasks: Task[] }[] | null
  expandedTaskIds: Set<string>
  onToggleExpand: (taskId: string) => void
  onSelect: (taskId: string) => void
  onToggleComplete: (taskId: string) => void
  onDelete: (taskId: string) => void
  onDeleteList: (listId: string) => void
  completingTaskId?: string | null
}) {
  if (!tasksByList || tasksByList.length === 0) {
    return (
      <EmptyState
        icon={ListTodo}
        title="暂无任务列表"
        description="点击右上角「新建列表」开始整理任务"
      />
    )
  }

  return (
    <div className="space-y-4">
      {tasksByList.map(({ listId, listName, tasks }) => (
        <div key={listId} className="group/list rounded-xl border bg-card p-3 shadow-sm transition-shadow hover:shadow-md">
          <div className="mb-2 flex items-center justify-between px-1">
            <Link
              to={listId === 'unknown' ? '/tasks/lists' : `/tasks/list/${listId}`}
              className="flex items-center gap-2 text-sm font-semibold hover:text-primary"
            >
              <div className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                <ListTodo className="size-3.5" />
              </div>
              {listName}
            </Link>
            <div className="flex items-center gap-1">
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{tasks.length}</span>
              {listId !== 'unknown' && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover/list:opacity-100"
                      title="删除列表"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>确认删除列表「{listName}」？</AlertDialogTitle>
                      <AlertDialogDescription>
                        此操作将删除该列表及其下所有任务{tasks.length > 0 ? `（共 ${tasks.length} 个任务）` : ''}，且无法恢复。若列表已同步到微软 To Do，也会从微软端删除。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => onDeleteList(listId)}
                      >
                        确认删除
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
          <div className="space-y-1">
            {tasks.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">暂无任务</p>
            ) : (
              tasks.map((task: Task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  isExpanded={expandedTaskIds.has(task.id)}
                  onToggleExpand={() => onToggleExpand(task.id)}
                  onSelect={() => onSelect(task.id)}
                  onToggleComplete={() => onToggleComplete(task.id)}
                  onDelete={() => onDelete(task.id)}
                  isCompleting={completingTaskId === task.id}
                />
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
