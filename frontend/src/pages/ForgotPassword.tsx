import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { MailCheck } from 'lucide-react'
import { Logo } from '../components/Logo'
import { api } from '../lib/api'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      // The API answers the same whether or not the address exists, so there is
      // nothing to branch on here — showing the confirmation is the only path.
      await api.forgotPassword(email)
      setSent(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-app-gradient text-white flex flex-col items-center justify-center px-6">
      <Link to="/" className="mb-8">
        <Logo />
      </Link>

      <div className="w-full max-w-sm rounded-2xl bg-white/5 border border-white/10 p-6">
        {sent ? (
          <div className="text-center">
            <MailCheck className="mx-auto text-emerald-300" size={34} />
            <h1 className="text-xl font-bold mt-4">Vérifiez vos emails</h1>
            <p className="text-sm text-gray-300 mt-3">
              Si un compte existe pour <span className="text-white">{email}</span>, un lien de
              réinitialisation vient d'être envoyé.
            </p>
            <p className="text-xs text-gray-500 mt-3">
              Le lien expire dans 1 heure. Pensez à regarder dans les indésirables.
            </p>
            <Link to="/login" className="btn-gradient mt-6 inline-block rounded-lg px-5 py-2.5 text-sm font-semibold">
              Retour à la connexion
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <h1 className="text-xl font-bold text-center">Mot de passe oublié</h1>
            <p className="text-sm text-gray-400 text-center">
              Saisissez votre adresse, nous vous enverrons un lien de réinitialisation.
            </p>
            <div>
              <label className="text-sm text-gray-300">Email</label>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 outline-none focus:border-purple-400"
              />
            </div>
            <button disabled={busy} className="btn-gradient w-full rounded-lg py-2.5 font-semibold disabled:opacity-50">
              {busy ? 'Envoi…' : 'Envoyer le lien'}
            </button>
            <p className="text-sm text-center text-gray-400">
              <Link to="/login" className="text-purple-300 hover:underline">
                Retour à la connexion
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
