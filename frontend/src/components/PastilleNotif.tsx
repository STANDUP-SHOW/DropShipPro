/**
 * La pastille des nouveautés : le nombre de choses reçues et pas encore
 * ouvertes, posée à côté d'un titre du menu.
 *
 * Demandée par Max le 19/09/2026 : « quand les 12 analyses de marché, 40
 * produits gagnants, prompts etc. arrivent, il doit y avoir des pastilles de
 * notification dans le menu à côté des titres — un rond assez gros, dégradé
 * jaune → rose, avec le nombre reçu et non ouvert dedans. »
 *
 * Deux règles qui ne se négocient pas :
 *
 *  - **À zéro, elle n'existe pas.** Une pastille vide, ou à 0, est un point de
 *    couleur qui appelle l'œil pour rien : celui qui la voit apprend à ne plus
 *    la regarder, et le jour où elle porte un vrai chiffre il ne le voit plus.
 *  - **Au-delà de 99, elle dit « 99+ ».** Quatre chiffres dans un rond de
 *    24 px, c'est illisible, et la différence entre 142 et 143 ne change aucun
 *    geste : ce qui compte est « beaucoup, va voir ».
 *
 * Le dégradé est en classes Tailwind, mais les chiffres sont blancs des deux
 * côtés du thème : le thème clair retourne chaque échelle de couleur autour de
 * 500 (`text-white` deviendrait gray-900), et des chiffres sombres sur un rose
 * soutenu ne se lisent plus. La classe `pastille-notif` rend `--color-white` au
 * blanc sous `[data-theme="light"]`, exactement comme `.btn-gradient` le fait
 * déjà pour le texte des boutons en dégradé (voir index.css).
 */
export function PastilleNotif({
  nombre,
  titre,
  className = '',
}: {
  nombre: number
  /** Ce que le survol raconte, par exemple « 12 analyses de marché non lues ». */
  titre?: string
  className?: string
}) {
  if (!Number.isFinite(nombre) || nombre <= 0) return null

  const texte = nombre > 99 ? '99+' : String(nombre)

  return (
    <span
      title={titre}
      aria-label={titre ?? `${texte} nouveautés`}
      className={`pastille-notif inline-flex h-6 min-w-[24px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-yellow-400 to-pink-500 px-1.5 text-[12px] font-bold leading-none text-white shadow-[0_0_10px_rgba(236,72,153,0.45)] ring-1 ring-white/25 ${className}`}
    >
      {texte}
    </span>
  )
}
