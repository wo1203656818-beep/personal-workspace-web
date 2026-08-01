import { tasksApi, notesApi, backupApi, type Task, type Note } from './api'

/**
 * 将任务数据导出为 CSV 文件并触发浏览器下载。
 * 包含：标题、列表、完成状态、重要、截止日期、创建时间、备注
 */
export async function exportTasksCsv(): Promise<void> {
  const tasks = await tasksApi.list().catch(() => [] as Task[])

  const headers = ['标题', '列表', '状态', '重要', '截止日期', '创建时间', '备注']
  const rows = tasks.map((t) => [
    escapeCsv(t.title),
    t.listId || '',
    t.isCompleted ? '已完成' : '待办',
    t.isImportant ? '是' : '否',
    t.dueDate || '',
    t.createdAt || '',
    escapeCsv(t.note || ''),
  ])

  const csvContent = [
    headers.join(','),
    ...rows.map((r) => r.join(',')),
  ].join('\n')

  const bom = '\uFEFF'
  const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `tasks-export-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * 将笔记数据导出为 Markdown 合集并触发浏览器下载。
 * 每篇笔记用 --- 分隔，包含标题、日期、标签
 */
export async function exportNotesMarkdown(): Promise<void> {
  const notes = await notesApi.list().catch(() => [] as Note[])

  const parts = notes.map((note) => {
    const title = note.title || '无标题'
    const date = note.updatedAt || note.importedAt || ''
    const content = note.content || ''
    return [
      `# ${title}`,
      '',
      `> 日期：${date}`,
      '',
      content,
    ].join('\n')
  })

  const mdContent = parts.join('\n\n---\n\n')
  const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `notes-export-${new Date().toISOString().slice(0, 10)}.md`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * 导出所有数据（调用后端 API）并触发浏览器下载。
 * 复用后端 /api/backup/export 端点
 */
export async function exportFullData(): Promise<void> {
  const data = await backupApi.export()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `full-backup-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function escapeCsv(value: string): string {
  if (!value) return '""'
  // 如果包含逗号、引号或换行，用双引号包裹
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return `"${value}"`
}