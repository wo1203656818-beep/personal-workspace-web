import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { tagsApi, type Tag } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

const COLOR_PALETTE = [
  { name: 'blue', value: '#3b82f6' },
  { name: 'green', value: '#22c55e' },
  { name: 'red', value: '#ef4444' },
  { name: 'yellow', value: '#eab308' },
  { name: 'purple', value: '#a855f7' },
  { name: 'orange', value: '#f97316' },
  { name: 'pink', value: '#ec4899' },
  { name: 'gray', value: '#6b7280' },
]

export function TagManager() {
  const queryClient = useQueryClient()
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(COLOR_PALETTE[0].value)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')

  const { data: tags = [], isLoading } = useQuery({
    queryKey: ['tags'],
    queryFn: tagsApi.list,
  })

  const createMutation = useMutation({
    mutationFn: tagsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
      setNewName('')
      setNewColor(COLOR_PALETTE[0].value)
      toast.success('标签已创建')
    },
    onError: (err: Error) => toast.error(`创建失败: ${err.message}`),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; color?: string } }) =>
      tagsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
      setEditingId(null)
      toast.success('标签已更新')
    },
    onError: (err: Error) => toast.error(`更新失败: ${err.message}`),
  })

  const deleteMutation = useMutation({
    mutationFn: tagsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
      toast.success('标签已删除')
    },
    onError: (err: Error) => toast.error(`删除失败: ${err.message}`),
  })

  const handleCreate = () => {
    if (!newName.trim()) {
      toast.error('标签名不能为空')
      return
    }
    createMutation.mutate({ name: newName.trim(), color: newColor })
  }

  const startEdit = (tag: Tag) => {
    setEditingId(tag.id)
    setEditName(tag.name)
    setEditColor(tag.color)
  }

  const handleUpdate = () => {
    if (!editingId || !editName.trim()) return
    updateMutation.mutate({ id: editingId, data: { name: editName.trim(), color: editColor } })
  }

  if (isLoading) {
    return <div className="text-sm text-muted-foreground py-4">加载中...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <div key={tag.id} className="group flex items-center gap-1">
            {editingId === tag.id ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-7 w-24 text-xs"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleUpdate()}
                />
                <div className="flex gap-0.5">
                  {COLOR_PALETTE.map((c) => (
                    <button
                      key={c.value}
                      className={`size-4 rounded-full border-2 transition-all ${
                        editColor === c.value ? 'border-foreground scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c.value }}
                      onClick={() => setEditColor(c.value)}
                    />
                  ))}
                </div>
                <Button size="icon" variant="ghost" className="size-6" onClick={handleUpdate}>
                  <Check className="size-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6"
                  onClick={() => setEditingId(null)}
                >
                  <X className="size-3" />
                </Button>
              </div>
            ) : (
              <>
                <Badge
                  variant="secondary"
                  className="gap-1 px-2.5 py-1 text-xs font-medium"
                  style={{
                    backgroundColor: tag.color + '20',
                    color: tag.color,
                    border: `1px solid ${tag.color}40`,
                  }}
                >
                  <span className="size-2 rounded-full" style={{ backgroundColor: tag.color }} />
                  {tag.name}
                </Badge>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-5 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                  onClick={() => startEdit(tag)}
                >
                  <Pencil className="size-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-5 text-destructive md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                  onClick={() => {
                    if (confirm(`确定删除标签「${tag.name}」？`)) {
                      deleteMutation.mutate(tag.id)
                    }
                  }}
                >
                  <Trash2 className="size-3" />
                </Button>
              </>
            )}
          </div>
        ))}
        {tags.length === 0 && <p className="text-sm text-muted-foreground">暂无标签，创建一个吧</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="新标签名"
          className="h-8 min-w-0 flex-1 text-sm"
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
        />
        <div className="flex gap-1">
          {COLOR_PALETTE.map((c) => (
            <button
              key={c.value}
              className={`size-5 rounded-full border-2 transition-all ${
                newColor === c.value ? 'border-foreground scale-110' : 'border-transparent'
              }`}
              style={{ backgroundColor: c.value }}
              onClick={() => setNewColor(c.value)}
            />
          ))}
        </div>
        <Button size="sm" className="gap-1" onClick={handleCreate} disabled={!newName.trim()}>
          <Plus className="size-3.5" />
          添加
        </Button>
      </div>
    </div>
  )
}
