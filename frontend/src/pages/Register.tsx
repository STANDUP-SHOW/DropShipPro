import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { GoogleSignIn } from '../components/GoogleSignIn'
import { useAuth } from '../lib/auth'

// Same figures as the /tarifs/ page (scripts/build-llms.cjs TARIFS).
const ATOUTS = [
  { titre: '120 drops offerts', texte: "De quoi importer et publier dix annonces, sans carte bancaire." },
  { titre: "Pas d'abonnement", texte: 'Vous payez ce que vous faites, rien de plus.' },
  { titre: "0,12 € l'annonce", texte: "Import et réécriture par l'IA compris." },
  { titre: 'Crédit rendu', texte: "Quand une action échoue, ses drops vous reviennent." },
]

const champ =
  'mt-1.5 w-full rounded-xl bg-[var(--nuit)] border border-[var(--trait-fort)] px-3.5 py-2.5 text-[var(--texte)] outline-none focus:border-[var(--rose)] focus:ring-2 focus:ring-[var(--rose)]/25'

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [voir, setVoir] = useState(false)
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
    <div className="min-h-screen bg-[var(--nuit)] text-[var(--texte)] flex flex-col items-center justify-center px-4 py-10">
      <Link to="/" className="mb-8">
        <Logo />
      </Link>
      <div className="w-full max-w-4xl grid gap-8 md:grid-cols-2 md:items-center">
        <section className="order-2 md:order-1">
          <div className="flex items-center gap-3">
            <img src="/marque/drops.png" alt="" width={48} height={48} className="drop-flotte h-12 w-12" />
            <img src="/marque/drops-mot.png" alt="Drops" width={249} height={96} className="h-7 w-auto" />
          </div>
          <h2 className="mt-5 text-2xl md:text-3xl font-bold leading-tight">
            Une plateforme pour tout faire avec l'IA
          </h2>
          <ul className="mt-6 space-y-4">
            {ATOUTS.map((a) => (
              <li key={a.titre} className="flex gap-3">
                <span
                  aria-hidden
                  className="mt-1.5 h-2.5 w-2.5 flex-none rounded-full bg-[linear-gradient(90deg,var(--marque-orange),var(--marque-rose))]"
                />
                <span>
                  <strong className="block text-[var(--texte)]">{a.titre}</strong>
                  <span className="text-[var(--texte-2)]">{a.texte}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-[var(--texte-3)]">
            Le prix de chaque action :{' '}
            <a href="/tarifs/" className="text-[var(--texte-2)] underline underline-offset-4 hover:text-[var(--texte)]">
              tarifs
            </a>
          </p>
        </section>
        <form
          onSubmit={onSubmit}
          className="order-1 md:order-2 w-full rounded-2xl bg-[var(--panneau)] border border-[var(--trait)] p-6 md:p-7 space-y-4"
        >
          <h1 className="text-xl font-bold">Créer un compte</h1>
          {error && (
            <p role="alert" className="text-sm text-red-300 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2">
              {error}
            </p>
          )}
          <div>
            <label htmlFor="inscription-email" className="text-sm text-[var(--texte-2)]">
              Email
            </label>
            <input
              id="inscription-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={champ}
            />
          </div>
          <div>
            <label htmlFor="inscription-mdp" className="text-sm text-[var(--texte-2)]">
              Mot de passe (8 caractères min.)
            </label>
            <div className="relative">
              <input
                id="inscription-mdp"
                type={voir ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${champ} pr-24`}
              />
              <button
                type="button"
                onClick={() => setVoir((v) => !v)}
                aria-pressed={voir}
                className="absolute right-2 top-1/2 mt-[3px] -translate-y-1/2 rounded-lg px-2.5 py-1 text-sm text-[var(--texte-2)] hover:text-[var(--texte)]"
              >
                {voir ? 'Masquer' : 'Afficher'}
              </button>
            </div>
          </div>
          <button disabled={busy} className="btn-gradient w-full rounded-xl py-3 font-semibold disabled:opacity-50">
            {busy ? 'Création...' : 'Créer mon compte'}
          </button>
          <GoogleSignIn />
          <p className="text-sm text-center text-[var(--texte-2)]">
            Déjà un compte ?{' '}
            <Link to="/login" className="text-[var(--texte)] underline underline-offset-4 hover:text-white">
              Se connecter
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}
