import { prisma } from '../lib/prisma.js'

/**
 * Le catalogue du vendeur dans un rayon donné, mis sous les yeux de son chef.
 *
 * **Il n'en avait aucun.** Relevé le 01/09/2026 : interrogé sur les produits de
 * son rayon, le chef électronique a répondu « je n'ai aucun accès à votre
 * catalogue ici sur DropShipper ». Il disait vrai — la conversation ne lui
 * transmettait que son propre profil de poste. On lui demandait un avis de chef
 * de rayon en lui cachant le rayon.
 *
 * Ce qui lui est donné et pourquoi :
 *
 * - **Le prix d'achat, le port et le prix de vente**, donc la marge. C'est le
 *   seul chiffre à partir duquel un conseil de sourcing veut dire quelque chose.
 * - **La sous-catégorie**, pas seulement le rayon : « quatorze bracelets et
 *   aucun collier » est une observation qu'il ne peut pas faire autrement.
 * - **L'état de publication.** Une annonce en brouillon depuis trois semaines
 *   est un problème différent d'une annonce en ligne qui ne vend pas.
 *
 * Ce qui ne l'est pas : les photos, les descriptions, les mots-clés. Ils
 * gonfleraient l'appel sans rien changer à un avis de sourcing, et le contexte
 * se paie à chaque question.
 */

/** Ce qu'on accepte de mettre dans une conversation, sans la faire coûter cher. */
const MAX_LIGNES = 60

export interface LigneCatalogue {
  titre: string
  sousCategorie: string | null
  achat: number
  port: number
  vente: number
  devise: string
  publiee: boolean
}

/**
 * Les annonces du vendeur rattachées à ce rayon.
 *
 * Le rattachement passe par le référentiel : une annonce porte une
 * sous-catégorie, dont le parent est le rayon. C'est ce qui rend la sélection
 * mécanique depuis que les chefs de rayon et le référentiel sont la même liste
 * — avant, il aurait fallu deviner.
 */
export async function catalogueDuRayon(userId: string, rayonId: string): Promise<LigneCatalogue[]> {
  const sousCategories = await prisma.category.findMany({
    where: { parentId: rayonId },
    select: { id: true, label: true },
  })

  // Le rayon lui-même compte : une annonce peut y être rangée directement.
  const ids = [rayonId, ...sousCategories.map((c) => c.id)]
  const libelle = new Map(sousCategories.map((c) => [c.id, c.label]))

  const produits = await prisma.product.findMany({
    where: { userId, categoryId: { in: ids } },
    select: {
      title: true,
      aiTitle: true,
      categoryId: true,
      price: true,
      shippingCost: true,
      sellingPrice: true,
      currency: true,
      status: true,
      publications: { where: { status: 'PUBLISHED' }, select: { id: true }, take: 1 },
    },
    orderBy: { createdAt: 'desc' },
    take: MAX_LIGNES,
  })

  return produits.map((p) => ({
    titre: p.aiTitle || p.title,
    sousCategorie: libelle.get(p.categoryId ?? '') ?? null,
    achat: Number(p.price),
    port: Number(p.shippingCost),
    vente: Number(p.sellingPrice),
    devise: p.currency,
    publiee: p.publications.length > 0,
  }))
}

/**
 * Le catalogue, écrit pour être lu par le modèle.
 *
 * Un tableau plutôt qu'une phrase par produit : soixante annonces en prose
 * feraient trois mille mots pour la même information, et le contexte se paie à
 * chaque question posée.
 *
 * Le rayon vide est dit explicitement. Sans cette phrase, le modèle voit une
 * liste absente et conclut qu'il n'a pas accès — ce qu'il a fait, et ce que le
 * vendeur a lu comme une panne.
 */
export function catalogueEnTexte(lignes: LigneCatalogue[], rayon: string): string {
  if (!lignes.length) {
    return [
      `CATALOGUE DU VENDEUR — rayon « ${rayon} » : aucune annonce.`,
      "Tu as bien accès à son catalogue : il est vide pour ce rayon. Dis-le, et propose par quoi commencer.",
    ].join('\n')
  }

  const parSousCategorie = new Map<string, number>()
  for (const l of lignes) {
    const cle = l.sousCategorie ?? 'sans sous-catégorie'
    parSousCategorie.set(cle, (parSousCategorie.get(cle) ?? 0) + 1)
  }

  const enLigne = lignes.length
  const marges = lignes.map((l) => l.vente - l.achat - l.port)
  const margeMoyenne = marges.reduce((a, b) => a + b, 0) / marges.length

  return [
    `CATALOGUE DU VENDEUR — rayon « ${rayon} », ${lignes.length} annonce(s).`,
    `${lignes.filter((l) => l.publiee).length} en ligne sur ${enLigne}. Marge unitaire moyenne : ${margeMoyenne.toFixed(2)} ${lignes[0].devise}.`,
    `Répartition : ${[...parSousCategorie].map(([k, n]) => `${k} (${n})`).join(', ')}.`,
    '',
    'Titre | sous-catégorie | achat | port | vente | marge | état',
    ...lignes.map((l) =>
      [
        l.titre.slice(0, 70),
        l.sousCategorie ?? '—',
        l.achat.toFixed(2),
        l.port.toFixed(2),
        l.vente.toFixed(2),
        (l.vente - l.achat - l.port).toFixed(2),
        l.publiee ? 'en ligne' : 'brouillon',
      ].join(' | '),
    ),
    '',
    "Ce catalogue est celui du vendeur, tu y as accès : ne dis jamais le contraire.",
    "Appuie tes conseils dessus — ce qui manque, ce qui se chevauche, les marges trop faibles.",
  ].join('\n')
}
