import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { AppLayout } from '@/components/AppLayout'
import { ErrorBoundary, RouteBoundary } from '@/components/ErrorBoundary'
import { PageSkeleton } from '@/components/PageSkeleton'
import { NotFound } from '@/pages/NotFound'

const LoginPage = lazy(() => import('@/pages/LoginPage').then((m) => ({ default: m.LoginPage })))
const DashboardPage = lazy(() => import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const TasksPage = lazy(() => import('@/pages/TasksPage').then((m) => ({ default: m.TasksPage })))
const NotesPage = lazy(() => import('@/pages/NotesPage').then((m) => ({ default: m.NotesPage })))
const KnowledgePage = lazy(() => import('@/pages/KnowledgePage').then((m) => ({ default: m.KnowledgePage })))
const AnalysisPage = lazy(() => import('@/pages/AnalysisPage').then((m) => ({ default: m.AnalysisPage })))
const ToolsPage = lazy(() => import('@/pages/ToolsPage').then((m) => ({ default: m.ToolsPage })))
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const SearchPage = lazy(() => import('@/pages/SearchPage').then((m) => ({ default: m.SearchPage })))
const MsTodoCallback = lazy(() => import('@/pages/MsTodoCallback').then((m) => ({ default: m.MsTodoCallback })))

function ProtectedRoutes() {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return (
    <Routes>
      <Route
        element={
          <Suspense fallback={<PageSkeleton />}>
            <AppLayout />
          </Suspense>
        }
      >
        <Route path="/" element={<RouteBoundary><DashboardPage /></RouteBoundary>} />
        <Route path="/tasks" element={<Navigate to="/tasks/all" replace />} />
        <Route path="/tasks/:view" element={<RouteBoundary><TasksPage /></RouteBoundary>} />
        <Route path="/tasks/list/:listId" element={<RouteBoundary><TasksPage /></RouteBoundary>} />
        <Route path="/notes" element={<RouteBoundary><NotesPage /></RouteBoundary>} />
        <Route path="/notes/:id" element={<RouteBoundary><NotesPage /></RouteBoundary>} />
        <Route path="/knowledge" element={<RouteBoundary><KnowledgePage /></RouteBoundary>} />
        <Route path="/knowledge/:id" element={<RouteBoundary><KnowledgePage /></RouteBoundary>} />
        <Route path="/analysis" element={<RouteBoundary><AnalysisPage /></RouteBoundary>} />
        <Route path="/search" element={<RouteBoundary><SearchPage /></RouteBoundary>} />
        <Route path="/tools" element={<RouteBoundary><ToolsPage /></RouteBoundary>} />
        <Route path="/settings" element={<RouteBoundary><SettingsPage /></RouteBoundary>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  const { isAuthenticated } = useAuth()
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <RouteBoundary><LoginPage /></RouteBoundary>} />
        <Route path="/oauth/ms-todo/callback" element={<RouteBoundary><MsTodoCallback /></RouteBoundary>} />
        <Route path="/*" element={<ProtectedRoutes />} />
      </Routes>
    </ErrorBoundary>
  )
}
