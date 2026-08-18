import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { LoadingScreen } from './components/LoadingScreen'
import { ErrorBoundary } from './components/ErrorBoundary'
import Index from './pages/Index'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import VerifyEmail from './pages/VerifyEmail'
import Dashboard from './pages/Dashboard'
import ProductDetail from './pages/ProductDetail'
import Orders from './pages/Orders'
import Settings from './pages/Settings'
import Privacy from './pages/Privacy'
import ReviewsPage from './pages/ReviewsPage'
import Guide from './pages/Guide'

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen message="Vérification de votre session…" />
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <ErrorBoundary>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          {/* Public on purpose: the Chrome Web Store listing links to it. */}
          <Route path="/confidentialite" element={<Privacy />} />
          {/* Public : un visiteur sans compte doit pouvoir lire les avis. */}
          <Route path="/avis" element={<ReviewsPage />} />
          <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
          <Route path="/products/:id" element={<Protected><ProductDetail /></Protected>} />
          <Route path="/orders" element={<Protected><Orders /></Protected>} />
          <Route path="/guide" element={<Protected><Guide /></Protected>} />
          <Route path="/settings" element={<Protected><Settings /></Protected>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
    </ErrorBoundary>
  )
}
