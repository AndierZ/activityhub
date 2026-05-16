import { useLocation, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../../hooks/useAuth'

interface NavItem {
  path:  string
  label: string
  icon:  string
}

const PARENT_NAV: NavItem[] = [
  { path: '/',         label: 'Calendar', icon: 'ti-calendar'    },
  { path: '/teachers', label: 'Teachers', icon: 'ti-users'       },
  { path: '/log',      label: 'Log',      icon: 'ti-plus'        },
  { path: '/payments', label: 'Payments', icon: 'ti-credit-card' },
  { path: '/profile',  label: 'Profile',  icon: 'ti-user'        },
]

const TEACHER_NAV: NavItem[] = [
  { path: '/my-schedule', label: 'Schedule', icon: 'ti-calendar'    },
  { path: '/payments',    label: 'Payments', icon: 'ti-credit-card' },
  { path: '/profile',     label: 'Profile',  icon: 'ti-user'        },
]

interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const location = useLocation()
  const navigate  = useNavigate()
  const { claimedTeacher } = useAuth()

  const navItems = claimedTeacher ? TEACHER_NAV : PARENT_NAV

  return (
    <div className="phone-shell">
      <main className="flex-1 overflow-hidden flex flex-col">
        {children}
      </main>

      <nav className="flex-shrink-0 h-20 border-t border-gray-100 bg-white flex items-start pt-2.5">
        {navItems.map(item => {
          const isLog    = item.path === '/log'
          const isActive = location.pathname === item.path

          if (isLog) {
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="flex-1 flex flex-col items-center gap-0"
                aria-label="Log activity"
              >
                <div className="w-11 h-11 bg-primary-600 rounded-full flex items-center justify-center -mt-3.5 shadow-lg shadow-primary-600/35">
                  <i className="ti ti-plus text-white text-xl" aria-hidden="true" />
                </div>
                <span className="text-[10px] font-medium text-gray-400 mt-0.5">Log</span>
              </button>
            )
          }

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-1 transition-colors ${
                isActive ? 'text-primary-600' : 'text-gray-400'
              }`}
            >
              <i className={`ti ${item.icon} text-xl`} aria-hidden="true" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
