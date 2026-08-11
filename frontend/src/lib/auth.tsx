import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, setToken, clearToken, isAuthed } from './api'

interface AuthUser {
  id: string
  email: string
  shopName?: string
  watermarkText?: string
  emailVerified?: boolean
  shopKey?: string
}

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => void
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  async function refresh() {
    if (!isAuthed()) {
      setUser(null)
      setLoading(false)
      return
    }
    try {
      const me = await api.me()
      setUser(me)
    } catch (err) {
      // Only a rejected token means the session is really over. A network blip or
      // a 5xx while the API restarts must not log the user out of a valid session.
      const status = (err as { status?: number }).status
      if (status === 401) {
        clearToken()
        setUser(null)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  async function login(email: string, password: string) {
    const res = await api.login(email, password)
    setToken(res.token)
    setUser(res.user)
  }

  async function register(email: string, password: string) {
    const res = await api.register(email, password)
    setToken(res.token)
    setUser(res.user)
  }

  function logout() {
    clearToken()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
