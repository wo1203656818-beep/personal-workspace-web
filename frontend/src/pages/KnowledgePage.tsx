import { useMemo, useState, Suspense, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useDropzone } from 'react-dropzone'
import { toast } from 'sonner'
import {
  BookOpen,
  ArrowLeft,
  FileText,
  File,
  FileImage,
  RefreshCw,
  Trash2,
  Search,
  Download,
  Sparkles,
  Loader2,
  MessageSquareText,
  Send,
  Presentation,
  Mic,
  Code2,
  Network,
  StickyNote,
  MessagesSquare,
  Globe,
  Copy,
  MessageCircle,
  CheckSquare,
  Square,
  type LucideIcon,
} from 'lucide-react'
import { kbApi, type KbDocument, type KbSummary } from '@/lib/api'
import { STALE_TIME } from '@/lib/query'
import { extractDocumentText } from '@/lib/doc-extract'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { PageSkeleton, DetailSkeleton } from '@/components/PageSkeleton'
import { EmptyState } from '@/components/EmptyState'
import { cn } from '@/lib/utils'
import { lazyImport } from '@/lib/lazy'
import { usePageTitle } from '@/hooks/use-page-title'
import { AIQaPanel } from '@/components/ai/AIQaPanel'

const DocViewer = lazyImport(() =>
  import('@/components/DocViewer').then((m) => ({ default: m.DocViewer })),
)

const fileTypeIcon: Record<string, LucideIcon> = {
  pdf: File,
  docx: FileText,
  md: FileText,
  xlsx: File,
  image: FileImage,
  txt: FileText,
  note: StickyNote,
  web: Globe,
  ppt: Presentation,
  audio: Mic,
  html: Code2,
  xmind: Network,
  session: MessagesSquare,
  unavailable: File,
  unknown: File,
}

const fileTypeColor: Record<string, string> = {
  pdf: 'bg-gradient-to-br from-red-500 to-rose-400',
  docx: 'bg-gradient-to-br from-blue-500 to-indigo-400',
  xlsx: 'bg-gradient-to-br from-emerald-500 to-green-400',
  md: 'bg-gradient-to-br from-slate-500 to-slate-400',
  image: 'bg-gradient-to-br from-purple-500 to-violet-400',
  txt: 'bg-gradient-to-br from-amber-500 to-yellow-400',
  note: 'bg-gradient-to-br from-slate-500 to-slate-400',
  web: 'bg-gradient-to-br from-sky-500 to-blue-400',
  ppt: 'bg-gradient-to-br from-orange-500 to-red-400',
  audio: 'bg-gradient-to-br from-pink-500 to-rose-400',
  html: 'bg-gradient-to-br from-cyan-500 to-teal-400',
  xmind: 'bg-gradient-to-br from-violet-500 to-purple-400',
  session: 'bg-gradient-to-br from-fuchsia-500 to-pink-400',
  unavailable: 'bg-gradient-to-br from-slate-400 to-slate-300',
  unknown: 'bg-gradient-to-br from-slate-400 to-slate-300',
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const RECENTLY_VIEWED_KEY = 'kb-recently-viewed'
const MAX_RECENT = 5

function getRecentlyViewedIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENTLY_VIEWED_KEY) || '[]')
  } catch {
    return []
  }
}

function addRecentlyViewedId(id: string) {
  const ids = getRecentlyViewedIds().filter((i) => i !== id)
  ids.unshift(id)
  localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(ids.slice(0, MAX_RECENT)))
}

const ACCEPTED_TYPES: Record<string, string[]> = {
  'text/markdown': ['.md', '.markdown'],
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'text/plain': ['.txt'],
}

const TYPE_FILTERS = [
  { value: 'all', label: '全部' },
  { value: 'pdf', label: 'PDF' },
  { value: 'docx', label: 'Word' },
  { value: 'xlsx', label: 'Excel' },
  { value: 'md', label: 'MD' },
  { value: 'txt', label: 'TXT' },
  { value: 'image', label: '图片' },
] as const

export function KnowledgePage() {
  usePageTitle('知识库')
  const { id } = useParams()
  const navigate = useNavigate()

  if (id) {
    return <KnowledgeDetail id={id} onBack={() => navigate('/knowledge')} />
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b bg-card/50 px-4 py-4 backdrop-blur-sm md:px-6">
        <div className="flex items-center gap-3">
          <div className="icon-badge size-9 bg-gradient-to-br from-emerald-500 to-teal-400 md:size-10">
            <BookOpen className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight md:text-2xl">知识库</h1>
            <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">沉淀文档、资料与灵感</p>
          </div>
        </div>
      </div>
      <KnowledgeList onNavigate={navigate} />
    </div>
  )
}

function KnowledgeList({ onNavigate }: { onNavigate: ReturnType<typeof useNavigate> }) {
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set())
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [cardSummaryDoc, setCardSummaryDoc] = useState<KbDocument | null>(null)
  const [cardSummaryText, setCardSummaryText] = useState<string | null>(null)
  const [summaryCloseConfirmOpen, setSummaryCloseConfirmOpen] = useState(false)
  const summaryMountedRef = useRef(true)
  const [recentlyViewedIds, setRecentlyViewedIds] = useState<string[]>(getRecentlyViewedIds)

  const [globalAskOpen, setGlobalAskOpen] = useState(false)
  const [globalQuestion, setGlobalQuestion] = useState('')
  const [globalAnswer, setGlobalAnswer] = useState<string | null>(null)
  const [globalSources, setGlobalSources] = useState<
    { title: string; snippet: string; score: number }[]
  >([])
  const [qaOpen, setQaOpen] = useState(false)
  const [docPage, setDocPage] = useState(1)
  const DOC_PAGE_SIZE = 20

  const globalAskMutation = useMutation({
    mutationFn: (q: string) => kbApi.globalAsk(q),
    onSuccess: (data) => {
      setGlobalAnswer(data.answer)
      setGlobalSources(data.sources || [])
    },
    onError: (err: Error) => toast.error(`问答失败: ${err.message}`),
  })

  const cardSummaryMutation = useMutation({
    mutationFn: (docId: string) => kbApi.summary(docId),
    onSuccess: (data) => {
      if (!summaryMountedRef.current) return
      setCardSummaryText(data.summary)
    },
    onError: (err: Error) => {
      if (!summaryMountedRef.current) return
      toast.error(`总结失败: ${err.message}`)
    },
  })

  // 重置 mounted 标志：dialog 打开时允许回调，关闭时阻止
  useEffect(() => {
    if (cardSummaryDoc) {
      summaryMountedRef.current = true
    }
  }, [cardSummaryDoc])

  const trimmedQuery = searchQuery.trim()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleNavigate = useCallback(
    (docId: string) => {
      addRecentlyViewedId(docId)
      setRecentlyViewedIds(getRecentlyViewedIds())
      onNavigate(`/knowledge/${docId}`)
    },
    [onNavigate],
  )

  const { data: docs = [], isLoading: docsLoading } = useQuery<KbSummary[]>({
    queryKey: ['kb'],
    queryFn: kbApi.listSummary,
    enabled: trimmedQuery.length === 0,
    staleTime: STALE_TIME,
  })

  const { data: searchResults = [] } = useQuery({
    queryKey: ['kb', 'search', trimmedQuery],
    queryFn: () => kbApi.search(trimmedQuery),
    enabled: trimmedQuery.length > 0,
    staleTime: STALE_TIME,
  })

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const content = await extractDocumentText(file)
      return kbApi.upload(file, undefined, setUploadProgress, content || undefined)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb'] })
      toast.success('上传成功')
    },
    onError: (err: Error) => toast.error(`上传失败: ${err.message}`),
    onSettled: () => setUploadProgress(null),
  })

  const deleteDocMutation = useMutation({
    mutationFn: (id: string) => kbApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb'] })
      toast.success('已删除')
    },
    onError: (err: Error) => toast.error(`删除失败: ${err.message}`),
  })

  const batchDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) {
        await kbApi.delete(id)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb'] })
      toast.success('批量删除完成')
      setSelectedDocIds(new Set())
      setBatchDeleteOpen(false)
    },
    onError: (err: Error) => toast.error(`批量删除失败: ${err.message}`),
  })

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: ACCEPTED_TYPES,
    onDrop: (files) => files.forEach((f) => uploadMutation.mutate(f)),
  })

  const baseDocs = useMemo(() => {
    const data = trimmedQuery ? searchResults : docs
    return Array.isArray(data) ? data : []
  }, [trimmedQuery, searchResults, docs])

  const filteredDocs = baseDocs.filter((doc: KbDocument) => {
    if (typeFilter === 'all') return true
    return doc.fileType === typeFilter
  })

  const visibleDocs = filteredDocs.slice(0, docPage * DOC_PAGE_SIZE)
  const hasMoreDocs = visibleDocs.length < filteredDocs.length

  // Reset page when search/filter changes
  useEffect(() => {
    setDocPage(1)
  }, [trimmedQuery, typeFilter])

  return (
    <>
      <div className="border-b px-4 py-3 md:px-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            placeholder="搜索知识库..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="rounded-xl pl-9"
          />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0">
              {filteredDocs.length > 0
                ? `${filteredDocs.length} 个文档`
                : ''}
            </span>
          </div>
          <Tabs value={typeFilter} onValueChange={setTypeFilter} className="flex-1">
            <TabsList className="flex w-full justify-start overflow-x-auto rounded-xl sm:w-auto">
              {TYPE_FILTERS.map((t) => (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  className="shrink-0 rounded-lg text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setGlobalAskOpen(true)
              setGlobalQuestion('')
              setGlobalAnswer(null)
              setGlobalSources([])
            }}
            className="gap-2 rounded-lg shrink-0"
          >
            <MessageSquareText className="size-4" />
            向知识库提问
          </Button>
        </div>
      </div>

      <div
        {...getRootProps()}
        className={`mx-4 mt-3 mb-2 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-muted/30 py-6 text-center transition-colors md:mx-6 ${isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/40 hover:bg-muted/50'} ${uploadMutation.isPending ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}
      >
        <input {...getInputProps()} />
        <div className="icon-badge mb-2 size-10 bg-gradient-to-br from-emerald-500 to-teal-400">
          <File className="size-5" />
        </div>
        <p className="text-sm font-medium">
          {isDragActive ? '释放文件以上传' : '拖拽文件到此处，或点击上传'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          支持 Markdown、PDF、Word、Excel、图片与 TXT
        </p>
      </div>

      {uploadProgress !== null && (
        <div className="mx-4 mb-2 md:mx-6">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>上传中</span>
            <span>{uploadProgress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-150"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      <ScrollArea className="flex-1">
        {docsLoading ? (
          <PageSkeleton />
        ) : (
          <div className="grid gap-3 p-2 md:grid-cols-2 md:p-4">
            {recentlyViewedIds.length > 0 && filteredDocs.length > 0 && (
              <div className="col-span-full mb-1">
                <p className="text-xs font-medium text-muted-foreground px-1">最近浏览</p>
              </div>
            )}
            {filteredDocs.length === 0 ? (
              <EmptyState
                icon={BookOpen}
                title={trimmedQuery || typeFilter !== 'all' ? '未找到匹配的文档' : '暂无文档'}
                description={
                  trimmedQuery || typeFilter !== 'all'
                    ? '尝试更换筛选条件'
                    : '拖拽文件到上方区域上传文档'
                }
                className="col-span-full"
              />
            ) : (
              <>
                {/* 批量操作栏 */}
                {selectedDocIds.size > 0 && (
                  <div className="col-span-full flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5">
                    <span className="text-xs text-muted-foreground">已选 {selectedDocIds.size} 项</span>
                    <Button size="sm" variant="destructive" className="ml-auto gap-1.5 rounded-lg" onClick={() => setBatchDeleteOpen(true)}>
                      <Trash2 className="size-3.5" />删除选中
                    </Button>
                    <Button size="sm" variant="ghost" className="gap-1.5 rounded-lg" onClick={() => setSelectedDocIds(new Set())}>
                      取消选择
                    </Button>
                  </div>
                )}
                {visibleDocs.map((doc: KbDocument) => {
                const Icon = fileTypeIcon[doc.fileType || ''] || File
                const colorClass = fileTypeColor[doc.fileType || ''] || fileTypeColor.unknown
                const isRecent = recentlyViewedIds.includes(doc.id)
                const isSelected = selectedDocIds.has(doc.id)
                return (
                  <div
                    key={doc.id}
                    className={cn(
                      'group surface-card flex items-center gap-3 transition-colors hover:bg-accent/50',
                      isRecent && 'ring-1 ring-primary/20',
                      isSelected && 'ring-1 ring-primary/50 bg-primary/5',
                    )}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        const next = new Set(selectedDocIds)
                        if (isSelected) next.delete(doc.id)
                        else next.add(doc.id)
                        setSelectedDocIds(next)
                      }}
                      className="shrink-0 pl-3 text-muted-foreground hover:text-foreground"
                    >
                      {isSelected ? <CheckSquare className="size-4 text-primary" /> : <Square className="size-4" />}
                    </button>
                    <div className="flex flex-1 cursor-pointer items-center gap-3 py-3 pr-3" onClick={() => handleNavigate(doc.id)}>
                      <div className={cn('icon-badge size-10 shrink-0', colorClass)}>
                        <Icon className="size-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{doc.title}</p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span className="rounded-full bg-muted px-2 py-0.5 font-medium uppercase tracking-wide">
                            {doc.fileType}
                          </span>
                          {doc.fileSize != null ? <span>{formatFileSize(doc.fileSize)}</span> : null}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 shrink-0"
                      title="复制链接"
                      onClick={(e) => {
                        e.stopPropagation()
                        navigator.clipboard.writeText(`${window.location.origin}/knowledge/${doc.id}`)
                        toast.success('链接已复制')
                      }}
                    >
                      <Copy className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 shrink-0"
                      title="AI 总结"
                      onClick={(e) => {
                        e.stopPropagation()
                        setCardSummaryDoc(doc)
                        setCardSummaryText(null)
                        cardSummaryMutation.mutate(doc.id)
                      }}
                      disabled={cardSummaryMutation.isPending}
                    >
                      {cardSummaryMutation.isPending && cardSummaryDoc?.id === doc.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="size-3.5" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleteConfirmId(doc.id)
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                )
              })}
                {hasMoreDocs && (
                  <div className="col-span-full flex justify-center pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDocPage((p) => p + 1)}
                      className="gap-1.5 rounded-lg"
                    >
                      加载更多
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </ScrollArea>

      <AlertDialog
        open={!!deleteConfirmId}
        onOpenChange={(open) => !open && setDeleteConfirmId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除文档？</AlertDialogTitle>
            <AlertDialogDescription>此操作不可撤销，文档将被永久删除。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteConfirmId) deleteDocMutation.mutate(deleteConfirmId)
                setDeleteConfirmId(null)
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 批量删除确认 */}
      <AlertDialog open={batchDeleteOpen} onOpenChange={(o) => !o && setBatchDeleteOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>批量删除文档</AlertDialogTitle>
            <AlertDialogDescription>确定要删除选中的 {selectedDocIds.size} 个文档吗？此操作不可恢复。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={batchDeleteMutation.isPending}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => batchDeleteMutation.mutate([...selectedDocIds])} disabled={batchDeleteMutation.isPending}>
              {batchDeleteMutation.isPending ? '删除中...' : `删除 ${selectedDocIds.size} 个文档`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={!!cardSummaryDoc}
        onOpenChange={(v) => {
          if (!v) {
            if (cardSummaryMutation.isPending) {
              setSummaryCloseConfirmOpen(true)
            } else {
              setCardSummaryDoc(null)
              setCardSummaryText(null)
            }
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-violet-500" />
              AI 总结 — {cardSummaryDoc?.title}
            </DialogTitle>
            <DialogDescription>{cardSummaryDoc?.fileType?.toUpperCase()}</DialogDescription>
          </DialogHeader>
          <div className="mt-2 min-h-[80px] text-sm leading-relaxed">
            {cardSummaryMutation.isPending && !cardSummaryText && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                正在生成总结…
              </div>
            )}
            {cardSummaryText && <p className="whitespace-pre-wrap">{cardSummaryText}</p>}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={summaryCloseConfirmOpen}
        onOpenChange={(open) => !open && setSummaryCloseConfirmOpen(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>总结尚未完成</AlertDialogTitle>
            <AlertDialogDescription>AI 总结仍在生成中，关闭将丢失当前结果。确定要关闭吗？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                summaryMountedRef.current = false
                setSummaryCloseConfirmOpen(false)
                setCardSummaryDoc(null)
                setCardSummaryText(null)
              }}
            >
              关闭
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={globalAskOpen}
        onOpenChange={(v) => {
          if (!v) {
            setGlobalAskOpen(false)
            setGlobalAnswer(null)
            setGlobalSources([])
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquareText className="size-4 text-emerald-500" />
              向知识库提问
            </DialogTitle>
            <DialogDescription>基于知识库中的所有文档，智能回答你的问题</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!globalQuestion.trim()) return
              setGlobalAnswer(null)
              setGlobalSources([])
              globalAskMutation.mutate(globalQuestion.trim())
            }}
            className="flex items-center gap-2"
          >
            <Input
              placeholder="输入你的问题..."
              value={globalQuestion}
              onChange={(e) => setGlobalQuestion(e.target.value)}
              className="rounded-xl flex-1"
              disabled={globalAskMutation.isPending}
              autoFocus
            />
            <Button
              type="submit"
              disabled={globalAskMutation.isPending || !globalQuestion.trim()}
              className="rounded-lg gap-1 shrink-0"
            >
              {globalAskMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              发送
            </Button>
          </form>
          {globalAskMutation.isPending && !globalAnswer && (
            <div className="flex items-center gap-2 py-4 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              正在检索知识库并生成回答…
            </div>
          )}
          {globalAnswer && (
            <div className="space-y-3">
              <div className="rounded-xl bg-muted/50 p-3 text-sm leading-relaxed">
                <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Sparkles className="size-3" /> 回答
                </span>
                <p className="whitespace-pre-wrap">{globalAnswer}</p>
              </div>
              {globalSources.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-medium text-muted-foreground">引用来源</span>
                  {globalSources.map((src, i) => (
                    <div key={i} className="rounded-lg border bg-card/50 px-3 py-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-medium truncate">{src.title}</span>
                        <Badge variant="secondary" className="ml-2 shrink-0 text-[10px]">
                          {(src.score * 100).toFixed(0)}%
                        </Badge>
                      </div>
                      {src.snippet && (
                        <p className="mt-1 line-clamp-2 text-muted-foreground">{src.snippet}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Button
        className="fixed bottom-6 right-6 z-50 size-12 rounded-full shadow-lg"
        onClick={() => setQaOpen(true)}
      >
        <MessageCircle className="size-5" />
      </Button>
      <AIQaPanel open={qaOpen} onOpenChange={setQaOpen} />
    </>
  )
}

function KnowledgeDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [summary, setSummary] = useState<string | null>(null)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<string | null>(null)

  const { data: selectedDoc, isLoading: selectedDocLoading, isFetching: selectedDocFetching } = useQuery({
    queryKey: ['kbDoc', id],
    queryFn: () => kbApi.get(id),
    staleTime: STALE_TIME,
  })

  const summaryMutation = useMutation({
    mutationFn: (docId: string) => kbApi.summary(docId),
    onSuccess: (data) => setSummary(data.summary),
    onError: (err: Error) => toast.error(`总结失败: ${err.message}`),
  })

  const askMutation = useMutation({
    mutationFn: ({ docId, q }: { docId: string; q: string }) => kbApi.ask(docId, q),
    onSuccess: (data) => setAnswer(data.answer),
    onError: (err: Error) => toast.error(`问答失败: ${err.message}`),
  })

  if (selectedDocLoading) return <DetailSkeleton />
  if (!selectedDoc) return <DetailSkeleton />

  const Icon = fileTypeIcon[selectedDoc.fileType || ''] || File
  const hasBinary = !!selectedDoc.r2Key
  const hasContent = !!selectedDoc.content?.trim()

  const handleDownload = async () => {
    try {
      const blobUrl = await kbApi.getBlobUrl(selectedDoc.id)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = selectedDoc.title || 'download'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
    } catch (err) {
      toast.error(`下载失败: ${err instanceof Error ? err.message : '未知错误'}`)
    }
  }

  const handleAsk = (e: React.FormEvent) => {
    e.preventDefault()
    if (!question.trim()) return
    setAnswer(null)
    askMutation.mutate({ docId: id, q: question.trim() })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b bg-card/50 px-4 py-3 backdrop-blur-sm">
        <Button variant="ghost" size="icon" className="rounded-lg" onClick={onBack}>
          <ArrowLeft className="size-4" />
        </Button>
        <div
          className={cn(
            'icon-badge size-8',
            fileTypeColor[selectedDoc.fileType || ''] || fileTypeColor.unknown,
          )}
        >
          <Icon className="size-4" />
        </div>
        <h1 className="flex-1 truncate text-lg font-semibold tracking-tight">
          {selectedDoc.title}
        </h1>
        {selectedDocFetching && !selectedDocLoading && (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        )}
        <Badge variant="secondary" className="rounded-lg uppercase">
          {selectedDoc.fileType}
        </Badge>
        {hasContent && (
          <Button
            size="sm"
            variant="outline"
            className="gap-2 rounded-lg"
            onClick={() => summaryMutation.mutate(selectedDoc.id)}
            disabled={summaryMutation.isPending}
          >
            <Sparkles className={`size-4 ${summaryMutation.isPending ? 'animate-spin' : ''}`} />
            AI 总结
          </Button>
        )}
        {hasBinary && (
          <Button size="sm" variant="outline" className="gap-2 rounded-lg" onClick={handleDownload}>
            <Download className="size-4" />
            下载
          </Button>
        )}
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-4 p-4 md:p-6">
          {summary && (
            <div className="surface-card overflow-x-hidden border-l-4 border-l-violet-500">
              <div className="flex items-center gap-2 text-sm font-medium text-violet-600 dark:text-violet-400">
                <Sparkles className="size-4" />
                AI 总结
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{summary}</p>
            </div>
          )}

          {hasContent && (
            <div className="surface-card overflow-x-hidden">
              <form onSubmit={handleAsk} className="flex items-center gap-2">
                <Input
                  placeholder="向文档提问..."
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  className="rounded-xl"
                  disabled={askMutation.isPending}
                />
                <Button
                  type="submit"
                  disabled={askMutation.isPending || !question.trim()}
                  className="rounded-lg gap-1 shrink-0"
                >
                  {askMutation.isPending ? (
                    <RefreshCw className="size-4 animate-spin" />
                  ) : (
                    <MessagesSquare className="size-4" />
                  )}
                  提问
                </Button>
              </form>
              {answer && (
                <div className="mt-3 rounded-xl bg-muted/50 p-3 text-sm leading-relaxed">
                  <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Sparkles className="size-3" /> 回答
                  </span>
                  <p className="whitespace-pre-wrap">{answer}</p>
                </div>
              )}
            </div>
          )}

          <div className="surface-card overflow-x-hidden">
            <Suspense fallback={<DetailSkeleton />}>
              <DocViewer
                fileType={selectedDoc.fileType || ''}
                content={selectedDoc.content ?? undefined}
                r2Key={selectedDoc.r2Key ?? undefined}
                title={selectedDoc.title}
                docId={hasBinary ? selectedDoc.id : undefined}
              />
            </Suspense>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
