import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
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
import Statistiques from './pages/Statistiques'
import Acquisition from './pages/Acquisition'
import Extension from './pages/Extension'
import CommandesFournisseurs from './pages/CommandesFournisseurs'
import SavFournisseurs from './pages/SavFournisseurs'
import ProductDetail from './pages/ProductDetail'
import Orders from './pages/Orders'
import Settings from './pages/Settings'
import MySites from './pages/MySites'
import Suppliers from './pages/Suppliers'
import AfterSales from './pages/AfterSales'
import BetaAccess from './pages/BetaAccess'
import Privacy from './pages/Privacy'
import ReviewsPage from './pages/ReviewsPage'
import BillingPage from './pages/Billing'
import MarketAnalysisPage from './pages/MarketAnalysis'
import Veille from './pages/Veille'
import Rayons from './pages/Rayons'
import Agents from './pages/Agents'
import PhotoStudio from './pages/PhotoStudio'
import Marketing from './pages/Marketing'
import PlatformsSelling from './pages/PlatformsSelling'
import Accounting from './pages/Accounting'
import ApiLinks from './pages/ApiLinks'
import SupplierWatch from './pages/SupplierWatch'
import MyAds from './pages/MyAds'
import Categories from './pages/Categories'
import Tickets from './pages/Tickets'
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

/**
 * Fait défiler jusqu'à l'ancre de l'adresse — ce que le navigateur ferait
 * tout seul sur un site classique, et que React Router ne fait jamais.
 *
 * Sans lui, « Extension Chrome » (/acquisition#extension) et « Aide & contact »
 * (/guide#contact) changeaient l'adresse et laissaient la page en haut : le
 * vendeur voyait « Comment acquérir » et concluait que le bouton ne menait à
 * rien. Le petit délai réessaie le temps que la page async pose ses blocs.
 */
function DefileVersAncre() {
  const { hash, key, search } = useLocation()
  useEffect(() => {
    if (!hash) {
      // Les liens ?etat= changent d'onglet sur place : on n'y touche pas.
      if (!search) window.scrollTo(0, 0)
      return
    }
    const cible = hash.slice(1)
    /*
     * Viser une fois ne suffit pas : les blocs asynchrones du haut de page
     * (statistiques de section, listes) arrivent après le premier défilement
     * et poussent l'ancre de plusieurs centaines de pixels. On re-vise donc
     * pendant deux secondes et demie — premier mouvement fluide, corrections
     * sèches — jusqu'à ce que la page ait fini de bouger.
     */
    let essais = 0
    const tenter = () => {
      const el = document.getElementById(cible)
      if (el) el.scrollIntoView({ block: 'start', behavior: essais === 0 ? 'smooth' : 'auto' })
      if (++essais < 25) setTimeout(tenter, 180)
    }
    tenter()
    // `key` change à chaque navigation, même vers la même adresse : recliquer
    // sur « Extension Chrome » depuis la page refait défiler.
  }, [key, hash, search])
  return null
}

export default function App() {
  return (
    <ErrorBoundary>
    <BrowserRouter>
      <AuthProvider>
        <DefileVersAncre />
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
          <Route path="/statistiques" element={<Protected><Statistiques /></Protected>} />
          <Route path="/acquisition" element={<Protected><Acquisition /></Protected>} />
          <Route path="/extension" element={<Protected><Extension /></Protected>} />
          <Route path="/commandes-fournisseurs" element={<Protected><CommandesFournisseurs /></Protected>} />
          <Route path="/sav-fournisseurs" element={<Protected><SavFournisseurs /></Protected>} />
          <Route path="/products/:id" element={<Protected><ProductDetail /></Protected>} />
          <Route path="/orders" element={<Protected><Orders /></Protected>} />
          <Route path="/guide" element={<Protected><Guide /></Protected>} />
          <Route path="/settings" element={<Protected><Settings /></Protected>} />
          <Route path="/mes-sites" element={<Protected><MySites /></Protected>} />
          <Route path="/fournisseurs" element={<Protected><Suppliers /></Protected>} />
          <Route path="/autorisation-speciale" element={<Protected><BetaAccess /></Protected>} />
          <Route path="/sav" element={<Protected><AfterSales /></Protected>} />
          <Route path="/abonnement" element={<Protected><BillingPage /></Protected>} />
          <Route path="/livraisons" element={<Protected><Deliveries /></Protected>} />
          <Route path="/messages" element={<Protected><Messages /></Protected>} />
          <Route path="/pilote" element={<Protected><Autopilot /></Protected>} />
          <Route path="/marketing-photo" element={<Protected><PhotoStudio /></Protected>} />
          <Route path="/tickets" element={<Protected><Tickets /></Protected>} />
          <Route path="/categories" element={<Protected><Categories /></Protected>} />
          <Route path="/mes-pubs" element={<Protected><MyAds /></Protected>} />
          <Route path="/marketing" element={<Protected><Marketing /></Protected>} />
          {/*
            Les deux anciennes adresses menent a la page fusionnee.

            Elles sont dans des favoris, dans le guide, dans d anciens messages.
            Les laisser vivre montrerait la moitie de la verite : « Acquisition »
            sans les cles, « API Sourcing » sans le catalogue.
          */}
          <Route path="/plateformes-acquisition" element={<Navigate to="/fournisseurs" replace />} />
          <Route path="/plateformes-vente" element={<Protected><PlatformsSelling /></Protected>} />
          <Route path="/comptabilite" element={<Protected><Accounting /></Protected>} />
          <Route path="/api-links" element={<Protected><ApiLinks /></Protected>} />
          {/* API Connect : le meme ecran, sous le nom que le client lui donne. */}
          <Route path="/api-connect" element={<Protected><ApiLinks /></Protected>} />
          <Route path="/gestion-fournisseur" element={<Protected><SupplierWatch /></Protected>} />
          <Route path="/api-sourcing-connect" element={<Navigate to="/fournisseurs" replace />} />
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
