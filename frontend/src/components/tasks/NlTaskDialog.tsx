import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
interface NlParsed {
  title: string
  dueDate: string | null
  listName: string | null
  note: string | null
  listId: string | null
}

export function NlTaskDialog({
  open,
  onOpenChange,
  nlText,
  onNlTextChange,
  nlParsed,
  parseTaskMutation,
  createFromNlMutation,
  onReset,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  nlText: string
  onNlTextChange: (text: string) => void
  nlParsed: NlParsed | null
  parseTaskMutation: { mutate: (text: string) => void; isPending: boolean }
  createFromNlMutation: { mutate: (task: NlParsed) => void; isPending: boolean }
  onReset: () => void
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        onOpenChange(open)
        if (!open) onReset()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" /> 用一句话添加任务
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Textarea
            value={nlText}
            onChange={(e) => onNlTextChange(e.target.value)}
            placeholder="例如：明天下午3点提醒我给客户发方案，归类到工作"
            className="min-h-[80px]"
          />
          <Button
            onClick={() => parseTaskMutation.mutate(nlText)}
            disabled={parseTaskMutation.isPending || !nlText.trim()}
            className="gap-2"
          >
            {parseTaskMutation.isPending ? '解析中...' : '解析'}
          </Button>

          {nlParsed && (
            <div className="rounded-xl bg-muted/30 p-3 text-sm space-y-1">
              <p>
                <span className="text-muted-foreground">标题：</span>
                {nlParsed.title}
              </p>
              {nlParsed.dueDate && (
                <p>
                  <span className="text-muted-foreground">时间：</span>
                  {nlParsed.dueDate}
                </p>
              )}
              {nlParsed.listName && (
                <p>
                  <span className="text-muted-foreground">列表：</span>
                  {nlParsed.listName}
                </p>
              )}
              {nlParsed.note && (
                <p>
                  <span className="text-muted-foreground">备注：</span>
                  {nlParsed.note}
                </p>
              )}
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onReset()}>
            取消
          </Button>
          <Button
            onClick={() => createFromNlMutation.mutate(nlParsed!)}
            disabled={createFromNlMutation.isPending || !nlParsed}
          >
            {createFromNlMutation.isPending ? '创建中...' : '创建任务'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
