import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ErrorBoundary, ProtectedRoute } from '@carflow/shared'
import { useAuth } from './contexts/AuthContext'
import './App.css'

// Lazy load pages for code splitting and better performance
const Dashboard = lazy(() => import('./pages/Dashboard').then(module => ({ default: module.Dashboard })))
const Analytics = lazy(() => import('./pages/Analytics').then(module => ({ default: module.Analytics })))
const Inventory = lazy(() => import('./pages/Inventory').then(module => ({ default: module.Inventory })))
const Leads = lazy(() => import('./pages/Leads').then(module => ({ default: module.Leads })))
const BookingRequests = lazy(() => import('./pages/BookingRequests').then(module => ({ default: module.BookingRequests })))
const Rentals = lazy(() => import('./pages/Rentals').then(module => ({ default: module.Rentals })))
const SwapRequests = lazy(() => import('./pages/SwapRequests').then(module => ({ default: module.SwapRequests })))
const Notifications = lazy(() => import('./pages/Notifications').then(module => ({ default: module.Notifications })))
const MessagesPage = lazy(() => import('./pages/MessagesPage').then((m) => ({ default: m.MessagesPage })))
const SubscriptionBilling = lazy(() => import('./pages/SubscriptionBilling').then(module => ({ default: module.SubscriptionBilling })))
const MaintenancePage = lazy(() => import('./pages/MaintenancePage').then(module => ({ default: module.MaintenancePage })))
const ReviewsPage = lazy(() => import('./pages/ReviewsPage').then(module => ({ default: module.ReviewsPage })))
const PayoutsPage = lazy(() => import('./pages/PayoutsPage').then(module => ({ default: module.PayoutsPage })))
const Settings = lazy(() => import('./pages/Settings').then(module => ({ default: module.Settings })))
const LoginPage = lazy(() => import('./pages/LoginPage').then(module => ({ default: module.LoginPage })))
const SignUpPage = lazy(() => import('./pages/SignUpPage').then(m => ({ default: m.SignUpPage })))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })))

// Loading fallback component
const LoadingFallback = () => (
  <div style={{ 
    display: 'flex', 
    justifyContent: 'center', 
    alignItems: 'center', 
    height: '100vh',
    fontSize: '16px',
    color: '#666'
  }}>
    Loading...
  </div>
)

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignUpPage />} />
            <Route element={<ProtectedRoute useAuth={useAuth} allow={['dealer']} />} >
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/inventory" element={<Inventory />} />
              <Route path="/leads" element={<Leads />} />
              <Route path="/requests" element={<BookingRequests />} />
              <Route path="/rentals" element={<Rentals />} />
              <Route path="/swaps" element={<SwapRequests />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/messages" element={<MessagesPage />} />
              <Route path="/subscription" element={<SubscriptionBilling />} />
              <Route path="/maintenance" element={<MaintenancePage />} />
              <Route path="/reviews" element={<ReviewsPage />} />
              <Route path="/payouts" element={<PayoutsPage />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App
