import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MessageSquare, Trash2 } from 'lucide-react'
import { Logo } from '../components/Logo'
import { ReviewGrid, StarPicker, Stars, type PublicReview } from '../components/Reviews'
import { api, isAuthed } from '../lib/api'

/**
 * Public reviews page.
 *
 * Outside <Protected> on purpose: a visitor with no account must be able to read
 * what testers said. Writing one, on the other hand, requires being signed in —
 * which is also what keeps the page from filling with spam.
 */
export default function ReviewsPage() {
  const [reviews, setReviews] = useState<PublicReview[]>([])
  const [count, setCount] = useState(0)
  const [average, setAverage] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  const signedIn = isAuthed()
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [hasReview, setHasReview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  async function load() {
    const data = await api.listPublicReviews(200)
    setReviews(data.reviews)
    setCount(data.count)
    setAverage(data.average)
    setLoading(false)
  }

  useEffect(() => {
    load()
    if (!signedIn) return
    api
      .myReview()
      .then((mine) => {
        if (!mine) return
        setHasReview(true)
        setRating(mine.rating)
        setComment(mine.comment)
        setDisplayName(mine.displayName)
      })
      .catch(() => {
        // An expired token just means no form is pre-filled.
      })
  }, [signedIn])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    if (!rating) return setMessage({ ok: false, text: 'Choisissez une note de 1 à 5 étoiles.' })

    setSaving(true)
    try {
      await api.saveReview({ rating, comment, displayName: displayName || undefined })
      setHasReview(true)
      setMessage({ ok: true, text: 'Merci, votre avis est publié.' })
      await load()
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Enregistrement impossible' })
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    await api.deleteReview()
    setHasReview(false)
    setRating(0)
    setComment('')
    setMessage({ ok: true, text: 'Votre avis a été retiré.' })
    await load()
  }

  return (
    <div className="min-h-screen bg-app-gradient text-white">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <Link to="/">
          <Logo />
        </Link>
        <Link
          to={signedIn ? '/dashboard' : '/login'}
          className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/5"
        >
          {signedIn ? 'Mon espace' : 'Se connecter'}
        </Link>
      </header>

      <main className="mx-auto max-w-5xl px-6 pb-20">
        <h1 className="text-2xl font-bold">Avis des utilisateurs</h1>
        {average !== null && count > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Stars rating={Math.round(average)} size={18} />
            <span className="text-sm text-gray-300">
              {`${average.toFixed(1)} sur 5 — ${count} avis`}
            </span>
          </div>
        )}

        {/* The form comes first: the page exists to collect opinions during the
            test phase, not only to display them. */}
        <section className="mt-8 rounded-2xl border border-purple-400/30 bg-purple-500/5 p-5">
          <h2 className="flex items-center gap-2 font-bold">
            <MessageSquare size={18} className="text-purple-300" />
            <span>{hasReview ? 'Modifier mon avis' : 'Donner mon avis'}</span>
          </h2>

          {!signedIn ? (
            <p className="mt-3 text-sm text-gray-300">
              <Link to="/login" className="text-purple-300 hover:underline">
                Connectez-vous
              </Link>{' '}
              pour laisser un avis. Un avis par compte, modifiable à tout moment.
            </p>
          ) : (
            <form onSubmit={submit} className="mt-4 space-y-3">
              <div>
                <label className="text-xs text-gray-400">Votre note</label>
                <div className="mt-1">
                  <StarPicker value={rating} onChange={setRating} />
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-400">Nom affiché</label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={40}
                  placeholder="Le nom de votre boutique, ou votre prénom"
                  className="mt-1 w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm outline-none focus:border-purple-400"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Votre adresse email n'est jamais affichée.
                </p>
              </div>

              <div>
                <label className="text-xs text-gray-400">Votre avis</label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={5}
                  minLength={10}
                  maxLength={1500}
                  required
                  placeholder="Ce qui vous a servi, ce qui vous a manqué, ce qui vous a bloqué…"
                  className="mt-1 w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm outline-none focus:border-purple-400"
                />
                <p className="mt-1 text-xs text-gray-500">
                  {`${comment.length} / 1500 caractères`}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  disabled={saving}
                  className="btn-gradient rounded-lg px-5 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  {saving ? 'Envoi…' : hasReview ? 'Mettre à jour' : 'Publier mon avis'}
                </button>
                {hasReview && (
                  <button
                    type="button"
                    onClick={remove}
                    className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-300"
                  >
                    <Trash2 size={14} />
                    <span>Retirer mon avis</span>
                  </button>
                )}
                {message && (
                  <span className={`text-xs ${message.ok ? 'text-emerald-300' : 'text-red-400'}`}>
                    {message.text}
                  </span>
                )}
              </div>
            </form>
          )}
        </section>

        <h2 className="mt-10 text-lg font-bold">
          {count > 0 ? `Ce qu'en disent les utilisateurs (${count})` : 'Aucun avis pour le moment'}
        </h2>

        {loading ? (
          <p className="mt-4 text-sm text-gray-400">Chargement…</p>
        ) : reviews.length === 0 ? (
          <p className="mt-4 text-sm text-gray-400">
            Personne ne s'est encore exprimé. Si vous testez l'application, votre retour est le
            bienvenu — y compris s'il est sévère.
          </p>
        ) : (
          <div className="mt-4">
            <ReviewGrid reviews={reviews} />
          </div>
        )}
      </main>
    </div>
  )
}
