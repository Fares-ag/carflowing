import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ProtectedRoute } from './components/ProtectedRoute'
import './App.css'

// Lazy load pages for code splitting and better performance
const Dashboard = lazy(() => import('./pages/Dashboard').then(module => ({ default: module.Dashboard })))
const Analytics = lazy(() => import('./pages/Analytics').then(module => ({ default: module.Analytics })))
const Inventory = lazy(() => import('./pages/Inventory').then(module => ({ default: module.Inventory })))
const Leads = lazy(() => import('./pages/Leads').then(module => ({ default: module.Leads })))
const Notifications = lazy(() => import('./pages/Notifications').then(module => ({ default: module.Notifications })))
const SubscriptionBilling = lazy(() => import('./pages/SubscriptionBilling').then(module => ({ default: module.SubscriptionBilling })))
const Settings = lazy(() => import('./pages/Settings').then(module => ({ default: module.Settings })))
const LoginPage = lazy(() => import('./pages/LoginPage').then(module => ({ default: module.LoginPage })))

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
            <Route element={<ProtectedRoute allow={['dealer']} />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/inventory" element={<Inventory />} />
              <Route path="/leads" element={<Leads />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/subscription" element={<SubscriptionBilling />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App

