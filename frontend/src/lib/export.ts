import { tasksApi, notesApi, kbApi, settingsApi, taskListsApi, type Task, type Note, type KbDocument, type TaskList } from './api'

// 敏感键白名单：导出时剔除
const SENSITIVE_KEYS = ['password_hash', 'ms_refresh_token', 'ima_api_key', 'custom_ai_api_key', 'ai_api_key']

/**
 * 导出全部数据为 JSON 文件并触发浏览器下载。
 * 包含：任务列表 / 任务 / 笔记 / 知识库元数据 / 设置（非敏感部分）。
 * 不包含：知识库文件二进制（仅元数据）、敏感凭据。
 */
export async function exportAllData(): Promise<void> {
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')

  // 并发拉取所有数据
  const [lists, notes, kbDocs, settings] = await Promise.all([
    taskListsApi.list().catch(() => [] as TaskList[]),
    notesApi.list().catch(() => [] as Note[]),
    kbApi.list().catch(() => [] as KbDocument[]),
    settingsApi.get().catch(() => ({}) as Record<string, string>),
  ])

  // 任务按列表分组拉取
  const allTasks: Task[] = []
  for (const list of lists) {
    try {
      const tasks = await tasksApi.byList(list.id)
      allTasks.push(...tasks)
    } catch {
      // 单个列表失败不影响整体导出
    }
  }

  // 过滤敏感键
  const safeSettings = Object.fromEntries(
    Object.entries(settings).filter(([k]) => !SENSITIVE_KEYS.includes(k))
  )

  const payload = {
    exportedAt: new Date().toISOString(),
    version: 1,
    taskLists: lists,
    tasks: allTasks,
    notes,
    knowledgeBase: kbDocs.map((d) => ({
      id: d.id,
      title: d.title,
      fileType: d.fileType,
      importedAt: d.importedAt,
      updatedAt: d.updatedAt,
      // 不导出 content 和 r2Key（content 可能很大，r2Key 是存储路径）
    })),
    settings: safeSettings,
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `workbench-export-${timestamp}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
