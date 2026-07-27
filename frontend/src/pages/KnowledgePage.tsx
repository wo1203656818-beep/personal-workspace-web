import { useMemo, useState, useEffect, useRef, lazy, Suspense } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useDropzone } from 'react-dropzone'
import { toast } from 'sonner'
import { BookOpen, ArrowLeft, FileText, File, FileImage, RefreshCw, Trash2, Search, Download, Presentation, Mic, Code2, Network, StickyNote, MessagesSquare, Globe, CheckCircle2, AlertCircle, Sparkles, type LucideIcon } from 'lucide-react'
import { kbApi, imaApi, type KbDocument, type KbSummary } from '@/lib/api'
import { extractDocumentText } from '@/lib/doc-extract'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { PageSkeleton, DetailSkeleton } from '@/components/PageSkeleton'
import { EmptyState } from '@/components/EmptyState'
import { cn } from '@/lib/utils'

// DocViewer 依赖 pdfjs/xlsx/docx-preview，体积大，按需懒加载
const DocViewer = lazy(() => import('@/components/DocViewer').then((m) => ({ default: m.DocViewer })))

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
  { value: 'ppt', label: 'PPT' },
  { value: 'xlsx', label: 'Excel' },
  { value: 'md', label: 'MD' },
  { value: 'txt', label: 'TXT' },
  { value: 'html', label: 'HTML' },
  { value: 'web', label: '网页' },
  { value: 'image', label: '图片' },
  { value: 'audio', label: '音频' },
  { value: 'xmind', label: '导图' },
  { value: 'note', label: '笔记' },
  { value: 'session', label: '会话' },
] as const

export function KnowledgePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [summary, setSummary] = useState<string | null>(null)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<string | null>(null)

  const trimmedQuery = searchQuery.trim()

  const { data: docs = [], isLoading: docsLoading } = useQuery<KbSummary[]>({
    queryKey: ['kb'],
    queryFn: kbApi.listSummary,
    enabled: trimmedQuery.length === 0,
    staleTime: 2 * 60 * 1000,
  })

  const { data: searchResults = [] } = useQuery({
    queryKey: ['kb', 'search', trimmedQuery],
    queryFn: () => kbApi.search(trimmedQuery),
    enabled: trimmedQuery.length > 0,
    staleTime: 2 * 60 * 1000,
  })

  const { data: selectedDoc, isLoading: selectedDocLoading } = useQuery({
    queryKey: ['kbDoc', id],
    queryFn: () => kbApi.get(id!),
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
  })

  // 切换文档时重置 AI 状态
  useEffect(() => {
    setSummary(null)
    setQuestion('')
    setAnswer(null)
  }, [id])

  // R2 文件上传（react-dropzone）：PDF/DOCX/TXT/MD 先在前端提取正文
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

  // 删除文档
  const deleteDocMutation = useMutation({
    mutationFn: (id: string) => kbApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb'] })
      toast.success('已删除')
    },
    onError: (err: Error) => toast.error(`删除失败: ${err.message}`),
  })

  // AI 总结文档
  const summaryMutation = useMutation({
    mutationFn: (docId: string) => kbApi.summary(docId),
    onSuccess: (data) => setSummary(data.summary),
    onError: (err: Error) => toast.error(`总结失败: ${err.message}`),
  })

  // 向文档提问
  const askMutation = useMutation({
    mutationFn: ({ docId, q }: { docId: string; q: string }) => kbApi.ask(docId, q),
    onSuccess: (data) => setAnswer(data.answer),
    onError: (err: Error) => toast.error(`问答失败: ${err.message}`),
  })

  // IMA 知识库同步（就近反馈）
  const [syncFeedback, setSyncFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(feedbackTimerRef.current), [])

  const syncImaMutation = useMutation({
    mutationFn: () => imaApi.syncKb(),
    onSuccess: (data: { ok: boolean; synced?: number; partial?: boolean; skipped?: number; error?: string }) => {
      queryClient.invalidateQueries({ queryKey: ['kb'] })
      const msg = data.partial
        ? `部分同步${data?.synced != null ? ` · ${data.synced} 条` : ''}，剩余 ${data.skipped ?? 0} 条`
        : `同步完成${data?.synced != null ? ` · ${data.synced} 条` : ''}`
      setSyncFeedback({ type: 'success', message: msg })
      clearTimeout(feedbackTimerRef.current)
      feedbackTimerRef.current = setTimeout(() => setSyncFeedback(null), 3000)
    },
    onError: (err: Error) => {
      setSyncFeedback({ type: 'error', message: `同步失败: ${err.message}` })
    },
  })

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: ACCEPTED_TYPES,
    onDrop: (files) => files.forEach(f => uploadMutation.mutate(f)),
  })

  const baseDocs = useMemo(() => {
    const data = trimmedQuery ? searchResults : docs
    return Array.isArray(data) ? data : []
  }, [trimmedQuery, searchResults, docs])
  const filteredDocs = baseDocs.filter((doc: KbDocument) => {
    if (typeFilter === 'all') return true
    return doc.fileType === typeFilter
  })

  if (id && selectedDocLoading) {
    return <DetailSkeleton />
  }

  if (id && selectedDoc) {
    const Icon = fileTypeIcon[selectedDoc.fileType || ''] || File
    const hasBinary = !!selectedDoc.r2Key
    const hasContent = !!selectedDoc.content?.trim()

    // 带 auth 头触发下载（避免裸 a href 401）
    const handleDownload = async () => {
      try {
        const blobUrl = await kbApi.getBlobUrl(selectedDoc.id)
        const a = document.createElement('a')
        a.href = blobUrl
        a.download = selectedDoc.title || 'download'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        // 延迟 revoke，确保下载已触发
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
      } catch (err) {
        toast.error(`下载失败: ${err instanceof Error ? err.message : '未知错误'}`)
      }
    }

    const handleAsk = (e: React.FormEvent) => {
      e.preventDefault()
      if (!question.trim() || !id) return
      setAnswer(null)
      askMutation.mutate({ docId: id, q: question.trim() })
    }

    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 border-b bg-card/50 px-4 py-3 backdrop-blur-sm">
          <Button variant="ghost" size="icon" className="rounded-lg" onClick={() => navigate('/knowledge')}>
            <ArrowLeft className="size-4" />
          </Button>
          <div className={cn('icon-badge size-8', fileTypeColor[selectedDoc.fileType || ''] || fileTypeColor.unknown)}>
            <Icon className="size-4" />
          </div>
          <h1 className="flex-1 truncate text-lg font-semibold tracking-tight">{selectedDoc.title}</h1>
          <Badge variant="secondary" className="rounded-lg uppercase">{selectedDoc.fileType}</Badge>
          {selectedDoc.r2Key && (
            <Badge variant="outline" className="rounded-lg text-xs">R2</Badge>
          )}
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
            {/* AI 总结 */}
            {summary && (
              <div className="surface-card overflow-x-hidden border-l-4 border-l-violet-500">
                <div className="flex items-center gap-2 text-sm font-medium text-violet-600 dark:text-violet-400">
                  <Sparkles className="size-4" />
                  AI 总结
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{summary}</p>
              </div>
            )}

            {/* 向文档提问 */}
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
                  <Button type="submit" disabled={askMutation.isPending || !question.trim()} className="rounded-lg gap-1 shrink-0">
                    {askMutation.isPending ? <RefreshCw className="size-4 animate-spin" /> : <MessagesSquare className="size-4" />}
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
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => syncImaMutation.mutate()}
            disabled={syncImaMutation.isPending}
            className="gap-2 rounded-lg"
          >
            <RefreshCw className={`size-4 ${syncImaMutation.isPending ? 'animate-spin' : ''}`} />
            IMA 同步
          </Button>
          {syncFeedback && (
            <span
              className={`inline-flex items-center gap-1.5 text-xs transition-opacity ${
                syncFeedback.type === 'success'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-destructive cursor-pointer hover:underline'
              }`}
              onClick={syncFeedback.type === 'error' ? () => syncImaMutation.mutate() : undefined}
            >
              {syncFeedback.type === 'success'
                ? <CheckCircle2 className="size-3.5" />
                : <AlertCircle className="size-3.5" />}
              {syncFeedback.message}
            </span>
          )}
          <Button size="sm" onClick={open} disabled={uploadMutation.isPending} className="rounded-lg gap-1">
            <File className="size-4" /> 上传
          </Button>
        </div>
      </div>

      <div className="border-b px-4 py-3 md:px-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索知识库..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="rounded-xl pl-9"
          />
        </div>
        <Tabs value={typeFilter} onValueChange={setTypeFilter} className="mt-3">
          <TabsList className="flex w-full justify-start overflow-x-auto rounded-xl sm:w-auto">
            {TYPE_FILTERS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="shrink-0 rounded-lg text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">{t.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* 拖拽上传区（独立虚线框，react-dropzone） */}
      <div
        {...getRootProps()}
        className={`mx-4 mt-3 mb-2 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-muted/30 py-6 text-center transition-colors md:mx-6 ${isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/40 hover:bg-muted/50'} ${uploadMutation.isPending ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}
      >
        <input {...getInputProps()} />
        <div className="icon-badge mb-2 size-10 bg-gradient-to-br from-emerald-500 to-teal-400">
          <File className="size-5" />
        </div>
        <p className="text-sm font-medium">{isDragActive ? '释放文件以上传' : '拖拽文件到此处，或点击上传'}</p>
        <p className="mt-1 text-xs text-muted-foreground">支持 Markdown、PDF、Word、Excel、图片与 TXT</p>
      </div>

      {/* 上传进度条 */}
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

      {/* 文档列表区（不再响应拖拽） */}
      <ScrollArea className="flex-1">
        {docsLoading ? (
          <PageSkeleton />
        ) : (
        <div className="grid gap-3 p-2 md:grid-cols-2 md:p-4">
          {filteredDocs.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title={trimmedQuery || typeFilter !== 'all' ? '未找到匹配的文档' : '暂无文档'}
              description={trimmedQuery || typeFilter !== 'all' ? '尝试更换筛选条件' : '拖拽文件到上方区域，或点击「IMA 同步」添加文档'}
              className="col-span-full"
            />
          ) : (
            filteredDocs.map((doc: KbDocument) => {
              const Icon = fileTypeIcon[doc.fileType || ''] || File
              const colorClass = fileTypeColor[doc.fileType || ''] || fileTypeColor.unknown
              const isIma = doc.r2Key?.startsWith('ima/')
              return (
                <div
                  key={doc.id}
                  className="group surface-card flex cursor-pointer items-center gap-3 transition-colors hover:bg-accent/50"
                  onClick={() => navigate(`/knowledge/${doc.id}`)}
                >
                  <div className={cn('icon-badge size-10', colorClass)}>
                    <Icon className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{doc.title}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="rounded-full bg-muted px-2 py-0.5 font-medium uppercase tracking-wide">{doc.fileType}</span>
                      {doc.fileSize ? <span>{(doc.fileSize / 1024).toFixed(1)} KB</span> : null}
                      {isIma && <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-blue-600 dark:text-blue-400">IMA</span>}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeleteConfirmId(doc.id)
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              )
            })
          )}
        </div>
        )}
      </ScrollArea>

      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
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
    </div>
  )
}
