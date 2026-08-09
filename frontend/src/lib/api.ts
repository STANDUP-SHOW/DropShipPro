const BASE = '/api'

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
    throw new Error(body.error || `Erreur ${res.status}`)
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
  me: () => request<{ id: string; email: string; shopName?: string; watermarkText?: string }>('/auth/me'),

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
    request(`/products/${id}/publish`, { method: 'POST', body: JSON.stringify({ platforms }) }),
  categoryPreview: (id: string) => request<Record<string, string>>(`/products/${id}/category-preview`),

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

export function setToken(token: string) {
  localStorage.setItem('droppost_token', token)
}
export function clearToken() {
  localStorage.removeItem('droppost_token')
}
export function isAuthed() {
  return Boolean(getToken())
}
