import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Tags, Plus, X } from 'lucide-react'
import { tagsApi, type Tag } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'

const QUICK_COLORS = [
  '#3b82f6',
  '#22c55e',
  '#ef4444',
  '#eab308',
  '#a855f7',
  '#f97316',
  '#ec4899',
  '#6b7280',
]

export function TagAssignment({ targetType, targetId }: { targetType: string; targetId: string }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(QUICK_COLORS[0])

  const { data: allTags = [] } = useQuery({
    queryKey: ['tags'],
    queryFn: tagsApi.list,
  })

  const { data: assignedTags = [] } = useQuery({
    queryKey: ['tags', targetType, targetId],
    queryFn: () => tagsApi.of(targetType, targetId),
    enabled: !!targetType && !!targetId,
  })

  const assignMutation = useMutation({
    mutationFn: tagsApi.assign,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags', targetType, targetId] })
    },
    onError: (err: Error) => toast.error(`分配失败: ${err.message}`),
  })

  const unassignMutation = useMutation({
    mutationFn: tagsApi.unassign,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags', targetType, targetId] })
    },
    onError: (err: Error) => toast.error(`移除失败: ${err.message}`),
  })

  const createMutation = useMutation({
    mutationFn: tagsApi.create,
    onSuccess: (tag) => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
      assignMutation.mutate({ tagId: tag.id, targetType, targetId })
      setCreating(false)
      setNewName('')
      setNewColor(QUICK_COLORS[0])
    },
    onError: (err: Error) => toast.error(`创建失败: ${err.message}`),
  })

  const assignedIds = new Set(assignedTags.map((t) => t.id))

  const toggleTag = (tag: Tag) => {
    if (assignedIds.has(tag.id)) {
      unassignMutation.mutate({ tagId: tag.id, targetType, targetId })
    } else {
      assignMutation.mutate({ tagId: tag.id, targetType, targetId })
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Tags className="size-4" /> 标签
      </div>
      <div className="flex flex-wrap gap-1.5">
        {assignedTags.map((tag) => (
          <Badge
            key={tag.id}
            variant="secondary"
            className="gap-1 px-2 py-0.5 text-xs"
            style={{
              backgroundColor: tag.color + '20',
              color: tag.color,
              border: `1px solid ${tag.color}40`,
            }}
          >
            <span className="size-1.5 rounded-full" style={{ backgroundColor: tag.color }} />
            {tag.name}
            <button
              className="ml-0.5 rounded-full hover:bg-black/10 p-0.5"
              onClick={() => unassignMutation.mutate({ tagId: tag.id, targetType, targetId })}
            >
              <X className="size-2.5" />
            </button>
          </Badge>
        ))}
        {assignedTags.length === 0 && <span className="text-xs text-muted-foreground">无标签</span>}
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1 text-xs h-7">
            <Plus className="size-3" />
            管理标签
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3" align="start">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">选择标签</p>
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {allTags.map((tag) => (
                <label
                  key={tag.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-accent"
                >
                  <Checkbox
                    checked={assignedIds.has(tag.id)}
                    onCheckedChange={() => toggleTag(tag)}
                  />
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: tag.color }} />
                  <span className="flex-1">{tag.name}</span>
                </label>
              ))}
              {allTags.length === 0 && (
                <p className="text-xs text-muted-foreground py-2">暂无标签</p>
              )}
            </div>

            <div className="border-t pt-2">
              {!creating ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full gap-1 text-xs h-7"
                  onClick={() => setCreating(true)}
                >
                  <Plus className="size-3" />
                  新建标签
                </Button>
              ) : (
                <div className="space-y-2">
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="标签名"
                    className="h-7 text-xs"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newName.trim()) {
                        createMutation.mutate({ name: newName.trim(), color: newColor })
                      }
                    }}
                  />
                  <div className="flex gap-1">
                    {QUICK_COLORS.map((c) => (
                      <button
                        key={c}
                        className={`size-4 rounded-full border-2 transition-all ${
                          newColor === c ? 'border-foreground scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: c }}
                        onClick={() => setNewColor(c)}
                      />
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      className="h-6 flex-1 text-xs"
                      disabled={!newName.trim()}
                      onClick={() =>
                        createMutation.mutate({ name: newName.trim(), color: newColor })
                      }
                    >
                      创建
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-xs"
                      onClick={() => setCreating(false)}
                    >
                      取消
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
