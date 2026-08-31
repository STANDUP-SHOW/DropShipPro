import 'dotenv/config'
import { prisma } from './src/lib/prisma.js'
import { mapCategory, mapCategories } from './src/services/categoryMapping.js'
import type { Platform } from '@prisma/client'

/**
 * Éprouve la correspondance entre le référentiel et chaque destination.
 *
 * Le défaut relevé le 31/08/2026 : ranger une annonce ne changeait rien aux
 * autres plateformes, qui restaient toutes sur « Divers ». La cause était
 * mécanique — la fonction ne cherchait l'identifiant que dans l'ancien
 * catalogue TypeScript de 29 entrées, où un identifiant du référentiel en base
 * ne figure jamais.
 *
 * Ce banc tourne **contre la vraie base**, comme celui du référentiel : c'est
 * le seul moyen de vérifier qu'une catégorie réellement semée donne une
 * réponse réellement utile.
 */

let echecs = 0
const exige = (condition: boolean, message: string) => {
  if (!condition) {
    echecs++
    console.log(`ECHEC : ${message}`)
  }
}

const souris = await prisma.category.findFirst({ where: { path: { contains: 'Informatique et accessoires PC' } } })
if (!souris) {
  console.log("ECHEC : le referentiel n'est pas seme, le banc ne peut rien verifier.")
  await prisma.$disconnect()
  process.exit(1)
}

console.log(`Categorie de reference : ${souris.path}`)
console.log(`Chemin Google          : ${souris.google}\n`)

const demande = { sourceCategory: 'la catégorie Maison', categoryId: souris.id }

// --- Aucune destination ne doit plus rendre « Divers » ----------------------

const destinations: Platform[] = [
  'OWN_SITE',
  'SHOPIFY',
  'GOOGLE_SHOPPING',
  'INSTAGRAM',
  'FACEBOOK',
  'LEBONCOIN',
  'VINTED',
  'EBAY',
  'AMAZON',
  'CDISCOUNT',
  'TIKTOK_SHOP',
]

const toutes = await mapCategories(demande, destinations)
for (const [platform, valeur] of Object.entries(toutes)) {
  console.log(`  ${platform.padEnd(16)} ${valeur}`)
}
console.log('')

/*
 * Le cœur du banc.
 *
 * « Divers », « Autres », « Everything Else » sont les valeurs de repli. En
 * voir une alors que l'annonce est rangée signifie que le référentiel n'a pas
 * été lu — c'est exactement le défaut qu'on corrige.
 */
const REPLIS = ['divers', 'autres', 'everything else', 'others', 'apparel & accessories']
for (const [platform, valeur] of Object.entries(toutes)) {
  exige(
    !REPLIS.includes(valeur.trim().toLowerCase()),
    `${platform} rend « ${valeur} » alors que l'annonce est rangée`,
  )
}

// --- Chaque famille de destination reçoit ce qu'elle attend -----------------

exige(
  (await mapCategory(demande, 'GOOGLE_SHOPPING')) === souris.google,
  'Google Shopping doit recevoir le chemin de la taxonomie Google, mot pour mot',
)
// Le catalogue Meta lit `google_product_category` : Instagram et la boutique
// Facebook s'en remplissent, ce n'est pas une approximation.
exige(
  (await mapCategory(demande, 'INSTAGRAM')) === souris.google,
  'Instagram passe par le catalogue Meta, qui lit la taxonomie Google',
)
exige(
  (await mapCategory(demande, 'SHOPIFY')) === souris.path,
  'Le « type de produit » de Shopify est du texte libre : le chemin lisible convient',
)
exige(
  (await mapCategory(demande, 'LEBONCOIN')) === souris.path,
  'Faute de correspondance exacte, Leboncoin reçoit le chemin du référentiel — pas « Divers »',
)

// --- Une correspondance posée à la main l'emporte sur tout ------------------

const avant = souris.targets
try {
  await prisma.category.update({
    where: { id: souris.id },
    data: { targets: { LEBONCOIN: 'Informatique > Souris et claviers' } },
  })
  exige(
    (await mapCategory(demande, 'LEBONCOIN')) === 'Informatique > Souris et claviers',
    'une correspondance relue à la main doit primer',
  )
  // Et elle ne déborde pas sur les autres : une valeur posée pour Leboncoin ne
  // dit rien de ce qu'attend Google.
  exige(
    (await mapCategory(demande, 'GOOGLE_SHOPPING')) === souris.google,
    'une correspondance posée pour une plateforme ne doit pas en contaminer une autre',
  )
} finally {
  await prisma.category.update({
    where: { id: souris.id },
    data: { targets: avant === null ? undefined : (avant as object) },
  })
}

// --- Sans catégorie, le repli reste, et c'est normal ------------------------

const orpheline = { sourceCategory: null, categoryId: null }
exige(
  (await mapCategory(orpheline, 'AMAZON')) === 'Divers',
  "sans aucune catégorie, « Divers » est la seule réponse honnête",
)
// Un identifiant qui ne désigne plus rien ne doit pas faire tomber la
// publication : les annonces d'avant le référentiel en portent encore.
exige(
  typeof (await mapCategory({ sourceCategory: 'montres', categoryId: 'inconnu-xyz' }, 'VINTED')) === 'string',
  'un identifiant orphelin doit rendre une valeur, pas lever',
)

console.log(
  echecs === 0
    ? 'Correspondance des categories : tout passe.'
    : `Correspondance des categories : ${echecs} echec(s).`,
)
await prisma.$disconnect()
process.exit(echecs === 0 ? 0 : 1)
