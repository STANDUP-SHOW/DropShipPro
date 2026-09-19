import { useState } from 'react'

/**
 * La marque DropShop : son icône carrée et son logo d'en-tête.
 *
 * Demandé le 19/09/2026 par Max — « mettre le logo dropshop en tête et son
 * icône dans le menu général (idem Shopify) ». Shopify a son sac de courses
 * dessiné dans MenuBoutiques ; la boutique maison n'avait qu'un badge « IA »
 * sur dégradé vert, c'est-à-dire deux lettres là où la marque devrait être.
 *
 * **Les fichiers vivent dans `public/logos/`, pas dans le code**, et c'est ce
 * qui compte ici : remplacer le logo n'est alors qu'un fichier à écraser, sans
 * rien recompiler ni retoucher un composant. Deux noms, un par usage :
 *
 * | Fichier                      | Où il sert                         |
 * |------------------------------|------------------------------------|
 * | `/logos/dropshop-icone.png`  | l'icône carrée du menu général     |
 * | `/logos/dropshop-entete.png` | le logo large des en-têtes de page |
 *
 * Seule l'icône est livrée pour l'instant (la marque « D » du dossier
 * `extensions/`). Le logo d'en-tête est **facultatif** : tant que le fichier
 * n'existe pas, l'en-tête reprend l'icône, et déposer le fichier suffit à le
 * faire apparaître — aucune ligne de code à changer.
 *
 * Chaque image a son repli, comme `PlatformLogo` : un fichier absent ou
 * illisible ne doit jamais laisser un carré vide à la place de la marque, il
 * revient au badge « IA » d'avant.
 */

/**
 * La taille des icônes de marque dans le menu, en pixels.
 *
 * Les deux blocs du menu — DropShop et Shopify — sont au même rang, donc à la
 * même taille : c'est la comparaison qui est l'argument du bloc. Elles étaient
 * rendues à 18 px ; Max les a demandées **une fois et demie plus grandes** le
 * 19/09/2026, d'où 27. Ce nombre est partagé : voir `MenuBoutiques.tsx`, qui
 * dimensionne l'icône Shopify avec.
 */
export const TAILLE_ICONE_MARQUE = 27

/** Le badge de repli : ce que le menu affichait avant d'avoir un logo. */
function BadgeIA({ size }: { size: number }) {
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-emerald-400 to-green-600 font-black text-white"
      style={{ width: size, height: size, fontSize: size * 0.45, boxShadow: '0 0 8px rgba(52,211,153,0.6)' }}
    >
      IA
    </span>
  )
}

/** L'icône carrée de DropShop, à la taille des icônes de marque du menu. */
export function IconeDropShop({ size = TAILLE_ICONE_MARQUE }: { size?: number }) {
  const [casse, setCasse] = useState(false)

  if (casse) return <BadgeIA size={size} />

  return (
    <img
      src="/logos/dropshop-icone.png"
      alt=""
      aria-hidden
      onError={() => setCasse(true)}
      style={{ width: size, height: size }}
      className="shrink-0 rounded-md object-contain"
    />
  )
}

/**
 * Le logo de DropShop en tête de page.
 *
 * Il essaie le logo large, puis l'icône, puis le badge : trois recours, chacun
 * avec son propre échec. Un seul drapeau « cassé » ferait tomber directement
 * sur le badge quand le logo large manque — c'est-à-dire dans le cas normal
 * d'aujourd'hui, où seule l'icône est livrée.
 */
export function LogoDropShopEntete({ size = 40 }: { size?: number }) {
  const [largeCasse, setLargeCasse] = useState(false)

  if (largeCasse) return <IconeDropShop size={size} />

  return (
    <img
      src="/logos/dropshop-entete.png"
      alt=""
      aria-hidden
      onError={() => setLargeCasse(true)}
      style={{ height: size, maxWidth: size * 4 }}
      className="shrink-0 object-contain"
    />
  )
}
