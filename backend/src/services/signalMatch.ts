import { prisma } from '../lib/prisma.js'

/**
 * Décide si un signal touche les produits du vendeur, ou seulement le marché.
 *
 * C'est toute la différence entre « les bagues connectées explosent en France »
 * — bon à savoir — et « la bague connectée que tu vends explose en France » —
 * à traiter aujourd'hui. Le second se noie dans le premier si rien ne les
 * sépare, et un vendeur qui reçoit vingt-cinq signaux par jour ne les lit plus.
 *
 * Le rapprochement se fait sur les mots, pas sur un identifiant : l'agent parle
 * de « Ninja CREAMi » quand le vendeur a listé « Machine à glace italienne
 * Ninja CREAMi Deluxe ». Aucun identifiant commun, mais un humain voit tout de
 * suite que c'est le même produit.
 */

/**
 * Mots trop courants pour rapprocher quoi que ce soit.
 *
 * Sans cette liste, « pour » et « avec » relient n'importe quel signal à
 * n'importe quel produit, et tout devient « personnel » — ce qui revient à
 * n'avoir aucun filtre.
 */
const STOP_WORDS = new Set([
  'avec', 'pour', 'sans', 'dans', 'plus', 'tout', 'tous', 'cette', 'votre', 'notre',
  'chez', 'vers', 'sous', 'entre', 'leur', 'elle', 'nous', 'vous', 'ils',
  'produit', 'produits', 'article', 'articles', 'nouveau', 'nouvelle', 'nouveaux',
  'france', 'francais', 'francaise', 'europe', 'europeen', 'marche', 'marches',
  'vente', 'ventes', 'prix', 'euro', 'euros', 'promo', 'offre', 'offres',
  'tiktok', 'instagram', 'facebook', 'shop', 'store', 'boutique',
  'the', 'and', 'with', 'for', 'from', 'best', 'top', 'new',
])

/** Retire les accents pour que « connectée » et « connectee » se rencontrent. */
function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

/**
 * Les mots porteurs de sens d'un texte.
 *
 * Quatre lettres minimum : en dessous, ce sont des articles et des unités, et
 * ils rapprocheraient tout de tout.
 */
function keywords(text: string): Set<string> {
  const words = normalize(text)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w))
  return new Set(words)
}

export interface MatchedProduct {
  id: string
  title: string
  /** Les mots qui ont fait le rapprochement, pour que le vendeur puisse juger. */
  on: string[]
}

interface Matchable {
  title: string
  category?: string | null
  brand?: string | null
}

/**
 * Rapproche une liste de signaux du catalogue du vendeur, en une seule lecture
 * de la base : un scan dépose vingt-cinq signaux d'un coup, et relire le
 * catalogue vingt-cinq fois serait absurde.
 */
export async function matchToCatalogue<T extends Matchable>(
  userId: string,
  items: T[],
): Promise<Map<T, MatchedProduct[]>> {
  const result = new Map<T, MatchedProduct[]>()
  if (!items.length) return result

  const products = await prisma.product.findMany({
    where: { userId },
    select: { id: true, title: true, aiTitle: true, sourceCategory: true, categoryId: true },
    take: 500,
  })

  const indexed = products.map((p) => ({
    id: p.id,
    title: p.aiTitle || p.title,
    words: keywords(`${p.title} ${p.aiTitle ?? ''} ${p.sourceCategory ?? ''} ${p.categoryId ?? ''}`),
  }))

  for (const item of items) {
    const signalWords = keywords(`${item.title} ${item.category ?? ''} ${item.brand ?? ''}`)
    const matches: MatchedProduct[] = []

    for (const product of indexed) {
      const shared = [...signalWords].filter((w) => product.words.has(w))
      // Deux mots communs, pas un. « connectee » seul relie une bague à une
      // enceinte ; « bague » et « connectee » ensemble désignent le produit.
      if (shared.length >= 2) {
        matches.push({ id: product.id, title: product.title, on: shared.slice(0, 4) })
      }
    }

    // Les rapprochements les plus francs d'abord, et jamais plus de cinq : au
    // delà, la liste cesse d'aider à décider.
    matches.sort((a, b) => b.on.length - a.on.length)
    result.set(item, matches.slice(0, 5))
  }

  return result
}
