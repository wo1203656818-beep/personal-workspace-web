import React from 'react'
import { Plus, X, CheckSquare, ChevronUp, ChevronDown } from 'lucide-react'
import { type Subtask } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import type { UseMutationResult } from '@tanstack/react-query'

export function TaskSubtasks({
  sortedSubtasks,
  newSubtask,
  onNewSubtaskChange,
  insertAtPosition,
  onInsertAtPositionChange,
  addSubtaskMutation,
  toggleSubtaskMutation,
  deleteSubtaskMutation,
  reorderSubtaskMutation,
}: {
  sortedSubtasks: Subtask[]
  newSubtask: string
  onNewSubtaskChange: (v: string) => void
  insertAtPosition: number | null
  onInsertAtPositionChange: (v: number | null) => void
  addSubtaskMutation: UseMutationResult<
    Subtask,
    Error,
    { title: string; sortOrder?: number },
    unknown
  >
  toggleSubtaskMutation: UseMutationResult<Subtask, Error, string, unknown>
  deleteSubtaskMutation: UseMutationResult<unknown, Error, string, unknown>
  reorderSubtaskMutation: UseMutationResult<
    unknown,
    Error,
    { id: string; sortOrder: number }[],
    unknown
  >
}) {
  return (
    <div className="space-y-3 rounded-xl bg-muted/30 p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <CheckSquare className="size-4" /> 子任务
      </div>
      <div className="space-y-0.5">
        {sortedSubtasks.map((st: Subtask, idx: number) => (
          <React.Fragment key={st.id}>
            <div className="flex justify-center">
              {insertAtPosition === st.sortOrder + 0.5 ? (
                <div className="flex w-full items-center gap-2 px-2 py-1">
                  <Plus className="size-3 text-primary shrink-0" />
                  <Input
                    value={newSubtask}
                    onChange={(e) => onNewSubtaskChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newSubtask.trim()) {
                        addSubtaskMutation.mutate({
                          title: newSubtask.trim(),
                          sortOrder: st.sortOrder + 0.5,
                        })
                      }
                      if (e.key === 'Escape') {
                        onInsertAtPositionChange(null)
                        onNewSubtaskChange('')
                      }
                    }}
                    onBlur={() => {
                      onInsertAtPositionChange(null)
                      onNewSubtaskChange('')
                    }}
                    placeholder="输入子步骤..."
                    className="h-7 text-xs border-0 bg-background/60 rounded px-2 focus-visible:ring-1"
                    autoFocus
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    onInsertAtPositionChange(st.sortOrder + 0.5)
                    onNewSubtaskChange('')
                  }}
                  className="flex items-center justify-center w-full rounded py-0.5 text-muted-foreground/30 hover:text-primary hover:bg-primary/5 transition-colors"
                  title="在此处插入子步骤"
                >
                  <Plus className="size-3" />
                </button>
              )}
            </div>
            <div className="group flex items-center gap-1.5 rounded-lg px-2 py-1.5 hover:bg-accent">
              <div className="flex flex-col items-center gap-0">
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() => {
                    const orders = sortedSubtasks.map((s, i) => ({
                      id: s.id,
                      sortOrder: i === idx ? idx - 1 : i === idx - 1 ? idx : (s.sortOrder ?? i),
                    }))
                    reorderSubtaskMutation.mutate(orders)
                  }}
                  className="size-3.5 flex items-center justify-center text-muted-foreground/30 hover:text-foreground disabled:opacity-0"
                >
                  <ChevronUp className="size-3" />
                </button>
                <button
                  type="button"
                  disabled={idx === sortedSubtasks.length - 1}
                  onClick={() => {
                    const orders = sortedSubtasks.map((s, i) => ({
                      id: s.id,
                      sortOrder: i === idx ? idx + 1 : i === idx + 1 ? idx : (s.sortOrder ?? i),
                    }))
                    reorderSubtaskMutation.mutate(orders)
                  }}
                  className="size-3.5 flex items-center justify-center text-muted-foreground/30 hover:text-foreground disabled:opacity-0"
                >
                  <ChevronDown className="size-3" />
                </button>
              </div>
              <Checkbox
                checked={st.isCompleted}
                onCheckedChange={() => toggleSubtaskMutation.mutate(st.id)}
                disabled={toggleSubtaskMutation.isPending}
              />
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-sm',
                  st.isCompleted && 'line-through text-muted-foreground',
                )}
              >
                {st.title}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 md:opacity-0 md:group-hover:opacity-100 shrink-0"
                onClick={() => deleteSubtaskMutation.mutate(st.id)}
              >
                <X className="size-3" />
              </Button>
            </div>
          </React.Fragment>
        ))}
        {sortedSubtasks.length === 0 && (
          <p className="px-2 py-1 text-xs text-muted-foreground">
            暂无子任务，点击 AI 拆解可自动生成
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 pt-1">
        <Plus className="size-4 text-muted-foreground shrink-0" />
        <Input
          value={newSubtask}
          onChange={(e) => onNewSubtaskChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newSubtask.trim()) {
              if (insertAtPosition !== null) {
                addSubtaskMutation.mutate({ title: newSubtask.trim(), sortOrder: insertAtPosition })
              } else {
                addSubtaskMutation.mutate({ title: newSubtask.trim() })
              }
            }
          }}
          placeholder="添加子步骤..."
          className="h-8 border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
      </div>
    </div>
  )
}
