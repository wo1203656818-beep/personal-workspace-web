import { CalendarClock } from 'lucide-react'
import { TaskListBody } from '@/components/tasks/TaskListBody'

interface PlannedViewProps {
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

export function PlannedView(props: PlannedViewProps) {
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
      emptyIcon={CalendarClock}
      emptyTitle="没有已计划的任务"
      emptyDescription="为任务设置截止日期，它们会出现在这里"
    />
  )
}
