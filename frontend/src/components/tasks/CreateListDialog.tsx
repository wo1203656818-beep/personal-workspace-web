import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

export function CreateListDialog({
  open,
  onOpenChange,
  newListName,
  onNewListNameChange,
  onCreate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  newListName: string
  onNewListNameChange: (name: string) => void
  onCreate: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(open) => !open && onOpenChange(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建列表</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          value={newListName}
          onChange={(e) => onNewListNameChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newListName.trim()) {
              onCreate()
            }
          }}
          placeholder="列表名称"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={() => newListName.trim() && onCreate()}>
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
