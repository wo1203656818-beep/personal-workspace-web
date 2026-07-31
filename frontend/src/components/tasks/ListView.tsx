import { ListChecks } from 'lucide-react'
import { TaskListBody } from '@/components/tasks/TaskListBody'

interface ListViewProps {
  tasks: any[]
  lists: any[]
  listId: string
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

export function ListView(props: ListViewProps) {
  const listName = props.lists.find(l => l.id === props.listId)?.name || '列表'

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
      emptyTitle={`${listName} 暂无任务`}
      emptyDescription="在上方输入框添加任务"
    />
  )
}
