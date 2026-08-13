import { memo } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { CarflowLogo } from '@carflow/shared'
import { useAuth } from '../contexts/AuthContext'
import {
  Bell,
  CalendarCheck,
  CreditCard,
  LayoutDashboard,
  LineChart,
  LogOut,
  Settings,
  Users,
  Wrench,
} from 'lucide-react'
import './Sidebar.css'

interface NavItem {
  path: string
  icon: string
  label: string
}

// Move nav items outside component to prevent recreation
const NAV_ITEMS: readonly NavItem[] = [
  { path: '/dashboard', icon: 'dashboard', label: 'Dashboard' },
  { path: '/analytics', icon: 'analytics', label: 'Analytics' },
  { path: '/inventory', icon: 'inventory', label: 'Inventory' },
  { path: '/requests', icon: 'requests', label: 'Booking Requests' },
  { path: '/leads', icon: 'leads', label: 'Leads' },
  { path: '/notifications', icon: 'notifications', label: 'Notifications' },
  { path: '/subscription', icon: 'subscription', label: 'Subscription' },
  { path: '/settings', icon: 'settings', label: 'Settings' },
] as const

export const Sidebar = memo(function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { session, logout } = useAuth()
  const user = session ? { name: session.name, email: session.email } : null

  const isActive = (path: string) => {
    return location.pathname === path
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="logo-icon">
            <img src={CarflowLogo} alt="Carflow" />
          </div>
          <div className="logo-text">
            <div className="logo-subtitle">Dealer Portal</div>
          </div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map(({ path, icon, label }) => (
          <Link 
            key={path}
            to={path} 
            className={`nav-item ${isActive(path) ? 'active' : ''}`}
          >
            <span className="nav-icon">
              {icon === 'dashboard' ? <LayoutDashboard size={16} /> : null}
              {icon === 'analytics' ? <LineChart size={16} /> : null}
              {icon === 'inventory' ? <Wrench size={16} /> : null}
              {icon === 'requests' ? <CalendarCheck size={16} /> : null}
              {icon === 'leads' ? <Users size={16} /> : null}
              {icon === 'notifications' ? <Bell size={16} /> : null}
              {icon === 'subscription' ? <CreditCard size={16} /> : null}
              {icon === 'settings' ? <Settings size={16} /> : null}
            </span>
            <span className="nav-label">{label}</span>
          </Link>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button
          className="nav-item logout"
          type="button"
          onClick={async () => {
            await logout().then(() => navigate('/login'))
          }}
        >
          <span className="nav-icon">
            <LogOut size={16} />
          </span>
          <span className="nav-label">Logout</span>
        </button>
        <div className="user-info">
          <div className="user-details">
            <div className="user-name">{user?.name ?? 'Account'}</div>
            <div className="user-email">{user?.email ?? '—'}</div>
          </div>
          <button
            className="user-edit"
            type="button"
            aria-label="Open settings"
            onClick={() => navigate('/settings')}
          >
            <Settings size={14} />
          </button>
          <div className="user-avatar">
            {(user?.name ?? 'Account')
              .split(' ')
              .map(part => part[0])
              .join('')
              .slice(0, 2)
              .toUpperCase()}
          </div>
        </div>
      </div>
    </aside>
  )
})
