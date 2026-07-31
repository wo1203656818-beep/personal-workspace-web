import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { authApi } from '@/lib/api'
import { toast } from 'sonner'

export function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [pwdForm, setPwdForm] = useState({ old: '', new: '', confirm: '' })
  const [pwdLoading, setPwdLoading] = useState(false)

  const handleChangePassword = async () => {
    if (pwdForm.new !== pwdForm.confirm) {
      toast.error('两次输入的新密码不一致')
      return
    }
    if (pwdForm.new.length < 6) {
      toast.error('新密码至少 6 位')
      return
    }
    setPwdLoading(true)
    try {
      await authApi.changePassword({ oldPassword: pwdForm.old, newPassword: pwdForm.new })
      toast.success('密码已修改，下次登录请使用新密码')
      onOpenChange(false)
      setPwdForm({ old: '', new: '', confirm: '' })
    } catch (e) {
      toast.error(`修改失败: ${(e as Error).message}`)
    } finally {
      setPwdLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <KeyRound className="size-5 text-primary" />
            修改密码
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">旧密码</label>
            <input
              type="password"
              value={pwdForm.old}
              onChange={(e) => setPwdForm((p) => ({ ...p, old: e.target.value }))}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">新密码（至少 6 位）</label>
            <input
              type="password"
              value={pwdForm.new}
              onChange={(e) => setPwdForm((p) => ({ ...p, new: e.target.value }))}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">确认新密码</label>
            <input
              type="password"
              value={pwdForm.confirm}
              onChange={(e) => setPwdForm((p) => ({ ...p, confirm: e.target.value }))}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleChangePassword} disabled={pwdLoading}>
            {pwdLoading ? '保存中...' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
