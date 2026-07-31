import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { HTTPError } from 'ky'
import { Sun, Star, Sparkles, X, Calendar, Trash2, FileText, Zap, Gauge, Timer } from 'lucide-react'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { toast } from 'sonner'
import { tasksApi, subtasksApi, aiApi, type Task, type TaskList } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar as CalendarPicker } from '@/components/ui/calendar'
import { cn } from '@/lib/utils'
import { parseStoredTime } from '@/lib/datetime'
import { useIsMobile } from '@/hooks/use-mobile'
import { Sheet, SheetContent, SheetHeader } from '@/components/ui/sheet'
import { TaskSubtasks } from '@/components/tasks/TaskSubtasks'
import { TaskRecurrence, parseRecurrence } from '@/components/tasks/TaskRecurrence'
import { TaskMoveToList } from '@/components/tasks/TaskMoveToList'
import { TagAssignment } from '@/components/tags/TagAssignment'
import { CommitmentContract } from '@/components/tasks/CommitmentContract'
import { IfThenPlan } from '@/components/tasks/IfThenPlan'
import { AbandonCompassion } from '@/components/tasks/AbandonCompassion'
import { AntiRuminationGuard } from '@/components/tasks/AntiRuminationGuard'
import { DecisionTimer } from '@/components/tasks/DecisionTimer'

function toDatetimeLocal(iso: string) {
  const d = parseStoredTime(iso)
  if (!d) return ''
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = fmt.formatToParts(d)
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '00'
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}

export function TaskDetailDialog({
  taskId,
  onClose,
  onDelete,
  lists = [],
}: {
  taskId: string | null
  onClose: () => void
  onDelete: (id: string) => void
  lists?: TaskList[]
}) {
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const [newSubtask, setNewSubtask] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [reminderPickerOpen, setReminderPickerOpen] = useState(false)
  const [recurrencePickerOpen, setRecurrencePickerOpen] = useState(false)
  const [recurrenceType, setRecurrenceType] = useState<'none' | 'daily' | 'weekly' | 'monthly'>(
    'none',
  )
  const [weeklyDays, setWeeklyDays] = useState<number[]>([])
  const [monthlyDay, setMonthlyDay] = useState<number>(1)
  const [noteDraft, setNoteDraft] = useState('')
  const [insertAtPosition, setInsertAtPosition] = useState<number | null>(null)
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false)
  const [showDecisionTimer, setShowDecisionTimer] = useState(false)

  const { data: task } = useQuery<Task>({
    queryKey: ['task', taskId],
    queryFn: () => tasksApi.get(taskId!),
    enabled: !!taskId,
  })

  const { data: subtasks = [] } = useQuery({
    queryKey: ['subtasks', taskId],
    queryFn: () => subtasksApi.byTask(taskId!),
    enabled: !!taskId,
  })

  const sortedSubtasks = useMemo(
    () => [...subtasks].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [subtasks],
  )

  useEffect(() => {
    if (task) setNoteDraft(task.note || '')
  }, [task?.id, task?.note])

  useEffect(() => {
    if (task) {
      const r = parseRecurrence(task.recurrence)
      setRecurrenceType(r.type)
      setWeeklyDays(r.days || [])
      setMonthlyDay(r.dayOfMonth || 1)
    }
  }, [task?.id, task?.recurrence])

  const updateDetailMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Task> }) => tasksApi.update(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['task', taskId] })
      if ('isCompleted' in variables.data) {
        queryClient.invalidateQueries({ queryKey: ['subtasks', taskId] })
      }
    },
    onError: (err: Error) => toast.error(`更新失败: ${err.message}`),
  })

  const myDayMutation = useMutation({
    mutationFn: ({ id, add }: { id: string; add: boolean }) =>
      add ? tasksApi.addToMyDay(id) : tasksApi.removeFromMyDay(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['task', taskId] })
    },
  })

  const addSubtaskMutation = useMutation({
    mutationFn: ({ title, sortOrder }: { title: string; sortOrder?: number }) =>
      subtasksApi.create(taskId!, title, sortOrder),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subtasks', taskId] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['task', taskId] })
      setNewSubtask('')
      setInsertAtPosition(null)
    },
    onError: (err: Error) => {
      toast.error(`添加子任务失败: ${err.message}`)
    },
  })

  const reorderSubtaskMutation = useMutation({
    mutationFn: (orders: { id: string; sortOrder: number }[]) => subtasksApi.reorder(orders),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['subtasks', taskId] }),
    onError: (err: Error) => toast.error(`排序失败: ${err.message}`),
  })

  const toggleSubtaskMutation = useMutation({
    mutationFn: (id: string) => subtasksApi.toggle(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['subtasks', taskId] })
      const prev = queryClient.getQueryData(['subtasks', taskId])
      queryClient.setQueryData(['subtasks', taskId], (old: any) =>
        old?.map((s: any) => (s.id === id ? { ...s, isCompleted: !s.isCompleted } : s)),
      )
      return { prev }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['task', taskId] })
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['subtasks', taskId], ctx.prev)
      toast.error(`更新子任务失败`)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['subtasks', taskId] }),
  })

  const deleteSubtaskMutation = useMutation({
    mutationFn: (id: string) => subtasksApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subtasks', taskId] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['task', taskId] })
    },
  })

  const aiBreakdownMutation = useMutation({
    mutationFn: async () => {
      if (!taskId) throw new Error('未选择任务')
      setAiLoading(true)
      const data = await aiApi.breakdown(task?.title || '', taskId)
      const validSubtasks = (data.subtasks || [])
        .filter(
          (st: { title?: string }) => typeof st.title === 'string' && st.title.trim().length > 0,
        )
        .filter((st: { title: string }) => st.title.trim().length <= 200)
        .slice(0, 10)
      if (validSubtasks.length === 0) throw new Error('AI 未返回有效子任务')
      return { ...data, subtasks: validSubtasks }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['subtasks', taskId] })
      queryClient.invalidateQueries({ queryKey: ['task', taskId] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      setAiLoading(false)
      toast.success(`AI 已拆解 ${data.subtasks.length} 个子任务`)
    },
    onError: async (err: Error) => {
      setAiLoading(false)
      let detail = err.message
      if (err instanceof HTTPError) {
        try {
          const body = (await err.response.json()) as { error?: string; detail?: string }
          detail = body.detail || body.error || err.message
        } catch {
          // ignore
        }
      }
      toast.error(`AI 拆解失败: ${detail}`)
      console.error('[aiBreakdown]', err)
    },
  })

  const abandonMutation = useMutation({
    mutationFn: () => tasksApi.abandon(taskId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: ['task', taskId] })
      setShowAbandonConfirm(false)
      toast.success('任务已放弃')
    },
    onError: (err: Error) => toast.error(`放弃失败: ${err.message}`),
  })

  if (!task) return null

  const dueDate = task.dueDate ? (parseStoredTime(task.dueDate) ?? undefined) : undefined
  const reminder = task.reminder ? (parseStoredTime(task.reminder) ?? undefined) : undefined

  const detailHeaderNode = (
    <div className="flex items-start gap-2 pr-1">
      <DialogTitle className="flex-1 text-lg leading-snug">{task.title}</DialogTitle>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 shrink-0 -mr-1"
        onClick={() =>
          updateDetailMutation.mutate({ id: taskId!, data: { isImportant: !task.isImportant } })
        }
      >
        <Star className={cn('size-4', task.isImportant && 'fill-yellow-400 text-yellow-400')} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 shrink-0"
        onClick={onClose}
        title="关闭"
      >
        <X className="size-4" />
        <span className="sr-only">关闭</span>
      </Button>
    </div>
  )

  const detailBody = (maxH: string) => (
    <ScrollArea className={cn('px-6 py-5', maxH)}>
      <div className="space-y-5">
        {/* 决策倒计时 */}
        {showDecisionTimer && (
          <DecisionTimer
            duration={5}
            onTimeUp={() => setShowDecisionTimer(false)}
            onCancel={() => setShowDecisionTimer(false)}
          />
        )}

        {/* 反内耗守卫 */}
        <AntiRuminationGuard
          category="任务决策"
          onApplyRule={() => setShowDecisionTimer(false)}
          onForceDecide={() => {
            setShowDecisionTimer(false)
            toast.success('立即行动，不再纠结')
          }}
        />
        <TaskSubtasks
          sortedSubtasks={sortedSubtasks}
          newSubtask={newSubtask}
          onNewSubtaskChange={setNewSubtask}
          insertAtPosition={insertAtPosition}
          onInsertAtPositionChange={setInsertAtPosition}
          addSubtaskMutation={addSubtaskMutation}
          toggleSubtaskMutation={toggleSubtaskMutation}
          deleteSubtaskMutation={deleteSubtaskMutation}
          reorderSubtaskMutation={reorderSubtaskMutation}
        />

        <div className="space-y-3 rounded-xl bg-muted/30 p-4">
          <TagAssignment targetType="task" targetId={task.id} />
        </div>

        <div className="space-y-3 rounded-xl bg-muted/30 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Zap className="size-4" /> 承诺合约
          </div>
          <CommitmentContract
            commitmentDeadline={task.commitmentDeadline}
            status={task.status}
            onUpdate={(data) => updateDetailMutation.mutate({ id: task.id, data })}
          />
        </div>

        <div className="space-y-3 rounded-xl bg-muted/30 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Zap className="size-4" /> if-then 计划
          </div>
          <IfThenPlan
            ifThenPlan={task.ifThenPlan}
            onUpdate={(plan) =>
              updateDetailMutation.mutate({ id: task.id, data: { ifThenPlan: plan } })
            }
          />
        </div>

        <div className="space-y-3 rounded-xl bg-muted/30 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Gauge className="size-4" /> 能量等级
          </div>
          <div className="flex gap-2">
            {(
              [
                { value: 'low', emoji: '🌙', label: '低 · 简单' },
                { value: 'medium', emoji: '⛅', label: '中 · 适中' },
                { value: 'high', emoji: '☀️', label: '高 · 困难' },
              ] as const
            ).map((opt) => (
              <Button
                key={opt.value}
                variant={task.energyLevel === opt.value ? 'default' : 'outline'}
                size="sm"
                className="flex-1 gap-1"
                onClick={() =>
                  updateDetailMutation.mutate({ id: task.id, data: { energyLevel: opt.value } })
                }
              >
                <span>{opt.emoji}</span>
                <span className="text-xs">{opt.label.split(' · ')[0]}</span>
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            标记任务难度，首页会根据当前时段自动推荐匹配精力的任务
          </p>
        </div>

        <div className="space-y-3 rounded-xl bg-muted/30 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Calendar className="size-4" /> 日程
          </div>
          <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start gap-2">
                <Calendar className="size-4" />
                {dueDate ? format(dueDate, 'yyyy-MM-dd') : '设置截止日期'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarPicker
                mode="single"
                selected={dueDate}
                onSelect={(date) => {
                  if (date) {
                    updateDetailMutation.mutate({
                      id: task.id,
                      data: { dueDate: format(date, 'yyyy-MM-dd') },
                    })
                  }
                  setDatePickerOpen(false)
                }}
                locale={zhCN}
              />
              {dueDate && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    updateDetailMutation.mutate({ id: task.id, data: { dueDate: null } })
                    setDatePickerOpen(false)
                  }}
                >
                  清除日期
                </Button>
              )}
            </PopoverContent>
          </Popover>

          <Popover open={reminderPickerOpen} onOpenChange={setReminderPickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start gap-2">
                <Sun className="size-4" />
                {reminder ? format(reminder, 'yyyy-MM-dd HH:mm') : '设置提醒'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-3" align="start">
              <input
                type="datetime-local"
                defaultValue={reminder ? toDatetimeLocal(task.reminder || '') : ''}
                onBlur={(e) => {
                  if (e.target.value) {
                    const parts = e.target.value.split('T')
                    if (parts.length === 2) {
                      updateDetailMutation.mutate({
                        id: task.id,
                        data: { reminder: `${parts[0]}T${parts[1]}+08:00` },
                      })
                    }
                  }
                }}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              {reminder && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 w-full"
                  onClick={() => {
                    updateDetailMutation.mutate({ id: task.id, data: { reminder: null } })
                    setReminderPickerOpen(false)
                  }}
                >
                  清除提醒
                </Button>
              )}
            </PopoverContent>
          </Popover>
        </div>

        <TaskRecurrence
          recurrence={task.recurrence}
          recurrencePickerOpen={recurrencePickerOpen}
          onRecurrencePickerOpenChange={setRecurrencePickerOpen}
          recurrenceType={recurrenceType}
          onRecurrenceTypeChange={setRecurrenceType}
          weeklyDays={weeklyDays}
          onWeeklyDaysChange={setWeeklyDays}
          monthlyDay={monthlyDay}
          onMonthlyDayChange={setMonthlyDay}
          onMutate={(id, data) => updateDetailMutation.mutate({ id, data })}
          taskId={task.id}
        />

        <div className="space-y-3 rounded-xl bg-muted/30 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <FileText className="size-4" /> 备注
          </div>
          <Textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="添加备注..."
            onBlur={() => {
              if (noteDraft !== (task.note || '')) {
                updateDetailMutation.mutate({ id: task.id, data: { note: noteDraft } })
              }
            }}
            className="min-h-[100px] resize-none bg-transparent"
          />
        </div>

        <div className="space-y-1 rounded-xl bg-muted/30 p-2">
          <Button
            variant="ghost"
            className="w-full justify-start gap-2"
            onClick={() => setShowDecisionTimer(!showDecisionTimer)}
          >
            <Timer className="size-4 text-orange-500" />
            {showDecisionTimer ? '关闭计时器' : '启动决策计时器'}
          </Button>
          <TaskMoveToList
            currentListId={task.listId}
            lists={lists}
            onMove={(listId) => updateDetailMutation.mutate({ id: task.id, data: { listId } })}
          />
          <Button
            variant="ghost"
            className="w-full justify-start gap-2"
            onClick={() => aiBreakdownMutation.mutate()}
            disabled={aiLoading}
          >
            <Sparkles className="size-4 text-purple-500" />
            {aiLoading ? 'AI 拆解中...' : 'AI 拆解子任务'}
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start gap-2"
            onClick={() => myDayMutation.mutate({ id: taskId!, add: !task.isMyDay })}
          >
            <Sun className={cn('size-4', task.isMyDay && 'text-orange-400')} />
            {task.isMyDay ? '移出我的一天' : '添加到我的一天'}
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-destructive hover:bg-destructive/10"
            onClick={() => onDelete(task.id)}
          >
            <Trash2 className="size-4" />
            删除任务
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-orange-500 hover:bg-orange-500/10"
            onClick={() => setShowAbandonConfirm(true)}
          >
            <Sparkles className="size-4" />
            放弃任务
          </Button>
        </div>
      </div>
    </ScrollArea>
  )

  if (isMobile) {
    return (
      <Sheet open={!!taskId} onOpenChange={(open) => !open && onClose()}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="max-h-[88vh] rounded-t-2xl p-0"
        >
          <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/30" />
          <SheetHeader className="flex flex-row items-start gap-2 border-b px-5 py-4 text-left">
            {detailHeaderNode}
          </SheetHeader>
          {detailBody('max-h-[calc(88vh-6.5rem)]')}
        </SheetContent>
        {showAbandonConfirm && (
          <AbandonCompassion
            taskTitle={task?.title || ''}
            onConfirm={() => abandonMutation.mutate()}
            onCancel={() => setShowAbandonConfirm(false)}
          />
        )}
      </Sheet>
    )
  }

  return (
    <Dialog open={!!taskId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className="max-h-[82vh] gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-4 text-left">{detailHeaderNode}</DialogHeader>
        {detailBody('max-h-[calc(82vh-5.5rem)]')}
      </DialogContent>

      {showAbandonConfirm && (
        <AbandonCompassion
          taskTitle={task?.title || ''}
          onConfirm={() => abandonMutation.mutate()}
          onCancel={() => setShowAbandonConfirm(false)}
        />
      )}
    </Dialog>
  )
}
