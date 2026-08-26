import { useState } from 'react'
import { PlatformBadge } from './PlatformBadge'
import type { PlatformInfo } from '../lib/platforms'

/**
 * Où cette annonce est en ligne, lu sur la vignette.
 *
 * Le vendeur voyait « Publié » et rien d'autre : publié où, il fallait ouvrir la
 * fiche pour le savoir. Sur cinquante annonces diffusées sur des destinations
 * différentes, c'est cinquante ouvertures pour répondre à une question qui tient
 * en un coup d'œil.
 *
 * **Les allumées sont celles qui sont vraiment en ligne.** Les autres — en
 * attente, refusées — sont éteintes, et c'est le cœur de l'affaire : une
 * pastille allumée sur une destination qui n'a rien reçu vaut moins que pas de
 * pastille du tout. Le détail se déroule au clic, avec la raison.
 */

export interface PublicationLegere {
  platform: string
  status: string
  error?: string | null
  externalUrl?: string | null
}

export function PublishedBadges({
  publications,
  platforms,
  /** Sur une vignette, la place est comptée : au-delà, on affiche « +n ». */
  max = 4,
}: {
  publications: PublicationLegere[]
  platforms: PlatformInfo[]
  max?: number
}) {
  const [deplie, setDeplie] = useState(false)

  const infoDe = (id: string) => platforms.find((p) => p.id === id)
  const nomDe = (id: string) => infoDe(id)?.label ?? id
  const couleurDe = (id: string) => infoDe(id)?.color ?? '#8b5cf6'

  // Les en ligne d'abord : ce sont elles qu'on cherche.
  const triees = [...publications].sort((a, b) => {
    const rang = (s: string) => (s === 'PUBLISHED' ? 0 : s === 'PENDING' ? 1 : 2)
    return rang(a.status) - rang(b.status)
  })
  if (!triees.length) return null

  const enLigne = triees.filter((p) => p.status === 'PUBLISHED')
  const visibles = deplie ? triees : triees.slice(0, max)
  const reste = triees.length - visibles.length

  return (
    <div
      onClick={(e) => {
        // La vignette est un lien : dérouler ne doit pas ouvrir la fiche.
        e.preventDefault()
        e.stopPropagation()
        setDeplie((v) => !v)
      }}
      title={deplie ? 'Replier' : `${enLigne.length} destination(s) en ligne — cliquez pour le détail`}
      className="flex cursor-pointer flex-wrap items-center gap-1"
    >
      {visibles.map((pub) => {
        const publiee = pub.status === 'PUBLISHED'
        return (
          <span
            key={pub.platform}
            className={`relative inline-flex transition ${
              publiee ? '' : 'opacity-35 grayscale'
            }`}
            title={
              publiee
                ? `${nomDe(pub.platform)} — en ligne`
                : `${nomDe(pub.platform)} — ${pub.error || (pub.status === 'PENDING' ? 'en attente' : 'refusée')}`
            }
          >
            <PlatformBadge label={nomDe(pub.platform)} color={couleurDe(pub.platform)} size={18} />
            {publiee ? (
              <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-[#1b1633] bg-emerald-400" />
            ) : null}
          </span>
        )
      })}

      {reste > 0 ? (
        <span className="rounded-full bg-white/10 px-1.5 text-[10px] leading-4 text-gray-400">
          {`+${reste}`}
        </span>
      ) : null}

      {/*
        Déplié, la liste devient lisible : le nom, l'état, et la raison quand il
        y en a une. Une pastille grise sans explication ferait chercher.
      */}
      {deplie ? (
        <ul className="mt-1 w-full space-y-1">
          {triees.map((pub) => (
            <li key={`d-${pub.platform}`} className="flex items-start gap-1.5 text-[11px]">
              <span
                className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                  pub.status === 'PUBLISHED'
                    ? 'bg-emerald-400'
                    : pub.status === 'PENDING'
                      ? 'bg-amber-400'
                      : 'bg-red-400'
                }`}
              />
              <span className="min-w-0 flex-1">
                <span className="text-gray-300">{nomDe(pub.platform)}</span>
                {pub.error ? <span className="text-gray-500">{` — ${pub.error}`}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
