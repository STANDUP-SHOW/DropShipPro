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

function getToken() {
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
    const error = new Error(body.error || `Erreur ${res.status}`) as Error & { status?: number }
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
  getProduct: (id: string) => request<any>(`/products/${id}`),
  updateProduct: (id: string, data: Record<string, unknown>) =>
    request(`/products/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteProduct: (id: string) => request(`/products/${id}`, { method: 'DELETE' }),
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
  categoryPreview: (id: string) => request<Record<string, string>>(`/products/${id}/category-preview`),
  listCategories: (filter?: { sector?: string; shop?: string }) =>
    request<{
      categories: Array<{ id: string; group: string; label: string; sector: string }>
      sectors: Array<{ sector: string; count: number }>
    }>(`/products/meta/categories?${new URLSearchParams({
      ...(filter?.sector ? { sector: filter.sector } : {}),
      ...(filter?.shop ? { shop: filter.shop } : {}),
    })}`),
  listPlatforms: () =>
    request<
      Array<{
        id: string
        label: string
        automatable: boolean
        sellUrl: string | null
        note: string
        color: string
        integration: 'live' | 'api-ready' | 'extension' | 'none'
        batchable: boolean
        warning?: string
        unavailable?: boolean
      }>
    >('/products/meta/platforms'),

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

  updateProfile: (data: Record<string, unknown>) =>
    request('/settings/profile', { method: 'PATCH', body: JSON.stringify(data) }),
  // Sites du vendeur : un par boutique, chacun avec sa propre clé de catalogue.
  listShops: () =>
    request<
      Array<{
        id: string
        name: string
        shopKey: string
        platform: string | null
        sectors: string[]
        products: number
      }>
    >('/settings/shops'),
  createShop: (data: { name: string; platform?: string; sectors?: string[] }) =>
    request<{ id: string; name: string; shopKey: string }>('/settings/shops', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  renameShop: (id: string, data: { name?: string; platform?: string; sectors?: string[] }) =>
    request(`/settings/shops/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteShop: (id: string) => request(`/settings/shops/${id}`, { method: 'DELETE' }),

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
  setConversationStatus: (id: string, status: string) =>
    request(`/conversations/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  // Agents visuels : photos de produit et visuels publicitaires.
  visualState: () =>
    request<{
      credits: number
      produced: number
      configured: boolean
      packs: Array<{ id: string; label: string; amount: number; images: number }>
      formats: Array<{ id: string; label: string; width: number; height: number; note: string }>
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
    options?: { hint?: string; ctaLabel?: string; ctaUrl?: string; argument?: string },
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
  productInfoHistory: (departmentId: string) =>
    request<{ count: number; reviews: ProductReview[] }>(`/departments/${departmentId}/product-info`),

  askDepartment: (departmentId: string, question: string) =>
    request<{
      message: { id: string; role: string; content: string; billed: boolean; createdAt: string }
      billed: boolean
      credits: number | null
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

  listCredentials: () => request<any[]>('/settings/credentials'),
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
  return body as { images: string[]; added: number }
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
