import { CarflowLogo } from '@carflow/shared'
import type { AdminPortalRole } from '@carflow/shared/types'
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
  Megaphone,
  MessagesSquare,
  Package,
  Receipt,
  ScrollText,
  Search,
  Settings,
  Tag,
  UserCog,
  Users,
  Wallet,
  Wrench,
  Zap,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { ADMIN_NAV_ITEMS, ADMIN_SETTINGS_ROLES, type AdminRouteAccess } from '../config/adminNav'
import { useAuth } from '../contexts/AuthContext'
import './AdminLayout.css'

export interface AdminLayoutProps {
  title: string
  subtitle: string
  children: ReactNode
}

type NavItem = {
  to: string
  label: string
  icon: ReactNode
  roles: AdminRouteAccess
}

const NAV_ICONS: Record<string, ReactNode> = {
  '/dashboard': <LayoutDashboard size={18} />,
  '/cars': <Car size={18} />,
  '/customers': <Users size={18} />,
  '/rental': <Receipt size={18} />,
  '/dealers': <Building2 size={18} />,
  '/payments': <CreditCard size={18} />,
  '/payouts': <Wallet size={18} />,
  '/disputes': <AlertTriangle size={18} />,
  '/plans': <Package size={18} />,
  '/promos': <Tag size={18} />,
  '/booking-requests': <Receipt size={18} />,
  '/maintenance': <Wrench size={18} />,
  '/jobs': <Zap size={18} />,
  '/staff': <UserCog size={18} />,
  '/complaints': <AlertTriangle size={18} />,
  '/messages': <MessagesSquare size={18} />,
  '/broadcasts': <Megaphone size={18} />,
  '/analytics': <LineChart size={18} />,
  '/audit': <ScrollText size={18} />,
}

const NAV_ITEMS: NavItem[] = ADMIN_NAV_ITEMS.map((item) => ({
  ...item,
  icon: NAV_ICONS[item.to] ?? <LayoutDashboard size={18} />,
}))

function canSeeNavItem(item: NavItem, role: AdminPortalRole | undefined): boolean {
  if (!role) return false
  if (item.roles === 'all') return true
  return item.roles.includes(role)
}

export function AdminLayout({ title, subtitle, children }: AdminLayoutProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { logout, session } = useAuth()
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const path = location.pathname

  const visibleNavItems = useMemo(
    () => NAV_ITEMS.filter((item) => canSeeNavItem(item, session?.role)),
    [session?.role]
  )

  const canSeeSettings = session?.role ? ADMIN_SETTINGS_ROLES.includes(session.role) : false

  return (
    <div className={`adminDash ${isSidebarCollapsed ? 'adminDash--collapsed' : ''}`}>
      <aside className="adminSidebar">
        <div className="adminSidebarInner">
          <div className="adminBrand">
            <img src={CarflowLogo} alt="Carflow" />
          </div>

          <nav className="adminNav" aria-label="Admin navigation">
            {visibleNavItems.map((item) => (
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
            {canSeeSettings ? (
              <NavLink to="/settings" className="adminNavItem">
                <span className="adminNavIcon" aria-hidden="true">
                  <Settings size={18} />
                </span>
                Settings
              </NavLink>
            ) : null}
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
            onClick={() => setIsSidebarCollapsed((prev) => !prev)}
          >
            <Menu size={18} />
          </button>
          <div className="adminTopbarTitleBlock">
            <div className="adminTopbarTitle">{title}</div>
            <div className="adminTopbarSub">{subtitle}</div>
          </div>
        </div>
        <div className="adminTopbarRight">
          <nav className="adminTopbarNav" aria-label="Quick links">
            <button
              className={`adminTopbarLink${path.startsWith('/dashboard') || path === '/' ? ' adminTopbarLink--active' : ''}`}
              type="button"
              onClick={() => navigate('/dashboard')}
            >
              <Home size={16} strokeWidth={1.75} />
              Home
            </button>
            {canSeeNavItem(NAV_ITEMS[1], session?.role) ? (
              <button
                className={`adminTopbarLink${path.startsWith('/cars') ? ' adminTopbarLink--active' : ''}`}
                type="button"
                onClick={() => navigate('/cars')}
              >
                <Car size={16} strokeWidth={1.75} />
                Cars
              </button>
            ) : null}
          </nav>
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
