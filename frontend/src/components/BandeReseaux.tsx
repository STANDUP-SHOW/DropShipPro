import { useState } from 'react'
import { PlatformLogo } from './PlatformLogo'

/**
 * La bande des réseaux, en tête de la page Réseaux.
 *
 * Deux façons de la peindre, et la seconde existe pour que la première puisse
 * manquer sans laisser un trou :
 *
 * 1. **Le visuel du vendeur**, s'il a déposé `public/logos/social.jpg` — la
 *    planche de logos qu'il nous a désignée. Le nom est convenu et écrit dans
 *    `public/logos/README.md` : déposer le fichier suffit, il n'y a rien à
 *    recompiler ni à recoder.
 * 2. **Une bande construite ici**, un logo par réseau, chacun avec son nom.
 *    C'est ce qui s'affiche tant que le fichier n'est pas là, et c'est une vraie
 *    bande — pas un message d'absence.
 *
 * Le `.eps` du même dossier ne sert qu'à l'impression : aucun navigateur ne le
 * lit, il n'a rien à faire dans une page.
 */

/**
 * Les réseaux, dans l'ordre où un vendeur les cite.
 *
 * `domain` est ce qui rend le vrai logo quand le paquet local ne l'a pas :
 * c'est l'échelle de recours déjà tenue par `PlatformLogo` (fichier local →
 * icône publiée par la marque → pastille).
 */
const RESEAUX = [
  { id: 'FACEBOOK', label: 'Facebook', domain: 'facebook.com', color: '#1877f2' },
  { id: 'INSTAGRAM', label: 'Instagram', domain: 'instagram.com', color: '#e1306c' },
  { id: 'TIKTOK', label: 'TikTok', domain: 'tiktok.com', color: '#000000' },
  { id: 'YOUTUBE', label: 'YouTube', domain: 'youtube.com', color: '#ff0000' },
  { id: 'SNAPCHAT', label: 'Snapchat', domain: 'snapchat.com', color: '#8a7300' },
  { id: 'PINTEREST', label: 'Pinterest', domain: 'pinterest.com', color: '#e60023' },
  { id: 'LINKEDIN', label: 'LinkedIn', domain: 'linkedin.com', color: '#0a66c2' },
  { id: 'X', label: 'X', domain: 'x.com', color: '#111111' },
  { id: 'THREADS', label: 'Threads', domain: 'threads.net', color: '#000000' },
  { id: 'WHATSAPP', label: 'WhatsApp', domain: 'whatsapp.com', color: '#25d366' },
  { id: 'TELEGRAM', label: 'Telegram', domain: 'telegram.org', color: '#229ed9' },
]

/** Le nom convenu du visuel déposé par le vendeur. */
const PLANCHE = '/logos/social.jpg'

export function BandeReseaux() {
  // Une image absente répond par une erreur de chargement, jamais par un 404
  // visible : c'est ce drapeau qui fait passer à la bande construite.
  const [plancheAbsente, setPlancheAbsente] = useState(false)

  return (
    <section className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-r from-violet-500/15 via-fuchsia-500/10 to-sky-500/15">
      {!plancheAbsente ? (
        <img
          src={PLANCHE}
          alt="Les réseaux sociaux sur lesquels vous diffusez"
          onError={() => setPlancheAbsente(true)}
          className="w-full object-contain"
        />
      ) : (
        <ul className="flex flex-wrap items-start justify-center gap-4 p-5 sm:gap-6">
          {RESEAUX.map((r) => (
            <li key={r.id} className="flex w-16 flex-col items-center gap-1.5">
              <PlatformLogo id={r.id} label={r.label} domain={r.domain} color={r.color} size={44} />
              <span className="w-full truncate text-center text-[11px] text-gray-400" title={r.label}>
                {r.label}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
