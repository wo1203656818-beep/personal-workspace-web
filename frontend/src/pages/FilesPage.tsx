import { useState, useRef, useMemo, useEffect } from 'react'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FolderOpen, Upload, Trash2, Copy, File, FileImage, FileText, FileArchive, Film, Loader2, Search, X, HardDrive, Pencil, CheckSquare, Square, Download } from 'lucide-react'
import { toast } from 'sonner'
import { filesApi, API_BASE, type R2FileItem } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { EmptyState } from '@/components/EmptyState'
import { Card, CardContent } from '@/components/ui/card'
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
  DialogFooter,
} from '@/components/ui/dialog'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { usePageTitle } from '@/hooks/use-page-title'

const getFileIcon = (contentType: string) => {
  if (contentType.startsWith('image/')) return FileImage
  if (contentType.startsWith('text/')) return FileText
  if (contentType.startsWith('video/')) return Film
  if (contentType.includes('zip') || contentType.includes('rar') || contentType.includes('tar')) return FileArchive
  return File
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function FilesPage() {
  usePageTitle('文件')
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [deleteFile, setDeleteFile] = useState<R2FileItem | null>(null)
  const [previewFile, setPreviewFile] = useState<R2FileItem | null>(null)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [fileTypeFilter, setFileTypeFilter] = useState('all')
  // 重命名
  const [renameFile, setRenameFile] = useState<R2FileItem | null>(null)
  const [renameValue, setRenameValue] = useState('')
  // 批量删除
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(true)
  }

  const handleDragLeave = () => {
    setDragging(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const files = e.dataTransfer.files
    if (files.length === 0) return
    setUploading(true)
    try {
      for (let i = 0; i < files.length; i++) {
        await filesApi.upload(files[i])
      }
      queryClient.invalidateQueries({ queryKey: ['files'] })
      toast.success(`已上传 ${files.length} 个文件`)
    } catch (err: any) {
      toast.error(`上传失败: ${err.message}`)
    } finally {
      setUploading(false)
    }
  }

  const {
    data: filesData,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ['files'],
    queryFn: ({ pageParam }) => filesApi.list({ limit: 20, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => (lastPage.truncated ? lastPage.cursor : undefined),
  })

  const deleteMutation = useMutation({
    mutationFn: (key: string) => filesApi.remove(key),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] })
      toast.success('文件已删除')
      setDeleteFile(null)
    },
    onError: (err: Error) => toast.error(`删除失败: ${err.message}`),
  })

  const renameMutation = useMutation({
    mutationFn: ({ key, newKey }: { key: string; newKey: string }) => filesApi.rename(key, newKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] })
      toast.success('文件已重命名')
      setRenameFile(null)
      setRenameValue('')
    },
    onError: (err: Error) => toast.error(`重命名失败: ${err.message}`),
  })

  const batchDeleteMutation = useMutation({
    mutationFn: async (keys: string[]) => {
      for (const key of keys) {
        await filesApi.remove(key)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] })
      toast.success('批量删除完成')
      setSelectedKeys(new Set())
      setBatchDeleteOpen(false)
    },
    onError: (err: Error) => toast.error(`批量删除失败: ${err.message}`),
  })

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      await filesApi.upload(file)
      queryClient.invalidateQueries({ queryKey: ['files'] })
      toast.success('文件已上传')
    } catch (err: any) {
      toast.error(`上传失败: ${err.message}`)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const copyUrl = (key: string) => {
    const url = `${import.meta.env.VITE_API_BASE || ''}/files/${encodeURIComponent(key)}`
    navigator.clipboard.writeText(url)
    toast.success('链接已复制')
  }

  const downloadFile = async (key: string) => {
    try {
      const a = document.createElement('a')
      a.href = `${API_BASE}/files/${encodeURIComponent(key)}`
      a.download = key.split('/').pop() || key
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch {
      toast.error('下载失败')
    }
  }

  const items = filesData?.pages.flatMap((p) => p.items) ?? []

  const totalStorage = useMemo(() => {
    return items.reduce((sum, item) => sum + item.size, 0)
  }, [items])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
        e.preventDefault()
        fileRef.current?.click()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const getFileCategory = (contentType: string): string => {
    if (contentType.startsWith('image/')) return 'images'
    if (contentType.startsWith('text/') || contentType.includes('pdf') || contentType.includes('document') || contentType.includes('sheet') || contentType.includes('presentation')) return 'documents'
    if (contentType.includes('zip') || contentType.includes('rar') || contentType.includes('tar') || contentType.includes('7z') || contentType.includes('gzip')) return 'archives'
    return 'others'
  }

  const filteredItems = useMemo(() => {
    let result = [...items]
    if (fileTypeFilter !== 'all') {
      result = result.filter(item => getFileCategory(item.contentType) === fileTypeFilter)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(item =>
        item.key.toLowerCase().includes(q) ||
        item.contentType.toLowerCase().includes(q)
      )
    }
    result.sort((a, b) => new Date(b.uploaded).getTime() - new Date(a.uploaded).getTime())
    return result
  }, [items, searchQuery, fileTypeFilter])

  return (
    <div className="page-layout">
      <div className="page-header">
        <div className="page-header-left">
          <div className="icon-badge size-9 bg-gradient-to-br from-sky-500 to-cyan-500 md:size-10">
            <FolderOpen className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight sm:text-xl md:text-2xl">文件管理</h1>
            <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">浏览和管理 R2 存储文件</p>
          </div>
        </div>
        <div className="page-header-right">
          <div className="hidden items-center gap-1.5 text-xs text-muted-foreground md:flex">
            <HardDrive className="size-3.5" />
            <span>已用 {formatSize(totalStorage)}</span>
          </div>
          <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} />
          <Button size="sm" onClick={() => fileRef.current?.click()} disabled={uploading} className="h-8 gap-1.5 rounded-lg sm:h-9">
            {uploading ? <><Loader2 className="size-3.5 animate-spin sm:size-4" /> 上传中...</> : <><Upload className="size-3.5 sm:size-4" /> 上传</>}
          </Button>
        </div>
      </div>

      <div className="page-content-wide">
        <ScrollArea
          className="flex-1"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="relative p-4 md:p-6">
          {dragging && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-primary/50 bg-card p-8">
                <Upload className="size-8 text-primary" />
                <p className="text-sm font-medium">释放以上传文件</p>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Loader2 className="mb-4 size-10 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">加载中...</p>
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={FolderOpen}
              title="暂无文件"
              description="上传文件到 R2 存储"
              action={
                <Button size="sm" onClick={() => fileRef.current?.click()} className="gap-1.5 rounded-lg">
                  <Upload className="size-4" />上传第一个文件
                </Button>
              }
            />
          ) : (
            <>
              {/* Search & Filter */}
              <Card className="mb-4 border-border/60">
                <CardContent className="p-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="relative flex-1 min-w-[200px]">
                      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="搜索文件名或类型..."
                        className="h-9 rounded-lg pl-9 pr-9 text-xs"
                      />
                      {searchQuery && (
                        <button
                          onClick={() => setSearchQuery('')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          <X className="size-4" />
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(['all', 'images', 'documents', 'archives', 'others'] as const).map((t) => (
                        <button
                          key={t}
                          onClick={() => setFileTypeFilter(t)}
                          className={`rounded-full px-2.5 py-1 text-[10px] transition-colors ${
                            fileTypeFilter === t
                              ? 'bg-primary/10 text-primary font-medium'
                              : 'text-muted-foreground hover:bg-accent/50'
                          }`}
                        >
                          {t === 'all' ? '全部' : t === 'images' ? '图片' : t === 'documents' ? '文档' : t === 'archives' ? '压缩包' : '其他'}
                        </button>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {filteredItems.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-center">
                  <Search className="mb-2 size-8 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">未找到匹配的文件</p>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    {/* 批量操作栏 */}
                    {selectedKeys.size > 0 && (
                      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5">
                      <button onClick={() => setSelectedKeys(new Set())} className="text-xs text-muted-foreground hover:text-foreground">
                          <Square className="size-4" />
                        </button>
                        <span className="text-xs text-muted-foreground">已选 {selectedKeys.size} 项</span>
                        <Button size="sm" variant="destructive" className="ml-auto gap-1.5 rounded-lg" onClick={() => setBatchDeleteOpen(true)}>
                          <Trash2 className="size-3.5" />删除选中
                        </Button>
                        <Button size="sm" variant="ghost" className="gap-1.5 rounded-lg" onClick={() => setSelectedKeys(new Set())}>
                          取消选择
                        </Button>
                      </div>
                    )}
                    {filteredItems.map((file) => {
                      const isSelected = selectedKeys.has(file.key)
                      return (
                      <div key={file.key} className={`group flex items-center gap-3 rounded-xl border bg-card p-3 transition-all hover:shadow-sm hover:border-border ${isSelected ? 'border-primary/50 bg-primary/5' : 'border-border/60'}`}>
                        <button
                          onClick={() => {
                            const next = new Set(selectedKeys)
                            if (isSelected) next.delete(file.key)
                            else next.add(file.key)
                            setSelectedKeys(next)
                          }}
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                        >
                          {isSelected ? <CheckSquare className="size-4 text-primary" /> : <Square className="size-4" />}
                        </button>
                        <div
                          className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-primary/10 transition-colors hover:bg-primary/15"
                          onClick={() => setPreviewFile(file)}
                        >
                          {(() => {
                            const Icon = getFileIcon(file.contentType)
                            return <Icon className="size-4 text-primary" />
                          })()}
                        </div>
                        <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setPreviewFile(file)}>
                          <p className="truncate text-sm font-medium">{file.key}</p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                            <span className="shrink-0">{formatSize(file.size)}</span>
                            <span className="shrink-0">·</span>
                            <span className="max-w-[10rem] truncate">{file.contentType}</span>
                            <span className="shrink-0">·</span>
                            <span className="shrink-0">{formatDistanceToNow(new Date(file.uploaded), { addSuffix: true, locale: zhCN })}</span>
                          </div>
                        </div>
                        <div className="flex gap-1 md:opacity-0 md:transition-all md:group-hover:opacity-100">
                          <Button variant="ghost" size="icon" className="size-8 rounded-lg" onClick={() => downloadFile(file.key)} title="下载">
                            <Download className="size-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="size-8 rounded-lg" onClick={() => copyUrl(file.key)} title="复制链接">
                            <Copy className="size-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="size-8 rounded-lg" onClick={() => {
                            setRenameFile(file)
                            setRenameValue(file.key)
                          }} title="重命名">
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="size-8 rounded-lg text-destructive hover:text-destructive" onClick={() => setDeleteFile(file)} title="删除">
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    )})}
                  </div>
                  {hasNextPage && (
                    <div className="flex justify-center pt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fetchNextPage()}
                        disabled={isFetchingNextPage}
                        className="gap-1.5 rounded-lg"
                      >
                        {isFetchingNextPage ? (
                          <><Loader2 className="size-3.5 animate-spin" /> 加载中...</>
                        ) : (
                          <>加载更多</>
                        )}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </ScrollArea>
      </div>

      <Dialog open={!!previewFile} onOpenChange={(o) => !o && setPreviewFile(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="truncate">{previewFile?.key}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {previewFile?.contentType?.startsWith('image/') ? (
              <img
                src={`${API_BASE}/files/${encodeURIComponent(previewFile.key)}`}
                alt={previewFile.key}
                className="max-h-[60vh] w-full rounded-lg object-contain bg-muted"
              />
            ) : previewFile?.contentType?.startsWith('video/') ? (
              <video
                src={`${API_BASE}/files/${encodeURIComponent(previewFile.key)}`}
                controls
                className="max-h-[60vh] w-full rounded-lg bg-muted"
              />
            ) : previewFile?.contentType === 'application/pdf' ? (
              <iframe
                src={`${API_BASE}/files/${encodeURIComponent(previewFile.key)}`}
                className="h-[60vh] w-full rounded-lg bg-muted"
                title={previewFile.key}
              />
            ) : (
              <div className="flex flex-col items-center py-8 text-center">
                <File className="mb-2 size-12 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">无法预览此文件类型</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><span className="text-muted-foreground">大小: </span>{previewFile && formatSize(previewFile.size)}</div>
              <div><span className="text-muted-foreground">类型: </span>{previewFile?.contentType}</div>
              <div className="col-span-2"><span className="text-muted-foreground">上传时间: </span>{previewFile && new Date(previewFile.uploaded).toLocaleString('zh-CN')}</div>
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => { if (previewFile) copyUrl(previewFile.key) }} className="gap-1.5">
              <Copy className="size-3.5" /> 复制链接
            </Button>
            <Button size="sm" variant="outline" onClick={() => { if (previewFile) downloadFile(previewFile.key) }} className="gap-1.5">
              <Download className="size-3.5" /> 下载
            </Button>
            <Button size="sm" onClick={() => setPreviewFile(null)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteFile} onOpenChange={(o) => !o && setDeleteFile(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除文件</AlertDialogTitle>
            <AlertDialogDescription>确定要删除「{deleteFile?.key}」吗？此操作不可恢复。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteFile && deleteMutation.mutate(deleteFile.key)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? '删除中...' : '删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 重命名对话框 */}
      <Dialog open={!!renameFile} onOpenChange={(o) => !o && setRenameFile(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>重命名文件</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">新文件名</label>
              <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} placeholder="输入新文件名" />
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setRenameFile(null)} disabled={renameMutation.isPending}>取消</Button>
            <Button size="sm" onClick={() => renameFile && renameMutation.mutate({ key: renameFile.key, newKey: renameValue })} disabled={renameMutation.isPending || !renameValue.trim() || renameValue === renameFile?.key}>
              {renameMutation.isPending ? <><Loader2 className="size-4 animate-spin" /> 重命名中...</> : '确认重命名'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 批量删除确认 */}
      <AlertDialog open={batchDeleteOpen} onOpenChange={(o) => !o && setBatchDeleteOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>批量删除文件</AlertDialogTitle>
            <AlertDialogDescription>确定要删除选中的 {selectedKeys.size} 个文件吗？此操作不可恢复。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={batchDeleteMutation.isPending}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => batchDeleteMutation.mutate([...selectedKeys])} disabled={batchDeleteMutation.isPending}>
              {batchDeleteMutation.isPending ? '删除中...' : `删除 ${selectedKeys.size} 个文件`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}