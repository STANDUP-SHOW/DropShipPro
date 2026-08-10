import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { Logo } from '../components/Logo'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'

export default function VerifyEmail() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const { refresh } = useAuth()

  const [state, setState] = useState<'pending' | 'ok' | 'error'>('pending')
  const [message, setMessage] = useState('')
  // The token is single-use, so React's double-invoked effect in development
  // would burn it and report a failure on the second run.
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    if (!token) {
      setState('error')
      setMessage('Lien de confirmation incomplet.')
      return
    }

    api
      .verifyEmail(token)
      .then(async () => {
        setState('ok')
        await refresh()
      })
      .catch((err) => {
        setState('error')
        setMessage(err instanceof Error ? err.message : 'Confirmation impossible')
      })
  }, [token, refresh])

  return (
    <div className="min-h-screen bg-app-gradient text-white flex flex-col items-center justify-center px-6 text-center">
      <Link to="/" className="mb-8">
        <Logo />
      </Link>

      <div className="w-full max-w-sm rounded-2xl bg-white/5 border border-white/10 p-7">
        {state === 'pending' && (
          <>
            <Loader2 className="mx-auto animate-spin text-purple-300" size={32} />
            <p className="mt-4 text-sm text-gray-300">Confirmation en cours…</p>
          </>
        )}

        {state === 'ok' && (
          <>
            <CheckCircle2 className="mx-auto text-emerald-300" size={36} />
            <h1 className="text-xl font-bold mt-4">Adresse confirmée</h1>
            <p className="text-sm text-gray-300 mt-2">
              Votre compte est sécurisé. Vous pouvez réinitialiser votre mot de passe à tout moment.
            </p>
            <Link to="/dashboard" className="btn-gradient mt-6 inline-block rounded-lg px-5 py-2.5 text-sm font-semibold">
              Accéder à mes annonces
            </Link>
          </>
        )}

        {state === 'error' && (
          <>
            <XCircle className="mx-auto text-red-400" size={36} />
            <h1 className="text-xl font-bold mt-4">Confirmation impossible</h1>
            <p className="text-sm text-gray-300 mt-2">{message}</p>
            <p className="text-xs text-gray-500 mt-3">
              Depuis vos réglages, vous pouvez demander l'envoi d'un nouveau lien.
            </p>
            <Link to="/settings" className="btn-gradient mt-6 inline-block rounded-lg px-5 py-2.5 text-sm font-semibold">
              Ouvrir mes réglages
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
