// In dev, Vite proxies /api to localhost:4000 (see vite.config.ts). In production
// the frontend (Vercel) and backend (Railway) are on different hosts, so the
// deployed build needs the absolute backend URL via VITE_API_URL.
const API_ROOT = import.meta.env.VITE_API_URL?.replace(/\/$/, '') ?? ''
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
  publishProduct: (id: string, platforms: string[]) =>
    request<
      Array<{ platform: string; status: string; error: string | null; externalUrl: string | null }>
    >(`/products/${id}/publish`, { method: 'POST', body: JSON.stringify({ platforms }) }),
  publishBatch: (productIds: string[], platforms: string[]) =>
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
    }>('/products/publish-batch', { method: 'POST', body: JSON.stringify({ productIds, platforms }) }),
  categoryPreview: (id: string) => request<Record<string, string>>(`/products/${id}/category-preview`),
  listCategories: () => request<Array<{ id: string; group: string; label: string }>>('/products/meta/categories'),
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
  startCheckout: (planId: string) =>
    request<{ clientSecret: string }>('/billing/checkout', { method: 'POST', body: JSON.stringify({ planId }) }),
  confirmPayment: (sessionId: string) =>
    request<{ granted: boolean; alreadyGranted?: boolean; credits?: number; premium?: boolean; status?: string }>(
      '/billing/confirm',
      { method: 'POST', body: JSON.stringify({ sessionId }) },
    ),
  openBillingPortal: () => request<{ url: string }>('/billing/portal', { method: 'POST' }),

  listOrders: () => request<any[]>('/orders'),
  createOrder: (data: Record<string, unknown>) => request('/orders', { method: 'POST', body: JSON.stringify(data) }),
  updateOrder: (id: string, data: Record<string, unknown>) =>
    request(`/orders/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  updateProfile: (data: Record<string, unknown>) =>
    request('/settings/profile', { method: 'PATCH', body: JSON.stringify(data) }),
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
