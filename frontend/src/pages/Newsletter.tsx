import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Mail, Check } from 'lucide-react'
import { Logo } from '../components/Logo'
import { api } from '../lib/api'

/**
 * La page publique d'inscription à la newsletter — accessible sans compte,
 * c'est là que pointe le lien « S'abonner » des emails. Coquille publique
 * (bg-app-gradient + Logo), à la charte, comme les pages Avis et Confidentialité.
 */
export default function Newsletter() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [etat, setEtat] = useState<{ ok: boolean; texte: string } | null>(null)

  async function envoyer(e: FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setBusy(true)
    setEtat(null)
    try {
      await api.newsletterSubscribe(email.trim(), 'page-newsletter')
      setEtat({ ok: true, texte: 'Vous êtes inscrit ! Vous recevrez les niches qui montent et nos nouveautés.' })
      setEmail('')
    } catch (err) {
      setEtat({ ok: false, texte: err instanceof Error ? err.message : "Inscription impossible, réessayez." })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-app-gradient text-white">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <Link to="/">
          <Logo />
        </Link>
        <Link
          to="/login"
          className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/5"
        >
          Se connecter
        </Link>
      </header>

      <main className="mx-auto max-w-xl px-6 pb-24 pt-10">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-7">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500 to-purple-600">
            <Mail size={20} />
          </span>
          <h1 className="mt-4 text-2xl font-bold">La newsletter DropShipper</h1>
          <p className="mt-2 text-sm leading-relaxed text-gray-300">
            Et si l'IA pouvait dénicher les niches, les mettre en vente pour vous, et que vous n'ayez
            plus qu'à encaisser vos bénéfices ? Recevez <b>les niches qui montent</b>, les nouvelles
            fonctions et nos conseils pour vendre plus — directement dans votre boîte mail.
          </p>

          {etat?.ok ? (
            <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4">
              <Check size={18} className="mt-0.5 shrink-0 text-emerald-300" />
              <p className="text-sm text-emerald-100">{etat.texte}</p>
            </div>
          ) : (
            <form onSubmit={envoyer} className="mt-6 space-y-3">
              <label className="block text-sm text-gray-300">
                Votre adresse email
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vous@exemple.com"
                  className="mt-1 w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm outline-none focus:border-purple-400"
                />
              </label>
              <button
                type="submit"
                disabled={busy}
                className="btn-gradient w-full rounded-lg py-2.5 font-semibold disabled:opacity-50"
              >
                {busy ? 'Inscription…' : "S'abonner à la newsletter"}
              </button>
              {etat && !etat.ok ? <p className="text-sm text-red-400">{etat.texte}</p> : null}
              <p className="text-center text-[11px] text-gray-500">
                Un email, pas de spam. Désinscription possible à tout moment.
              </p>
            </form>
          )}
        </div>
      </main>
    </div>
  )
}
