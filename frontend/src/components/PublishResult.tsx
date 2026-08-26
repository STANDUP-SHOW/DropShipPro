import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { CheckCircle2, Clock, AlertTriangle, X, ExternalLink, ArrowRight } from 'lucide-react'
import { PlatformBadge } from './PlatformBadge'
import type { PlatformInfo } from '../lib/platforms'

/**
 * Ce qui s'est réellement passé après un « Publier ».
 *
 * La demande était « quand on publie, c'est publié : une fenêtre qui confirme ».
 * La fenêtre est là — mais elle ne dira pas « tout est en ligne » quand ça ne
 * l'est pas, et ce n'est pas de la prudence mal placée : sur les onze
 * destinations, deux publient vraiment. Les autres attendent un compte vendeur
 * validé ou l'extension.
 *
 * Un vendeur à qui l'on annonce onze mises en ligne va vérifier, n'en trouvera
 * que deux, et ne croira plus rien de ce que l'application lui dit. Alors qu'un
 * vendeur à qui l'on dit « deux en ligne, neuf en attente, voilà pourquoi »
 * sait quoi faire de sa journée.
 *
 * D'où trois colonnes, et la plus grosse d'abord : en ligne, en attente,
 * refusées.
 */

export interface ResultatPublication {
  platform: string
  status: string
  error: string | null
  externalUrl: string | null
  /** Renseigné en publication de lot, absent pour une annonce seule. */
  title?: string
}

const rangs = {
  PUBLISHED: {
    titre: 'En ligne',
    icone: CheckCircle2,
    style: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
    puce: 'text-emerald-300',
  },
  PENDING: {
    titre: 'En attente',
    icone: Clock,
    style: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
    puce: 'text-amber-300',
  },
  FAILED: {
    titre: 'Refusées',
    icone: AlertTriangle,
    style: 'border-red-400/30 bg-red-400/10 text-red-200',
    puce: 'text-red-300',
  },
} as const

export function PublishResult({
  resultats,
  platforms,
  onClose,
}: {
  resultats: ResultatPublication[]
  platforms: PlatformInfo[]
  onClose: () => void
}) {
  const nomDe = (id: string) => platforms.find((p) => p.id === id)?.label ?? id
  const couleurDe = (id: string) => platforms.find((p) => p.id === id)?.color ?? '#8b5cf6'

  const par = (statut: keyof typeof rangs) => resultats.filter((r) => r.status === statut)
  const enLigne = par('PUBLISHED')
  const enAttente = par('PENDING')
  const refusees = par('FAILED')

  /*
   * Le titre dit l'essentiel avant qu'on lise quoi que ce soit.
   *
   * « 3 annonces publiées » quand tout marche, et le compte exact sinon. Jamais
   * « publié avec succès » sur un lot dont la moitié attend.
   */
  const titre = enLigne.length
    ? refusees.length || enAttente.length
      ? `${enLigne.length} mise(s) en ligne sur ${resultats.length}`
      : resultats.length > 1
        ? `Les ${resultats.length} destinations sont en ligne`
        : 'En ligne'
    : refusees.length
      ? 'Aucune mise en ligne'
      : 'Enregistré, en attente de diffusion'

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70 p-4 sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#1b1633] p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            {enLigne.length ? (
              <CheckCircle2 size={20} className="shrink-0 text-emerald-300" />
            ) : (
              <Clock size={20} className="shrink-0 text-amber-300" />
            )}
            <span>{titre}</span>
          </h2>
          <button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {([
            ['PUBLISHED', enLigne],
            ['PENDING', enAttente],
            ['FAILED', refusees],
          ] as const).map(([statut, liste]) =>
            liste.length ? (
              <section key={statut}>
                <h3 className={`text-xs font-semibold uppercase tracking-wide ${rangs[statut].puce}`}>
                  {`${rangs[statut].titre} · ${liste.length}`}
                </h3>
                <ul className="mt-2 space-y-1.5">
                  {liste.map((r, i) => (
                    <li
                      key={`${r.platform}-${r.title ?? ''}-${i}`}
                      className={`rounded-lg border px-3 py-2 text-sm ${rangs[statut].style}`}
                    >
                      <div className="flex items-center gap-2">
                        <PlatformBadge label={nomDe(r.platform)} color={couleurDe(r.platform)} size={18} />
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {r.title ? `${nomDe(r.platform)} — ${r.title}` : nomDe(r.platform)}
                        </span>
                        {r.externalUrl ? (
                          <a
                            href={r.externalUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            title="Voir en ligne"
                            className="shrink-0 opacity-80 hover:opacity-100"
                          >
                            <ExternalLink size={14} />
                          </a>
                        ) : null}
                      </div>
                      {/*
                        La raison est ce qui distingue « en attente » d'un
                        silence. Sans elle, le vendeur ne sait pas si c'est à lui
                        de faire quelque chose.
                      */}
                      {r.error ? <p className="mt-1 text-xs opacity-80">{r.error}</p> : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null,
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm hover:bg-white/5"
          >
            Fermer
          </button>
          <Link
            to="/dashboard"
            onClick={onClose}
            className="btn-gradient flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold"
          >
            <span>Consulter mes annonces</span>
            <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    </div>,
    document.body,
  )
}
