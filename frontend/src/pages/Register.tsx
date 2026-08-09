import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { useAuth } from '../lib/auth'

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await register(email, password)
      navigate('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de création de compte')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-app-gradient text-white flex flex-col items-center justify-center px-6">
      <Link to="/" className="mb-8">
        <Logo />
      </Link>
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-2xl bg-white/5 border border-white/10 p-6 space-y-4">
        <h1 className="text-xl font-bold text-center">Créer un compte</h1>
        {error && <p className="text-sm text-red-400 text-center">{error}</p>}
        <div>
          <label className="text-sm text-gray-300">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 outline-none focus:border-purple-400"
          />
        </div>
        <div>
          <label className="text-sm text-gray-300">Mot de passe (8 caractères min.)</label>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 outline-none focus:border-purple-400"
          />
        </div>
        <button disabled={busy} className="btn-gradient w-full rounded-lg py-2.5 font-semibold disabled:opacity-50">
          {busy ? 'Création...' : 'Créer mon compte'}
        </button>
        <p className="text-sm text-center text-gray-400">
          Déjà un compte ?{' '}
          <Link to="/login" className="text-purple-300 hover:underline">
            Se connecter
          </Link>
        </p>
      </form>
    </div>
  )
}
