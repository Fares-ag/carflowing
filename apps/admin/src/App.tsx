import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ProtectedRoute } from './components/ProtectedRoute'
import { DashboardPage } from './pages/DashboardPage'
import { CarsPage } from './pages/CarsPage'
import { RentalPage } from './pages/RentalPage'
import { DealersPage } from './pages/DealersPage'
import { CustomersPage } from './pages/CustomersPage'
import { PlansPage } from './pages/PlansPage'
import { BookingRequestsPage } from './pages/BookingRequestsPage'
import { ComplaintsPage } from './pages/ComplaintsPage'
import { PaymentsPage } from './pages/PaymentsPage'
import { MessagesPage } from './pages/MessagesPage'
import { AdminAnalyticsPage } from './pages/AdminAnalyticsPage'
import { LoginPage } from './pages/LoginPage'
import { SettingsPage } from './pages/SettingsPage'
import { Toaster } from 'sonner'
import './App.css'

function App() {
  return (
    <ErrorBoundary>
      <Toaster position="top-right" richColors />
      <BrowserRouter>
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
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App

