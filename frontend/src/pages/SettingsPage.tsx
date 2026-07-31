import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Sun, Moon, Monitor, Zap, ShieldAlert, Database, Trash2, Tags } from 'lucide-react'
import { settingsApi } from '@/lib/api'
import { useTheme } from '@/lib/theme'
import { SettingsSkeleton } from '@/components/PageSkeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { SettingCard } from '@/components/settings/SettingCard'
import { MsTodoSyncCard } from '@/components/settings/MsTodoSyncCard'
import { ImaSyncCard } from '@/components/settings/ImaSyncCard'
import { TelegramConfigCard } from '@/components/settings/TelegramConfigCard'
import { SyncLogCenter } from '@/components/settings/SyncLogCenter'
import { AiConfigManager } from '@/components/settings/AiConfigManager'
import { TagManager } from '@/components/tags/TagManager'

export function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const queryClient = useQueryClient()
  const [settingsTab, setSettingsTab] = useState('general')
  const [resetConfirmText, setResetConfirmText] = useState('')

  const { isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.get,
  })

  const resetMutation = useMutation({
    mutationFn: () => settingsApi.resetData(),
    onSuccess: () => {
      toast.success('数据已清空')
      queryClient.invalidateQueries()
    },
    onError: (err: Error) => {
      toast.error(`清空失败: ${err.message}`)
    },
  })

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <div className="icon-badge size-9 bg-gradient-to-br from-slate-500 to-slate-400 md:size-10">
          <Monitor className="size-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">设置</h1>
          <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">管理界面、AI 与同步配置</p>
        </div>
      </div>

      {isLoading ? (
        <SettingsSkeleton />
      ) : (
        <Tabs value={settingsTab} onValueChange={setSettingsTab}>
          <TabsList className="w-full justify-start gap-1 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <TabsTrigger value="general">通用</TabsTrigger>
            <TabsTrigger value="ai">AI</TabsTrigger>
            <TabsTrigger value="sync">同步</TabsTrigger>
            <TabsTrigger value="data">数据</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="mt-4 space-y-5">
            <SettingCard
              icon={Sun}
              title="界面主题"
              description="选择适合你的界面外观"
              gradient="from-orange-400 to-amber-400"
            >
              <RadioGroup
                value={theme}
                onValueChange={(v) => setTheme(v as 'light' | 'dark' | 'system')}
                className="grid grid-cols-1 gap-2 sm:grid-cols-3"
              >
                {[
                  { value: 'light', label: '亮色', icon: Sun },
                  { value: 'dark', label: '暗色', icon: Moon },
                  { value: 'system', label: '跟随系统', icon: Monitor },
                ].map((t) => (
                  <Label
                    key={t.value}
                    htmlFor={`theme-${t.value}`}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-border p-3 transition-all duration-200 hover:bg-accent/60 has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:checked]:shadow-sm"
                  >
                    <RadioGroupItem value={t.value} id={`theme-${t.value}`} />
                    <t.icon className="size-4" />
                    <span className="text-sm font-medium">{t.label}</span>
                  </Label>
                ))}
              </RadioGroup>
            </SettingCard>
            <SettingCard
              icon={Tags}
              title="标签管理"
              description="创建、编辑或删除标签，用于给任务和笔记分类"
              gradient="from-blue-500 to-cyan-500"
            >
              <TagManager />
            </SettingCard>
          </TabsContent>

          <TabsContent value="ai" className="mt-4 space-y-5">
            <SettingCard
              icon={Zap}
              title="AI 配置"
              description="配置 AI 分析、周报与任务拆解的模型来源（可添加多个并自由指定默认）"
              gradient="from-violet-500 to-fuchsia-500"
            >
              <AiConfigManager />
            </SettingCard>
          </TabsContent>

          <TabsContent value="sync" className="mt-4 space-y-5">
            <MsTodoSyncCard />
            <ImaSyncCard />
            <TelegramConfigCard />
            <SyncLogCenter />
          </TabsContent>

          <TabsContent value="data" className="mt-4 space-y-5">
            <Card className="overflow-hidden border-destructive/30 bg-destructive/5">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base text-destructive">
                  <div className="icon-badge size-7 bg-gradient-to-br from-red-500 to-rose-500">
                    <ShieldAlert className="size-4" />
                  </div>
                  危险操作
                </CardTitle>
                <CardDescription className="text-destructive/80">
                  以下操作会删除数据，请谨慎使用
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-3 rounded-2xl border border-destructive/20 bg-card p-4">
                  <div className="flex size-9 items-center justify-center rounded-xl bg-destructive/10">
                    <Database className="size-4 text-destructive" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">清空所有数据</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      永久删除所有任务、笔记、知识库及配置数据，且无法恢复。
                    </p>
                  </div>
                  <AlertDialog
                    onOpenChange={(open) => {
                      if (!open) setResetConfirmText('')
                    }}
                  >
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm" className="gap-2 rounded-lg">
                        <Trash2 className="size-4" /> 清空
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle className="text-destructive">
                          确认清空所有数据？
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          此操作将永久删除所有任务、笔记、知识库及配置数据，且无法恢复。
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <div className="space-y-3 py-2">
                        <div className="rounded-xl bg-destructive/5 p-3 text-sm text-destructive/80">
                          <p className="font-medium text-destructive">请先备份数据</p>
                          <p className="mt-1 text-xs">
                            在执行清空前，请确保已通过顶部菜单「导出数据」功能备份了重要信息。
                          </p>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">
                            请输入「确认清空」以继续
                          </Label>
                          <Input
                            value={resetConfirmText}
                            onChange={(e) => setResetConfirmText(e.target.value)}
                            placeholder="确认清空"
                            className="h-9 text-sm"
                          />
                        </div>
                      </div>
                      <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          disabled={resetConfirmText !== '确认清空'}
                          onClick={() => resetMutation.mutate()}
                        >
                          确认清空
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
