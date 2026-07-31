import { useMutation, useQueryClient } from '@tanstack/react-query'
import { tasksApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Zap, Clock } from 'lucide-react'

interface TwoMinuteCheckProps {
  taskId: string
  taskTitle: string
  onClose: () => void
}

export function TwoMinuteCheck({ taskId, taskTitle, onClose }: TwoMinuteCheckProps) {
  const queryClient = useQueryClient()

  const markQuickMutation = useMutation({
    mutationFn: () => tasksApi.markQuick(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', 'quick-pool'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      onClose()
    },
  })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="size-4 text-orange-500" />
            两分钟规则
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            这件事能在2分钟内完成吗？
          </p>
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-sm font-medium">{taskTitle}</p>
          </div>
          <div className="flex gap-2">
            <Button
              className="flex-1 gap-2"
              onClick={() => markQuickMutation.mutate()}
              disabled={markQuickMutation.isPending}
            >
              <Zap className="size-4" />
              能，马上做
            </Button>
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={onClose}
            >
              <Clock className="size-4" />
              不能，先记下
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
