import { Suspense } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { AppLayout } from '@/components/AppLayout'
import { RouteBoundary } from '@/components/ErrorBoundary'
import { PageSkeleton } from '@/components/PageSkeleton'
import { NotFound } from '@/pages/NotFound'
import { lazyImport } from '@/lib/lazy'

const LoginPage = lazyImport(() => import('@/pages/LoginPage').then((m) => ({ default: m.LoginPage })))
const DashboardPage = lazyImport(() =>
  import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
)
const TasksPage = lazyImport(() => import('@/pages/TasksPage').then((m) => ({ default: m.TasksPage })))
const NotesPage = lazyImport(() => import('@/pages/NotesPage').then((m) => ({ default: m.NotesPage })))
const KnowledgePage = lazyImport(() =>
  import('@/pages/KnowledgePage').then((m) => ({ default: m.KnowledgePage })),
)
const SettingsPage = lazyImport(() =>
  import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
)
const MsTodoCallback = lazyImport(() =>
  import('@/pages/MsTodoCallback').then((m) => ({ default: m.MsTodoCallback })),
)
const NewsPage = lazyImport(() => import('@/pages/NewsPage'))
const MonitorPage = lazyImport(() =>
  import('@/pages/MonitorPage').then((m) => ({ default: m.MonitorPage })),
)
const ToolsPage = lazyImport(() =>
  import('@/pages/ToolsPage').then((m) => ({ default: m.ToolsPage })),
)
const AnalysisPage = lazyImport(() =>
  import('@/pages/AnalysisPage').then((m) => ({ default: m.AnalysisPage })),
)
const HabitsPage = lazyImport(() =>
  import('@/pages/HabitsPage').then((m) => ({ default: m.HabitsPage })),
)
const FocusPage = lazyImport(() =>
  import('@/pages/FocusPage').then((m) => ({ default: m.FocusPage })),
)
const GoalsPage = lazyImport(() =>
  import('@/pages/GoalsPage').then((m) => ({ default: m.GoalsPage })),
)
const CollectionsPage = lazyImport(() =>
  import('@/pages/CollectionsPage').then((m) => ({ default: m.CollectionsPage })),
)
const CalendarPage = lazyImport(() =>
  import('@/pages/CalendarPage').then((m) => ({ default: m.CalendarPage })),
)
const RecordsPage = lazyImport(() =>
  import('@/pages/RecordsPage').then((m) => ({ default: m.RecordsPage })),
)
const JournalPage = lazyImport(() =>
  import('@/pages/JournalPage').then((m) => ({ default: m.JournalPage })),
)
const BackupPage = lazyImport(() =>
  import('@/pages/BackupPage').then((m) => ({ default: m.BackupPage })),
)
const FilesPage = lazyImport(() =>
  import('@/pages/FilesPage').then((m) => ({ default: m.FilesPage })),
)
const ChatPage = lazyImport(() =>
  import('@/pages/ChatPage').then((m) => ({ default: m.ChatPage })),
)
const ToolsRouter = lazyImport(() =>
  import('@/pages/ToolsRouter').then((m) => ({ default: m.ToolsRouter })),
)

function LoginGuard() {
  const { isAuthenticated } = useAuth()
  if (isAuthenticated) return <Navigate to="/" replace />
  return <RouteBoundary><LoginPage /></RouteBoundary>
}

function ProtectedLayout() {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AppLayout />
    </Suspense>
  )
}

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginGuard />,
  },
  {
    path: '/oauth/ms-todo/callback',
    element: (
      <RouteBoundary>
        <MsTodoCallback />
      </RouteBoundary>
    ),
  },
  {
    path: '/',
    element: <ProtectedLayout />,
    children: [
      { index: true, element: <RouteBoundary><DashboardPage /></RouteBoundary> },
      { path: 'tasks', element: <RouteBoundary><TasksPage /></RouteBoundary> },
      { path: 'tasks/today', element: <RouteBoundary><TasksPage /></RouteBoundary> },
      { path: 'tasks/:view', element: <RouteBoundary><TasksPage /></RouteBoundary> },
      { path: 'tasks/list/:listId', element: <RouteBoundary><TasksPage /></RouteBoundary> },
      { path: 'notes', element: <RouteBoundary><NotesPage /></RouteBoundary> },
      { path: 'notes/:id', element: <RouteBoundary><NotesPage /></RouteBoundary> },
      { path: 'knowledge', element: <RouteBoundary><KnowledgePage /></RouteBoundary> },
      { path: 'knowledge/:id', element: <RouteBoundary><KnowledgePage /></RouteBoundary> },
      { path: 'settings', element: <RouteBoundary><SettingsPage /></RouteBoundary> },
      { path: 'news/*', element: <RouteBoundary><NewsPage /></RouteBoundary> },
      { path: 'monitor', element: <RouteBoundary><MonitorPage /></RouteBoundary> },
      { path: 'tools', element: <RouteBoundary><ToolsPage /></RouteBoundary> },
      { path: 'tools/:toolId', element: <RouteBoundary><ToolsRouter /></RouteBoundary> },
      { path: 'analysis', element: <RouteBoundary><AnalysisPage /></RouteBoundary> },
      { path: 'habits', element: <RouteBoundary><HabitsPage /></RouteBoundary> },
      { path: 'focus', element: <RouteBoundary><FocusPage /></RouteBoundary> },
      { path: 'goals', element: <RouteBoundary><GoalsPage /></RouteBoundary> },
      { path: 'collections', element: <RouteBoundary><CollectionsPage /></RouteBoundary> },
      { path: 'records', element: <RouteBoundary><RecordsPage /></RouteBoundary> },
      { path: 'journal', element: <RouteBoundary><JournalPage /></RouteBoundary> },
      { path: 'backup', element: <RouteBoundary><BackupPage /></RouteBoundary> },
      { path: 'files', element: <RouteBoundary><FilesPage /></RouteBoundary> },
      { path: 'chat', element: <RouteBoundary><ChatPage /></RouteBoundary> },
      { path: 'calendar', element: <RouteBoundary><CalendarPage /></RouteBoundary> },
      { path: '*', element: <NotFound /> },
    ],
  },
])