import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles, Check, Trash2, Download } from 'lucide-react'
import { api, assetUrl } from '../lib/api'

type Visual = Awaited<ReturnType<typeof api.productVisuals>>['generated'][number]

/**
 * Six mises en situation, et rien d autre.
 *
 * Lea produisait aussi un visuel publicitaire. C etait une erreur de metier :
 * elle compose une image, elle n ecrit pas d accroche, et la pub sortait sans
 * texte -- un credit depense pour un visuel inutilisable. La publicite est le
 * metier de Nadia, qui pose le logo, le prix et le bouton. Chacune la sienne.
 */
const MISES_EN_SITUATION = 6

/**
 * Le bloc de Léa sur la fiche d'une annonce.
 *
 * L'atelier photo existait déjà, mais dans une page à part : il fallait savoir
 * qu'il existait, y aller, et retrouver son produit dans une liste. Le vendeur
 * qui regarde une annonce faible ne fait pas ce chemin. L'agent vient donc à
 * lui, là où le manque se voit.
 *
 * Rien n'est appliqué tout seul : les images produites sont proposées, et c'est
 * le vendeur qui décide laquelle rejoint l'annonce. Une photo poussée d'office
 * en tête d'annonce serait une modification de sa vitrine faite sans lui.
 */
export function PhotoAgentBlock({
  productId,
  onImagesChanged,
}: {
  productId: string
  onImagesChanged: () => void
}) {
  const [credits, setCredits] = useState<number | null>(null)
  const [configured, setConfigured] = useState(true)
  const [visuals, setVisuals] = useState<Visual[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [kept, setKept] = useState<Set<string>>(new Set())

  useEffect(() => {
    api
      .visualState()
      .then((s) => {
        setCredits(s.credits)
        setConfigured(s.configured)
      })
      .catch(() => setConfigured(false))
    api
      .productVisuals(productId)
      .then((d) => setVisuals(d.generated))
      .catch(() => undefined)
  }, [productId])

  const cout = MISES_EN_SITUATION

  async function regenerate() {
    setBusy(true)
    setError(null)
    const problemes: string[] = []

    try {
      const photos = await api.generatePhotos(productId, MISES_EN_SITUATION)
      if (photos.errors.length) problemes.push(...photos.errors)
      setCredits(photos.credits)
      setVisuals((v) => [...photos.images, ...v])
    } catch (err) {
      problemes.push(err instanceof Error ? err.message : 'Génération impossible')
    } finally {
      setBusy(false)
      // Dédoublonné : « crédits épuisés » répété six fois n'apprend rien de plus.
      if (problemes.length) setError([...new Set(problemes)].join(' · '))
    }
  }

  async function keep(id: string) {
    await api.keepImage(id)
    setKept((k) => new Set(k).add(id))
    onImagesChanged()
  }

  async function remove(id: string) {
    await api.deleteImage(id)
    setVisuals((v) => v.filter((i) => i.id !== id))
  }

  if (!configured) return null

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
      <header className="flex items-start gap-2.5">
        <span className="text-xl">📸</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold tracking-wide">Léa — Agent Graphiste</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-gray-500">
            Je peux refaire les photos de ce produit si vous le souhaitez : le même article, mais en
            situation d'utilisation, éclairé comme en studio. Je ne fais que de la photo.
          </p>
        </div>
      </header>

      <button
        type="button"
        onClick={regenerate}
        disabled={busy || credits === 0}
        className="btn-gradient mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
      >
        <Sparkles size={15} />
        <span>{busy ? 'Léa travaille…' : 'Régénérer 6 photos'}</span>
      </button>

      <p className="mt-2 text-center text-[11px] text-gray-500">
        {credits === null
          ? `${cout} crédits images · ${MISES_EN_SITUATION} mises en situation`
          : `${cout} crédits images sur les ${credits} qui vous restent · ${MISES_EN_SITUATION} mises en situation`}
      </p>

      {/*
        Le renvoi vers Nadia, et la raison.
        Léa composait aussi la publicité, et la sortait sans accroche : un crédit
        dépensé pour un visuel inutilisable. Poser le logo, le prix et le bouton
        est un autre métier — autant le dire ici plutôt que de laisser le vendeur
        redemander la même chose à la mauvaise personne.
      */}
      <p className="mt-2 text-center text-[11px] text-gray-500">
        Besoin d'une publicité — logo, prix, bouton vers la boutique ?{' '}
        <Link to="/marketing" className="text-purple-300 underline underline-offset-2">
          C'est Nadia qui s'en charge
        </Link>
        .
      </p>

      {credits === 0 ? (
        <p className="mt-2 text-center text-[11px] text-amber-300">
          <Link to="/marketing-photo" className="underline">
            Recharger des crédits images
          </Link>
        </p>
      ) : null}

      {error ? <p className="mt-3 text-xs text-red-400">{error}</p> : null}

      {visuals.length ? (
        <div className="mt-4 grid grid-cols-3 gap-2">
          {visuals.map((v) => (
            <div key={v.id} className="group relative overflow-hidden rounded-lg bg-black/30">
              <img
                src={assetUrl(v.path)}
                alt=""
                className="aspect-square w-full object-cover"
                loading="lazy"
              />
              {v.kind === 'ad' ? (
                <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[9px] font-semibold">
                  PUB
                </span>
              ) : null}
              <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1 bg-black/70 p-1 opacity-0 transition group-hover:opacity-100 max-md:opacity-100">
                <button
                  type="button"
                  title="Ajouter à l'annonce"
                  onClick={() => keep(v.id)}
                  className="rounded p-1 text-emerald-300 hover:bg-white/10"
                >
                  <Check size={13} />
                </button>
                <a
                  href={assetUrl(v.path)}
                  target="_blank"
                  rel="noreferrer"
                  title="Ouvrir en grand"
                  className="rounded p-1 text-gray-300 hover:bg-white/10"
                >
                  <Download size={13} />
                </a>
                <button
                  type="button"
                  title="Jeter"
                  onClick={() => remove(v.id)}
                  className="rounded p-1 text-red-300 hover:bg-white/10"
                >
                  <Trash2 size={13} />
                </button>
              </div>
              {v.kept || kept.has(v.id) ? (
                <span className="absolute right-1 top-1 rounded bg-emerald-500/90 px-1 text-[9px] font-semibold">
                  DANS L'ANNONCE
                </span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}
