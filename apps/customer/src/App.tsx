import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ProtectedRoute } from './components/ProtectedRoute'
import { HomePage } from './pages/HomePage'
import { BrowseCarsPage } from './pages/BrowseCarsPage'
import { CarDetailPage } from './pages/CarDetailPage'
import { ShoppingCartPage } from './pages/ShoppingCartPage'
import { CheckoutPage } from './pages/CheckoutPage'
import { BookingConfirmedPage } from './pages/BookingConfirmedPage'
import { Dashboard } from './pages/Dashboard'
import { MyRentals } from './pages/MyRentals'
import { MyFavorites } from './pages/MyFavorites'
import { MyRequests } from './pages/MyRequests'
import { SubscriptionBilling } from './pages/SubscriptionBilling'
import { AccountSettings } from './pages/AccountSettings'
import { ContactPage } from './pages/ContactPage'
import { FAQPage } from './pages/FAQPage'
import { LoginPage } from './pages/LoginPage'
import { SignUpPage } from './pages/SignUpPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import './App.css'

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/browse" element={<BrowseCarsPage />} />
          <Route path="/car/:id" element={<CarDetailPage />} />
          <Route path="/cart" element={<ShoppingCartPage />} />
          <Route path="/booking-confirmed" element={<BookingConfirmedPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/faqs" element={<FAQPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignUpPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route element={<ProtectedRoute allow={['customer']} />}>
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/rentals" element={<MyRentals />} />
            <Route path="/favorites" element={<MyFavorites />} />
            <Route path="/requests" element={<MyRequests />} />
            <Route path="/billing" element={<SubscriptionBilling />} />
            <Route path="/settings" element={<AccountSettings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App
