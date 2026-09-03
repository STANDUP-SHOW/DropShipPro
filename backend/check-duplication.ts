import { prisma } from './src/lib/prisma.js'
import { dupliquerAnnonce } from './src/services/listingDuplicate.js'

/**
 * Ce qu'une copie d'annonce reprend, et ce qu'elle ne doit surtout pas reprendre.
 *
 *   cd backend && npx tsx check-duplication.ts
 *
 * Le banc tourne contre la vraie base, sur **deux comptes jetables créés et
 * détruits ici** — le catalogue du vendeur n'est jamais touché.
 *
 * Trois dangers, et ils ne se voient pas à la lecture du code :
 *
 * 1. **Une copie qui se croit publiée.** Reprendre l'état « Publié » sans les
 *    publications ferait une annonce en ligne qu'aucune place de marché ne
 *    connaît. Le vendeur ne le découvrirait qu'en cherchant sa vente.
 * 2. **Un texte source pollué.** `reecrireAnnonce()` repart de `title` et
 *    `description` : y coller « (copie) » abîmerait la matière première de
 *    toutes les réécritures suivantes, et le suffixe s'empilerait à chaque
 *    duplication d'une duplication.
 * 3. **Une copie incomplète.** Le modèle compte plus de quarante colonnes. Une
 *    duplication qui les énumère en oublie une au prochain ajout, en silence.
 *    Ce banc compare les deux lignes champ par champ plutôt que de faire
 *    confiance à une liste.
 */

let echecs = 0
const exige = (condition: boolean, message: string) => {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${message}`)
  if (!condition) echecs++
}

const marque = `banc-duplication-${Date.now()}`
const compte = await prisma.user.create({
  data: { email: `${marque}@exemple.test`, passwordHash: 'x', credits: 0, imageCredits: 0 },
})
const voisin = await prisma.user.create({
  data: { email: `${marque}-voisin@exemple.test`, passwordHash: 'x', credits: 0, imageCredits: 0 },
})

try {
  const original = await prisma.product.create({
    data: {
      userId: compte.id,
      sourceUrl: 'https://www.temu.com/fr/bague-equerre-g-606271004607882.html',
      sourceSite: 'temu.com',
      title: 'bague équerre carrée symbole lœil - Temu France',
      description: 'Acier inoxydable 316L, taille réglable, finition brossée.',
      aiTitle: 'Bague chevalière acier inoxydable 316L, motif équerre',
      aiDescription: 'Une chevalière en acier 316L au motif géométrique.',
      images: ['https://cdn.test/bague-1.jpg', 'https://cdn.test/bague-2.jpg'],
      variants: { Taille: ['7', '8', '9'] },
      bulletPoints: ['ACIER 316L : ne noircit pas', 'TAILLE RÉGLABLE'],
      attributes: { Matière: 'Acier inoxydable 316L', Public: 'Homme' },
      metaKeywords: 'bague homme, chevalière acier',
      price: 3.78,
      sellingPrice: 14.9,
      markupPercent: 60,
      status: 'PUBLISHED',
      aiEnhanced: true,
    },
  })

  // Une publication réelle : c'est elle qui ne doit pas suivre la copie.
  await prisma.publication.create({
    data: { productId: original.id, platform: 'OWN_SITE', status: 'PUBLISHED', publishedAt: new Date() },
  })

  const copie = await dupliquerAnnonce(compte.id, original.id)
  if (!copie) {
    console.log('RATE  la duplication n’a rien rendu')
    process.exit(1)
  }

  // --- Ce qui doit changer ---------------------------------------------------
  console.log('\nCe que la copie ne reprend pas')
  exige(copie.id !== original.id, 'la copie a son propre identifiant')
  exige(copie.status === 'DRAFT', `la copie est en brouillon (statut : ${copie.status})`)

  const publiees = await prisma.publication.count({ where: { productId: copie.id } })
  exige(publiees === 0, `la copie ne porte aucune publication (${publiees} trouvée(s))`)

  const originalIntact = await prisma.publication.count({ where: { productId: original.id } })
  exige(originalIntact === 1, "l'original garde la sienne")

  // --- Le titre affiché distingue les deux, le texte source est intact -------
  console.log('\nLe titre affiché, et le texte source')
  exige(copie.aiTitle === `${original.aiTitle} (copie)`, `titre affiché : « ${copie.aiTitle} »`)
  exige(copie.title === original.title, 'le titre source n’est pas marqué')
  exige(!copie.title.includes('(copie)'), 'aucun « (copie) » dans le texte que la réécriture relit')
  exige(copie.description === original.description, 'la description source n’est pas marquée')

  // Une copie de copie ne doit pas empiler deux suffixes sur le texte source.
  const copieDeCopie = await dupliquerAnnonce(compte.id, copie.id)
  exige(copieDeCopie?.title === original.title, 'le texte source survit à une seconde duplication')
  exige(
    copieDeCopie?.aiTitle === `${copie.aiTitle} (copie)`,
    `la copie de copie se distingue aussi : « ${copieDeCopie?.aiTitle} »`,
  )

  // --- Ce qui doit suivre, champ par champ -----------------------------------
  console.log('\nCe que la copie reprend')
  /*
   * Comparé colonne par colonne plutôt que sur une liste écrite à la main :
   * c'est la seule façon de voir une colonne ajoutée au modèle et oubliée par
   * la duplication. Les cinq exclues ci-dessous le sont pour une raison dite
   * plus haut ; tout le reste doit être identique.
   */
  const exclus = new Set(['id', 'userId', 'createdAt', 'updatedAt', 'status', 'aiTitle'])
  const differents: string[] = []
  for (const cle of Object.keys(original)) {
    if (exclus.has(cle)) continue
    const a = JSON.stringify((original as Record<string, unknown>)[cle])
    const b = JSON.stringify((copie as Record<string, unknown>)[cle])
    if (a !== b) differents.push(`${cle} : ${a} → ${b}`)
  }
  exige(
    differents.length === 0,
    differents.length ? `champ(s) perdu(s) : ${differents.join(' · ')}` : 'tous les autres champs sont identiques',
  )

  // --- L'isolation entre comptes ---------------------------------------------
  console.log('\nCe qu’un autre compte ne peut pas faire')
  const vole = await dupliquerAnnonce(voisin.id, original.id)
  exige(vole === null, "l'annonce d'un autre vendeur n'est pas duplicable")

  // --- Les deux annonces vivent leur vie -------------------------------------
  console.log('\nAprès la duplication')
  await prisma.product.delete({ where: { id: original.id } })
  const survivante = await prisma.product.findUnique({ where: { id: copie.id } })
  exige(survivante !== null, "supprimer l'original ne supprime pas la copie")
  exige(
    JSON.stringify(survivante?.images) === JSON.stringify(original.images),
    'et la copie garde les adresses de ses photos',
  )
} finally {
  // Les produits partent avec le compte : `onDelete: Cascade` sur `Product.user`.
  await prisma.user.deleteMany({ where: { id: { in: [compte.id, voisin.id] } } })
  await prisma.$disconnect()
}

console.log(echecs ? `\n${echecs} échec(s).` : '\nTout passe.')
process.exit(echecs ? 1 : 0)
