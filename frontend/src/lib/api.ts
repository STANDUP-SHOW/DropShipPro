import type { PlatformInfo } from './platforms'
// In dev, Vite proxies /api to localhost:4000 (see vite.config.ts). In production
// the frontend (Vercel) and backend (Railway) are on different hosts, so the
// deployed build needs the absolute backend URL via VITE_API_URL.
const CONFIGURED_API = import.meta.env.VITE_API_URL?.replace(/\/$/, '') ?? ''

/**
 * Where the API lives when the build variable is missing.
 *
 * Vite freezes VITE_* at build time, so losing that variable ships a bundle that
 * calls its own domain for everything — and Vercel answers 405 to any POST. The
 * whole application dies, login included, behind an error code that explains
 * nothing. It happened. A deployed build now falls back to the known API rather
 * than to an address that cannot work.
 */
const FALLBACK_API = 'https://dropshippro-production.up.railway.app'

const isLocal =
  typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)

/**
 * A configured value is only trusted when it looks like an address.
 *
 * The variable was once overwritten with a Stripe publishable key, and the app
 * cheerfully built every request on `pk_test_…/api/…` — a relative path that
 * lands on the site itself, where Vercel answers 405 to any POST. Nothing
 * worked, login included, and the error code pointed nowhere. A value that is
 * not an http address is now ignored rather than used.
 */
const looksLikeUrl = (value: string) =>
  value.startsWith('http://') || value.startsWith('https://')

const usable = CONFIGURED_API && looksLikeUrl(CONFIGURED_API) ? CONFIGURED_API : ''

if (CONFIGURED_API && !usable) {
  console.error(
    "VITE_API_URL ne ressemble pas à une adresse http, elle est ignorée. Valeur reçue :",
    CONFIGURED_API.slice(0, 12) + '…',
  )
}

// Empty on localhost so the Vite dev proxy keeps doing its job.
const API_ROOT = usable || (isLocal ? '' : FALLBACK_API)
const BASE = `${API_ROOT}/api`

export const apiRoot = API_ROOT

/** Resolves a backend-relative path (product photos, /api/public/*) to a full URL. */
export function assetUrl(path: string) {
  if (!path || path.startsWith('http')) return path
  return `${API_ROOT}${path}`
}

export function getToken() {
  return localStorage.getItem('droppost_token')
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    /*
     * `errors` au pluriel compte autant que `error`.
     *
     * La génération de publicités échoue lot par lot et rend le détail dans
     * `errors` — « aucune police sur le serveur », « crédits épuisés », ce que
     * le vendeur doit lire. Ne lire que `error` affichait « Erreur 502 » et
     * jetait l'explication : il voyait un code, et ses crédits rendus sans
     * savoir pourquoi.
     */
    const detail = Array.isArray(body.errors) ? body.errors.filter(Boolean).join(' ') : ''
    const error = new Error(body.error || detail || `Erreur ${res.status}`) as Error & {
      status?: number
    }
    error.status = res.status
    throw error
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

/** L'avis d'un chef de rayon sur un produit, en trois volets. */
export interface ProductReview {
  id: string
  url: string
  title: string | null
  verdict: string
  suppliers: string | null
  social: string | null
  marketplace: string | null
  sources: string[] | null
  createdAt: string
}

/** Un agent tel que la page « Vos agents » l'affiche, quelle que soit sa famille. */
export interface AgentCardData {
  key: string
  name: string
  role: string
  family: 'chaine' | 'comptoir'
  /** Le service : c'est par lui que la page « Mes agents » est rangée. */
  category: 'administratif' | 'production' | 'marketing' | 'logistique'
  emoji: string
  does: string
  where: string | null
  href: string | null
  state: 'actif' | 'inactif' | 'indisponible'
  note: string | null
  /** Prix mensuel en centimes, absent quand l'agent est compris dans l'abonnement. */
  monthly?: number
  /** Ce que l'agent ne fait pas — décisif sur du conseil comptable ou juridique. */
  caveat?: string
  hired?: boolean
  paidUntil?: string | null
}

/** Un ticket avec tout son fil, tel que l ecran l affiche. */
export interface TicketComplet {
  id: string
  subject: string
  kind: string
  status: string
  creditsSpent: number | null
  creditKind: string
  refundedCredits: number | null
  refundedBy: string | null
  createdAt: string
  messages: Array<{
    id: string
    author: string
    agentKey: string | null
    body: string
    createdAt: string
  }>
}

const SOCIAL_STATE = '/social/state'
const SOCIAL_SYNC = '/social/sync'
const SOCIAL_CONNECT = '/social/connect'
const SOCIAL_CAMPAIGNS = '/social/campaigns'
const CREDENTIALS_P = '/settings/credentials'
const POST_M = 'POST'

/** Une commande qui demande une réponse, et pourquoi. */
export interface SavLigne {
  id: string
  platform: string
  status: string
  buyerName: string
  amount: number
  currency: string
  jours: number
  raison: string
  produit: { id: string; titre: string; image: string | null }
}

export const api = {
  register: (email: string, password: string) =>
    request<{ token: string; user: { id: string; email: string } }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  login: (email: string, password: string) =>
    request<{ token: string; user: { id: string; email: string } }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: () =>
    request<{ id: string; email: string; shopName?: string; watermarkText?: string; emailVerified?: boolean }>(
      '/auth/me',
    ),

  forgotPassword: (email: string) =>
    request<{ ok: true; message: string }>('/auth/password/forgot', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  resetPassword: (token: string, password: string) =>
    request<{ token: string; user: { id: string; email: string } }>('/auth/password/reset', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: true }>('/auth/password/change', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  verifyEmail: (token: string) =>
    request<{ ok: true }>('/auth/email/verify', { method: 'POST', body: JSON.stringify({ token }) }),
  resendVerification: () => request<{ ok: true }>('/auth/email/resend', { method: 'POST' }),

  importProduct: (url: string) => request('/products/import', { method: 'POST', body: JSON.stringify({ url }) }),
  importBatch: (urls: string[]) =>
    request<{ results: Array<{ url: string; ok: boolean; error?: string }>; imported: number; failed: number }>(
      '/products/import-batch',
      { method: 'POST', body: JSON.stringify({ urls }) },
    ),
  listProducts: () => request<any[]>('/products'),
  /** Les quatorze blocs du tableau de bord statistiques, sur la periode donnee. */
  tableauStats: (du: Date, au: Date) =>
    request<{
      du: string
      au: string
      blocs: import('../components/stats/TuileStat').BlocData[]
      carte: import('../components/stats/CarteMonde').CarteData
    }>(
      `/stats/tableau?du=${du.toISOString()}&au=${au.toISOString()}`,
    ),
  getProduct: (id: string) => request<any>(`/products/${id}`),
  updateProduct: (id: string, data: Record<string, unknown>) =>
    request(`/products/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteProduct: (id: string) => request(`/products/${id}`, { method: 'DELETE' }),
  /** Une copie de l'annonce, en brouillon et sans crédit : rien n'est réécrit. */
  dupliquerProduit: (id: string) =>
    request<{ id: string; aiTitle: string | null }>(`/products/${id}/dupliquer`, { method: 'POST' }),
  /** Retire la vidéo de l'annonce. Le fichier reste sur le stockage, comme les photos. */
  supprimerVideo: (id: string) => request<{ ok: true }>(`/products/${id}/video`, { method: 'DELETE' }),
  publishProduct: (id: string, platforms: string[], shopId?: string) =>
    request<
      Array<{ platform: string; status: string; error: string | null; externalUrl: string | null }>
    >(`/products/${id}/publish`, { method: 'POST', body: JSON.stringify({ platforms, shopId }) }),
  publishBatch: (productIds: string[], platforms: string[], shopId?: string) =>
    request<{
      results: Array<{
        productId: string
        title: string
        platform: string
        status: string
        error: string | null
        externalUrl: string | null
      }>
      published: number
      pending: number
      failed: number
      missing: number
    }>('/products/publish-batch', { method: 'POST', body: JSON.stringify({ productIds, platforms, shopId }) }),
  /** Ce que chaque destination acceptera, et le titre qu elle recevra. */
  conformite: (id: string) =>
    request<{
      verdicts: Array<{
        platform: string
        publiable: boolean
        ecarts: Array<{ regle: string; quoi: string; severite: 'bloquant' | 'avertissement'; message: string }>
      }>
      titres: Array<{ platform: string; max: number; titre: string; raccourci: boolean }>
      publiables: number
      total: number
    }>(`/products/${id}/conformite`),

  /** La note d'une annonce, critère par critère, avec la correction de chacun. */
  noteAnnonce: (id: string) =>
    request<{
      score: number
      level: 'bon' | 'moyen' | 'faible'
      checks: Array<{ label: string; points: number; max: number; fix: string | null }>
      priorities: string[]
    }>(`/products/${id}/score`),
  /*
   * Reprendre l'annonce sur ce qui lui manque.
   *
   * Un crédit, rendu si le modèle n'a pas répondu ou s'il n'y avait rien à
   * reprendre : le vendeur paie une réécriture qu'il a reçue.
   */
  optimiserAnnonce: (id: string) =>
    request<{
      avant: { score: number }
      apres: { score: number; checks: Array<{ label: string; points: number; max: number; fix: string | null }> }
      changements: string[]
      aVous: string[]
      complet: boolean
      reecrit: boolean
    }>(`/products/${id}/optimiser`, { method: 'POST' }),

  /**
   * Refaire la réécriture d'une annonce ratée.
   *
   * Ne repasse pas par la page source : le titre et la description d'origine
   * sont conservés dans l'annonce. Une fiche AliExpress se reprend donc comme
   * une autre, alors qu'un réimport par adresse y serait refusé.
   */
  reecrireAnnonce: (id: string) =>
    request<{ ok: true; changements: string[] }>(`/products/${id}/reecrire`, { method: 'POST' }),

  categoryPreview: (id: string) => request<Record<string, string>>(`/products/${id}/category-preview`),
  listCategories: (filter?: { sector?: string; shop?: string }) =>
    request<{
      categories: Array<{ id: string; group: string; label: string; sector: string }>
      sectors: Array<{ id: string; label: string; count: number }>
    }>(`/products/meta/categories?${new URLSearchParams({
      ...(filter?.sector ? { sector: filter.sector } : {}),
      ...(filter?.shop ? { shop: filter.shop } : {}),
    })}`),
  /** Les trois états, servis par le serveur — la même liste que celle qui se traduit à la publication. */
  listConditions: () =>
    request<Array<{ id: string; label: string; aide: string }>>('/products/meta/conditions'),

  /**
   * La version d'extension que le serveur distribue.
   *
   * Publique : c'est du code client, et l'avertissement doit s'afficher sur
   * chaque écran, y compris avant qu'une session soit chargée.
   */
  versionExtension: () => request<{ version: string | null }>('/public/extension-version'),

  /** Les jeux d'options tout prêts (pointure, taille, couleur), définis côté serveur. */
  jeuxOptions: () =>
    request<Array<{ id: string; nom: string; valeurs: string[]; aide: string }>>(
      '/products/meta/jeux-options',
    ),
  /*
   * Une action sur un lot d'annonces cochées.
   *
   * Le serveur rend trois chiffres et non un simple succès : ce qui a bougé, ce
   * qui était déjà dans cet état, et ce qui a échoué. Sur vingt annonces, « 12
   * traitées » sans le reste laisse chercher les huit autres.
   */
  actionLot: (corps: {
    ids: string[]
    action: 'categorie' | 'supprimer' | 'options' | 'boutique' | 'reecrire'
    categoryId?: string
    jeu?: string
    shopId?: string | null
  }) =>
    request<{
      demandees: number
      faites: number
      inchangees: number
      echecs: Array<{ id: string; titre: string; raison: string }>
      message?: string
    }>('/products/lot', { method: 'POST', body: JSON.stringify(corps) }),

  /*
   * La forme est celle de `lib/platforms.ts`, pas une copie.
   *
   * Elle était recopiée ici, champ par champ, et les deux ont divergé au
   * premier ajout : `domain` manquait, `feed` manquait dans l'union, et
   * ajouter `video` a fait échouer la compilation de quatre écrans qui
   * n'avaient rien demandé. Une seule déclaration, celle que le serveur rend.
   */
  listPlatforms: () => request<PlatformInfo[]>('/products/meta/platforms'),

  /**
   * Les plateformes d'acquisition, où l'on achète.
   *
   * Distinctes des destinations, où l'on vend : ni les mêmes comptes, ni les
   * mêmes gestes, et une même marque peut être les deux.
   */
  /** L annuaire complet des canaux connus : etre liste ne veut pas dire integre. */
  listChannels: () =>
    request<{
      types: Array<{ id: string; label: string; aide: string }>
      canaux: Array<{
        id: string
        label: string
        logo: string
        type: string
        integre: boolean
        /**
         * Le flux qui suffit à nourrir ce canal, quand il en existe un.
         *
         * Un comparateur ne veut pas d'API : il veut une adresse à relire
         * chaque nuit. Quatre-vingt-une entrées de l'annuaire sont dans ce cas,
         * et les deux formats sont déjà servis.
         */
        flux: { format: 'google' | 'meta'; ou: string } | null
      }>
      total: number
      /** Combien de canaux un simple flux suffirait à servir. */
      aFlux: number
      formats: Array<{ id: 'google' | 'meta'; fichier: string; label: string; aide: string }>
      boutiques: Array<{ id: string; name: string; adresses: Record<string, string> }>
    }>('/products/meta/channels'),

  /**
   * L'avis de Nadia sur l'opportunité publicitaire d'une annonce.
   *
   * Payé un crédit et **gardé sur l'annonce** : rappeler la route sans
   * `refaire` resert l'avis existant sans refacturer.
   */
  adAdvice: (productId: string, refaire = false) =>
    request<{ avis: string; at: string; facture: boolean }>(`/products/${productId}/ad-advice`, {
      method: POST_M,
      body: JSON.stringify({ refaire }),
    }),

  /** Ce qui demande une réponse après la vente, avant que le client écrive. */
  savOverview: () =>
    request<{
      sansSuivi: SavLigne[]
      tropLong: SavLigne[]
      jamaisCommande: SavLigne[]
      conversations: Array<{
        id: string
        platform: string
        customerName: string
        subject: string | null
        unread: boolean
        lastMessageAt: string
      }>
      aTraiter: number
    }>('/orders/sav'),

  /** Les ventes à commander, regroupées par fournisseur. */
  ordersBySupplier: () =>
    request<{
      fournisseurs: Array<{
        supplierId: string
        label: string
        relie: boolean
        aCommander: number
        ventes: Array<{
          id: string
          platform: string
          status: string
          amount: number
          currency: string
          createdAt: string
          buyerName: string
          buyerAddress: unknown
          supplierOrderId: string | null
          supplierOrderStatus: string | null
          supplierOrderError: string | null
          supplierOrderUrl: string | null
          trackingNumber: string | null
          produit: {
            id: string
            titre: string
            image: string | null
            supplierRef: string | null
            cout: number
          }
        }>
      }>
    }>('/orders/by-supplier'),

  /** Dépose la commande chez le fournisseur — sans la payer. */
  orderFromSupplier: (orderId: string, forcer = false) =>
    request<{ orderId: string; etat: string; message: string; url?: string; cout?: number }>(
      `/orders/${orderId}/supplier-order`,
      { method: POST_M, body: JSON.stringify({ forcer }) },
    ),

  listSuppliers: () =>
    request<
      Array<{
        id: string
        label: string
        domain: string
        origine: string
        importPath: 'extension' | 'url' | 'les-deux'
        quoi: string
        attention?: string
        adapte?: boolean
        color: string
        api?: {
          nom: string
          console: string
          exige: string
          lectureCatalogue: boolean
          stockTempsReel: boolean
          commande: boolean
          suivi: boolean
          champs: Array<{ cle: string; label: string; secret?: boolean; optionnel?: boolean }>
        }
      }>
    >('/products/meta/suppliers'),

  // Reviews. The listing is public — the home page shows it to visitors with no
  // account — while writing one requires being signed in, which is also what keeps
  // the page from filling with spam.
  listPublicReviews: (limit = 50) =>
    request<{
      reviews: Array<{ id: string; displayName: string; rating: number; comment: string; createdAt: string }>
      count: number
      average: number | null
    }>(`/public/reviews?limit=${limit}`),
  myReview: () =>
    request<{ id: string; displayName: string; rating: number; comment: string } | null>('/reviews/mine'),
  saveReview: (data: { rating: number; comment: string; displayName?: string }) =>
    request('/reviews', { method: 'PUT', body: JSON.stringify(data) }),
  deleteReview: () => request('/reviews', { method: 'DELETE' }),

  // Analyse de marché. Un crédit par produit analysé : chaque analyse lance de
  // vraies recherches web, elle coûte trois à quatre fois un import.
  marketAnalysis: (productIds: string[]) =>
    request<{
      results: Array<{
        productId: string
        title: string
        error?: string
        analysis: {
          verdict: string
          priceLow: number | null
          priceHigh: number | null
          suggestedPrice: number | null
          deliveryTime: string | null
          origin: string | null
          competition: string | null
          findings: Array<{ marketplace: string; price: number | null; url: string | null }>
          reasoning: string
          sources: string[]
        } | null
      }>
    }>('/products/market-analysis', { method: 'POST', body: JSON.stringify({ productIds }) }),

  // Facturation. /plans est public : la grille s'affiche avant toute connexion.
  listPlans: () =>
    request<{
      signupCredits: number
      packs: Array<{ id: string; label: string; amount: number; credits: number }>
      /** Les credits graphiques : une reserve a part, pour les images. */
      imagePacks: Array<{ id: string; label: string; amount: number; images: number }>
      premium: { id: string; label: string; amount: number; monthlyFairUse: number }
      enabled: boolean
    }>('/billing/plans'),
  myBilling: () =>
    request<{
      credits: number
      premium: boolean
      premiumUntil: string | null
      payments: Array<{ id: string; planId: string; amount: number; credits: number; createdAt: string }>
    }>('/billing/me'),
  // Renvoie un clientSecret et non une URL : le formulaire de paiement est monte
  // dans l'application, l'acheteur ne quitte jamais drop-shipper.fr.
  startCheckout: (planId: string, departmentId?: string) =>
    request<{ clientSecret: string }>('/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ planId, departmentId }),
    }),
  confirmPayment: (sessionId: string) =>
    request<{ granted: boolean; alreadyGranted?: boolean; credits?: number; premium?: boolean; status?: string }>(
      '/billing/confirm',
      { method: 'POST', body: JSON.stringify({ sessionId }) },
    ),
  // Factures, cartes et resiliation servies par notre API : le vendeur n a plus
  // aucune raison d atterrir sur une page Stripe.
  listInvoices: () =>
    request<{
      invoices: Array<{
        id: string
        number: string | null
        createdAt: string
        total: number
        currency: string
        status: string
        paid: boolean
      }>
    }>('/billing/invoices'),
  listCards: () =>
    request<{
      cards: Array<{ id: string; brand: string; last4: string; expMonth: number | null; expYear: number | null }>
    }>('/billing/payment-methods'),
  createSetupIntent: () => request<{ clientSecret: string }>('/billing/setup-intent', { method: 'POST' }),
  deleteCard: (id: string) => request(`/billing/payment-methods/${id}`, { method: 'DELETE' }),
  cancelSubscription: () =>
    request<{ cancelled: boolean; activeUntil: string | null }>('/billing/cancel-subscription', { method: 'POST' }),

  openBillingPortal: () => request<{ url: string }>('/billing/portal', { method: 'POST' }),

  listOrders: () =>
    request<
      Array<{
        id: string
        platform: string
        status: string
        buyerName: string
        amount: number | string
        currency: string
        trackingNumber: string | null
        product: { id: string; title: string; aiTitle: string | null } | null
      }>
    >('/orders'),
  getOrder: (id: string) =>
    request<{
      id: string
      platform: string
      status: string
      buyerName: string
      buyerEmail: string | null
      buyerAddress: unknown
      amount: number
      currency: string
      trackingNumber: string | null
      carrier: string | null
      supplierOrderUrl: string | null
      externalOrderId: string | null
      conversationId: string | null
      tracking: {
        number: string
        carrier: string | null
        carrierLabel: string
        url: string
        generic: boolean
      } | null
      events: Array<{ date: string; status: string; location: string | null }> | null
    }>(`/orders/${id}`),
  setTracking: (id: string, trackingNumber: string, carrier?: string, markShipped?: boolean) =>
    request<{ ok: true; tracking: { carrierLabel: string; url: string; generic: boolean } }>(
      `/orders/${id}/tracking`,
      { method: 'PUT', body: JSON.stringify({ trackingNumber, carrier, markShipped }) },
    ),
  contactBuyer: (id: string) =>
    request<{ id: string; created: boolean }>(`/orders/${id}/contact`, { method: 'POST' }),
  createOrder: (data: Record<string, unknown>) => request('/orders', { method: 'POST', body: JSON.stringify(data) }),
  updateOrder: (id: string, data: Record<string, unknown>) =>
    request(`/orders/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  /** Les reglages du compte, filigrane compris : /auth/me n en renvoie qu une part. */
  settingsProfile: () =>
    request<{
      id: string
      email: string
      shopName: string | null
      controlAgent: boolean
      watermarkEnabled: boolean
      watermarkText: string | null
      watermarkImage: string | null
      watermarkScale: number
      watermarkOpacity: number
      watermarkPosition: string
      watermarkMode: string
      shopKey: string
    }>('/settings/profile'),
  deleteWatermarkLogo: () => request('/settings/watermark-logo', { method: 'DELETE' }),

  updateProfile: (data: Record<string, unknown>) =>
    request('/settings/profile', { method: 'PATCH', body: JSON.stringify(data) }),
  // Sites du vendeur : un par boutique, chacun avec sa propre clé de catalogue.
  /** Depose le logo d une boutique : il prime sur celui du compte. */
  uploadShopLogo: (shopId: string, file: File) => {
    const form = new FormData()
    form.append('logo', file)
    return request<{ logo: string }>(`/settings/shops/${shopId}/logo`, {
      method: 'PUT',
      body: form,
      // Le navigateur pose lui-meme la frontiere multipart : l imposer la casse.
      headers: {},
    })
  },

  listShops: () =>
    request<
      Array<{
        id: string
        name: string
        shopKey: string
        platform: string | null
        sectors: string[]
        products: number
        logo: string | null
        createdAt: string
        /*
         * Le filigrane de cette boutique. `null` veut dire « comme le compte » :
         * un vendeur qui n'a qu'une boutique ne règle rien, celui qui en a
         * quatre ne recopie pas trois fois la même chose.
         */
        watermarkEnabled: boolean
        /** « texte » ou « logo ». Null : comme le compte. */
        watermarkMode: string | null
        watermarkText: string | null
        watermarkScale: number | null
        watermarkOpacity: number | null
        watermarkPosition: string | null
        /** L adresse lisible de la vitrine : /b/<slug>. */
        slug: string | null
        themeId: string
        themeTokens: Record<string, string> | null
        storefront: Record<string, string | number> | null
      }>
    >('/settings/shops'),
  createShop: (data: { name: string; platform?: string; sectors?: string[] }) =>
    request<{ id: string; name: string; shopKey: string }>('/settings/shops', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  renameShop: (
    id: string,
    data: {
      name?: string
      platform?: string
      sectors?: string[]
      watermarkEnabled?: boolean
      watermarkMode?: 'texte' | 'logo' | null
      watermarkText?: string | null
      watermarkScale?: number | null
      watermarkOpacity?: number | null
      watermarkPosition?: string | null
      themeId?: string
      themeTokens?: Record<string, string> | null
      storefront?: Record<string, string | number> | null
    },
  ) =>
    request(`/settings/shops/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteShop: (id: string) => request(`/settings/shops/${id}`, { method: 'DELETE' }),

  /** Les 21 thèmes de la bibliothèque, pour l écran de choix. */
  listThemes: () =>
    request<
      Array<{
        id: string
        nom: string
        structure: { id: string; nom: string; pour: string }
        secteurs: string[]
        polices: { titre: string; texte: string }
        apercu: { background: string; foreground: string; primary: string; accent: string; card: string }
      }>
    >('/settings/themes'),

  /** Un crédit : le modèle choisit un thème et écrit les textes. Rendu si rien ne sort. */
  genererVitrine: (id: string, description: string) =>
    request<{
      themeId: string
      contenu: { accroche: string; accrocheSuite: string; sousTitre: string; annonce: string }
      raison: string
      rayonsRetenus: string[]
    }>(`/settings/shops/${id}/vitrine`, { method: 'POST', body: JSON.stringify({ description }) }),

  // Clés machine : un agent de veille extérieur dépose ses trouvailles avec.
  listApiKeys: () =>
    request<
      Array<{
        id: string
        name: string
        prefix: string
        lastUsedAt: string | null
        revokedAt: string | null
        createdAt: string
      }>
    >('/settings/api-keys'),
  createApiKey: (name: string) =>
    request<{ id: string; name: string; prefix: string; key: string }>('/settings/api-keys', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  revokeApiKey: (id: string) => request(`/settings/api-keys/${id}`, { method: 'DELETE' }),

  // Boîte à opportunités : ce que les agents ont repéré, en attente d'arbitrage.
  listOpportunities: (status?: string, department?: string) =>
    request<{
      count: number
      opportunities: Array<{
        id: string
        source: string
        sourceUrl: string
        title: string
        image: string | null
        category: string | null
        sourcePrice: number
        marketPrice: number | null
        marginPercent: number | null
        currency: string
        salesCount: number | null
        euStock: boolean | null
        deliveryDays: number | null
        delivery: string | null
        warranty: string | null
        isNew: boolean
        notes: string | null
        status: 'NEW' | 'KEPT' | 'REJECTED' | 'IMPORTED'
        productId: string | null
        needsExtension: boolean
        personal: boolean
        matchedProducts: Array<{ id: string; title: string; on: string[] }>
        detectedAt: string
      }>
    }>(`/opportunities?${new URLSearchParams({ ...(status ? { status } : {}), ...(department ? { department } : {}) })}`),
  // Messagerie acheteurs, toutes plateformes confondues.
  listConversations: (status?: string) =>
    request<{
      count: number
      unread: number
      conversations: Array<{
        id: string
        platform: string
        customerName: string
        customerEmail: string | null
        subject: string | null
        status: 'OPEN' | 'WAITING' | 'CLOSED'
        unread: boolean
        agentName: string | null
        lastMessageAt: string
        preview: string
        channel: 'email' | 'manuel'
      }>
    }>(status ? `/conversations?status=${status}` : '/conversations'),
  getConversation: (id: string) =>
    request<{
      id: string
      platform: string
      customerName: string
      customerEmail: string | null
      subject: string | null
      status: 'OPEN' | 'WAITING' | 'CLOSED'
      agentName: string | null
      channel: 'email' | 'manuel'
      notice: string
      messages: Array<{
        id: string
        direction: string
        body: string
        author: string | null
        sentVia: string | null
        drafted: boolean
        createdAt: string
      }>
    }>(`/conversations/${id}`),
  replyConversation: (id: string, body: string, drafted?: boolean) =>
    request<{
      message: {
        id: string
        direction: string
        body: string
        author: string | null
        sentVia: string | null
        drafted: boolean
        createdAt: string
      }
      delivered: boolean
      channel: 'email' | 'manuel'
      notice: string
    }>(`/conversations/${id}/messages`, { method: 'POST', body: JSON.stringify({ body, drafted }) }),
  draftConversation: (id: string) =>
    request<{ text: string; agentName: string | null }>(`/conversations/${id}/draft`, {
      method: 'POST',
    }),
  /** Comptabilite et SAV : chiffres reels, litiges ouverts, remboursements. */
  accounting: () =>
    request<{
      parMois: Array<{ mois: string; commandes: number; rembourses: number; chiffre: number; cout: number; marge: number }>
      parPlateforme: Array<{ platform: string; commandes: number; rembourses: number; chiffre: number; cout: number; marge: number }>
      remboursements: Array<{ id: string; platform: string; titre: string; montant: number; devise: string; createdAt: string }>
      litiges: Array<{ id: string; platform: string; customerName: string; subject: string | null; status: string; unread: boolean; lastMessageAt: string }>
      avertissement: string
    }>('/orders/accounting'),

  setConversationStatus: (id: string, status: string) =>
    request(`/conversations/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  /** Remettre un message dans la pile : on l'a ouvert, on le traitera ce soir. */
  setConversationUnread: (id: string, unread: boolean) =>
    request(`/conversations/${id}`, { method: 'PATCH', body: JSON.stringify({ unread }) }),

  // Agents visuels : photos de produit et visuels publicitaires.
  visualState: () =>
    request<{
      credits: number
      produced: number
      configured: boolean
      packs: Array<{ id: string; label: string; amount: number; images: number }>
      formats: Array<{ id: string; label: string; width: number; height: number; note: string }>
      /*
       * Le tarif vient du serveur, il ne se recalcule pas ici.
       *
       * L'écran multipliait le nombre d'images par un crédit, parce que c'était
       * vrai. Ça ne l'est plus pour une publicité, et un prix affiché qui ne
       * correspond pas au prélèvement est pire qu'un prix absent.
       */
      tarif: { photo: number; pub: number; photosMax: number }
    }>('/visuals/state'),
  productVisuals: (productId: string) =>
    request<{
      product: { id: string; title: string; aiTitle: string | null }
      generated: Array<{
        id: string
        kind: string
        path: string
        platform: string | null
        width: number
        height: number
        kept: boolean
        createdAt: string
      }>
    }>(`/visuals/product/${productId}`),
  generatePhotos: (productId: string, count: number, hint?: string) =>
    request<{
      images: Array<{
        id: string
        kind: string
        path: string
        platform: string | null
        width: number
        height: number
        kept: boolean
        createdAt: string
      }>
      credits: number
      errors: string[]
    }>('/visuals/photos', { method: 'POST', body: JSON.stringify({ productId, count, hint }) }),
  /**
   * Une publicité, pas une photo.
   *
   * Le titre, le prix et le logo ne se passent pas ici : le serveur les lit dans
   * l'annonce et dans les réglages du vendeur. Un prix affiché sur une publicité
   * est une promesse, et une promesse ne se saisit pas deux fois.
   */
  generateAds: (
    productId: string,
    platforms: string[],
    count: number,
    options?: {
      hint?: string
      ctaLabel?: string
      ctaUrl?: string
      argument?: string
      /** Faux retire le prix du visuel : un prix affiche est une promesse. */
      showPrice?: boolean
      /** La boutique dont le logo signe la publicite. */
      shopId?: string
    },
  ) =>
    request<{
      images: Array<{
        id: string
        kind: string
        path: string
        platform: string | null
        width: number
        height: number
        kept: boolean
        createdAt: string
      }>
      credits: number
      errors: string[]
    }>('/visuals/ads', {
      method: 'POST',
      body: JSON.stringify({ productId, platforms, count, ...options }),
    }),
  /** Le book d'un agent visuel : tout ce qu'il a produit, toutes annonces confondues. */
  visualGallery: (kind?: 'ad' | 'photo') =>
    request<{
      count: number
      images: Array<{
        id: string
        kind: string
        path: string
        platform: string | null
        width: number
        height: number
        kept: boolean
        createdAt: string
        productId: string | null
        productTitle: string | null
      }>
    }>(`/visuals/gallery${kind ? `?kind=${kind}` : ''}`),
  keepImage: (id: string) => request<{ ok: true }>(`/visuals/${id}/keep`, { method: 'POST' }),
  deleteImage: (id: string) => request(`/visuals/${id}`, { method: 'DELETE' }),

  // L'équipe fournie d'office, et les agents à qui l'on parle.
  agentRoster: () =>
    request<{
      // Même forme des deux côtés : la carte d'agent est la même, et un champ
      // absent d'une famille se lit comme absent plutôt que comme une erreur
      // de type.
      categories: Array<{
        key: 'administratif' | 'production' | 'marketing' | 'logistique'
        label: string
        hint: string
      }>
      pipeline: AgentCardData[]
      support: AgentCardData[]
      /** Les chefs de rayon en poste, nommés : « 3 rayons » ne dit pas lesquels. */
      rayons: Array<{
        id: string
        key: string
        name: string
        label: string
        paidUntil: string | null
        active: boolean
      }>
      departments: number
    }>('/chat/agents/roster'),
  supportHistory: (key: string) =>
    request<{
      agent: { key: string; name: string; role: string; emoji: string; does: string }
      messages: Array<{ id: string; role: string; content: string; createdAt: string }>
    }>(`/chat/support/${key}`),
  askSupport: (key: string, question: string) =>
    request<{
      message: { id: string; role: string; content: string; createdAt: string }
      route: string | null
      credits: number | null
      /** Reponses deja donnees aujourdhui par cet agent, et le plafond compris dans son abonnement. */
      quota: { utilise: number; plafond: number }
    }>(`/chat/support/${key}`, { method: 'POST', body: JSON.stringify({ question }) }),

  // Pilote automatique.
  getAutopilot: () =>
    request<{
      settings: {
        enabled: boolean
        dailyLimit: number
        autoPublish: boolean
        destinations: string[]
        minMargin: number
        requireEuStock: boolean
      }
      destinations: Array<{ id: string; label: string; color: string }>
    }>('/autopilot'),
  saveAutopilot: (settings: {
    enabled: boolean
    dailyLimit: number
    autoPublish: boolean
    destinations: string[]
    minMargin: number
    requireEuStock: boolean
  }) => request<{ ok: true }>('/autopilot', { method: 'PUT', body: JSON.stringify(settings) }),
  runAutopilot: () =>
    request<{ imported: number; published: number; skipped: number; failed: number }>(
      '/autopilot/run',
      { method: 'POST' },
    ),
  autopilotRuns: () =>
    request<{
      count: number
      runs: Array<{
        id: string
        day: string
        imported: number
        published: number
        skipped: number
        failed: number
        log: Array<{ titre: string; action: string; raison: string }> | null
        createdAt: string
      }>
    }>('/autopilot/runs'),

  // Rapports quotidiens archivés, et discussion avec le chef de rayon.
  listReports: (section?: string, department?: string) =>
    request<{
      count: number
      reports: Array<{
        id: string
        section: string
        day: string
        title: string
        summary: Record<string, number | string> | null
        createdAt: string
      }>
    }>(`/reports?${new URLSearchParams({ ...(section ? { section } : {}), ...(department ? { department } : {}) })}`),
  getReport: (id: string) =>
    request<{
      id: string
      section: string
      day: string
      title: string
      body: string
      summary: Record<string, number | string> | null
    }>(`/reports/${id}`),
  deleteReport: (id: string) => request(`/reports/${id}`, { method: 'DELETE' }),

  chatHistory: (departmentId: string) =>
    request<{
      agentName: string
      messages: Array<{
        id: string
        role: string
        content: string
        billed: boolean
        createdAt: string
      }>
    }>(`/chat/${departmentId}`),
  /**
   * L'avis d'un chef de rayon sur un produit dont on colle l'adresse.
   *
   * Resservi sans repayer pendant une semaine sur la même adresse : `billed`
   * dit si le crédit est parti, pour que l'interface ne l'annonce pas à tort.
   */
  productInfo: (departmentId: string, url: string) =>
    request<{
      review: ProductReview
      billed: boolean
      credits: number | null
    }>(`/departments/${departmentId}/product-info`, {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),
  /** Ce que le rayon a rapporté, plateforme par plateforme, et ce qui est en ligne. */
  departmentSales: (departmentId: string) =>
    request<{
      rayon: { id: string; key: string; agentName: string }
      annonces: number
      parPlateforme: Array<{ platform: string; commandes: number; chiffre: number; marge: number }>
      ventes: Array<{
        id: string
        platform: string
        titre: string
        montant: number
        devise: string
        status: string
        createdAt: string
      }>
      publications: Array<{
        productId: string
        titre: string
        platform: string
        status: string
        externalUrl: string | null
        publishedAt: string | null
        error: string | null
      }>
    }>(`/departments/${departmentId}/sales`),

  productInfoHistory: (departmentId: string) =>
    request<{ count: number; reviews: ProductReview[] }>(`/departments/${departmentId}/product-info`),

  askDepartment: (departmentId: string, question: string) =>
    request<{
      message: { id: string; role: string; content: string; billed: boolean; createdAt: string }
      billed: boolean
      credits: number | null
      /** Reponses deja donnees aujourdhui par cet agent, et le plafond compris dans son abonnement. */
      quota: { utilise: number; plafond: number }
    }>(`/chat/${departmentId}`, { method: 'POST', body: JSON.stringify({ question }) }),

  // Chefs de rayon : un agent par secteur, embauché explicitement.
  departmentCatalogue: () =>
    request<{
      profiles: Array<{
        key: string
        label: string
        agentName: string
        emoji: string
        focus: string
        covers: string[]
        hired: boolean
      }>
      plans: Array<{ id: string; label: string; amount: number; days: number; pitch: string }>
    }>('/departments/catalogue'),
  listDepartments: () =>
    request<
      Array<{
        id: string
        key: string
        agentName: string
        label: string
        emoji: string
        focus: string
        covers: string[]
        opportunities: number
        signals: number
        pending: number
        paidUntil: string | null
        plan: string | null
        active: boolean
      }>
    >('/departments'),
  hireDepartment: (key: string) =>
    request<{ id: string; agentName: string; label: string }>('/departments', {
      method: 'POST',
      body: JSON.stringify({ key }),
    }),
  releaseDepartment: (id: string) => request(`/departments/${id}`, { method: 'DELETE' }),

  listSignals: (kind?: string, department?: string) =>
    request<{
      count: number
      signals: Array<{
        id: string
        kind: 'SOCIAL' | 'MARKET'
        platform: string | null
        title: string
        summary: string | null
        url: string | null
        category: string | null
        brand: string | null
        metrics: Record<string, number | string> | null
        engagementScore: number | null
        trendScore: number | null
        isNew: boolean
        status: 'NEW' | 'KEPT' | 'REJECTED'
        notes: string | null
        detectedAt: string
        personal: boolean
        matchedProducts: Array<{ id: string; title: string; on: string[] }>
      }>
    }>(`/signals?${new URLSearchParams({ ...(kind ? { kind } : {}), ...(department ? { department } : {}) })}`),
  setSignalStatus: (id: string, status: string) =>
    request(`/signals/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  setOpportunityStatus: (id: string, status: string, productId?: string) =>
    request(`/opportunities/${id}`, { method: 'PATCH', body: JSON.stringify({ status, productId }) }),
  deleteOpportunity: (id: string) => request(`/opportunities/${id}`, { method: 'DELETE' }),

  /**
   * Les comptes de régie publicitaire.
   *
   * Le jeton n'est jamais relu : l'API ne renvoie que la présence du compte et
   * son identifiant, qui n'est pas un secret.
   */
  listAdAccounts: () =>
    request<Array<{ network: string; accountId: string; connected: boolean; updatedAt: string }>>(
      '/settings/ad-accounts',
    ),
  saveAdAccount: (network: string, accountId: string, token: string) =>
    request<{ network: string; accountId: string; connected: boolean }>('/settings/ad-accounts', {
      method: 'PUT',
      body: JSON.stringify({ network, accountId, token }),
    }),
  deleteAdAccount: (network: string) =>
    request(`/settings/ad-accounts/${network}`, { method: 'DELETE' }),

  /** Les fournisseurs relies par leur API officielle. Les valeurs ne ressortent jamais. */
  listSupplierLinks: () =>
    request<Array<{ supplier: string; connected: boolean; champs: string[]; updatedAt: string }>>(
      '/settings/supplier-links',
    ),
  saveSupplierLink: (supplier: string, data: Record<string, string>) =>
    request<{ supplier: string; connected: boolean }>('/settings/supplier-links', {
      method: 'PUT',
      body: JSON.stringify({ supplier, data }),
    }),
  deleteSupplierLink: (supplier: string) =>
    request(`/settings/supplier-links/${supplier}`, { method: 'DELETE' }),

  /** Les produits reliés à un fournisseur, et leur dernier relevé de prix. */
  supplierWatch: () =>
    request<{
      surveilles: number
      total: number
      produits: Array<{
        id: string
        title: string
        aiTitle: string | null
        supplierId: string | null
        supplierRef: string | null
        supplierPrice: number | null
        supplierStock: number | null
        supplierCheckedAt: string | null
        price: number
        sellingPrice: number
        currency: string
        status: string
      }>
    }>('/settings/supplier-watch'),

  /** Relève prix et stock chez les fournisseurs reliés. Peut durer. */
  runSupplierWatch: () =>
    request<{
      verifies: number
      erreurs: string[]
      changements: Array<{
        productId: string
        titre: string
        supplier: string
        genre: 'prix' | 'rupture' | 'retour' | 'echec'
        avant: string
        apres: string
        conseil: string | null
      }>
    }>('/settings/supplier-watch', { method: 'POST' }),

  /** L arbre du referentiel : rayons a gros blocs, sous-categories dessous. */
  /** Reprend les annonces qui ne pointent vers aucune catégorie du référentiel. */
  /**
   * Reprend un lot d annonces, et rend le curseur du suivant.
   *
   * La reprise se faisait d un seul tenant : quatre-vingt-onze annonces,
   * chacune pouvant appeler le modele, et la requete coupee par le proxy bien
   * avant la fin -- « failed to fetch », sans rien dire de ce qui avait ete
   * range. L ecran rappelle desormais tant que `suivant` n est pas nul.
   */
  recategoriser: (apres?: string) =>
    request<{
      examinees: number
      dejaRangees: number
      rangees: number
      restants: Array<{ id: string; titre: string }>
      suivant: string | null
    }>('/products/meta/recategoriser', { method: 'POST', body: JSON.stringify(apres ? { apres } : {}) }),

  categoryTree: () =>
    request<{
      rayons: number
      sousCategories: number
      apprises: number
      arbre: Array<{
        id: string
        label: string
        sector: string
        icone: string | null
        uses: number
        enfants: Array<{ id: string; label: string; path: string; uses: number; origin: string }>
      }>
    }>('/products/meta/category-tree'),

  /** Range une annonce a la main : le geste est retenu comme alias. */
  setProductCategory: (id: string, categoryId: string) =>
    request<{ ok: true; categoryId: string; path: string }>(`/products/${id}/category`, {
      method: 'PUT',
      body: JSON.stringify({ categoryId }),
    }),

  /**
   * Les tickets : le vendeur signale, les agents repondent.
   *
   * Pas de bouton qui recredite tout seul : il se presserait par reflexe et
   * n apprendrait rien a personne. Un ticket laisse une trace et une decision.
   */
  listTickets: () =>
    request<
      Array<{
        id: string
        subject: string
        kind: string
        status: string
        creditsSpent: number | null
        creditKind: string
        refundedCredits: number | null
        messages: number
        extrait: string
        createdAt: string
        updatedAt: string
      }>
    >('/tickets'),

  getTicket: (id: string) => request<TicketComplet>(`/tickets/${id}`),

  openTicket: (data: {
    subject: string
    body: string
    kind?: string
    productId?: string
    generatedImageId?: string
  }) => request<TicketComplet>('/tickets', { method: 'POST', body: JSON.stringify(data) }),

  replyTicket: (id: string, body: string) =>
    request<TicketComplet>(`/tickets/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }),

  closeTicket: (id: string) => request<{ ok: true }>(`/tickets/${id}/close`, { method: 'POST' }),

  /**
   * Le raccordement aux reseaux et aux regies, par la passerelle.
   *
   * Le vendeur s authentifie chez Meta ou TikTok, jamais chez le moteur : le
   * jeton ne passe jamais par nous.
   */
  socialState: () =>
    request<{
      configure: boolean
      reseaux: string[]
      regies: string[]
      comptes: Array<{
        id: string
        externalId: string
        platform: string
        label: string | null
        connected: boolean
        isAdAccount: boolean
      }>
    }>(SOCIAL_STATE),

  socialSync: () => request<{ comptes: number }>(SOCIAL_SYNC, { method: POST_M }),

  /** Le brouillon prêt à relire pour une annonce, un message par réseau. */
  socialDraft: (productId: string) =>
    request<{
      comptes: Array<{ externalId: string; platform: string; label: string | null; connected: boolean }>
      medias: string[]
      lien: string | null
      brouillons: Array<{ platform: string; texte: string; note: string | null }>
    }>(`/products/${productId}/social-draft`),

  socialPost: (data: { comptes: string[]; texte: string; medias?: string[] }) =>
    request<{
      externalId: string
      etat: string
      parCompte: Array<{ compte: string; etat: string; url: string | null; erreur: string | null }>
    }>('/social/posts', { method: POST_M, body: JSON.stringify(data) }),

  socialConnect: (platform: string, retour: string) =>
    request<{ url: string }>(SOCIAL_CONNECT, {
      method: POST_M,
      body: JSON.stringify({ platform, retour }),
    }),

  socialCampaign: (data: {
    compte: string
    nom: string
    objectif: string
    budgetJour: number
    creative: { image: string; titre: string; texte: string; url: string; boutonLabel?: string }
  }) =>
    request<{ externalId: string; etat: string; url: string | null }>(SOCIAL_CAMPAIGNS, {
      method: POST_M,
      body: JSON.stringify(data),
    }),

  listCredentials: () => request<any[]>(CREDENTIALS_P),
  saveCredential: (data: Record<string, unknown>) =>
    request('/settings/credentials', { method: 'PUT', body: JSON.stringify(data) }),
}

/**
 * Downloads an authenticated endpoint. A plain <a href> can't carry the Bearer
 * token, so fetch it with the header and hand the browser a blob URL instead.
 */
export async function downloadWithAuth(path: string, filename: string) {
  const token = getToken()
  const res = await fetch(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new Error('Téléchargement impossible')

  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/** Uploads photos to a listing. FormData, so no JSON Content-Type here. */
export async function uploadProductImages(productId: string, files: File[]) {
  const form = new FormData()
  for (const file of files) form.append('photos', file)

  const token = getToken()
  const res = await fetch(`${BASE}/products/${productId}/images`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `Erreur ${res.status}`)
  // `max` vient du serveur : le plafond etait ecrit en dur dans l ecran, et les
  // deux valeurs ont diverge des que le serveur a change.
  return body as { images: string[]; added: number; max?: number }
}

/**
 * Téléverse la vidéo de l'annonce. FormData, donc pas de Content-Type ici.
 *
 * Celle du vendeur, jamais celle d'un fournisseur : le relevé de l'extension
 * reste strictement photo, et c'est une décision, pas un manque.
 */
export async function uploadProductVideo(productId: string, file: File) {
  const form = new FormData()
  form.append('video', file)

  const token = getToken()
  const res = await fetch(`${BASE}/products/${productId}/video`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `Erreur ${res.status}`)
  // `destinations` vient du serveur : le vendeur vient de téléverser, c'est le
  // moment où il veut savoir où sa vidéo servira — et l'écrire en dur ici ferait
  // deux vérités à tenir.
  return body as { videoUrl: string; destinations: string[] }
}

/**
 * Importe une liste exportée par un fournisseur — AliExpress Business et les
 * autres.
 *
 * Le fichier ne porte que des identifiants et des titres : les fiches et les
 * photos sont demandées à l'API du fournisseur, qui doit donc être reliée. Sans
 * elle, ces adresses ne mènent nulle part — une page AliExpress se construit en
 * JavaScript et ne se laisse pas lire par un serveur.
 */
export async function importSupplierList(fichier: File) {
  const form = new FormData()
  form.append('fichier', fichier)

  const token = getToken()
  const res = await fetch(`${BASE}/products/import-list`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `Erreur ${res.status}`)
  return body as {
    importes: number
    deja: number
    lues: number
    ignorees: number
    nonRelies: string[]
    echecs: Array<{ ref: string; raison: string }>
  }
}

export function setToken(token: string) {
  localStorage.setItem('droppost_token', token)
}
export function clearToken() {
  localStorage.removeItem('droppost_token')
}
export function isAuthed() {
  return Boolean(getToken())
}
