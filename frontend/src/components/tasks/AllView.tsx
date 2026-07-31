import { ListChecks } from 'lucide-react'
import { TaskListBody } from '@/components/tasks/TaskListBody'
import type { Task } from '@/lib/api'

interface AllViewProps {
  tasks: Task[]
  showCompleted: boolean
  expandedTaskIds: Set<string>
  onToggleExpand: (id: string) => void
  onSelectTask: (id: string) => void
  onDeleteTask: (id: string) => void
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onToggleSelectAll: () => void
  allSelected: boolean
}

export function AllView(props: AllViewProps) {
  return (
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
  )
}
