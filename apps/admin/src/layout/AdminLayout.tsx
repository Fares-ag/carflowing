import type { ReactNode } from 'react'
import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  Bell,
  Building2,
  Car,
  CreditCard,
  Home,
  LayoutDashboard,
  LineChart,
  LogOut,
  Menu,
  MessagesSquare,
  Package,
  Receipt,
  Search,
  Settings,
  Users,
} from 'lucide-react'
import { CarflowLogo } from '@carflow/shared'
import { useAuth } from '../contexts/AuthContext'
import './AdminLayout.css'

export interface AdminLayoutProps {
  title: string
  subtitle: string
  children: ReactNode
}

const NAV_ITEMS: Array<{ to: string; label: string; icon: ReactNode }> = [
  { to: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { to: '/cars', label: 'Cars', icon: <Car size={18} /> },
  { to: '/customers', label: 'Customers', icon: <Users size={18} /> },
  { to: '/rental', label: 'Rental', icon: <Receipt size={18} /> },
  { to: '/dealers', label: 'Dealers', icon: <Building2 size={18} /> },
  { to: '/payments', label: 'Payments', icon: <CreditCard size={18} /> },
  { to: '/plans', label: 'Plans', icon: <Package size={18} /> },
  { to: '/booking-requests', label: 'Booking Requests', icon: <Receipt size={18} /> },
  { to: '/complaints', label: 'Complaints', icon: <AlertTriangle size={18} /> },
  { to: '/messages', label: 'Messages', icon: <MessagesSquare size={18} /> },
  { to: '/analytics', label: 'Analytics', icon: <LineChart size={18} /> },
]

export function AdminLayout({ title, subtitle, children }: AdminLayoutProps) {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  return (
    <div className={`adminDash ${isSidebarCollapsed ? 'adminDash--collapsed' : ''}`}>
      <aside className="adminSidebar">
        <div className="adminSidebarInner">
          <div className="adminBrand">
            <img src={CarflowLogo} alt="Carflow" />
          </div>
          <nav className="adminNav" aria-label="Admin navigation">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `adminNavItem ${isActive ? 'adminNavItem--active' : ''}`}
              >
                <span className="adminNavIcon" aria-hidden="true">
                  {item.icon}
                </span>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="adminSidebarBottom">
            <NavLink to="/settings" className="adminNavItem">
              <span className="adminNavIcon" aria-hidden="true">
                <Settings size={18} />
              </span>
              Settings
            </NavLink>
            <button
              className="adminNavItem adminNavItem--danger"
              type="button"
              onClick={async () => {
                await logout().then(() => navigate('/login'))
              }}
            >
              <span className="adminNavIcon" aria-hidden="true">
                <LogOut size={18} />
              </span>
              Logout
            </button>
          </div>
        </div>
      </aside>

      <header className="adminTopbar">
        <div className="adminTopbarLeft">
          <button
            className="adminIconBtn"
            type="button"
            aria-label="Menu"
            onClick={() => setIsSidebarCollapsed(prev => !prev)}
          >
            <Menu size={18} />
          </button>
          <div className="adminTopbarTitleBlock">
            <div className="adminTopbarTitle">{title}</div>
            <div className="adminTopbarSub">{subtitle}</div>
          </div>
        </div>
        <div className="adminTopbarRight">
          <button className="adminPillBtn" type="button" onClick={() => navigate('/dashboard')}>
            <Home size={16} />
            Home
          </button>
          <button className="adminPillBtn" type="button" onClick={() => navigate('/cars')}>
            <Car size={16} />
            Cars
          </button>
          <button
            className="adminIconBtn"
            type="button"
            aria-label="Search"
            onClick={() => navigate('/customers')}
          >
            <Search size={18} />
          </button>
          <button
            className="adminIconBtn adminIconBtn--dot"
            type="button"
            aria-label="Messages"
            onClick={() => navigate('/messages')}
          >
            <Bell size={18} />
          </button>
        </div>
      </header>

      <main className="adminMain">{children}</main>
    </div>
  )
}

