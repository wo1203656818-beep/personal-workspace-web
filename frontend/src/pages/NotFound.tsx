import { Link } from 'react-router-dom'
import { Ghost } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function NotFound() {
  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-6 p-8 text-center">
      <Ghost className="size-20 text-muted-foreground" />
      <div className="space-y-2">
        <h1 className="text-5xl font-bold tracking-tight">404</h1>
        <p className="text-muted-foreground">页面不存在</p>
      </div>
      <Button asChild>
        <Link to="/">返回首页</Link>
      </Button>
    </div>
  )
}
