import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { affiliationApi } from '../lib/affiliation'

/**
 * Le programme d'affiliation, et l'inscription (décision de Max, 07/10/2026) :
 * 10 % à vie, en euros, de ce que les filleuls dépensent en drops.
 */
export function CadreAffiliation({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-app-gradient text-white">
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <Link to="/">
          <Logo />
        </Link>
        <nav className="flex items-center gap-4 text-sm text-gray-300">
          <Link to="/affiliation" className="hover:text-white">
            Le programme
          </Link>
          <Link to="/affiliation/connexion" className="hover:text-white">
            Espace affilié
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">{children}</main>
    </div>
  )
}

const ETAPES = [
  ['Inscrivez-vous', 'Un nom, une adresse email : vous recevez votre code d’accès et votre lien personnel par mail.'],
  ['Partagez votre lien', 'Sur vos réseaux, votre chaîne, votre blog ou vos messages. Chaque visite est comptée.'],
  ['Touchez 10 % à vie', 'Sur chaque recharge de drops de vos filleuls, tant qu’ils restent clients. Versés en euros.'],
]

export default function AffiliationAccueil() {
  const [nom, setNom] = useState('')
  const [email, setEmail] = useState('')
  const [accepte, setAccepte] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)

  async function inscrire(e: FormEvent) {
    e.preventDefault()
    setErreur(null)
    setEnvoi(true)
    try {
      const r = await affiliationApi.inscription(nom, email)
      setMessage(r.message)
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Inscription impossible')
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <CadreAffiliation>
      <section className="pt-6 sm:pt-12">
        <p className="text-sm font-semibold uppercase tracking-wider text-orange-300">Programme d’affiliation</p>
        <h1 className="mt-3 text-3xl font-bold leading-tight sm:text-5xl">
          Recommandez DropShipper IA,
          <br className="hidden sm:block" /> touchez <span className="bg-gradient-to-r from-[#f28a4b] to-[#e85290] bg-clip-text text-transparent">10 % à vie</span>
        </h1>
        <p className="mt-4 max-w-2xl text-base text-gray-300 sm:text-lg">
          Chaque vendeur qui crée son compte par votre lien devient votre filleul. Sur tout ce qu’il dépense en drops,
          aujourd’hui et dans cinq ans, 10 % vous reviennent, en euros.
        </p>
      </section>

      <section className="mt-10 grid gap-4 sm:grid-cols-3">
        {ETAPES.map(([titre, texte], i) => (
          <div key={titre} className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm font-bold text-orange-300">{i + 1}</p>
            <h2 className="mt-1 text-lg font-bold">{titre}</h2>
            <p className="mt-2 text-sm text-gray-300">{texte}</p>
          </div>
        ))}
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 sm:p-6">
          <h2 className="text-lg font-bold">Un exemple</h2>
          <p className="mt-2 text-sm text-gray-300">
            Un filleul recharge 20 € de drops chaque mois : vous touchez 2 € par mois, tant qu’il recharge. Dix filleuls
            comme lui : 20 € par mois. Les drops se paient à l’acte, sans abonnement : un vendeur actif recharge au fil de
            son activité.
          </p>
          <h2 className="mt-6 text-lg font-bold">Votre espace</h2>
          <ul className="mt-2 space-y-1.5 text-sm text-gray-300">
            <li>• Clics, inscriptions et taux de conversion</li>
            <li>• Dépenses de vos filleuls et vos gains, par jour, semaine, mois et année</li>
            <li>• La liste de vos filleuls, actifs et inactifs</li>
            <li>• Vos gains dus et déjà versés</li>
          </ul>
          <p className="mt-6 text-xs text-gray-500">
            Le compte affilié est distinct d’un compte vendeur. Les commissions portent sur les recharges payées par les
            filleuls (par carte ou via Shopify), à partir de leur inscription par votre lien.{' '}
            <a href="/cgu/#affiliation" className="underline">
              Conditions du programme
            </a>
            .
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 sm:p-6">
          <h2 className="text-lg font-bold">Devenir affilié</h2>
          {message ? (
            <div className="mt-4 space-y-3 text-sm">
              <p className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-emerald-200">{message}</p>
              <Link to={`/affiliation/connexion?email=${encodeURIComponent(email)}`} className="btn-gradient inline-block rounded-lg px-4 py-2.5 font-semibold">
                J’ai reçu mon code
              </Link>
            </div>
          ) : (
            <form onSubmit={inscrire} className="mt-4 space-y-4">
              {erreur && <p className="text-sm text-red-400">{erreur}</p>}
              <label className="block text-sm text-gray-300">
                Votre nom ou celui de votre média
                <input
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  required
                  minLength={2}
                  maxLength={60}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-orange-300/60"
                />
              </label>
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
              <label className="flex items-start gap-2 text-sm text-gray-300">
                <input type="checkbox" checked={accepte} onChange={(e) => setAccepte(e.target.checked)} required className="mt-1" />
                <span>
                  J’accepte les{' '}
                  <a href="/cgu/#affiliation" className="underline">
                    conditions du programme d’affiliation
                  </a>
                  .
                </span>
              </label>
              <button disabled={envoi || !accepte} className="btn-gradient w-full rounded-lg py-2.5 font-semibold disabled:opacity-50">
                {envoi ? 'Envoi…' : 'Recevoir mon code d’accès'}
              </button>
              <p className="text-center text-sm text-gray-400">
                Déjà affilié ?{' '}
                <Link to="/affiliation/connexion" className="text-white underline">
                  Ouvrir mon espace
                </Link>
              </p>
            </form>
          )}
        </div>
      </section>
    </CadreAffiliation>
  )
}
