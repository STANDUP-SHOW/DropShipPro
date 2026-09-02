import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { Sparkles, X, Check, ArrowRight, Loader2 } from 'lucide-react'
import { api, assetUrl } from '../lib/api'

/**
 * Créer une publicité : la fenêtre qui pose les six questions qui comptent.
 *
 * Le bouton « Générer ad » dépliait un panneau sous la liste, plus bas que
 * l'écran : le vendeur cliquait, rien ne bougeait sous ses yeux, et il en
 * concluait que le bouton ne marchait pas. Une fenêtre au milieu de l'écran
 * répond à ce clic.
 *
 * **Facebook et Instagram sont séparés**, et ce n'est pas une erreur de notre
 * part de le faire alors que c'est le même Meta : ce sont deux réseaux
 * différents pour ceux qui les utilisent, et ils n'ont pas le même format —
 * Facebook est un paysage 1200×628, Instagram un carré 1080×1080. Les fondre en
 * une seule case forcerait à choisir un format pour les deux.
 */

/** Les destinations proposées, dans l'ordre où on y pense. */
const RESEAUX = [
  { id: 'facebook', label: 'Facebook', format: 'Fil · 1200×628', couleur: '#1877f2', emoji: '👥' },
  { id: 'instagram', label: 'Instagram', format: 'Carré · 1080×1080', couleur: '#e1306c', emoji: '📷' },
  {
    id: 'instagram-story',
    label: 'Instagram Story',
    format: 'Vertical · 1080×1920',
    couleur: '#c13584',
    emoji: '⚡',
  },
  { id: 'tiktok', label: 'TikTok', format: 'Vertical · 1080×1920', couleur: '#000000', emoji: '🎵' },
  { id: 'snapchat', label: 'Snapchat', format: 'Vertical · 1080×1920', couleur: '#fffc00', emoji: '👻' },
  { id: 'google', label: 'Google Display', format: 'Bannière · 1200×628', couleur: '#4285f4', emoji: '🔍' },
] as const

export function AdDialog({
  productId,
  productTitle,
  shopId,
  credits,
  coutParPub = 2,
  onClose,
  onGenerated,
}: {
  productId: string
  productTitle: string
  /** La boutique ou l annonce est rangee : c est la proposition par defaut. */
  shopId?: string | null
  credits: number | null
  /** Ce que coûte une publicité, servi par `/visuals/state`. Jamais recalculé ici. */
  coutParPub?: number
  onClose: () => void
  onGenerated: (images: unknown[], credits: number) => void
}) {
  /**
   * La boutique dont la publicite porte le nom et le logo.
   *
   * Elle n etait pas demandee : la publicite prenait la boutique ou l annonce
   * etait rangee, et le vendeur qui en tient quatre recevait le mauvais nom
   * sous le mauvais logo. Une publicite qui ne correspond a aucune de ses
   * enseignes ne se publie pas -- elle se jette.
   */
  const [boutiques, setBoutiques] = useState<Array<{ id: string; name: string; logo: string | null }>>([])
  const [boutique, setBoutique] = useState<string>(shopId ?? '')

  const [choisis, setChoisis] = useState<Set<string>>(new Set(['instagram']))
  const [avecPrix, setAvecPrix] = useState(true)
  /** L'IA lit l'annonce, ou le vendeur dicte son message. */
  const [source, setSource] = useState<'ia' | 'moi'>('ia')
  const [argument, setArgument] = useState('')
  const [hint, setHint] = useState('')
  const [ctaLabel, setCtaLabel] = useState('Commander')
  const [ctaUrl, setCtaUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [fini, setFini] = useState<number | null>(null)

  useEffect(() => {
    api
      .listShops()
      .then((liste) => {
        setBoutiques(liste.map((b) => ({ id: b.id, name: b.name, logo: b.logo })))
        // Une seule boutique : la question ne se pose pas, on la retient sans
        // rien demander.
        setBoutique((actuel) => actuel || (liste.length === 1 ? liste[0].id : ''))
      })
      .catch(() => undefined)
  }, [])

  const basculer = (id: string) =>
    setChoisis((actuel) => {
      const suivant = new Set(actuel)
      if (suivant.has(id)) suivant.delete(id)
      else suivant.add(id)
      return suivant
    })

  async function generer() {
    if (!choisis.size || busy) return
    setBusy(true)
    setErreur(null)
    try {
      const res = await api.generateAds(productId, [...choisis], 1, {
        showPrice: avecPrix,
        // Ce que le vendeur dicte ne part que s'il a choisi de dicter : laisser
        // filer un champ rempli puis abandonné mettrait sur le visuel une phrase
        // qu'il croyait annulée.
        argument: source === 'moi' && argument.trim() ? argument.trim() : undefined,
        hint: source === 'moi' && hint.trim() ? hint.trim() : undefined,
        ctaLabel: ctaLabel.trim() || undefined,
        ctaUrl: ctaUrl.trim() || undefined,
        shopId: boutique || undefined,
      })
      if (res.errors.length) setErreur(res.errors.join(' · '))
      onGenerated(res.images, res.credits)
      if (res.images.length) setFini(res.images.length)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Génération impossible')
    } finally {
      setBusy(false)
    }
  }

  /*
   * Le coût, réseau par réseau, au tarif du serveur.
   *
   * C'était `choisis.size` : un crédit par visuel, parce que c'était vrai à
   * l'époque. Une publicité en coûte deux — une accroche écrite, puis un visuel
   * composé — et cette ligne aurait continué d'annoncer la moitié du prix sans
   * que rien ne la contredise. Le tarif arrive donc de `/visuals/state`.
   */
  const cout = choisis.size * coutParPub

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70 p-4 sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#1b1633] p-5">
        {/* --- Après coup : ce qui a été produit, et où le retrouver --------- */}
        {fini ? (
          <div className="py-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20">
              <Check size={24} className="text-emerald-300" />
            </div>
            <h2 className="mt-3 text-lg font-bold">
              {fini > 1 ? `${fini} publicités générées` : 'Publicité générée'}
            </h2>
            <p className="mt-1 text-sm text-gray-400">Retrouvez-la dans « Mes pubs ».</p>
            <div className="mt-5 flex justify-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-white/10 px-4 py-2 text-sm hover:bg-white/5"
              >
                Fermer
              </button>
              <Link
                to="/mes-pubs"
                onClick={onClose}
                className="btn-gradient flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold"
              >
                <span>Voir mes pubs</span>
                <ArrowRight size={15} />
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 text-lg font-bold">
                  <Sparkles size={18} className="shrink-0 text-purple-300" />
                  <span>Créer une publicité</span>
                </h2>
                <p className="mt-0.5 truncate text-xs text-gray-400">{productTitle}</p>
              </div>
              <button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            {/*
              --- L'enseigne ------------------------------------------------

              Demandée en premier, avant même la destination : c'est elle qui
              décide du nom et du logo posés sur le visuel. Elle ne l'était pas,
              et la publicité prenait la boutique où l'annonce est rangée — un
              vendeur qui en tient quatre recevait le mauvais nom sous le
              mauvais logo, c'est-à-dire une publicité à jeter.

              La question disparaît quand elle n'a qu'une réponse : un vendeur
              avec une seule boutique n'a rien à choisir.
            */}
            {boutiques.length > 1 ? (
              <>
                <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Au nom de quelle boutique ?
                </h3>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {boutiques.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setBoutique(b.id)}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs transition ${
                        boutique === b.id
                          ? 'border-purple-400/60 bg-purple-500/15 text-white'
                          : 'border-white/10 bg-white/[0.03] text-gray-400 hover:text-white'
                      }`}
                    >
                      {b.logo ? (
                        <img
                          src={assetUrl(b.logo)}
                          alt=""
                          className="h-6 w-6 shrink-0 rounded object-contain"
                        />
                      ) : (
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-white/10 text-[10px]">
                          {b.name.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <span className="truncate">{b.name}</span>
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-gray-500">
                  Son nom et son logo seront posés sur le visuel.
                </p>
              </>
            ) : null}

            {/* --- Les réseaux : éteints, on les allume au clic --------------- */}
            <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Où va-t-elle passer ?
            </h3>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {RESEAUX.map((r) => {
                const actif = choisis.has(r.id)
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => basculer(r.id)}
                    aria-pressed={actif}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition ${
                      actif
                        ? 'border-purple-400/60 bg-purple-500/15'
                        : 'border-white/10 bg-white/[0.03] opacity-45 grayscale hover:opacity-80'
                    }`}
                  >
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm"
                      style={{ backgroundColor: `${r.couleur}33` }}
                    >
                      {r.emoji}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">{r.label}</span>
                      <span className="block truncate text-[10px] text-gray-500">{r.format}</span>
                    </span>
                    {actif ? <Check size={13} className="shrink-0 text-purple-300" /> : null}
                  </button>
                )
              })}
            </div>

            {/* --- Le prix ---------------------------------------------------- */}
            <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Afficher le prix de vente ?
            </h3>
            <div className="mt-2 flex gap-2">
              {(
                [
                  [true, 'Oui, afficher le prix'],
                  [false, 'Non, sans prix'],
                ] as const
              ).map(([valeur, label]) => (
                <button
                  key={String(valeur)}
                  type="button"
                  onClick={() => setAvecPrix(valeur)}
                  className={`flex-1 rounded-xl border px-3 py-2 text-xs transition ${
                    avecPrix === valeur
                      ? 'border-purple-400/60 bg-purple-500/15 text-white'
                      : 'border-white/10 bg-white/[0.03] text-gray-400 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* --- Le message -------------------------------------------------- */}
            <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Le message
            </h3>
            <div className="mt-2 flex gap-2">
              {(
                [
                  ['ia', "Laisser Nadia lire l'annonce"],
                  ['moi', 'Je dicte mon message'],
                ] as const
              ).map(([valeur, label]) => (
                <button
                  key={valeur}
                  type="button"
                  onClick={() => setSource(valeur)}
                  className={`flex-1 rounded-xl border px-3 py-2 text-xs transition ${
                    source === valeur
                      ? 'border-purple-400/60 bg-purple-500/15 text-white'
                      : 'border-white/10 bg-white/[0.03] text-gray-400 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/*
              Deux zones de texte, et non deux lignes.

              Soixante caractères pour l'accroche et trois cents pour l'image
              suffisaient à « sur un bureau en bois » — pas à une vraie consigne.
              Un vendeur qui sait ce qu'il veut décrit le cadrage, la lumière, le
              décor, et surtout ce qu'il ne veut pas voir. Un champ d'une ligne
              le décourage avant même la borne.
            */}
            {source === 'moi' ? (
              <div className="mt-2 space-y-3">
                <label className="block">
                  <span className="text-[11px] text-gray-400">Ce qu'il faut mettre en avant</span>
                  <textarea
                    value={argument}
                    onChange={(e) => setArgument(e.target.value)}
                    rows={2}
                    maxLength={300}
                    placeholder="« Livraison offerte dès 39 € », « Le seul modèle étanche à ce prix »…"
                    className="mt-1 w-full resize-y rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs leading-relaxed outline-none focus:border-purple-400/70"
                  />
                </label>

                <label className="block">
                  <span className="text-[11px] text-gray-400">
                    Consigne pour l'image — décrivez ce que vous voulez, en détail
                  </span>
                  <textarea
                    value={hint}
                    onChange={(e) => setHint(e.target.value)}
                    rows={5}
                    maxLength={2000}
                    placeholder={
                      "Décor, lumière, cadrage, ambiance, ce qu'il ne faut surtout pas voir.\n\n" +
                      '« Posée sur un établi en chêne brut, lumière rasante de fin de journée, ' +
                      "arrière-plan flou d'atelier, aucun texte ni logo sur la photo, cadrage " +
                      'serré à 45°. »'
                    }
                    className="mt-1 w-full resize-y rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs leading-relaxed outline-none focus:border-purple-400/70"
                  />
                  {/* Le compteur n apparait qu en approchant, pour ne pas
                      suggerer une contrainte a qui ecrit trois lignes. */}
                  {hint.length > 1500 ? (
                    <span className="mt-1 block text-right text-[10px] text-gray-500">
                      {`${hint.length} / 2000`}
                    </span>
                  ) : null}
                </label>
              </div>
            ) : (
              <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
                Nadia reprend le titre, les arguments et le prix de l'annonce telle qu'elle est
                enregistrée. Rien n'est inventé : un prix ou une promesse qui ne viennent pas de la
                fiche se paient en litiges.
              </p>
            )}

            {/* --- Le bouton dessiné sur le visuel ------------------------------ */}
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <input
                value={ctaLabel}
                onChange={(e) => setCtaLabel(e.target.value)}
                maxLength={40}
                placeholder="Texte du bouton"
                className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs outline-none focus:border-purple-400/70"
              />
              <input
                value={ctaUrl}
                onChange={(e) => setCtaUrl(e.target.value)}
                maxLength={300}
                placeholder="Adresse de la boutique (facultatif)"
                className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs outline-none focus:border-purple-400/70"
              />
            </div>

            {erreur ? (
              <p className="mt-3 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-200">
                {erreur}
              </p>
            ) : null}

            {/*
              Refusé d'avance quand le solde ne couvre pas la demande : lancer
              pour recevoir « crédits insuffisants » fait perdre le temps de
              composition, et l'écran connaît déjà les deux chiffres.
            */}
            <button
              type="button"
              onClick={generer}
              disabled={!choisis.size || busy || (credits !== null && credits < cout)}
              className="btn-gradient mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-40"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              {/* Le nombre de publicités, pas le nombre de crédits : depuis que
                  les deux diffèrent, « Générer 4 publicité(s) » pour deux
                  réseaux serait un mensonge. */}
              <span>{busy ? 'Nadia compose…' : `Générer ${choisis.size} publicité(s)`}</span>
            </button>

            <p className="mt-2 text-center text-[11px] text-gray-500">
              {credits === null
                ? `${cout} crédit(s) image · ${coutParPub} par publicité`
                : `${cout} crédit(s) image sur les ${credits} qui vous restent · ${coutParPub} par publicité`}
            </p>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
