import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom'
import { ErrorBoundary, ProtectedRoute } from '@carflow/shared'
import { useAuth } from './contexts/AuthContext'
import { RouteErrorBoundary } from './components/shared/RouteErrorBoundary'
import { ScrollToTop } from './components/ScrollToTop'
import './App.css'

const HomePage = lazy(() => import('./pages/HomePage').then((m) => ({ default: m.HomePage })))
const BrowseCarsPage = lazy(() => import('./pages/BrowseCarsPage').then((m) => ({ default: m.BrowseCarsPage })))
const CarDetailPage = lazy(() => import('./pages/CarDetailPage').then((m) => ({ default: m.CarDetailPage })))
const MyBookingPage = lazy(() => import('./pages/MyBookingPage').then((m) => ({ default: m.MyBookingPage })))
const AccountSettings = lazy(() => import('./pages/AccountSettings').then((m) => ({ default: m.AccountSettings })))
const ContactPage = lazy(() => import('./pages/ContactPage').then((m) => ({ default: m.ContactPage })))
const FAQPage = lazy(() => import('./pages/FAQPage').then((m) => ({ default: m.FAQPage })))
const HowItWorksPage = lazy(() =>
  import('./pages/HowItWorksPage').then((m) => ({ default: m.HowItWorksPage }))
)
const LoginPage = lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })))
const SignUpPage = lazy(() => import('./pages/SignUpPage').then((m) => ({ default: m.SignUpPage })))
const ForgotPasswordPage = lazy(() =>
  import('./pages/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage }))
)
const ResetPasswordPage = lazy(() =>
  import('./pages/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage }))
)
const VerifyEmailPage = lazy(() =>
  import('./pages/VerifyEmailPage').then((m) => ({ default: m.VerifyEmailPage }))
)
const PaymentStatusPage = lazy(() =>
  import('./pages/PaymentStatusPage').then((m) => ({ default: m.PaymentStatusPage }))
)
const CheckoutPage = lazy(() =>
  import('./pages/CheckoutPage').then((m) => ({ default: m.CheckoutPage }))
)
const NotificationsPage = lazy(() =>
  import('./pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage }))
)
const MessagesPage = lazy(() =>
  import('./pages/MessagesPage').then((m) => ({ default: m.MessagesPage }))
)
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })))
const TermsPage = lazy(() => import('./pages/LegalPages').then((m) => ({ default: m.TermsPage })))
const PrivacyPage = lazy(() => import('./pages/LegalPages').then((m) => ({ default: m.PrivacyPage })))
const RefundPolicyPage = lazy(() =>
  import('./pages/LegalPages').then((m) => ({ default: m.RefundPolicyPage }))
)
const RentalAgreementPage = lazy(() =>
  import('./pages/LegalPages').then((m) => ({ default: m.RentalAgreementPage }))
)

const LoadingFallback = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
    Loading...
  </div>
)

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ScrollToTop />
        {/* Inside the router so the fallback can offer a real recovery path,
            and around Suspense so a failed lazy chunk lands here instead of
            unmounting the app into a white screen. */}
        <RouteErrorBoundary>
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/browse" element={<BrowseCarsPage />} />
              <Route path="/car/:id" element={<CarDetailPage />} />
              <Route path="/cart" element={<Navigate to="/browse" replace state={{ legacyRedirect: 'cart' }} />} />
              <Route path="/dashboard" element={<Navigate to="/my-booking" replace />} />
              <Route path="/requests" element={<Navigate to="/my-booking" replace />} />
              <Route path="/rentals" element={<Navigate to="/my-booking" replace />} />
              <Route path="/booking-confirmed" element={<Navigate to="/my-booking" replace />} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="/faqs" element={<FAQPage />} />
              <Route path="/how-it-works" element={<HowItWorksPage />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/refund-policy" element={<RefundPolicyPage />} />
              <Route path="/rental-agreement" element={<RentalAgreementPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignUpPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/verify-email" element={<VerifyEmailPage />} />
              <Route element={<ProtectedRoute useAuth={useAuth} allow={['customer']} />}>
                <Route path="/checkout" element={<CheckoutPage />} />
                <Route path="/my-booking" element={<MyBookingPage />} />
                <Route path="/payment-status" element={<PaymentStatusPage />} />
                <Route path="/favorites" element={<Navigate to="/settings?section=saved" replace />} />
                <Route path="/billing" element={<Navigate to="/settings?section=billing" replace />} />
                <Route path="/settings" element={<AccountSettings />} />
                <Route path="/notifications" element={<NotificationsPage />} />
                <Route path="/messages" element={<MessagesPage />} />
              </Route>
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </RouteErrorBoundary>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App
