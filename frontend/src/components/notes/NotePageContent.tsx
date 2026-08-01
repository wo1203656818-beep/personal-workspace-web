import { Suspense } from 'react'
import type { Note } from '@/lib/api'
import { lazyImport } from '@/lib/lazy'

const MarkdownPreview = lazyImport(async () => {
  const [
    { default: ReactMarkdown },
    { default: remarkGfm },
    { default: rehypeHighlight },
    { default: rehypeRaw },
  ] = await Promise.all([
    import('react-markdown'),
    import('remark-gfm'),
    import('rehype-highlight'),
    import('rehype-raw'),
  ])
  return {
    default: ({ content }: { content: string }) => (
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight, rehypeRaw]}>
        {content}
      </ReactMarkdown>
    ),
  }
})

export function NotePageContent({ note }: { note: Note }) {
  const isIma = note.sourceFile === 'ima_openapi'
  if (isIma && note.contentHtml) {
    return (
      <div
        className="break-words rounded-xl bg-muted/30 p-4 sm:p-6 prose prose-sm dark:prose-invert max-w-none [&_table]:block [&_table]:overflow-x-auto [&_table]:max-w-full"
        dangerouslySetInnerHTML={{ __html: note.contentHtml }}
      />
    )
  }
  return (
    <div className="break-words rounded-xl bg-muted/30 p-4 sm:p-6 prose prose-sm dark:prose-invert max-w-none [&_pre]:overflow-x-auto [&_pre]:max-w-full [&_table]:block [&_table]:overflow-x-auto [&_table]:max-w-full">
      <Suspense fallback={<div className="text-muted-foreground">加载预览中…</div>}>
        <MarkdownPreview content={note.content} />
      </Suspense>
    </div>
  )
}
