import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Sun } from 'lucide-react'
import { toast } from 'sonner'
import { aiApi } from '@/lib/api'
import { DailyDigestCard } from '@/components/tasks/DailyDigestCard'
import { PrioritySuggestionsCard } from '@/components/tasks/PrioritySuggestionsCard'
import { StaleTaskNudge } from '@/components/tasks/StaleTaskNudge'
import { TaskListBody } from '@/components/tasks/TaskListBody'
import { MoodWeatherCard } from '@/components/tasks/MoodWeatherCard'
import { MoodHistory } from '@/components/tasks/MoodHistory'
import { QuickActionPool } from '@/components/tasks/QuickActionPool'
import { NightlyReviewCard } from '@/components/tasks/NightlyReviewCard'

interface TodayViewProps {
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

export function TodayView(props: TodayViewProps) {
  const queryClient = useQueryClient()

  const { data: digestData, isLoading: digestLoading } = useQuery<{ digest: string; cached?: boolean }>({
    queryKey: ['aiDigest'],
    queryFn: aiApi.digest,
    staleTime: 60 * 60 * 1000,
  })

  const regenerateDigestMutation = useMutation({
    mutationFn: aiApi.digest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aiDigest'] })
      toast.success('已重新生成简报')
    },
    onError: (err: Error) => toast.error(`生成失败: ${err.message}`),
  })

  const { data: priorityData, isLoading: priorityLoading } = useQuery<{ suggestions: { taskId: string; reason: string }[]; cached?: boolean }>({
    queryKey: ['aiPriority'],
    queryFn: aiApi.prioritySuggestions,
    staleTime: 60 * 60 * 1000,
  })

  const regeneratePriorityMutation = useMutation({
    mutationFn: aiApi.prioritySuggestions,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aiPriority'] })
      toast.success('已重新生成优先级建议')
    },
    onError: (err: Error) => toast.error(`生成失败: ${err.message}`),
  })

  return (
    <>
      <DailyDigestCard
        currentView="myday"
        digestLoading={digestLoading}
        digestData={digestData}
        regenerateDigestMutation={regenerateDigestMutation}
        digestExpanded={true}
        onDigestExpandedChange={() => {}}
      />
      <PrioritySuggestionsCard
        currentView="myday"
        priorityLoading={priorityLoading}
        priorityData={priorityData}
        tasks={props.tasks}
        onSelectTask={props.onSelectTask}
        regeneratePriorityMutation={regeneratePriorityMutation}
      />
      <StaleTaskNudge />
      <MoodWeatherCard />
      <MoodHistory />
      <QuickActionPool />
      <NightlyReviewCard />
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
        emptyIcon={Sun}
        emptyTitle="今天没有待办任务"
        emptyDescription="添加一个任务，开启高效的一天"
      />
    </>
  )
}
