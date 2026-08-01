import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * 注册全局快捷键
 * - Cmd/Ctrl + K: 打开命令面板（已在 AppLayout 中注册）
 * - Cmd/Ctrl + N: 新建任务（跳转到 /tasks?new=1）
 * - Cmd/Ctrl + Shift + N: 新建笔记
 * - Cmd/Ctrl + J: 跳转到日记
 * - Cmd/Ctrl + ,: 打开设置
 * - Cmd/Ctrl + E: 切换主题
 * - Cmd/Ctrl + 1-4: 跳转到核心页面（首页/任务/笔记/知识库）
 */
export function useGlobalHotkeys({
  onToggleTheme,
  onOpenCommand,
}: {
  onToggleTheme?: () => void
  onOpenCommand?: () => void
}) {
  const navigate = useNavigate()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey

      // 跳过输入框中的快捷键
      const tag = (e.target as HTMLElement).tagName
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable

      if (!meta) return

      switch (e.key.toLowerCase()) {
        case 'k':
          // 命令面板 - 只在非输入框时触发
          if (!isInput) {
            e.preventDefault()
            onOpenCommand?.()
          }
          break
        case 'n':
          if (e.shiftKey) {
            // Cmd/Ctrl + Shift + N: 新建笔记
            if (!isInput) {
              e.preventDefault()
              navigate('/notes')
            }
          } else {
            // Cmd/Ctrl + N: 新建任务
            if (!isInput) {
              e.preventDefault()
              navigate('/tasks?new=1')
            }
          }
          break
        case 'j':
          // Cmd/Ctrl + J: 跳转到日记
          if (!isInput) {
            e.preventDefault()
            navigate('/journal')
          }
          break
        case ',':
          // Cmd/Ctrl + ,: 打开设置
          if (!isInput) {
            e.preventDefault()
            navigate('/settings')
          }
          break
        case 'e':
          // Cmd/Ctrl + E: 切换主题
          if (!isInput) {
            e.preventDefault()
            onToggleTheme?.()
          }
          break
        case '1':
          // Cmd/Ctrl + 1: 首页
          if (!isInput) {
            e.preventDefault()
            navigate('/')
          }
          break
        case '2':
          // Cmd/Ctrl + 2: 任务
          if (!isInput) {
            e.preventDefault()
            navigate('/tasks')
          }
          break
        case '3':
          // Cmd/Ctrl + 3: 笔记
          if (!isInput) {
            e.preventDefault()
            navigate('/notes')
          }
          break
        case '4':
          // Cmd/Ctrl + 4: 知识库
          if (!isInput) {
            e.preventDefault()
            navigate('/knowledge')
          }
          break
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigate, onToggleTheme, onOpenCommand])
}