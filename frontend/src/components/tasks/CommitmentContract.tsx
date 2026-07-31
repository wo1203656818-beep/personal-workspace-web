import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Calendar, AlertTriangle } from 'lucide-react'

interface CommitmentContractProps {
  commitmentDeadline?: string | null
  status?: string
  onUpdate: (data: { commitmentDeadline: string | null }) => void
}

export function CommitmentContract({
  commitmentDeadline,
  status,
  onUpdate,
}: CommitmentContractProps) {
  const [editing, setEditing] = useState(false)
  const [deadline, setDeadline] = useState(commitmentDeadline || '')

  const isOverdue = commitmentDeadline && new Date(commitmentDeadline) < new Date()
  const isActive = status === 'committed' || status === 'in_progress'

  const handleSave = () => {
    onUpdate({ commitmentDeadline: deadline || null })
    setEditing(false)
  }

  if (!isActive && !commitmentDeadline) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 text-xs"
        onClick={() => setEditing(true)}
      >
        <Calendar className="size-3" />
        设置承诺截止时间
      </Button>
    )
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <Input
          type="datetime-local"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          className="h-8 text-xs"
        />
        <Button size="sm" onClick={handleSave}>
          保存
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
          取消
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      {isOverdue ? (
        <Badge variant="destructive" className="gap-1 text-xs">
          <AlertTriangle className="size-3" />
          承诺已过期
        </Badge>
      ) : (
        <Badge variant="secondary" className="gap-1 text-xs">
          <Calendar className="size-3" />
          承诺截止:{' '}
          {new Date(commitmentDeadline!).toLocaleString('zh-CN', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Badge>
      )}
      <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setEditing(true)}>
        修改
      </Button>
    </div>
  )
}
