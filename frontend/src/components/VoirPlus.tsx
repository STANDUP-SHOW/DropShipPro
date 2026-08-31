import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'

/**
 * Une liste qui commence courte, et s'allonge à la demande.
 *
 * Trois cents annonces affichées d'un coup ne se parcourent pas : on fait
 * défiler en espérant reconnaître un titre, et le navigateur peine sur autant de
 * photos. Dix suffisent à voir ce qu'on cherche neuf fois sur dix — et quand ce
 * n'est pas le cas, le filtre et la recherche existent déjà au-dessus.
 *
 * **Pas de pagination numérotée.** Elle oblige à retenir où l'on était, et elle
 * casse la comparaison entre deux produits qui tombent sur deux pages
 * différentes. « Voir plus » ajoute sans jamais retirer.
 *
 * Le compte revient à dix dès que la liste change de contenu : après un filtre,
 * garder quatre-vingts lignes ouvertes montrerait un résultat plus long que
 * celui d'avant, ce qui se lit comme un filtre qui n'a pas marché.
 */

export const PAR_PAGE = 10

export function useVoirPlus<T>(items: T[], parPage = PAR_PAGE) {
  const [combien, setCombien] = useState(parPage)

  /*
   * `items.length` et non `items` : la liste est recalculée à chaque rendu par
   * les `useMemo` des pages appelantes, et surveiller la référence remettrait
   * le compte à dix en boucle, sans qu'on puisse jamais voir la onzième ligne.
   */
  useEffect(() => {
    setCombien(parPage)
  }, [items.length, parPage])

  return {
    visibles: items.slice(0, combien),
    reste: Math.max(0, items.length - combien),
    plus: () => setCombien((c) => c + parPage),
    tout: () => setCombien(items.length),
  }
}

/** Le bouton, sous la liste. Il ne s'affiche que s'il reste à voir. */
export function VoirPlus({
  reste,
  onPlus,
  onTout,
  parPage = PAR_PAGE,
}: {
  reste: number
  onPlus: () => void
  onTout?: () => void
  parPage?: number
}) {
  if (reste <= 0) return null

  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
      <button
        type="button"
        onClick={onPlus}
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-4 py-2 text-sm text-gray-300 transition hover:bg-white/5 hover:text-white"
      >
        <ChevronDown size={14} />
        <span>{`Voir ${Math.min(parPage, reste)} de plus`}</span>
      </button>

      {/*
        « Tout afficher » n'apparaît qu'au-delà de deux clics restants : en
        proposer un pour dix lignes de plus ferait deux boutons là où un suffit.
      */}
      {onTout && reste > parPage * 2 ? (
        <button
          type="button"
          onClick={onTout}
          className="text-xs text-gray-500 transition hover:text-white"
        >
          {`Tout afficher (${reste} restantes)`}
        </button>
      ) : null}
    </div>
  )
}
