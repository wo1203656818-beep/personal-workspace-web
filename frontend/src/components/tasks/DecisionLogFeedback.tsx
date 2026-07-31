import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { decisionLogsApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Timer } from 'lucide-react'

interface DecisionLogFeedbackProps {
  taskId: string
  taskTitle: string
  onClose: () => void
}

export function DecisionLogFeedback({ taskId, taskTitle, onClose }: DecisionLogFeedbackProps) {
  const queryClient = useQueryClient()
  const [duration, setDuration] = useState<number | null>(null)
  const [step, setStep] = useState<'duration' | 'satisfaction'>('duration')

  const createLogMutation = useMutation({
    mutationFn: (sat: number) => decisionLogsApi.create({
      taskId,
      category: '任务决策',
      title: taskTitle,
      durationSec: duration || undefined,
      satisfaction: sat,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decision-logs'] })
      toast.success('已记录')
      onClose()
    },
  })

  const DURATION_OPTIONS = [
    { value: 60, label: '< 1分钟', desc: '快速决定' },
    { value: 300, label: '1-5分钟', desc: '正常思考' },
    { value: 900, label: '5-15分钟', desc: '有点纠结' },
    { value: 1800, label: '15-30分钟', desc: '比较耗时' },
    { value: 3600, label: '> 30分钟', desc: '严重内耗' },
  ]

  const SATISFACTION_OPTIONS = [
    { value: 1, label: '很不满意', emoji: '😣' },
    { value: 2, label: '不太满意', emoji: '😐' },
    { value: 3, label: '一般', emoji: '🙂' },
    { value: 4, label: '比较满意', emoji: '😊' },
    { value: 5, label: '很满意', emoji: '😄' },
  ]

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Timer className="size-4" />
            记录这次决策
          </DialogTitle>
        </DialogHeader>

        {step === 'duration' ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              做这个决定花了多久？
            </p>
            <div className="grid gap-2">
              {DURATION_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  variant={duration === opt.value ? 'default' : 'outline'}
                  className="justify-between"
                  onClick={() => {
                    setDuration(opt.value)
                    setStep('satisfaction')
                  }}
                >
                  <span>{opt.label}</span>
                  <span className="text-xs text-muted-foreground">{opt.desc}</span>
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              对这个决定满意吗？
            </p>
            <div className="grid gap-2">
              {SATISFACTION_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  variant="outline"
                  className="justify-between"
                  onClick={() => createLogMutation.mutate(opt.value)}
                  disabled={createLogMutation.isPending}
                >
                  <span className="flex items-center gap-2">
                    <span>{opt.emoji}</span>
                    <span>{opt.label}</span>
                  </span>
                </Button>
              ))}
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              跳过
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
