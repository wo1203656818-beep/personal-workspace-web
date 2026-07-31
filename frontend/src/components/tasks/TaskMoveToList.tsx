import { CalendarClock } from 'lucide-react'
import { type TaskList } from '@/lib/api'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function TaskMoveToList({
  currentListId,
  lists,
  onMove,
}: {
  currentListId: string
  lists: TaskList[]
  onMove: (listId: string) => void
}) {
  if (lists.length <= 1) return null

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <CalendarClock className="size-4 shrink-0 text-muted-foreground" />
      <Select
        value={currentListId}
        onValueChange={(v) => {
          if (v !== currentListId) {
            onMove(v)
          }
        }}
      >
        <SelectTrigger className="h-8 flex-1 gap-1 rounded-lg text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {lists.map((l) => (
            <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
