import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { Sparkles, X, Check, ArrowRight, Loader2 } from 'lucide-react'
import { api } from '../lib/api'

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
  credits,
  onClose,
  onGenerated,
}: {
  productId: string
  productTitle: string
  credits: number | null
  onClose: () => void
  onGenerated: (images: unknown[], credits: number) => void
}) {
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

  const cout = choisis.size

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

            {source === 'moi' ? (
              <div className="mt-2 space-y-2">
                <input
                  value={argument}
                  onChange={(e) => setArgument(e.target.value)}
                  maxLength={60}
                  placeholder="Ce qu'il faut mettre en avant — « Livraison offerte »"
                  className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs outline-none focus:border-purple-400/70"
                />
                <input
                  value={hint}
                  onChange={(e) => setHint(e.target.value)}
                  maxLength={300}
                  placeholder="Ambiance de l'image — « sur un bureau en bois, lumière du matin »"
                  className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs outline-none focus:border-purple-400/70"
                />
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
                maxLength={30}
                placeholder="Texte du bouton"
                className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs outline-none focus:border-purple-400/70"
              />
              <input
                value={ctaUrl}
                onChange={(e) => setCtaUrl(e.target.value)}
                maxLength={80}
                placeholder="Adresse de la boutique (facultatif)"
                className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs outline-none focus:border-purple-400/70"
              />
            </div>

            {erreur ? (
              <p className="mt-3 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-200">
                {erreur}
              </p>
            ) : null}

            <button
              type="button"
              onClick={generer}
              disabled={!choisis.size || busy || credits === 0}
              className="btn-gradient mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-40"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              <span>{busy ? 'Nadia compose…' : `Générer ${cout || 0} publicité(s)`}</span>
            </button>

            <p className="mt-2 text-center text-[11px] text-gray-500">
              {credits === null
                ? `${cout} crédit(s) image`
                : `${cout} crédit(s) image sur les ${credits} qui vous restent`}
            </p>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
