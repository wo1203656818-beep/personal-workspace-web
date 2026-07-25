import { useRef, useEffect, useState } from 'react'
import { Viewer, Worker } from '@react-pdf-viewer/core'
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url'
import '@react-pdf-viewer/core/lib/styles/index.css'
import '@react-pdf-viewer/default-layout/lib/styles/index.css'
import { renderAsync } from 'docx-preview'
import * as XLSX from 'xlsx'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { FileText } from 'lucide-react'
import { kbApi } from '@/lib/api'

interface DocViewerProps {
  fileType: string
  content?: string
  r2Key?: string
  title?: string
  /** 文档 ID（用于带 auth 头拉取二进制） */
  docId?: string
}

// 带认证头的 blob URL hook（避免裸 fetch 401）
function useAuthBlob(docId?: string) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [arrayBuffer, setArrayBuffer] = useState<ArrayBuffer | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!docId) {
      setBlobUrl(null)
      setArrayBuffer(null)
      setLoading(false)
      setError(null)
      return
    }
    let cancelled = false
    let url: string | null = null
    setLoading(true)
    setError(null)

    kbApi.getBlob(docId)
      .then(async (blob) => {
        if (cancelled) return
        const buf = await blob.arrayBuffer()
        if (cancelled) return
        setArrayBuffer(buf)
        url = URL.createObjectURL(blob)
        setBlobUrl(url)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : '加载失败')
        setLoading(false)
      })

    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [docId])

  return { blobUrl, arrayBuffer, loading, error }
}

// PDF 预览：使用 @react-pdf-viewer/core
function PdfViewer({ blobUrl }: { blobUrl: string }) {
  const defaultLayoutPluginInstance = defaultLayoutPlugin()
  return (
    <div className="h-[70vh] w-full">
      <Worker workerUrl={workerUrl}>
        <Viewer
          fileUrl={blobUrl}
          plugins={[defaultLayoutPluginInstance]}
          renderLoader={() => (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              加载中...
            </div>
          )}
          renderError={() => (
            <div className="flex items-center justify-center py-12 text-sm text-destructive">
              加载失败
            </div>
          )}
        />
      </Worker>
    </div>
  )
}

// Word 预览：使用 docx-preview 的 renderAsync
function DocxViewer({ arrayBuffer }: { arrayBuffer: ArrayBuffer }) {
  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.innerHTML = ''
      renderAsync(arrayBuffer, containerRef.current)
    }
  }, [arrayBuffer])
  return (
    <div className="overflow-x-hidden">
      {/* docx-preview 在 section/table/img 上设固定 width:8.5in 等 inline style，
          移动端会溢出，用 !important 覆盖为响应式 */}
      <style>{`
        .docx-viewer .docx-wrapper { padding: 0 !important; background: transparent !important; }
        .docx-viewer section, .docx-viewer .docx {
          width: 100% !important; max-width: 100% !important; min-width: 0 !important;
          padding: 12px !important; margin: 0 !important; box-shadow: none !important;
        }
        .docx-viewer table { width: 100% !important; max-width: 100% !important; display: block; overflow-x: auto; }
        .docx-viewer img { max-width: 100% !important; height: auto !important; }
        .docx-viewer p, .docx-viewer div, .docx-viewer span { max-width: 100% !important; }
      `}</style>
      <div ref={containerRef} className="docx-viewer break-words" />
    </div>
  )
}

// Excel 预览：使用 xlsx (SheetJS) 转 HTML 表格
function XlsxViewer({ arrayBuffer }: { arrayBuffer: ArrayBuffer }) {
  const [html, setHtml] = useState('')
  useEffect(() => {
    const wb = XLSX.read(arrayBuffer, { type: 'array' })
    const firstSheet = wb.SheetNames[0]
    const ws = wb.Sheets[firstSheet]
    setHtml(XLSX.utils.sheet_to_html(ws))
  }, [arrayBuffer])
  return (
    <div className="overflow-x-auto">
      <div className="break-words [&_table]:block [&_table]:overflow-x-auto [&_table]:my-2 [&_table]:border-collapse" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}

// 图片预览
function ImageViewer({ blobUrl }: { blobUrl: string }) {
  return (
    <div className="flex justify-center">
      <img src={blobUrl} alt="预览" className="max-h-[80vh] max-w-full object-contain" />
    </div>
  )
}

// Markdown 预览：使用 react-markdown（启用 rehype-raw 渲染内嵌 HTML img）
function MarkdownViewer({ content }: { content: string }) {
  return (
    <div className="overflow-x-hidden">
      <div className="break-words prose prose-sm dark:prose-invert max-w-none [&_img]:mx-auto [&_img]:max-h-[70vh] [&_img]:max-w-full [&_img]:object-contain [&_pre]:overflow-x-auto [&_pre]:max-w-full [&_table]:block [&_table]:overflow-x-auto [&_table]:max-w-full">
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{content}</ReactMarkdown>
      </div>
    </div>
  )
}

// 纯文本预览：拉 ArrayBuffer → TextDecoder 解码 → <pre> 显示
function TxtViewer({ arrayBuffer }: { arrayBuffer: ArrayBuffer }) {
  const [text, setText] = useState('')
  useEffect(() => {
    try {
      setText(new TextDecoder('utf-8').decode(arrayBuffer))
    } catch {
      setText('(解码失败)')
    }
  }, [arrayBuffer])
  return (
    <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-xl bg-muted/30 p-4 text-sm">
      {text}
    </pre>
  )
}

// HTML 预览：拉 ArrayBuffer → TextDecoder → dangerouslySetInnerHTML（内容来自 IMA 可信源）
function HtmlViewer({ arrayBuffer }: { arrayBuffer: ArrayBuffer }) {
  const [html, setHtml] = useState('')
  useEffect(() => {
    try {
      setHtml(new TextDecoder('utf-8').decode(arrayBuffer))
    } catch {
      setHtml('<p>(解码失败)</p>')
    }
  }, [arrayBuffer])
  return (
    <div className="overflow-x-hidden">
      <div
        className="break-words prose prose-sm dark:prose-invert max-w-none [&_img]:max-h-[70vh] [&_img]:max-w-full [&_img]:object-contain [&_table]:block [&_table]:overflow-x-auto [&_table]:max-w-full [&_pre]:overflow-x-auto [&_pre]:max-w-full"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}

// 音频预览
function AudioViewer({ blobUrl }: { blobUrl: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-8">
      <audio controls src={blobUrl} className="w-full max-w-md" />
    </div>
  )
}

// 不支持的类型提示（xmind/note/session 等需在 IMA 客户端查看）
function UnsupportedType({ title, fileType }: { title?: string; fileType: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
      <FileText className="mb-2 size-8 opacity-30" />
      <p className="text-sm">{title || '文档预览'}</p>
      <p className="text-xs mt-1">类型: {fileType.toUpperCase()}</p>
      <p className="text-xs mt-2">此类型请在 IMA 客户端查看</p>
    </div>
  )
}

// 二进制文件 URL 缺失时的占位提示
function NoUrlPlaceholder({ title, fileType }: { title?: string; fileType: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
      <FileText className="mb-2 size-8 opacity-30" />
      <p className="text-sm">{title || '文档预览'}</p>
      <p className="text-xs mt-1">类型: {fileType.toUpperCase()}</p>
      <p className="text-xs mt-2">未提供文件 URL</p>
    </div>
  )
}

// 加载/错误态
function LoadState({ loading, error }: { loading: boolean; error: string | null }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        加载中...
      </div>
    )
  }
  return (
    <div className="flex items-center justify-center py-12 text-sm text-destructive">
      加载失败{error ? `: ${error}` : ''}
    </div>
  )
}

export function DocViewer({ fileType, content, title, docId }: DocViewerProps) {
  // IMA 的 web 类型实际存储为 HTML 文件，统一归到 html 渲染
  const normalizedType = fileType === 'web' ? 'html' : fileType

  // Markdown 直接用 content，无需二进制
  if (normalizedType === 'md' && content) {
    return <MarkdownViewer content={content} />
  }

  // 需在 IMA 客户端查看的类型（ppt 无浏览器原生渲染，xmind/note/session 无独立文件）
  if (['ppt', 'xmind', 'note', 'session'].includes(normalizedType)) {
    return <UnsupportedType title={title} fileType={fileType} />
  }

  // 二进制类型：pdf/docx/xlsx/image/txt/html/audio 都通过 docId 拉 ArrayBuffer
  const needsBinary = ['pdf', 'docx', 'xlsx', 'image', 'txt', 'html', 'audio'].includes(normalizedType)
  if (!needsBinary) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <p>不支持的文件格式: {fileType}</p>
      </div>
    )
  }

  if (!docId) {
    return <NoUrlPlaceholder title={title} fileType={fileType} />
  }

  return <BinaryViewer fileType={normalizedType} docId={docId} />
}

// 二进制查看器：负责带认证拉取并分发到对应组件
function BinaryViewer({
  fileType,
  docId,
}: {
  fileType: string
  docId: string
}) {
  const { blobUrl, arrayBuffer, loading, error } = useAuthBlob(docId)

  if (loading) return <LoadState loading error={null} />
  if (error || !blobUrl) return <LoadState loading={false} error={error} />

  if (fileType === 'pdf') return <PdfViewer blobUrl={blobUrl} />
  if (fileType === 'image') return <ImageViewer blobUrl={blobUrl} />
  if (fileType === 'audio') return <AudioViewer blobUrl={blobUrl} />

  // docx / xlsx / txt / html 需要 ArrayBuffer
  if (!arrayBuffer) return <LoadState loading={false} error="无数据" />
  if (fileType === 'docx') return <DocxViewer arrayBuffer={arrayBuffer} />
  if (fileType === 'xlsx') return <XlsxViewer arrayBuffer={arrayBuffer} />
  if (fileType === 'txt') return <TxtViewer arrayBuffer={arrayBuffer} />
  if (fileType === 'html') return <HtmlViewer arrayBuffer={arrayBuffer} />
  return <UnsupportedType title={undefined} fileType={fileType} />
}
