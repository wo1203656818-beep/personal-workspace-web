import { forwardRef } from 'react'
import { Plus, ListTodo, Sparkles } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { TaskList } from '@/lib/api'

export const NewTaskInput = forwardRef<HTMLInputElement, {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  lists: TaskList[]
  isListView: boolean
  isSearchView: boolean
  isListsOverview: boolean
  currentListId: string | undefined
  selectedListId: string
  onSelectList: (listId: string) => void
  suggestedList: { listId: string; listName: string } | null
  onAcceptSuggestion: () => void
}>(({
  value,
  onChange,
  onSubmit,
  lists,
  isListView,
  isSearchView,
  isListsOverview,
  currentListId,
  selectedListId,
  onSelectList,
  suggestedList,
  onAcceptSuggestion,
}, ref) => {
  if (isSearchView || isListsOverview) return null

  return (
    <div className="border-b px-4 py-3 md:px-6">
      <div className="surface-card flex flex-wrap items-center gap-2 transition-all focus-within:ring-2 focus-within:ring-primary/20">
        <div className="ml-1 flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Plus className="size-4" />
        </div>
        <Input
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && value.trim()) {
              onSubmit()
            }
          }}
          placeholder="添加任务..."
          className="min-w-0 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
        {/* 列表选择器：非列表视图下可选目标列表；列表视图下显示当前列表名 */}
        {lists.length > 0 && (
          <Select
            value={selectedListId || (isListView ? currentListId! : lists[0]?.id || '')}
            onValueChange={(v) => onSelectList(v)}
          >
            <SelectTrigger className="h-8 w-auto shrink-0 gap-1 rounded-lg border-none bg-muted/50 text-xs">
              <ListTodo className="size-3.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {lists.map((l) => (
                <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {/* AI 列表推荐 */}
        {suggestedList && !isListView && (
          <button
            type="button"
            onClick={onAcceptSuggestion}
            className="mr-1 flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20"
          >
            <Sparkles className="size-3" />
            推荐：{suggestedList.listName}
          </button>
        )}
      </div>
    </div>
  )
})
NewTaskInput.displayName = 'NewTaskInput'
