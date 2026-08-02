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
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1.5 border-b border-primary/10 bg-primary/5 px-3 py-2 shadow-sm backdrop-blur-sm">
      <span className="rounded-full bg-card px-2 py-0.5 text-xs font-medium text-primary">
        已选 {selectedCount} 项
      </span>
      <Button size="sm" variant="outline" className="h-8 px-2 text-xs" onClick={onComplete} disabled={disabled}>
        标记完成
      </Button>
      <Button size="sm" variant="outline" className="h-8 px-2 text-xs" onClick={onMarkImportant} disabled={disabled}>
        标记重要
      </Button>
      <Button size="sm" variant="outline" className="h-8 px-2 text-xs" onClick={onAddToMyDay} disabled={disabled}>
        我的一天
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="h-8 px-2 text-xs" disabled={disabled}>
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
      <Button
        size="sm"
        variant="outline"
        className="h-8 px-2 text-xs text-destructive hover:bg-destructive/5"
        onClick={onDelete}
        disabled={disabled}
      >
        删除
      </Button>
      <Button size="sm" variant="ghost" className="h-8 px-2 text-xs text-muted-foreground" onClick={onCancel} disabled={disabled}>
        取消选择
      </Button>
    </div>
  )
}
