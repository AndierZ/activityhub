import { useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect, type ReactNode } from 'react'
import { useAuth } from '../../hooks/useAuth'

function IOSInstallBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const ua = navigator.userAgent
    const isIOS = /iphone|ipad|ipod/i.test(ua)
    const isSafari = isIOS && !/CriOS|FxiOS|OPiOS/i.test(ua)
    const isStandalone =
      ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone) ||
      window.matchMedia('(display-mode: standalone)').matches
    const dismissed = localStorage.getItem('ios_install_dismissed') === '1'
    if (isSafari && !isStandalone && !dismissed) setVisible(true)
  }, [])

  if (!visible) return null

  function dismiss() {
    localStorage.setItem('ios_install_dismissed', '1')
    setVisible(false)
  }

  return (
    <div
      className="flex-shrink-0 flex items-start gap-3 px-4 py-3 mx-3 mb-2 rounded-[14px]"
      style={{ background: '#EEEBfd', border: '0.5px solid #C8C2F5' }}
    >
      <i className="ti ti-device-mobile-plus flex-shrink-0 mt-0.5" style={{ fontSize: 18, color: '#7C6EE6' }} />
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold" style={{ color: '#1A1A2E' }}>
          Add to Home Screen
        </div>
        <div className="text-[12px] mt-0.5 leading-snug" style={{ color: '#555566' }}>
          Tap <i className="ti ti-dots" style={{ fontSize: 11 }} /> in the bottom-right of Safari,
          then <i className="ti ti-square-arrow-up" style={{ fontSize: 11 }} /> <strong>Share</strong>,
          then scroll down to <strong>Add to Home Screen</strong>.
        </div>
      </div>
      <button onClick={dismiss} className="flex-shrink-0 p-0.5" aria-label="Dismiss">
        <i className="ti ti-x" style={{ fontSize: 15, color: '#999AAA' }} />
      </button>
    </div>
  )
}

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
  { path: '/my-schedule', label: 'Calendar', icon: 'ti-calendar'    },
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

      <IOSInstallBanner />

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
