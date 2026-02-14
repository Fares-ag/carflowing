import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { HomePage } from './pages/HomePage'
import { BrowseCarsPage } from './pages/BrowseCarsPage'
import { ShoppingCartPage } from './pages/ShoppingCartPage'
import { Dashboard } from './pages/Dashboard'
import { MyRentals } from './pages/MyRentals'
import { MyFavorites } from './pages/MyFavorites'
import { MyRequests } from './pages/MyRequests'
import { SubscriptionBilling } from './pages/SubscriptionBilling'
import { LoginPage } from './pages/LoginPage'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/browse" element={<BrowseCarsPage />} />
        <Route path="/cart" element={<ShoppingCartPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute allow={['customer']} />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/rentals" element={<MyRentals />} />
          <Route path="/favorites" element={<MyFavorites />} />
          <Route path="/requests" element={<MyRequests />} />
          <Route path="/billing" element={<SubscriptionBilling />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
