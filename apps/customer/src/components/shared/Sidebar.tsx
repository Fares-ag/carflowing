import { BarChart3, CreditCard, Settings } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import './Sidebar.css'

export function Sidebar() {
  const location = useLocation()
  
  const isActive = (path: string) => {
    return location.pathname === path
  }

  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">
        <Link 
          to="/dashboard" 
          className={`sidebar-item ${isActive('/dashboard') ? 'active' : ''}`}
        >
          <span className="sidebar-icon"><BarChart3 size={16} /></span>
          <span className="sidebar-label">Dashboard</span>
        </Link>
        <Link 
          to="/billing" 
          className={`sidebar-item ${isActive('/billing') ? 'active' : ''}`}
        >
          <span className="sidebar-icon"><CreditCard size={16} /></span>
          <span className="sidebar-label">Billing</span>
        </Link>
        <Link 
          to="/settings" 
          className={`sidebar-item ${isActive('/settings') ? 'active' : ''}`}
        >
          <span className="sidebar-icon"><Settings size={16} /></span>
          <span className="sidebar-label">Settings</span>
        </Link>
      </nav>
    </aside>
  )
}
