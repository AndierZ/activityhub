import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { LoginPage }              from './pages/LoginPage'
import { StudentCalendarPage }    from './pages/StudentCalendarPage'
import { TeachersPage }           from './pages/TeachersPage'
import { TeacherDetailPage }      from './pages/TeacherDetailPage'
import { LogPage }                from './pages/LogPage'
import { StudentPaymentsPage }    from './pages/StudentPaymentsPage'
import { StudentStatementPage }   from './pages/StudentStatementPage'
import { ProfilePage }            from './pages/ProfilePage'
import { TeacherCalendarPage }    from './pages/TeacherCalendarPage'
import { TeacherPaymentsPage }    from './pages/TeacherPaymentsPage'
import { TeacherStatementPage }   from './pages/TeacherStatementPage'
import { AppShell }               from './components/layout/AppShell'
import { JoinPage }               from './pages/JoinPage'

function ProtectedRoutes() {
  const { user, loading, claimedTeacher } = useAuth()
  if (loading) return <div className="flex items-center justify-center h-screen"><div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" /></div>
  if (!user) return <Navigate to="/login" replace />

  if (claimedTeacher) {
    return (
      <AppShell>
        <Routes>
          <Route path="/"                          element={<Navigate to="/calendar" replace />} />
          <Route path="/calendar"                  element={<TeacherCalendarPage />} />
          <Route path="/payments"                  element={<TeacherPaymentsPage />} />
          <Route path="/payments/:userId/:childId" element={<TeacherStatementPage />} />
          <Route path="/profile"                   element={<ProfilePage />} />
          <Route path="*"                          element={<Navigate to="/calendar" replace />} />
        </Routes>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/"             element={<Navigate to="/calendar" replace />} />
        <Route path="/calendar"     element={<StudentCalendarPage />} />
        <Route path="/teachers"     element={<TeachersPage />} />
        <Route path="/teachers/:id" element={<TeacherDetailPage />} />
        <Route path="/log"      element={<LogPage />} />
        <Route path="/payments"                      element={<StudentPaymentsPage />} />
        <Route path="/payments/:childId/:teacherId"  element={<StudentStatementPage />} />
        <Route path="/profile"  element={<ProfilePage />} />
        <Route path="*"         element={<Navigate to="/calendar" replace />} />
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
