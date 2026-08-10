import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { api, setToken } from '../lib/api'
import { useAuth } from '../lib/auth'

export default function ResetPassword() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const navigate = useNavigate()
  const { refresh } = useAuth()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (password !== confirm) return setError('Les deux mots de passe ne correspondent pas')

    setError(null)
    setBusy(true)
    try {
      // Resetting also signs the user in: they proved control of the mailbox.
      const res = await api.resetPassword(token, password)
      setToken(res.token)
      await refresh()
      navigate('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Réinitialisation impossible')
    } finally {
      setBusy(false)
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-app-gradient text-white flex flex-col items-center justify-center px-6 text-center">
        <Logo />
        <p className="mt-6 text-red-300">Lien de réinitialisation incomplet.</p>
        <Link to="/forgot-password" className="btn-gradient mt-5 rounded-lg px-5 py-2.5 text-sm font-semibold">
          Demander un nouveau lien
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-app-gradient text-white flex flex-col items-center justify-center px-6">
      <Link to="/" className="mb-8">
        <Logo />
      </Link>
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-2xl bg-white/5 border border-white/10 p-6 space-y-4">
        <h1 className="text-xl font-bold text-center">Nouveau mot de passe</h1>
        {error && <p className="text-sm text-red-400 text-center">{error}</p>}
        <div>
          <label className="text-sm text-gray-300">Nouveau mot de passe</label>
          <input
            type="password"
            required
            minLength={8}
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 outline-none focus:border-purple-400"
          />
          <p className="text-xs text-gray-500 mt-1">8 caractères minimum.</p>
        </div>
        <div>
          <label className="text-sm text-gray-300">Confirmez le mot de passe</label>
          <input
            type="password"
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="mt-1 w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 outline-none focus:border-purple-400"
          />
        </div>
        <button disabled={busy} className="btn-gradient w-full rounded-lg py-2.5 font-semibold disabled:opacity-50">
          {busy ? 'Enregistrement…' : 'Enregistrer et se connecter'}
        </button>
      </form>
    </div>
  )
}
