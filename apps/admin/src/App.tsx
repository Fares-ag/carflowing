import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { ErrorBoundary, ProtectedRoute, isAdminPortalRole, type AdminPortalRole } from '@carflow/shared'
import { useAuth } from './contexts/AuthContext'
import {
  ADMIN_ALL_PORTAL_ROLES,
  ADMIN_NAV_ITEMS,
  ADMIN_SETTINGS_ROLES,
  resolveRouteAllow,
} from './config/adminNav'
import { ForbiddenPage } from './pages/ForbiddenPage'
import './App.css'

const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const CarsPage = lazy(() => import('./pages/CarsPage').then((m) => ({ default: m.CarsPage })))
const RentalPage = lazy(() => import('./pages/RentalPage').then((m) => ({ default: m.RentalPage })))
const DealersPage = lazy(() => import('./pages/DealersPage').then((m) => ({ default: m.DealersPage })))
const CustomersPage = lazy(() => import('./pages/CustomersPage').then((m) => ({ default: m.CustomersPage })))
const PlansPage = lazy(() => import('./pages/PlansPage').then((m) => ({ default: m.PlansPage })))
const PromosPage = lazy(() => import('./pages/PromosPage').then((m) => ({ default: m.PromosPage })))
const BookingRequestsPage = lazy(() =>
  import('./pages/BookingRequestsPage').then((m) => ({ default: m.BookingRequestsPage }))
)
const ComplaintsPage = lazy(() => import('./pages/ComplaintsPage').then((m) => ({ default: m.ComplaintsPage })))
const PaymentsPage = lazy(() => import('./pages/PaymentsPage').then((m) => ({ default: m.PaymentsPage })))
const MessagesPage = lazy(() => import('./pages/MessagesPage').then((m) => ({ default: m.MessagesPage })))
const AdminAnalyticsPage = lazy(() =>
  import('./pages/AdminAnalyticsPage').then((m) => ({ default: m.AdminAnalyticsPage }))
)
const AuditLogPage = lazy(() => import('./pages/AuditLogPage').then((m) => ({ default: m.AuditLogPage })))
const PayoutsPage = lazy(() => import('./pages/PayoutsPage').then((m) => ({ default: m.PayoutsPage })))
const MaintenancePage = lazy(() => import('./pages/MaintenancePage').then((m) => ({ default: m.MaintenancePage })))
const JobsPage = lazy(() => import('./pages/JobsPage').then((m) => ({ default: m.JobsPage })))
const StaffPage = lazy(() => import('./pages/StaffPage').then((m) => ({ default: m.StaffPage })))
const BroadcastsPage = lazy(() => import('./pages/BroadcastsPage').then((m) => ({ default: m.BroadcastsPage })))
const DisputesPage = lazy(() => import('./pages/DisputesPage').then((m) => ({ default: m.DisputesPage })))
const LoginPage = lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })))

const LoadingFallback = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
    Loading...
  </div>
)

const navAllow = (path: string) => resolveRouteAllow(ADMIN_NAV_ITEMS.find((item) => item.to === path)!.roles)

function AdminRoute({ allow }: { allow: readonly AdminPortalRole[] }) {
  return (
    <ProtectedRoute
      useAuth={useAuth}
      allow={allow}
      portalRoleCheck={isAdminPortalRole}
      forbiddenFallback={<ForbiddenPage />}
    />
  )
}

function App() {
  return (
    <ErrorBoundary>
      <Toaster position="top-right" richColors />
      <BrowserRouter>
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<AdminRoute allow={ADMIN_ALL_PORTAL_ROLES} />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
            </Route>
            <Route element={<AdminRoute allow={navAllow('/cars')} />}>
              <Route path="/cars" element={<CarsPage />} />
            </Route>
            <Route element={<AdminRoute allow={navAllow('/customers')} />}>
              <Route path="/customers" element={<CustomersPage />} />
            </Route>
            <Route element={<AdminRoute allow={navAllow('/rental')} />}>
              <Route path="/rental" element={<RentalPage />} />
            </Route>
            <Route element={<AdminRoute allow={navAllow('/dealers')} />}>
              <Route path="/dealers" element={<DealersPage />} />
            </Route>
            <Route element={<AdminRoute allow={navAllow('/payments')} />}>
              <Route path="/payments" element={<PaymentsPage />} />
            </Route>
            <Route element={<AdminRoute allow={navAllow('/payouts')} />}>
              <Route path="/payouts" element={<PayoutsPage />} />
            </Route>
            <Route element={<AdminRoute allow={navAllow('/disputes')} />}>
              <Route path="/disputes" element={<DisputesPage />} />
            </Route>
            <Route element={<AdminRoute allow={navAllow('/maintenance')} />}>
              <Route path="/maintenance" element={<MaintenancePage />} />
            </Route>
            <Route element={<AdminRoute allow={navAllow('/jobs')} />}>
              <Route path="/jobs" element={<JobsPage />} />
            </Route>
            <Route element={<AdminRoute allow={navAllow('/plans')} />}>
              <Route path="/plans" element={<PlansPage />} />
            </Route>
            <Route element={<AdminRoute allow={navAllow('/promos')} />}>
              <Route path="/promos" element={<PromosPage />} />
            </Route>
            <Route element={<AdminRoute allow={navAllow('/booking-requests')} />}>
              <Route path="/booking-requests" element={<BookingRequestsPage />} />
            </Route>
            <Route element={<AdminRoute allow={navAllow('/staff')} />}>
              <Route path="/staff" element={<StaffPage />} />
            </Route>
            <Route element={<AdminRoute allow={navAllow('/complaints')} />}>
              <Route path="/complaints" element={<ComplaintsPage />} />
            </Route>
            <Route element={<AdminRoute allow={navAllow('/messages')} />}>
              <Route path="/messages" element={<MessagesPage />} />
            </Route>
            <Route element={<AdminRoute allow={navAllow('/broadcasts')} />}>
              <Route path="/broadcasts" element={<BroadcastsPage />} />
            </Route>
            <Route element={<AdminRoute allow={navAllow('/analytics')} />}>
              <Route path="/analytics" element={<AdminAnalyticsPage />} />
            </Route>
            <Route element={<AdminRoute allow={navAllow('/audit')} />}>
              <Route path="/audit" element={<AuditLogPage />} />
            </Route>
            <Route element={<AdminRoute allow={ADMIN_SETTINGS_ROLES} />}>
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App
