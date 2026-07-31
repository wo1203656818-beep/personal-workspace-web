import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sun, Moon, Monitor, Plus, CheckSquare, FileText, BookOpen } from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { tasksApi, notesApi, kbApi, type Task, type Note, type KbDocument } from '@/lib/api'

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query || !text) return text?.slice(0, 80) || ''
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const idx = lowerText.indexOf(lowerQuery)
  if (idx === -1) return text.slice(0, 80)
  const start = Math.max(0, idx - 20)
  const end = Math.min(text.length, idx + query.length + 40)
  const snippet =
    (start > 0 ? '...' : '') + text.slice(start, end) + (end < text.length ? '...' : '')
  const parts = snippet.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
  return parts.map((part, i) =>
    part.toLowerCase() === lowerQuery ? (
      <mark key={i} className="rounded bg-yellow-200 px-0.5 dark:bg-yellow-800">
        {part}
      </mark>
    ) : (
      part
    ),
  )
}

export function CommandPaletteDialog({
  open,
  onOpenChange,
  navCommands,
  onSetTheme,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  navCommands: Array<{
    label: string
    href: string
    icon: React.ComponentType<{ className?: string }>
  }>
  onSetTheme: (theme: 'light' | 'dark' | 'system') => void
}) {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<{
    tasks: Task[]
    notes: Note[]
    kb: KbDocument[]
  }>({
    tasks: [],
    notes: [],
    kb: [],
  })

  useEffect(() => {
    const q = searchQuery.trim()
    if (q.length < 2) {
      setSearchResults({ tasks: [], notes: [], kb: [] })
      setSearching(false)
      return
    }
    setSearching(true)
    const timer = setTimeout(() => {
      Promise.allSettled([
        tasksApi.search(q).catch(() => [] as Task[]),
        notesApi.search(q).catch(() => [] as Note[]),
        kbApi.search(q).catch(() => [] as KbDocument[]),
      ]).then(([tasksRes, notesRes, kbRes]) => {
        setSearchResults({
          tasks: tasksRes.status === 'fulfilled' ? tasksRes.value : [],
          notes: notesRes.status === 'fulfilled' ? notesRes.value : [],
          kb: kbRes.status === 'fulfilled' ? kbRes.value : [],
        })
        setSearching(false)
      })
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const runCommand = (fn: () => void) => {
    fn()
    onOpenChange(false)
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) setSearchQuery('')
      }}
      filter={() => 1}
    >
      <CommandInput
        placeholder="输入命令或搜索..."
        value={searchQuery}
        onValueChange={setSearchQuery}
        className="h-11 text-base"
      />
      <CommandList>
        <CommandEmpty>无匹配结果</CommandEmpty>
        <CommandGroup heading="导航">
          {navCommands.map((cmd) => (
            <CommandItem
              key={cmd.href}
              value={cmd.label}
              onSelect={() => runCommand(() => navigate(cmd.href))}
              className="rounded-lg px-2 py-2.5"
            >
              <cmd.icon className="mr-2 size-4" />
              <span className="text-sm">{cmd.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="操作">
          <CommandItem
            value="新建任务"
            onSelect={() => runCommand(() => navigate('/tasks?new=1'))}
            className="rounded-lg px-2 py-2.5"
          >
            <Plus className="mr-2 size-4" />
            <span className="text-sm">新建任务</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="主题">
          <CommandItem
            value="切换到亮色"
            onSelect={() => runCommand(() => onSetTheme('light'))}
            className="rounded-lg px-2 py-2.5"
          >
            <Sun className="mr-2 size-4" />
            <span className="text-sm">亮色模式</span>
          </CommandItem>
          <CommandItem
            value="切换到暗色"
            onSelect={() => runCommand(() => onSetTheme('dark'))}
            className="rounded-lg px-2 py-2.5"
          >
            <Moon className="mr-2 size-4" />
            <span className="text-sm">暗色模式</span>
          </CommandItem>
          <CommandItem
            value="跟随系统"
            onSelect={() => runCommand(() => onSetTheme('system'))}
            className="rounded-lg px-2 py-2.5"
          >
            <Monitor className="mr-2 size-4" />
            <span className="text-sm">跟随系统</span>
          </CommandItem>
        </CommandGroup>

        {searchQuery.trim().length >= 2 && (
          <>
            <CommandSeparator />
            {searching ? (
              <CommandGroup heading="搜索中">
                <CommandItem value="searching" disabled className="rounded-lg px-2 py-2.5">
                  <span className="text-sm text-muted-foreground">正在搜索...</span>
                </CommandItem>
              </CommandGroup>
            ) : (
              <>
                {searchResults.tasks.length > 0 && (
                  <CommandGroup heading={`任务 (${searchResults.tasks.length})`}>
                    {searchResults.tasks.map((task) => (
                      <CommandItem
                        key={task.id}
                        value={task.title}
                        onSelect={() =>
                          runCommand(() =>
                            navigate(`/tasks?selected=${task.id}`),
                          )
                        }
                        className="rounded-lg px-2 py-2.5"
                      >
                        <CheckSquare className="mr-2 size-4 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="line-clamp-1 text-sm font-medium">
                            {highlightMatch(task.title, searchQuery)}
                          </span>
                          {task.note && (
                            <span className="line-clamp-1 text-xs text-muted-foreground">
                              {highlightMatch(task.note, searchQuery)}
                            </span>
                          )}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {searchResults.notes.length > 0 && (
                  <CommandGroup heading={`笔记 (${searchResults.notes.length})`}>
                    {searchResults.notes.map((note) => (
                      <CommandItem
                        key={note.id}
                        value={note.title}
                        onSelect={() => runCommand(() => navigate(`/notes/${note.id}`))}
                        className="rounded-lg px-2 py-2.5"
                      >
                        <FileText className="mr-2 size-4 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="line-clamp-1 text-sm font-medium">
                            {highlightMatch(note.title, searchQuery)}
                          </span>
                          {note.content && (
                            <span className="line-clamp-1 text-xs text-muted-foreground">
                              {highlightMatch(note.content, searchQuery)}
                            </span>
                          )}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {searchResults.kb.length > 0 && (
                  <CommandGroup heading={`知识库 (${searchResults.kb.length})`}>
                    {searchResults.kb.map((doc) => (
                      <CommandItem
                        key={doc.id}
                        value={doc.title}
                        onSelect={() => runCommand(() => navigate(`/knowledge/${doc.id}`))}
                        className="rounded-lg px-2 py-2.5"
                      >
                        <BookOpen className="mr-2 size-4 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="line-clamp-1 text-sm font-medium">
                            {highlightMatch(doc.title, searchQuery)}
                          </span>
                          {doc.content && (
                            <span className="line-clamp-1 text-xs text-muted-foreground">
                              {highlightMatch(doc.content, searchQuery)}
                            </span>
                          )}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {searchResults.tasks.length === 0 &&
                  searchResults.notes.length === 0 &&
                  searchResults.kb.length === 0 && (
                    <CommandGroup heading="搜索结果">
                      <CommandItem value="no-results" disabled className="rounded-lg px-2 py-2.5">
                        <span className="text-sm text-muted-foreground">未找到匹配结果</span>
                      </CommandItem>
                    </CommandGroup>
                  )}
              </>
            )}
          </>
        )}
      </CommandList>
    </CommandDialog>
  )
}
