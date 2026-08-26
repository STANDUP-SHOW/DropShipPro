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
import BillingPage from './pages/Billing'
import MarketAnalysisPage from './pages/MarketAnalysis'
import Veille from './pages/Veille'
import Rayons from './pages/Rayons'
import Agents from './pages/Agents'
import PhotoStudio from './pages/PhotoStudio'
import Marketing from './pages/Marketing'
import PlatformsSourcing from './pages/PlatformsSourcing'
import PlatformsSelling from './pages/PlatformsSelling'
import Accounting from './pages/Accounting'
import ApiLinks from './pages/ApiLinks'
import ApiSourcing from './pages/ApiSourcing'
import SupplierWatch from './pages/SupplierWatch'
import SupportAgent from './pages/SupportAgent'
import Autopilot from './pages/Autopilot'
import Messages from './pages/Messages'
import Deliveries from './pages/Deliveries'
import Rayon from './pages/Rayon'
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
          <Route path="/abonnement" element={<Protected><BillingPage /></Protected>} />
          <Route path="/livraisons" element={<Protected><Deliveries /></Protected>} />
          <Route path="/messages" element={<Protected><Messages /></Protected>} />
          <Route path="/pilote" element={<Protected><Autopilot /></Protected>} />
          <Route path="/marketing-photo" element={<Protected><PhotoStudio /></Protected>} />
          <Route path="/marketing" element={<Protected><Marketing /></Protected>} />
          <Route path="/plateformes-acquisition" element={<Protected><PlatformsSourcing /></Protected>} />
          <Route path="/plateformes-vente" element={<Protected><PlatformsSelling /></Protected>} />
          <Route path="/comptabilite" element={<Protected><Accounting /></Protected>} />
          <Route path="/api-links" element={<Protected><ApiLinks /></Protected>} />
          {/* API Connect : le meme ecran, sous le nom que le client lui donne. */}
          <Route path="/api-connect" element={<Protected><ApiLinks /></Protected>} />
          <Route path="/gestion-fournisseur" element={<Protected><SupplierWatch /></Protected>} />
          <Route path="/api-sourcing-connect" element={<Protected><ApiSourcing /></Protected>} />
          {/* Ancienne adresse de l atelier publicite : les liens deja envoyes doivent continuer de marcher. */}
          <Route path="/publicite" element={<Navigate to="/marketing" replace />} />
          <Route path="/agents" element={<Protected><Agents /></Protected>} />
          <Route path="/agents/:key" element={<Protected><SupportAgent /></Protected>} />
          <Route path="/rayons" element={<Protected><Rayons /></Protected>} />
          <Route path="/rayon/:id" element={<Protected><Rayon /></Protected>} />
          <Route path="/veille" element={<Protected><Veille /></Protected>} />
          <Route path="/analyse-marche" element={<Protected><MarketAnalysisPage /></Protected>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
    </ErrorBoundary>
  )
}
