import { prisma } from '../lib/prisma.js'

/**
 * L'adresse lisible d'une vitrine, dérivée du nom de la boutique.
 *
 * « OGGUS - Accessoires pour hommes » devient `oggus-accessoires-pour-hommes`,
 * servi à `/b/oggus-accessoires-pour-hommes`.
 *
 * **Distincte de `shopKey`, et c'est le point.** La clé est un secret de
 * raccordement qu'on régénère si elle fuit ; l'adresse est publique et se donne
 * à des clients. Les confondre voudrait dire qu'on ne peut plus changer l'une
 * sans casser l'autre.
 */

/** Les mots vides, retirés quand le nom est long. */
const VIDES = new Set(['de', 'du', 'des', 'le', 'la', 'les', 'pour', 'et', 'a', 'au', 'aux', 'en'])

/**
 * Le texte réduit à ce qui tient dans une adresse.
 *
 * `normalize('NFD')` sépare les accents de leurs lettres, ce qui permet de les
 * retirer d'une passe : sans ça, « Épicerie » donne une adresse contenant un
 * caractère que la moitié des clients de messagerie coupent en collant le lien.
 */
export function enAdresse(nom: string): string {
  const base = nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  if (base.length <= 40) return base || 'boutique'

  // Trop long : on retire les mots vides, puis on coupe sur un tiret plutôt
  // qu'au milieu d'un mot — « oggus-accessoires-pour-hom » se retient mal.
  const mots = base.split('-').filter((m) => !VIDES.has(m))
  let court = ''
  for (const m of mots) {
    if (court.length + m.length + 1 > 40) break
    court = court ? `${court}-${m}` : m
  }
  return court || base.slice(0, 40).replace(/-+$/, '')
}

/**
 * Une adresse libre, dérivée du nom.
 *
 * Deux boutiques peuvent porter le même nom — chez deux vendeurs différents, ou
 * chez le même. Le suffixe numérique est ajouté seulement en cas de collision :
 * `ma-boutique`, puis `ma-boutique-2`. Numéroter d'emblée donnerait
 * `ma-boutique-1` à un vendeur qui n'a qu'une boutique.
 */
export async function adresseLibre(nom: string, sauf?: string): Promise<string> {
  const base = enAdresse(nom)

  for (let n = 1; n < 100; n++) {
    const essai = n === 1 ? base : `${base}-${n}`
    const prise = await prisma.shop.findUnique({ where: { slug: essai }, select: { id: true } })
    if (!prise || prise.id === sauf) return essai
  }

  // Cent boutiques du même nom : on cesse de compter et on prend l'identifiant,
  // qui est laid mais unique. Mieux qu'une boucle sans fin ou qu'un refus.
  return `${base}-${Date.now().toString(36)}`
}
