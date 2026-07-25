import * as pdfjs from 'pdfjs-dist'
import mammoth from 'mammoth'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

const MAX_CHARS = 30000

async function extractPdfText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise
  let text = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item: any) => item.str)
      .join(' ')
      .replace(/\s+/g, ' ')
    text += pageText + '\n'
    if (text.length >= MAX_CHARS) break
  }
  return text.slice(0, MAX_CHARS).trim()
}

async function extractDocxText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  return (result.value || '').slice(0, MAX_CHARS).trim()
}

export async function extractDocumentText(file: File): Promise<string | null> {
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  try {
    if (ext === 'pdf') return await extractPdfText(file)
    if (ext === 'docx' || ext === 'doc') return await extractDocxText(file)
    if (ext === 'txt' || ext === 'md' || ext === 'markdown') return (await file.text()).slice(0, MAX_CHARS).trim()
    return null
  } catch (e) {
    console.error('[doc-extract] failed:', e)
    return null
  }
}
