import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ListChecks, ListTodo } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TaskListBody } from '@/components/tasks/TaskListBody'

interface AllViewProps {
  tasks: any[]
  lists: any[]
  showCompleted: boolean
  expandedTaskIds: Set<string>
  onToggleExpand: (id: string) => void
  selectedTaskId: string | null
  onSelectTask: (id: string) => void
  onDeleteTask: (id: string) => void
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onToggleSelectAll: () => void
  allSelected: boolean
}

export function AllView(props: AllViewProps) {
  const listsWithCounts = useMemo(() => {
    return props.lists.map(list => ({
      ...list,
      pendingCount: props.tasks.filter(t => t.listId === list.id && !t.isCompleted).length,
    }))
  }, [props.lists, props.tasks])

  return (
    <>
      <TaskListBody
        tasks={props.tasks}
        showCompleted={props.showCompleted}
        expandedTaskIds={props.expandedTaskIds}
        onToggleExpand={props.onToggleExpand}
        onSelectTask={props.onSelectTask}
        onDeleteTask={props.onDeleteTask}
        selectedIds={props.selectedIds}
        onToggleSelect={props.onToggleSelect}
        onToggleSelectAll={props.onToggleSelectAll}
        allSelected={props.allSelected}
        emptyIcon={ListChecks}
        emptyTitle="暂无任务"
        emptyDescription="在上方输入框添加第一个任务"
      />

      {listsWithCounts.length > 0 && (
        <Card className="mt-4">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-semibold">任务列表</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {listsWithCounts.map((list) => (
                <Link
                  key={list.id}
                  to={`/tasks/list/${list.id}`}
                  className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/50"
                >
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <ListTodo className="size-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="line-clamp-1 text-sm font-medium">{list.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {list.pendingCount} 个待办
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {list.pendingCount}
                  </Badge>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </>
  )
}
