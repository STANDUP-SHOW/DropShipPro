import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles, Check, Trash2, Download, Megaphone } from 'lucide-react'
import { api, assetUrl } from '../lib/api'
import { AdDialog } from './AdDialog'

type Visual = Awaited<ReturnType<typeof api.productVisuals>>['generated'][number]

/**
 * Le nombre proposé par défaut, quand le vendeur n'a pas encore choisi.
 *
 * Il n'y avait pas de choix du tout : le bouton disait « Régénérer 6 photos »
 * et en faisait six, à prendre ou à laisser. Six est cher pour essayer un angle
 * et court pour refaire une fiche. Le curseur va de 1 à 10 ; trois est ce
 * qu'on prend pour voir.
 */
const PAR_DEFAUT = 3

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
  productTitle,
  shopId,
  onImagesChanged,
}: {
  productId: string
  /** Le titre de l'annonce, que la fenêtre de publicité affiche pour situer. */
  productTitle: string
  /** La boutique où l'annonce est rangée : la publicité la propose par défaut. */
  shopId?: string | null
  onImagesChanged: () => void
}) {
  const [credits, setCredits] = useState<number | null>(null)
  const [tarif, setTarif] = useState({ photo: 1, pub: 2, photosMax: 10 })
  const [configured, setConfigured] = useState(true)
  const [visuals, setVisuals] = useState<Visual[]>([])
  const [combien, setCombien] = useState(PAR_DEFAUT)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [kept, setKept] = useState<Set<string>>(new Set())
  const [pubOuverte, setPubOuverte] = useState(false)

  useEffect(() => {
    api
      .visualState()
      .then((s) => {
        setCredits(s.credits)
        setConfigured(s.configured)
        if (s.tarif) setTarif(s.tarif)
      })
      .catch(() => setConfigured(false))
    api
      .productVisuals(productId)
      .then((d) => setVisuals(d.generated))
      .catch(() => undefined)
  }, [productId])

  const cout = combien * tarif.photo

  async function regenerate() {
    setBusy(true)
    setError(null)
    const problemes: string[] = []

    try {
      const photos = await api.generatePhotos(productId, combien)
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
    <>
    {/* ================= Léa — les photos, et rien d'autre ================= */}
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
      <header className="flex items-start gap-2.5">
        <span className="text-xl">📸</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold tracking-wide">Léa — Agent Graphiste</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-gray-500">
            Je peux refaire les photos de ce produit si vous le souhaitez : le même article, mais en
            situation d'utilisation, éclairé comme en studio. Je ne fais que de la photo — la
            publicité, c'est Laurence, juste en dessous.
          </p>
        </div>
      </header>

      {/*
        Combien d'images, choisi avant de payer.
        Le bouton en faisait six, à prendre ou à laisser. Une seule suffit pour
        essayer un angle ; dix pour refaire une fiche entière.
      */}
      <div className="mt-4 flex items-center gap-3">
        <label htmlFor="combien-photos" className="shrink-0 text-xs text-gray-400">
          Combien d'images
        </label>
        <input
          id="combien-photos"
          type="range"
          min={1}
          max={tarif.photosMax}
          step={1}
          value={combien}
          onChange={(e) => setCombien(Number(e.target.value))}
          className="h-1.5 flex-1 cursor-pointer accent-purple-400"
        />
        <span className="w-6 text-right text-sm font-semibold tabular-nums">{combien}</span>
      </div>

      <button
        type="button"
        onClick={regenerate}
        disabled={busy || credits === 0}
        className="btn-gradient mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
      >
        <Sparkles size={15} />
        <span>{busy ? 'Léa travaille…' : `Générer ${combien} image${combien > 1 ? 's' : ''}`}</span>
      </button>

      <p className="mt-2 text-center text-[11px] text-gray-500">
        {/*
          Le prix unitaire, et pas seulement le total.
          « 7 crédits » ne se vérifie pas ; « 1 crédit par image » se vérifie et
          se retient — le vendeur sait d'avance ce que coûtera la fois d'après.
        */}
        {credits === null
          ? `${cout} crédit(s) · ${tarif.photo} crédit par image`
          : `${cout} crédit(s) sur les ${credits} qui vous restent · ${tarif.photo} crédit par image`}
      </p>

      {credits === 0 ? (
        <p className="mt-2 text-center text-[11px] text-amber-300">
          <Link to="/marketing-photo" className="underline">
            Recharger des crédits images
          </Link>
        </p>
      ) : null}

      {error ? <p className="mt-3 text-xs text-red-400">{error}</p> : null}
    </section>

    {/* ================= Laurence — la publicité, un autre métier =================
      Les deux étaient dans le même encadré, sous le nom de Léa : le vendeur
      croyait demander une photo à la graphiste et recevait une publicité, ou
      l'inverse. Ce ne sont pas les mêmes gestes, ni le même prix, ni le même
      résultat — un visuel de vente porte un logo, un prix et un bouton, une
      mise en situation n'en porte aucun. Deux encadrés, deux signatures.
    */}
    <section className="mt-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
      <header className="flex items-start gap-2.5">
        <span className="text-xl">📣</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold tracking-wide">Laurence — Agent Marketing</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-gray-500">
            Je transforme ce produit en publicité : j'écris l'accroche, je pose le nom et le logo de
            votre boutique, le prix et le bouton, au format du réseau choisi. Je ne retouche pas les
            photos — ça, c'est Léa juste au-dessus.
          </p>
        </div>
      </header>

      <button
        type="button"
        onClick={() => setPubOuverte(true)}
        disabled={credits !== null && credits < tarif.pub}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-purple-400/40 px-4 py-2.5 text-sm font-semibold text-purple-200 transition hover:bg-purple-500/10 disabled:opacity-40"
      >
        <Megaphone size={15} />
        <span>Créer une publicité</span>
      </button>

      <p className="mt-2 text-center text-[11px] text-gray-500">
        {credits === null
          ? `${tarif.pub} crédits la publicité`
          : `${tarif.pub} crédits la publicité, sur les ${credits} qui vous restent`}
      </p>
      <p className="mt-1 text-center text-[11px] text-gray-500">
        Vos publicités se retrouvent aussi dans{' '}
        <Link to="/marketing" className="text-purple-300 underline underline-offset-2">
          Commercialisation
        </Link>
        .
      </p>
    </section>

    {/* ============ Ce que les deux ont produit, au même endroit ============
      Une seule galerie, parce que le vendeur choisit parmi tout ce qu'il a :
      l'étiquette « PUB » dit de qui vient chaque visuel.
    */}
    <section className="mt-4">
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

      {pubOuverte ? (
        <AdDialog
          productId={productId}
          productTitle={productTitle}
          shopId={shopId}
          credits={credits}
          coutParPub={tarif.pub}
          onClose={() => setPubOuverte(false)}
          onGenerated={(images, restants) => {
            setCredits(restants)
            // Les publicités rejoignent la même galerie que les photos : elles
            // portent leur étiquette « PUB », et le vendeur les garde ou les
            // jette avec les mêmes boutons.
            setVisuals((v) => [...(images as Visual[]), ...v])
          }}
        />
      ) : null}
    </section>
    </>
  )
}
