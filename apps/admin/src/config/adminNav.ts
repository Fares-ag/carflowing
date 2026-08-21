import { ADMIN_PORTAL_ROLES, type AdminPortalRole } from '@carflow/shared/types'

export type AdminRouteAccess = AdminPortalRole[] | 'all'

export type AdminNavItemConfig = {
  to: string
  label: string
  roles: AdminRouteAccess
}

/** Sidebar + route RBAC — keep in sync with App.tsx ProtectedRoute groups. */
export const ADMIN_NAV_ITEMS: AdminNavItemConfig[] = [
  { to: '/dashboard', label: 'Dashboard', roles: 'all' },
  { to: '/cars', label: 'Cars', roles: ['admin', 'ops'] },
  { to: '/customers', label: 'Customers', roles: ['admin', 'support'] },
  { to: '/rental', label: 'Rental', roles: ['admin', 'ops'] },
  { to: '/dealers', label: 'Dealers', roles: ['admin'] },
  { to: '/payments', label: 'Payments', roles: ['admin', 'finance'] },
  { to: '/payouts', label: 'Payouts', roles: ['admin', 'finance'] },
  { to: '/disputes', label: 'Disputes', roles: ['admin', 'finance'] },
  { to: '/plans', label: 'Plans', roles: ['admin'] },
  { to: '/promos', label: 'Promos', roles: ['admin'] },
  { to: '/booking-requests', label: 'Booking Requests', roles: ['admin'] },
  { to: '/maintenance', label: 'Maintenance', roles: ['admin', 'ops'] },
  { to: '/jobs', label: 'Jobs', roles: ['admin', 'ops'] },
  { to: '/staff', label: 'Staff', roles: ['admin'] },
  { to: '/complaints', label: 'Complaints', roles: ['admin', 'support'] },
  { to: '/messages', label: 'Messages', roles: ['admin', 'support'] },
  { to: '/broadcasts', label: 'Broadcasts', roles: ['admin'] },
  { to: '/analytics', label: 'Analytics', roles: ['admin'] },
  { to: '/audit', label: 'Audit Log', roles: ['admin'] },
]

export const ADMIN_SETTINGS_ROLES: AdminPortalRole[] = ['admin']

export const ADMIN_ALL_PORTAL_ROLES = ADMIN_PORTAL_ROLES

export function resolveRouteAllow(roles: AdminRouteAccess): readonly AdminPortalRole[] {
  return roles === 'all' ? ADMIN_PORTAL_ROLES : roles
}

export function canAccessRoute(path: string, role: AdminPortalRole | undefined): boolean {
  if (!role) return false
  if (path === '/settings') return ADMIN_SETTINGS_ROLES.includes(role)
  const item = ADMIN_NAV_ITEMS.find((entry) => entry.to === path)
  if (!item) return false
  return resolveRouteAllow(item.roles).includes(role)
}
