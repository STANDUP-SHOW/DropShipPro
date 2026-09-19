import {
  semerCategories,
  resoudreCategorie,
  arbreCategories,
  apprendreDuVendeur,
  cle,
} from './src/services/categories.js'
import { prisma } from './src/lib/prisma.js'

/**
 * Éprouve le référentiel de catégories et son apprentissage.
 *
 * Ce banc tourne contre la vraie base : c'est le seul moyen de vérifier que la
 * mémoire retient, et la mémoire est le cœur du dispositif. Un résolveur qui
 * range bien mais n'apprend rien coûterait un appel au modèle par produit —
 * mille produits d'une même boutique feraient mille appels pour une seule
 * réponse.
 */

let echecs = 0
const exige = (condition: boolean, message: string) => {
  if (!condition) {
    echecs++
    console.log(`ECHEC : ${message}`)
  }
}

// --- Le socle ---------------------------------------------------------------
const seme = await semerCategories()
console.log(`socle : ${seme.categories} categories, ${seme.alias} alias neufs`)

const arbre = await arbreCategories()
exige(arbre.length >= 24, `${arbre.length} rayons, attendu au moins 24`)
exige(
  arbre.every((r) => r.icone),
  `des rayons sans icone : ${arbre.filter((r) => !r.icone).map((r) => r.label).join(', ')}`,
)
const feuilles = arbre.reduce((n, r) => n + r.enfants.length, 0)
exige(feuilles >= 200, `${feuilles} sous-categories, attendu au moins 200`)
console.log(`arbre : ${arbre.length} rayons, ${feuilles} sous-categories`)

// Semer deux fois ne doit rien casser ni rien dupliquer.
const deuxieme = await semerCategories()
exige(deuxieme.alias === 0, `un second semis a cree ${deuxieme.alias} alias : il n est pas idempotent`)

// --- La résolution, sans appeler le modèle ----------------------------------
// La clé du fournisseur est la voie la plus sûre, et elle doit passer avant tout.
const parIdentifiant = await resoudreCategorie({
  supplierId: 'test',
  supplierCategoryId: 'X-1',
  title: 'peu importe',
})
exige(parIdentifiant.par === 'aucune' || parIdentifiant.par === 'ia', 'un identifiant inconnu ne doit pas inventer un alias')

// Un libellé exact du référentiel se retrouve sans modèle.
const exact = arbre[0].enfants[0]
const parLibelle = await resoudreCategorie({ sourceCategory: exact.label, title: 'test' })
exige(parLibelle.categoryId !== null, `« ${exact.label} » devrait etre reconnu`)
exige(
  parLibelle.par === 'alias' || parLibelle.par === 'libelle',
  `« ${exact.label} » resolu par ${parLibelle.par}, attendu alias ou libelle`,
)
console.log(`« ${exact.label} » -> ${parLibelle.path} (par ${parLibelle.par})`)

// Un chemin complet : la feuille compte plus que la racine.
const parChemin = await resoudreCategorie({
  sourceCategory: `Quelque chose > ${exact.label}`,
  title: 'test',
})
exige(parChemin.categoryId === parLibelle.categoryId, 'un chemin doit se resoudre par sa feuille')

// Le choix du vendeur l'emporte sur ce que dit le fournisseur.
const autre = arbre[1].enfants[0]
const parChoix = await resoudreCategorie({
  categoryId: autre.id,
  sourceCategory: exact.label,
  title: 'test',
})
exige(parChoix.categoryId === autre.id, 'le choix du vendeur doit primer')
exige(parChoix.par === 'choix', `resolu par ${parChoix.par}, attendu choix`)

// --- L'apprentissage --------------------------------------------------------
// Un texte inconnu, rangé à la main, doit être retenu pour la fois suivante.
const inedit = `souris-gamer-essai-${seme.categories}`
await prisma.categoryAlias.createMany({
  data: [{ key: cle(inedit), categoryId: autre.id, source: 'manuel' }],
  skipDuplicates: true,
})
const apres = await resoudreCategorie({ sourceCategory: inedit, title: 'test' })
exige(apres.par === 'alias', `un alias pose doit servir, resolu par ${apres.par}`)
exige(apres.categoryId === autre.id, 'un alias pose doit rendre la bonne categorie')

// Le compteur d'usage monte : c'est lui qui reperera plus tard une categorie
// apprise par erreur et jamais utilisee.
const avant = await prisma.category.findUniqueOrThrow({ where: { id: autre.id } })
await resoudreCategorie({ sourceCategory: inedit, title: 'test' })
const apresUsage = await prisma.category.findUniqueOrThrow({ where: { id: autre.id } })
exige(apresUsage.uses > avant.uses, "le compteur d'usage ne monte pas")

// --- La correction du vendeur remplace, elle ne s'ajoute pas ---------------
/*
 * Le cas qui manquait, et c'est le seul qui compte pour le vendeur : il corrige
 * une annonce **parce que** la mémoire s'est trompée. Tant que l'apprentissage
 * ne faisait qu'ajouter « si rien n'existe », la correction ne changeait rien —
 * il rangeait, le suivant repartait au même mauvais endroit, et rien ne
 * l'expliquait.
 */
const fautif = `cosplay-essai-${seme.categories}`
await prisma.categoryAlias.createMany({
  data: [{ key: cle(fautif), categoryId: exact.id, source: 'aliexpress' }],
  skipDuplicates: true,
})
const bonneCategorie = autre.id
await apprendreDuVendeur({ title: `perruque essai ${seme.categories}`, sourceCategory: fautif }, bonneCategorie)

const corrige = await prisma.categoryAlias.findFirstOrThrow({ where: { key: cle(fautif) } })
exige(corrige.categoryId === bonneCategorie, "la correction du vendeur doit remplacer l'alias fautif")
exige(corrige.source === 'manuel', `l'alias corrigé porte « manuel », vu « ${corrige.source} » — sinon le titre peut l'effacer`)

// Et la clé du titre est gravée aussi : une fiche qui n'annonce aucune
// catégorie doit elle aussi apprendre quelque chose.
const parTitre = await prisma.categoryAlias.findFirst({ where: { key: cle(`perruque essai ${seme.categories}`) } })
exige(parTitre?.categoryId === bonneCategorie, 'le titre est gravé comme clé de dernier recours')

// Relu par le résolveur : c'est la seule preuve qui vaille.
const relu = await resoudreCategorie({ sourceCategory: fautif, title: `perruque essai ${seme.categories}` })
exige(relu.categoryId === bonneCategorie, `la correction doit être relue, vu ${relu.path ?? 'AUCUNE'} (${relu.par})`)

// Nettoyage : ce banc écrit dans la vraie mémoire, il ne l'encombre pas.
await prisma.categoryAlias.deleteMany({
  where: { key: { in: [cle(fautif), cle(`perruque essai ${seme.categories}`)] } },
})

// --- Ce que le socle couvre vraiment ---------------------------------------
const echantillon = [
  'Gaming Mouse',
  'Souris sans fil',
  'Robes',
  'Dashcams',
  'Aspirateurs et nettoyage',
  'Jouets et jeux',
]
console.log('\n--- couverture du socle, sans modele ---')
for (const texte of echantillon) {
  const r = await resoudreCategorie({ sourceCategory: texte, title: texte })
  console.log(`  ${texte.padEnd(28)} -> ${r.path ?? 'AUCUNE'} (${r.par})`)
}

console.log(echecs === 0 ? '\nReferentiel de categories : tout passe.' : `\n${echecs} echec(s).`)
process.exitCode = echecs === 0 ? 0 : 1
await prisma.$disconnect()
