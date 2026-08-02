import { useState, useMemo } from 'react'
import { Square, Trash2, Pin, Tag, X, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import type { ChatSessionPreview } from '@/lib/api'
import { cn } from '@/lib/utils'

export function ChatHistorySidebar({
  sessions,
  onClose,
  onOpen,
  onRemove,
  onTogglePin,
  onSaveTags,
}: {
  sessions: ChatSessionPreview[]
  onClose: () => void
  onOpen: (id: string) => void
  onRemove: (id: string, e: React.MouseEvent) => void
  onTogglePin: (s: ChatSessionPreview) => void
  onSaveTags: (s: ChatSessionPreview, tags: string[]) => void
}) {
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false)
  const [editingTagSession, setEditingTagSession] = useState<ChatSessionPreview | null>(null)
  const [tagInput, setTagInput] = useState('')
  const [search, setSearch] = useState('')

  const filtered = useMemo(
    () => sessions.filter((s) => !search || s.title?.toLowerCase().includes(search.toLowerCase())),
    [sessions, search],
  )

  const openTagPopover = (s: ChatSessionPreview) => {
    setEditingTagSession(s)
    setTagInput('')
    setTagPopoverOpen(true)
  }

  const addTagFromInput = () => {
    if (!editingTagSession) return
    const t = tagInput.trim()
    if (!t) return
    const current = editingTagSession.tags || []
    if (current.length >= 10 || current.includes(t)) {
      setTagInput('')
      return
    }
    const next = [...current, t]
    onSaveTags(editingTagSession, next)
    setEditingTagSession((s) => (s ? { ...s, tags: next } : s))
    setTagInput('')
  }

  const removeTagAt = (idx: number) => {
    if (!editingTagSession) return
    const next = (editingTagSession.tags || []).filter((_, i) => i !== idx)
    onSaveTags(editingTagSession, next)
    setEditingTagSession((s) => (s ? { ...s, tags: next } : s))
  }

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-[#0a0a0a]">
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <span className="text-sm font-medium text-white/90">聊天历史</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-white/60 hover:text-white"
          onClick={onClose}
        >
          <Square className="size-3.5" />
        </Button>
      </div>
      <div className="px-3 py-2">
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 focus-within:border-white/20 focus-within:bg-white/[0.07]">
          <Search className="size-3.5 text-white/40" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索会话标题..."
            className="flex-1 bg-transparent text-base text-white placeholder:text-white/30 focus-visible:outline-none sm:text-[13px]"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="text-white/40 hover:text-white"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto p-2">
        {filtered.length === 0 && (
          <p className="px-2 py-6 text-center text-[13px] text-white/30">
            {search ? '没有匹配的会话' : '还没有历史会话'}
          </p>
        )}
        {filtered.map((s) => (
          <div
            key={s.id}
            className="group flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 transition-colors hover:bg-white/5"
          >
            <button
              type="button"
              onClick={() => onTogglePin(s)}
              className="shrink-0"
              title={s.pinned ? '取消固定' : '固定到顶部'}
            >
              <Pin
                className={cn('size-3.5', s.pinned ? 'fill-primary text-primary' : 'text-white/30')}
              />
            </button>
            <button type="button" onClick={() => onOpen(s.id)} className="min-w-0 flex-1 text-left">
              <div className="truncate text-[13px] font-medium text-white/80">{s.title}</div>
              {s.tags && s.tags.length > 0 && (
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {s.tags.map((t) => (
                    <Badge
                      key={t}
                      variant="secondary"
                      className="rounded-full bg-primary/10 px-1.5 py-0 text-[10px] text-primary/70"
                    >
                      {t}
                    </Badge>
                  ))}
                </div>
              )}
              <div className="truncate text-[11px] text-white/30">{s.preview || '（空）'}</div>
            </button>
            <Popover
              open={tagPopoverOpen && editingTagSession?.id === s.id}
              onOpenChange={(v) => {
                if (!v) setTagPopoverOpen(false)
              }}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    openTagPopover(s)
                  }}
                  className="shrink-0 text-white/30 opacity-100 transition-opacity group-hover:opacity-100 md:opacity-0"
                  title="编辑标签"
                >
                  <Tag className="size-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                side="right"
                className="w-64 border-white/10 bg-[#1a1a1a] p-3"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="mb-2 text-xs font-medium text-white/70">编辑标签</p>
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {(editingTagSession?.tags || []).length === 0 && (
                    <span className="text-[11px] text-white/30">暂无标签</span>
                  )}
                  {(editingTagSession?.tags || []).map((t, idx) => (
                    <Badge
                      key={idx}
                      variant="secondary"
                      className="flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] text-primary"
                    >
                      {t}
                      <button
                        type="button"
                        onClick={() => removeTagAt(idx)}
                        className="ml-0.5 text-primary/60 hover:text-primary"
                      >
                        <X className="size-2.5" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="mb-2 flex gap-1.5">
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addTagFromInput()
                      }
                    }}
                    placeholder="输入标签，回车添加"
                    className="h-9 rounded-lg border-white/10 bg-white/5 text-base text-white placeholder:text-white/30 sm:h-7 sm:text-xs"
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 shrink-0 rounded-lg px-2 text-xs"
                    onClick={addTagFromInput}
                    disabled={!tagInput.trim()}
                  >
                    添加
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {['工作', '学习', '闲聊', '重要'].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        const cur = editingTagSession?.tags || []
                        if (cur.length < 10 && !cur.includes(p) && editingTagSession)
                          onSaveTags(editingTagSession, [...cur, p])
                      }}
                      className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-white/40 hover:border-white/20 hover:text-white/60"
                    >
                      + {p}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <button
              type="button"
              className="shrink-0 text-white/30 opacity-100 transition-opacity hover:text-white/60 md:opacity-0 md:group-hover:opacity-100"
              onClick={(e) => onRemove(s.id, e)}
              aria-label="删除会话"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
