import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { LoginPage }    from './pages/LoginPage'
import { CalendarPage } from './pages/CalendarPage'
import { TeachersPage }       from './pages/TeachersPage'
import { TeacherDetailPage } from './pages/TeacherDetailPage'
import { LogPage }           from './pages/LogPage'
import { PaymentsPage }   from './pages/PaymentsPage'
import { StatementPage }  from './pages/StatementPage'
import { ProfilePage }    from './pages/ProfilePage'
import { AppShell }     from './components/layout/AppShell'
import { JoinPage }     from './pages/JoinPage'

function ProtectedRoutes() {
  const { user, loading } = useAuth()
  if (loading) return <div className="flex items-center justify-center h-screen"><div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" /></div>
  if (!user) return <Navigate to="/login" replace />
  return (
    <AppShell>
      <Routes>
        <Route path="/"         element={<CalendarPage />} />
        <Route path="/teachers"     element={<TeachersPage />} />
        <Route path="/teachers/:id" element={<TeacherDetailPage />} />
        <Route path="/log"      element={<LogPage />} />
        <Route path="/payments"                      element={<PaymentsPage />} />
        <Route path="/payments/:childId/:teacherId"  element={<StatementPage />} />
        <Route path="/profile"  element={<ProfilePage />} />
<Route path="*"         element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login"        element={<LoginPage />} />
          <Route path="/join/:token"  element={<JoinPage />} />
          <Route path="/*"            element={<ProtectedRoutes />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
