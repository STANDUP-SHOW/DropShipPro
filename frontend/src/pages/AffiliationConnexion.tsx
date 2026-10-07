import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { affiliationApi } from '../lib/affiliation'
import { CadreAffiliation } from './AffiliationAccueil'

/** Connexion à l'espace affilié : l'adresse email et le code reçu par mail. */
export default function AffiliationConnexion() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [code, setCode] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)

  async function connecter(e: FormEvent) {
    e.preventDefault()
    setErreur(null)
    setEnvoi(true)
    try {
      await affiliationApi.connexion(email, code)
      navigate('/affiliation/espace')
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Connexion impossible')
    } finally {
      setEnvoi(false)
    }
  }

  async function renvoyer() {
    setErreur(null)
    if (!email) return setErreur('Saisissez d’abord votre adresse email.')
    try {
      setInfo((await affiliationApi.renvoyerCode(email)).message)
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Envoi impossible')
    }
  }

  return (
    <CadreAffiliation>
      <form onSubmit={connecter} className="mx-auto mt-10 w-full max-w-sm space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6">
        <h1 className="text-center text-xl font-bold">Espace affilié</h1>
        {erreur && <p className="text-center text-sm text-red-400">{erreur}</p>}
        {info && <p className="text-center text-sm text-emerald-300">{info}</p>}
        <label className="block text-sm text-gray-300">
          Adresse email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-orange-300/60"
          />
        </label>
        <label className="block text-sm text-gray-300">
          Code d’accès reçu par mail
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            required
            autoComplete="one-time-code"
            className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono tracking-widest text-white outline-none focus:border-orange-300/60"
          />
        </label>
        <button disabled={envoi} className="btn-gradient w-full rounded-lg py-2.5 font-semibold disabled:opacity-50">
          {envoi ? 'Connexion…' : 'Ouvrir mon espace'}
        </button>
        <button type="button" onClick={renvoyer} className="w-full text-sm text-gray-300 underline hover:text-white">
          Recevoir un nouveau code
        </button>
        <p className="text-center text-sm text-gray-400">
          Pas encore affilié ?{' '}
          <Link to="/affiliation" className="text-white underline">
            Découvrir le programme
          </Link>
        </p>
      </form>
    </CadreAffiliation>
  )
}
