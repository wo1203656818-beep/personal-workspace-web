import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BookOpen, Plus, Loader2, Trash2, Pencil, ExternalLink, Star,
  Film, Tv, Gamepad2, Bookmark as BookmarkIcon, Link2, MessageSquare, Search, X,
  Clipboard, ArrowUpDown, Copy, BookMarked, Archive, TrendingUp, Minus,
} from 'lucide-react'
import { toast } from 'sonner'
import { collectionsApi, type MediaItem, type Bookmark } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { EmptyState } from '@/components/EmptyState'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { usePageTitle } from '@/hooks/use-page-title'

const KIND_ICONS: Record<string, React.ElementType> = {
  book: BookOpen, movie: Film, tv: Tv, game: Gamepad2,
}
const KIND_LABELS: Record<string, string> = {
  book: '书籍', movie: '电影', tv: '剧集', game: '游戏',
}
const STATUS_LABELS: Record<string, string> = {
  want: '想读/看', doing: '在读/看', done: '已读/看',
}

export function CollectionsPage() {
  usePageTitle('收藏')
  const queryClient = useQueryClient()
  const [tab, setTab] = useState('media')
  const [mediaKind, setMediaKind] = useState('all')
  const [mediaSearch, setMediaSearch] = useState('')
  const [bmSearch, setBmSearch] = useState('')

  // 媒体弹窗
  const [mediaOpen, setMediaOpen] = useState(false)
  const [editMedia, setEditMedia] = useState<MediaItem | null>(null)
  const [deleteMedia, setDeleteMedia] = useState<MediaItem | null>(null)
  const [mTitle, setMTitle] = useState('')
  const [mKind, setMKind] = useState('book')
  const [mAuthor, setMAuthor] = useState('')
  const [mStatus, setMStatus] = useState('want')
  const [mRating, setMRating] = useState('')
  const [mNote, setMNote] = useState('')

  // 链接弹窗
  const [bmOpen, setBmOpen] = useState(false)
  const [editBm, setEditBm] = useState<Bookmark | null>(null)
  const [deleteBm, setDeleteBm] = useState<Bookmark | null>(null)
  const [bmUrl, setBmUrl] = useState('')
  const [bmTitle, setBmTitle] = useState('')
  const [bmSummary, setBmSummary] = useState('')

  // 书签筛选
  const [bookmarkStatus, setBookmarkStatus] = useState('all')
  const [bookmarkTag, setBookmarkTag] = useState('')

  // 排序
  const [mediaStatus, setMediaStatus] = useState('all')
  const [mediaSort, setMediaSort] = useState('createdAt')
  const [urlValid, setUrlValid] = useState<boolean | null>(null)

  // 阅读笔记
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteTarget, setNoteTarget] = useState<Bookmark | null>(null)
  const [noteText, setNoteText] = useState('')

  // ──────── 媒体数据 ────────
  const { data: mediaItems, isLoading: mediaLoading } = useQuery({
    queryKey: ['media', mediaKind, mediaStatus],
    queryFn: () => {
      const params: { kind?: string; status?: string } = {}
      if (mediaKind !== 'all') params.kind = mediaKind
      if (mediaStatus !== 'all') params.status = mediaStatus
      return collectionsApi.media.list(Object.keys(params).length > 0 ? params : undefined)
    },
  })

  // ──────── 链接数据 ────────
  const { data: bookmarks, isLoading: bmLoading } = useQuery({
    queryKey: ['bookmarks', bookmarkStatus],
    queryFn: () => collectionsApi.bookmarks.list(bookmarkStatus === 'all' ? undefined : bookmarkStatus),
  })

  // ──────── 媒体 CRUD ────────
  const saveMediaMutation = useMutation({
    mutationFn: () => {
      const data = { kind: mKind, title: mTitle, author: mAuthor || undefined, status: mStatus, rating: mRating ? parseInt(mRating) : undefined, note: mNote || undefined }
      return editMedia ? collectionsApi.media.update(editMedia.id, data as any) : collectionsApi.media.create(data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['media'] })
      toast.success(editMedia ? '已更新' : '已创建')
      closeMediaForm()
    },
    onError: (err: Error) => toast.error(`保存失败: ${err.message}`),
  })

  const deleteMediaMutation = useMutation({
    mutationFn: (id: string) => collectionsApi.media.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['media'] })
      toast.success('已删除')
      setDeleteMedia(null)
    },
    onError: (err: Error) => toast.error(`删除失败: ${err.message}`),
  })

  // ──────── 链接 CRUD ────────
  const saveBmMutation = useMutation({
    mutationFn: () => {
      const data = { url: bmUrl, title: bmTitle || undefined, summary: bmSummary || undefined }
      return editBm
        ? collectionsApi.bookmarks.update(editBm.id, data as any)
        : collectionsApi.bookmarks.create(data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] })
      toast.success(editBm ? '已更新' : '链接已收藏')
      closeBmForm()
    },
    onError: (err: Error) => toast.error(`保存失败: ${err.message}`),
  })

  const deleteBmMutation = useMutation({
    mutationFn: (id: string) => collectionsApi.bookmarks.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] })
      toast.success('链接已删除')
      setDeleteBm(null)
    },
    onError: (err: Error) => toast.error(`删除失败: ${err.message}`),
  })

  const updateBmMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { readStatus?: string; progress?: number; readingNote?: string } }) =>
      collectionsApi.bookmarks.update(id, data as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] })
    },
    onError: (err: Error) => toast.error(`更新失败: ${err.message}`),
  })

  const toggleReadStatus = (b: Bookmark) => {
    const nextStatus = b.readStatus === 'unread' ? 'read' : b.readStatus === 'read' ? 'archived' : 'unread'
    updateBmMutation.mutate({ id: b.id, data: { readStatus: nextStatus } })
  }

  const closeMediaForm = () => {
    setMediaOpen(false)
    setEditMedia(null)
    setMTitle('')
    setMKind('book')
    setMAuthor('')
    setMStatus('want')
    setMRating('')
    setMNote('')
  }

  const openEditMedia = (m: MediaItem) => {
    setEditMedia(m)
    setMTitle(m.title)
    setMKind(m.kind)
    setMAuthor(m.author ?? '')
    setMStatus(m.status)
    setMRating(m.rating?.toString() ?? '')
    setMNote(m.note ?? '')
    setMediaOpen(true)
  }

  const closeBmForm = () => {
    setBmOpen(false)
    setEditBm(null)
    setBmUrl('')
    setBmTitle('')
    setBmSummary('')
    setUrlValid(null)
  }

  const openEditBm = (b: Bookmark) => {
    setEditBm(b)
    setBmUrl(b.url)
    setBmTitle(b.title ?? '')
    setBmSummary(b.summary ?? '')
    setUrlValid(null)
    setBmOpen(true)
  }

  // 统计
  const mediaCounts = useMemo(() => {
    if (!mediaItems) return { total: 0, want: 0, doing: 0, done: 0 }
    return {
      total: mediaItems.length,
      want: mediaItems.filter((m) => m.status === 'want').length,
      doing: mediaItems.filter((m) => m.status === 'doing').length,
      done: mediaItems.filter((m) => m.status === 'done').length,
    }
  }, [mediaItems])

  const unreadCount = bookmarks?.filter((b) => b.readStatus === 'unread').length ?? 0

  const bookmarkStats = useMemo(() => {
    if (!bookmarks) return { total: 0, read: 0, archived: 0, avgProgress: 0 }
    const total = bookmarks.length
    const read = bookmarks.filter((b) => b.readStatus === 'read').length
    const archived = bookmarks.filter((b) => b.readStatus === 'archived').length
    const withProgress = bookmarks.filter((b) => b.progress != null && b.progress > 0)
    const avgProgress = withProgress.length > 0
      ? Math.round(withProgress.reduce((sum, b) => sum + (b.progress ?? 0), 0) / withProgress.length)
      : 0
    return { total, read, archived, avgProgress }
  }, [bookmarks])

  const bookmarkTags = useMemo(() => {
    if (!bookmarks) return []
    const set = new Set<string>()
    bookmarks.forEach((b) => {
      if (b.tags) {
        try { JSON.parse(b.tags).forEach((t: string) => set.add(t)) } catch { /* ignore */ }
      }
    })
    return [...set].sort()
  }, [bookmarks])

  // 键盘快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault()
        if (tab === 'bookmarks') {
          setBmOpen(true)
        } else {
          setEditMedia(null)
          setMediaOpen(true)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [tab])

  // Filtered data
  const filteredMedia = useMemo(() => {
    if (!mediaItems) return []
    let result = [...mediaItems]
    if (mediaSearch.trim()) {
      const q = mediaSearch.toLowerCase()
      result = result.filter(m =>
        m.title.toLowerCase().includes(q) ||
        (m.author && m.author.toLowerCase().includes(q)) ||
        (m.note && m.note.toLowerCase().includes(q))
      )
    }
    // 排序
    result.sort((a, b) => {
      switch (mediaSort) {
        case 'title': return a.title.localeCompare(b.title)
        case 'rating': return (b.rating ?? 0) - (a.rating ?? 0)
        case 'createdAt': default: return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      }
    })
    return result
  }, [mediaItems, mediaSearch, mediaSort])

  const filteredBookmarks = useMemo(() => {
    if (!bookmarks) return []
    const q = bmSearch.trim().toLowerCase()
    return bookmarks.filter(b =>
      (!bookmarkTag || (b.tags && JSON.parse(b.tags).includes(bookmarkTag))) &&
      (!q ||
        (b.title && b.title.toLowerCase().includes(q)) ||
        b.url.toLowerCase().includes(q) ||
        (b.summary && b.summary.toLowerCase().includes(q)))
    )
  }, [bookmarks, bmSearch, bookmarkTag])

  return (
    <div className="page-layout">
      <div className="page-header">
        <div className="page-header-left">
          <div className="icon-badge size-9 bg-gradient-to-br from-teal-500 to-emerald-500 md:size-10">
            <BookmarkIcon className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight sm:text-xl md:text-2xl">收藏</h1>
            <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">书单/影单与链接剪藏</p>
          </div>
        </div>
        <div className="page-header-right">
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 rounded-lg sm:h-9"
            onClick={async () => {
              try {
                const text = await navigator.clipboard.readText()
                if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
                  setBmUrl(text)
                  setBmTitle('')
                  setBmSummary('')
                  setTab('bookmarks')
                  setBmOpen(true)
                } else {
                  toast.error('剪贴板中没有有效的链接')
                }
              } catch {
                toast.error('无法读取剪贴板')
              }
            }}
          >
            <Clipboard className="size-3.5 sm:size-4" />快速收藏
          </Button>
        </div>
      </div>

      <div className="page-content-wide">
        <ScrollArea className="flex-1">
          <div className="space-y-6 p-4 md:p-6">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="w-full justify-start gap-1 overflow-x-auto">
              <TabsTrigger value="media" className="gap-1.5">
                <BookOpen className="size-4" />书影清单
              </TabsTrigger>
              <TabsTrigger value="bookmarks" className="gap-1.5">
                <Link2 className="size-4" />链接剪藏
                {unreadCount > 0 && (
                  <Badge variant="secondary" className="ml-1 rounded-full px-1.5 py-0 text-[10px]">{unreadCount}</Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="media" className="mt-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={mediaKind} onValueChange={setMediaKind}>
                    <SelectTrigger className="h-8 w-28 rounded-lg text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部</SelectItem>
                      <SelectItem value="book">书籍</SelectItem>
                      <SelectItem value="movie">电影</SelectItem>
                      <SelectItem value="tv">剧集</SelectItem>
                      <SelectItem value="game">游戏</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground">
                    {mediaCounts.want}/{mediaCounts.doing}/{mediaCounts.done}
                  </span>
                  <div className="flex flex-wrap items-center gap-1">
                    {['all', 'want', 'doing', 'done'].map((s) => (
                      <Button
                        key={s}
                        variant={mediaStatus === s ? 'default' : 'outline'}
                        size="sm"
                        className="h-7 rounded-lg px-2.5 text-xs"
                        onClick={() => setMediaStatus(s)}
                      >
                        {s === 'all' ? '全部' : STATUS_LABELS[s]}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={mediaSort} onValueChange={setMediaSort}>
                    <SelectTrigger className="h-8 w-24 rounded-lg text-xs">
                      <ArrowUpDown className="mr-1 size-3" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="createdAt">最新</SelectItem>
                      <SelectItem value="title">标题</SelectItem>
                      <SelectItem value="rating">评分</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="sm" onClick={() => { setEditMedia(null); setMediaOpen(true) }} className="gap-1 rounded-lg">
                    <Plus className="size-4" />添加
                  </Button>
                </div>
              </div>

              {mediaItems && mediaItems.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  {(['book', 'movie', 'tv', 'game'] as const).map((k) => {
                    const count = mediaItems.filter(m => m.kind === k).length
                    const Icon = KIND_ICONS[k]
                    return count > 0 && (
                      <Badge key={k} variant="secondary" className="gap-1 rounded-full px-2.5 py-0.5 text-[10px]">
                        <Icon className="size-3" />
                        {KIND_LABELS[k]} {count}
                      </Badge>
                    )
                  })}
                </div>
              )}

              {mediaItems && mediaItems.length > 0 && (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={mediaSearch}
                    onChange={(e) => setMediaSearch(e.target.value)}
                    placeholder="搜索标题、作者或备注..."
                    className="h-8 rounded-lg pl-9 pr-9 text-xs"
                  />
                  {mediaSearch && (
                    <button onClick={() => setMediaSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X className="size-4" />
                    </button>
                  )}
                </div>
              )}

              {mediaLoading ? (
                <div className="empty-state py-16"><Loader2 className="size-8 animate-spin text-primary" /></div>
              ) : !mediaItems || mediaItems.length === 0 ? (
                <EmptyState icon={BookOpen} title="还没有收藏" description="添加你想看的书、电影或剧集"
                  action={<Button size="sm" onClick={() => setMediaOpen(true)} className="gap-1 rounded-lg"><Plus className="size-4" />添加第一个</Button>}
                />
              ) : filteredMedia.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-center">
                  <Search className="mb-2 size-8 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">未找到匹配的条目</p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredMedia.map((m) => {
                    const KindIcon = KIND_ICONS[m.kind] ?? BookOpen
                    return (
                      <Card key={m.id} className="group overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-md">
                        <CardContent className="relative p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                                <KindIcon className="size-4 text-primary" />
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold">{m.title}</p>
                                <p className="text-xs text-muted-foreground">
                                  {KIND_LABELS[m.kind] ?? m.kind}
                                  {m.author && ` · ${m.author}`}
                                </p>
                              </div>
                            </div>
                            <div className="flex gap-1 md:opacity-0 md:transition-opacity md:group-hover:opacity-100">
                              <Button variant="ghost" size="icon" className="size-7 rounded-md" onClick={() => openEditMedia(m)}>
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="size-7 rounded-md text-destructive" onClick={() => setDeleteMedia(m)}>
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <Badge variant="secondary" className="rounded-full px-2 py-0 text-[10px]">
                              {STATUS_LABELS[m.status] ?? m.status}
                            </Badge>
                            {m.rating && (
                              <div className="flex items-center gap-0.5">
                                {Array.from({ length: m.rating }).map((_, i) => (
                                  <Star key={i} className="size-3 fill-amber-400 text-amber-400" />
                                ))}
                              </div>
                            )}
                          </div>
                          {m.note && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{m.note}</p>}
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="bookmarks" className="mt-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex flex-wrap gap-1">
                    {['all', 'unread', 'read', 'archived'].map((s) => (
                      <Button
                        key={s}
                        variant={bookmarkStatus === s ? 'default' : 'outline'}
                        size="sm"
                        className="h-7 rounded-lg px-2.5 text-xs"
                        onClick={() => setBookmarkStatus(s)}
                      >
                        {s === 'all' ? '全部' : s === 'unread' ? '未读' : s === 'read' ? '已读' : '归档'}
                      </Button>
                    ))}
                  </div>
                  {bookmarkTags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {bookmarkTag && (
                        <Button variant="ghost" size="sm" className="h-7 rounded-lg px-2.5 text-xs" onClick={() => setBookmarkTag('')}>
                          <X className="size-3" />清除
                        </Button>
                      )}
                      {bookmarkTags.map((t) => (
                        <Button
                          key={t}
                          variant={bookmarkTag === t ? 'default' : 'outline'}
                          size="sm"
                          className="h-7 rounded-full px-2.5 text-xs"
                          onClick={() => setBookmarkTag(bookmarkTag === t ? '' : t)}
                        >
                          #{t}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
                <Button size="sm" onClick={() => setBmOpen(true)} className="gap-1 rounded-lg">
                  <Plus className="size-4" />收藏链接
                </Button>
              </div>

              {/* Reading stats */}
              {bookmarks && bookmarks.length > 0 && bookmarkStatus === 'all' && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-xl border bg-card p-3">
                    <div className="flex items-center gap-2">
                      <div className="flex size-8 items-center justify-center rounded-lg bg-blue-500/10">
                        <BookMarked className="size-4 text-blue-500" />
                      </div>
                      <div>
                        <p className="text-lg font-bold">{bookmarkStats.total}</p>
                        <p className="text-[10px] text-muted-foreground">总收藏</p>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border bg-card p-3">
                    <div className="flex items-center gap-2">
                      <div className="flex size-8 items-center justify-center rounded-lg bg-green-500/10">
                        <BookOpen className="size-4 text-green-500" />
                      </div>
                      <div>
                        <p className="text-lg font-bold">{bookmarkStats.read}</p>
                        <p className="text-[10px] text-muted-foreground">已读</p>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border bg-card p-3">
                    <div className="flex items-center gap-2">
                      <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500/10">
                        <Archive className="size-4 text-amber-500" />
                      </div>
                      <div>
                        <p className="text-lg font-bold">{bookmarkStats.archived}</p>
                        <p className="text-[10px] text-muted-foreground">已归档</p>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border bg-card p-3">
                    <div className="flex items-center gap-2">
                      <div className="flex size-8 items-center justify-center rounded-lg bg-purple-500/10">
                        <TrendingUp className="size-4 text-purple-500" />
                      </div>
                      <div>
                        <p className="text-lg font-bold">{bookmarkStats.avgProgress}%</p>
                        <p className="text-[10px] text-muted-foreground">平均进度</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
                  {bookmarks && bookmarks.length > 0 && (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={bmSearch}
                    onChange={(e) => setBmSearch(e.target.value)}
                    placeholder="搜索链接标题、URL或摘要..."
                    className="h-8 rounded-lg pl-9 pr-9 text-xs"
                  />
                  {bmSearch && (
                    <button onClick={() => setBmSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X className="size-4" />
                    </button>
                  )}
                </div>
              )}

              {bmLoading ? (
                <div className="empty-state py-16"><Loader2 className="size-8 animate-spin text-primary" /></div>
              ) : !bookmarks || bookmarks.length === 0 ? (
                <EmptyState icon={Link2} title="还没有收藏的链接" description="收藏有用的网页、文章或资源"
                  action={<Button size="sm" onClick={() => setBmOpen(true)} className="gap-1 rounded-lg"><Plus className="size-4" />收藏第一个链接</Button>}
                />
              ) : filteredBookmarks.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-center">
                  <Search className="mb-2 size-8 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">未找到匹配的链接</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredBookmarks.map((b) => (
                    <div key={b.id} className="group flex items-start gap-3 rounded-xl border bg-card p-3 transition-all hover:shadow-sm">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
                        <Link2 className="size-4 text-blue-500" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <a href={b.url} target="_blank" rel="noopener noreferrer"
                          className="flex min-w-0 items-center gap-1 text-sm font-medium hover:text-primary"
                        >
                          <span className="truncate">{b.title || b.url}</span>
                          <ExternalLink className="size-3 shrink-0" />
                        </a>
                        {b.summary && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{b.summary}</p>}
                        {b.tags && JSON.parse(b.tags).length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {JSON.parse(b.tags).map((tag: string) => (
                              <Badge key={tag} variant="outline" className="rounded-full px-2 py-0 text-[10px]">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        )}
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <Badge variant={b.readStatus === 'unread' ? 'default' : 'secondary'}
                            className="rounded-full px-2 py-0 text-[10px] cursor-pointer"
                            onClick={() => toggleReadStatus(b)}
                          >
                            {b.readStatus === 'unread' ? '未读' : b.readStatus === 'read' ? '已读' : '归档'}
                          </Badge>
                          {b.progress != null && b.progress > 0 ? (
                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                className="flex size-4 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                                title="进度-10%"
                                onClick={(e) => { e.preventDefault(); updateBmMutation.mutate({ id: b.id, data: { progress: Math.max(0, b.progress! - 10) } }) }}
                              >
                                <Minus className="size-3" />
                              </button>
                              <div className="h-1.5 w-14 rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-primary"
                                  style={{ width: `${b.progress}%` }}
                                />
                              </div>
                              <span className="w-7 text-center text-[10px] text-muted-foreground">{b.progress}%</span>
                              <button
                                className="flex size-4 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                                title="进度+10%"
                                onClick={(e) => { e.preventDefault(); updateBmMutation.mutate({ id: b.id, data: { progress: Math.min(100, b.progress! + 10) } }) }}
                              >
                                <Plus className="size-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary hover:bg-primary/20"
                              onClick={(e) => { e.preventDefault(); updateBmMutation.mutate({ id: b.id, data: { progress: 10 } }) }}
                            >
                              开始阅读
                            </button>
                          )}
                          {b.readingNote && (
                            <span className="truncate text-[10px] text-muted-foreground max-w-[120px] inline-block">
                              📝 {b.readingNote}
                            </span>
                          )}
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {b.createdAt.slice(0, 10)}
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 rounded-md"
                          onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(b.url); toast.success('链接已复制') }}
                          title="复制链接"
                        >
                          <Copy className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 rounded-md"
                          onClick={(e) => { e.stopPropagation(); openEditBm(b) }}
                          title="编辑链接"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 rounded-md text-blue-500"
                          onClick={(e) => { e.stopPropagation(); setNoteTarget(b); setNoteText(b.readingNote || ''); setNoteOpen(true) }}
                          title="阅读笔记"
                        >
                          <MessageSquare className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 rounded-md text-destructive md:opacity-0 md:transition-opacity md:group-hover:opacity-100"
                          onClick={() => setDeleteBm(b)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
      </div>

      {/* 媒体编辑对话框 */}
      <Dialog open={mediaOpen} onOpenChange={(o) => { if (!o) closeMediaForm() }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editMedia ? '编辑' : '添加'}书影条目</DialogTitle>
            <DialogDescription>{editMedia ? '修改信息' : '记录你想看的书、电影或剧集'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">类型</label>
              <div className="flex flex-wrap gap-2">
                {['book', 'movie', 'tv', 'game'].map((k) => {
                  const KI = KIND_ICONS[k] ?? BookOpen
                  return (
                    <button key={k} type="button" onClick={() => setMKind(k)}
                      className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 text-xs transition-colors',
                        mKind === k ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'
                      )}
                    ><KI className="size-3.5" />{KIND_LABELS[k]}</button>
                  )
                })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">标题</label>
                <Input value={mTitle} onChange={(e) => setMTitle(e.target.value)} placeholder="名称" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">作者/导演</label>
                <Input value={mAuthor} onChange={(e) => setMAuthor(e.target.value)} placeholder="可选" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">状态</label>
                <Select value={mStatus} onValueChange={setMStatus}>
                  <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="want">想读/看</SelectItem>
                    <SelectItem value="doing">在读/看</SelectItem>
                    <SelectItem value="done">已读/看</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">评分 (1-5)</label>
                <Input type="number" min={1} max={5} value={mRating} onChange={(e) => setMRating(e.target.value)} placeholder="可选" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">备注</label>
              <Textarea value={mNote} onChange={(e) => setMNote(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={closeMediaForm} disabled={saveMediaMutation.isPending}>取消</Button>
            <Button size="sm" onClick={() => saveMediaMutation.mutate()} disabled={saveMediaMutation.isPending || !mTitle.trim()}>
              {saveMediaMutation.isPending ? <><Loader2 className="size-4 animate-spin" /> 保存中...</> : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 链接收藏/编辑对话框 */}
      <Dialog open={bmOpen} onOpenChange={(o) => { if (!o) closeBmForm() }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editBm ? '编辑链接' : '收藏链接'}</DialogTitle>
            <DialogDescription>{editBm ? '修改链接信息' : '保存有用的网页或文章'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">链接 URL</label>
              <div className="relative">
                <Input value={bmUrl} onChange={(e) => { setBmUrl(e.target.value); setUrlValid(null) }} placeholder="https://..." className="pr-8" />
                {bmUrl.trim() && (
                  <button
                    type="button"
                    onClick={() => {
                      const isValid = /^https?:\/\/.+\..+/i.test(bmUrl.trim())
                      setUrlValid(isValid)
                      if (!isValid) toast.error('URL 格式无效')
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                  >
                    {urlValid === null ? (
                      <span className="text-[10px] text-muted-foreground hover:text-foreground">验证</span>
                    ) : urlValid ? (
                      <span className="text-[10px] text-green-500">✓ 有效</span>
                    ) : (
                      <span className="text-[10px] text-red-500">✗ 无效</span>
                    )}
                  </button>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">标题（可选）</label>
              <Input value={bmTitle} onChange={(e) => setBmTitle(e.target.value)} placeholder="页面标题" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">摘要（可选）</label>
              <Textarea value={bmSummary} onChange={(e) => setBmSummary(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={closeBmForm} disabled={saveBmMutation.isPending}>取消</Button>
            <Button size="sm" onClick={() => saveBmMutation.mutate()} disabled={saveBmMutation.isPending || !bmUrl.trim()}>
              {saveBmMutation.isPending ? <><Loader2 className="size-4 animate-spin" /> 保存中...</> : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 阅读笔记对话框 */}
      <Dialog open={noteOpen} onOpenChange={(o) => { if (!o) setNoteOpen(false) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>阅读笔记</DialogTitle>
            <DialogDescription>
              {noteTarget?.title || '为这个链接添加笔记'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={4}
              placeholder="写下你的想法、摘要或心得..."
            />
          </div>
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setNoteOpen(false)}>取消</Button>
            <Button size="sm" onClick={() => {
              if (noteTarget) {
                updateBmMutation.mutate({ id: noteTarget.id, data: { readingNote: noteText || undefined } })
                setNoteOpen(false)
              }
            }} disabled={updateBmMutation.isPending}>
              {updateBmMutation.isPending ? <><Loader2 className="size-4 animate-spin" /> 保存中...</> : '保存笔记'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <AlertDialog open={!!deleteMedia} onOpenChange={(o) => !o && setDeleteMedia(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除条目</AlertDialogTitle>
            <AlertDialogDescription>确定要删除「{deleteMedia?.title}」吗？此操作不可恢复。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMediaMutation.isPending}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMedia && deleteMediaMutation.mutate(deleteMedia.id)} disabled={deleteMediaMutation.isPending}>
              {deleteMediaMutation.isPending ? '删除中...' : '删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteBm} onOpenChange={(o) => !o && setDeleteBm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除链接</AlertDialogTitle>
            <AlertDialogDescription>确定要删除此链接吗？此操作不可恢复。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBmMutation.isPending}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteBm && deleteBmMutation.mutate(deleteBm.id)} disabled={deleteBmMutation.isPending}>
              {deleteBmMutation.isPending ? '删除中...' : '删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}