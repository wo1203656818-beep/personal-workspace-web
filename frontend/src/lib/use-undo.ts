import { useCallback, useRef } from 'react'
import { toast } from 'sonner'

interface UndoEntry {
  label: string
  undo: () => Promise<void> | void
}

export function useUndo() {
  const stackRef = useRef<UndoEntry[]>([])

  const push = useCallback((entry: UndoEntry) => {
    stackRef.current.push(entry)
    toast(entry.label, {
      action: {
        label: '撤销',
        onClick: async () => {
          const last = stackRef.current.pop()
          if (last) await last.undo()
        },
      },
      duration: 5000,
    })
  }, [])

  return { push }
}
