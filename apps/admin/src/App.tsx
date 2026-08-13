import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Toaster } from 'sonner'
import './App.css'

const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const CarsPage = lazy(() => import('./pages/CarsPage').then((m) => ({ default: m.CarsPage })))
const RentalPage = lazy(() => import('./pages/RentalPage').then((m) => ({ default: m.RentalPage })))
const DealersPage = lazy(() => import('./pages/DealersPage').then((m) => ({ default: m.DealersPage })))
const CustomersPage = lazy(() => import('./pages/CustomersPage').then((m) => ({ default: m.CustomersPage })))
const PlansPage = lazy(() => import('./pages/PlansPage').then((m) => ({ default: m.PlansPage })))
const BookingRequestsPage = lazy(() =>
  import('./pages/BookingRequestsPage').then((m) => ({ default: m.BookingRequestsPage }))
)
const ComplaintsPage = lazy(() => import('./pages/ComplaintsPage').then((m) => ({ default: m.ComplaintsPage })))
const PaymentsPage = lazy(() => import('./pages/PaymentsPage').then((m) => ({ default: m.PaymentsPage })))
const MessagesPage = lazy(() => import('./pages/MessagesPage').then((m) => ({ default: m.MessagesPage })))
const AdminAnalyticsPage = lazy(() =>
  import('./pages/AdminAnalyticsPage').then((m) => ({ default: m.AdminAnalyticsPage }))
)
const LoginPage = lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })))

const LoadingFallback = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
    Loading...
  </div>
)

function App() {
  return (
    <ErrorBoundary>
      <Toaster position="top-right" richColors />
      <BrowserRouter>
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute allow={['admin']} />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/cars" element={<CarsPage />} />
              <Route path="/customers" element={<CustomersPage />} />
              <Route path="/rental" element={<RentalPage />} />
              <Route path="/dealers" element={<DealersPage />} />
              <Route path="/payments" element={<PaymentsPage />} />
              <Route path="/plans" element={<PlansPage />} />
              <Route path="/booking-requests" element={<BookingRequestsPage />} />
              <Route path="/complaints" element={<ComplaintsPage />} />
              <Route path="/messages" element={<MessagesPage />} />
              <Route path="/analytics" element={<AdminAnalyticsPage />} />
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
