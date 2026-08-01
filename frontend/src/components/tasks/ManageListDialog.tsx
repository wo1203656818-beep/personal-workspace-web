import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Trash2, Check } from 'lucide-react'
import { taskListsApi, type TaskList } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

const LIST_COLORS = [
  '#2563EB', '#7C3AED', '#DB2777', '#DC2626',
  '#EA580C', '#CA8A04', '#16A34A', '#0891B2',
  '#6366F1', '#8B5CF6', '#EC4899', '#F97316',
  '#14B8A6', '#64748B', '#000000',
]

interface ManageListDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  lists: TaskList[]
  onRefresh: () => void
}

export function ManageListDialog({ open, onOpenChange, lists, onRefresh }: ManageListDialogProps) {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('#2563EB')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const selected = lists.find((l) => l.id === selectedId)

  useEffect(() => {
    if (selected) {
      setEditName(selected.name)
      setEditColor(selected.color || '#2563EB')
      setConfirmDeleteId(null)
    }
  }, [selected])

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; color?: string } }) =>
      taskListsApi.update(id, data),
    onSuccess: () => {
      toast.success('列表已更新')
      queryClient.invalidateQueries({ queryKey: ['taskLists'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      onRefresh()
    },
    onError: (e: Error) => toast.error(`更新失败: ${e.message}`),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => taskListsApi.delete(id),
    onSuccess: () => {
      toast.success('列表已删除')
      queryClient.invalidateQueries({ queryKey: ['taskLists'] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      setSelectedId(null)
      setConfirmDeleteId(null)
      onRefresh()
    },
    onError: (e: Error) => toast.error(`删除失败: ${e.message}`),
  })

  const handleSave = () => {
    if (!selectedId || !editName.trim()) return
    updateMutation.mutate({
      id: selectedId,
      data: { name: editName.trim(), color: editColor },
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>管理任务列表</DialogTitle>
        </DialogHeader>

        {!selectedId ? (
          <div className="space-y-2 py-2">
            {lists.map((list) => (
              <button
                key={list.id}
                type="button"
                onClick={() => setSelectedId(list.id)}
                className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
              >
                <div className="size-3 rounded-full" style={{ background: list.color || '#6366F1' }} />
                <span className="flex-1 text-sm font-medium">{list.name}</span>
                <span className="text-xs text-muted-foreground">
                  {list.taskCount ?? 0} 个任务
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <button
              type="button"
              onClick={() => { setSelectedId(null); setConfirmDeleteId(null) }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              ← 返回列表
            </button>

            <div className="space-y-2">
              <label className="text-sm font-medium">名称</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
                placeholder="列表名称"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">颜色</label>
              <div className="flex flex-wrap gap-2">
                {LIST_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setEditColor(c)}
                    className={cn(
                      'size-7 rounded-full border-2 transition-all',
                      editColor === c ? 'border-foreground scale-110' : 'border-transparent',
                    )}
                    style={{ background: c }}
                  >
                    {editColor === c && <Check className="mx-auto size-3.5 text-white" />}
                  </button>
                ))}
              </div>
            </div>

            {confirmDeleteId === selectedId ? (
              <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3">
                <p className="text-sm text-destructive">确认删除「{selected?.name}」？列表中的任务将被一并删除，此操作不可撤销。</p>
                <div className="mt-2 flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteId(null)}>取消</Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => deleteMutation.mutate(selectedId)}
                    disabled={deleteMutation.isPending}
                  >
                    确认删除
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-destructive hover:text-destructive"
                onClick={() => setConfirmDeleteId(selectedId)}
              >
                <Trash2 className="size-3.5" />
                删除此列表
              </Button>
            )}
          </div>
        )}

        {selectedId && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
            <Button onClick={handleSave} disabled={updateMutation.isPending || !editName.trim()}>
              保存
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
