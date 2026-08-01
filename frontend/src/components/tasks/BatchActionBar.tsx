import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface BatchActionBarProps {
  selectedCount: number
  lists: Array<{ id: string; name: string }>
  disabled?: boolean
  onComplete: () => void
  onMarkImportant: () => void
  onAddToMyDay: () => void
  onMoveToList: (listId: string) => void
  onDelete: () => void
  onCancel: () => void
}

export function BatchActionBar({
  selectedCount,
  lists,
  disabled,
  onComplete,
  onMarkImportant,
  onAddToMyDay,
  onMoveToList,
  onDelete,
  onCancel,
}: BatchActionBarProps) {
  if (selectedCount === 0) return null

  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-card px-4 py-2">
      <span className="text-sm text-muted-foreground">已选 {selectedCount} 项</span>
      <Button size="sm" variant="outline" onClick={onComplete} disabled={disabled}>
        标记完成
      </Button>
      <Button size="sm" variant="outline" onClick={onMarkImportant} disabled={disabled}>
        标记重要
      </Button>
      <Button size="sm" variant="outline" onClick={onAddToMyDay} disabled={disabled}>
        我的一天
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" disabled={disabled}>
            移到列表 <ChevronDown className="ml-1 size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {lists.map((list) => (
            <DropdownMenuItem key={list.id} onClick={() => onMoveToList(list.id)}>
              {list.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button size="sm" variant="outline" onClick={onDelete} disabled={disabled} className="text-destructive">
        删除
      </Button>
      <Button size="sm" variant="ghost" onClick={onCancel} disabled={disabled}>
        取消选择
      </Button>
    </div>
  )
}
