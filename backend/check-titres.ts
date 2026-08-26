import type { Platform, Product } from '@prisma/client'
import { TITRE_MAX, verifierCanal } from './src/services/channelRules.js'
import { titleForChannel, titlesByChannel, trimToWords } from './src/services/channelCopy.js'

/**
 * Éprouve le titre par canal.
 *
 * Le défaut que ce banc corrige a été trouvé par le moteur de conformité : un
 * titre de 74 caractères, parfait pour Amazon qui en veut au moins 60, est
 * refusé par Vinted (70) et par Leboncoin (50). Aucun titre unique ne satisfait
 * les deux bouts.
 *
 * Ce qui est vérifié ici : chaque destination reçoit un titre qui TIENT chez
 * elle, et ce titre reste une suite de mots entiers. Un titre coupé au milieu
 * d'un mot perd le mot-clé qui fait vendre — « Montre automatique homme acier
 * inoxyd » ne se cherche pas.
 */
const LONG =
  'Montre automatique homme acier inoxydable 42 mm étanche 10 ATM 22 rubis bracelet maille milanaise'
const MOYEN = 'Montre automatique homme acier inoxydable 42 mm étanche'
const COURT = 'Montre automatique homme acier 42 mm'

function annonce(patch: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    userId: 'u1',
    sourceUrl: 'https://exemple.fr/p',
    sourceSite: 'exemple.fr',
    sourceCategory: 'Montres',
    categoryId: 'bm-montre',
    shopId: null,
    title: LONG,
    description: 'Une montre mécanique à remontage automatique, pensée pour un port quotidien.',
    aiTitle: LONG,
    aiDescription:
      'Montre mécanique à remontage automatique, boîtier acier 42 mm, verre minéral durci, réserve de marche de 40 heures.',
    price: 40 as never,
    shippingCost: 5 as never,
    sellingPrice: 129.9 as never,
    currency: 'EUR',
    markupPercent: 50,
    images: ['/a.jpg', '/b.jpg', '/c.jpg'],
    variants: null,
    metaTitle: null,
    metaDescription: null,
    metaKeywords: null,
    titleVariants: { long: LONG, moyen: MOYEN, court: COURT },
    bulletPoints: ['A', 'B', 'C', 'D', 'E'],
    attributes: { Mouvement: 'Automatique', Bracelet: 'Acier', Étanchéité: '10 ATM', Diamètre: '42 mm', Verre: 'Minéral' },
    aiEnhanced: true,
    marketAnalysis: null,
    marketAnalysedAt: null,
    status: 'READY',
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...patch,
  } as Product
}

let echecs = 0
const exige = (condition: boolean, message: string) => {
  if (!condition) {
    echecs++
    console.log(`ECHEC : ${message}`)
  }
}

const complete = annonce()

console.log(`titre source : ${LONG.length} caractères`)
console.log('')

for (const ligne of titlesByChannel(complete)) {
  const marque = ligne.raccourci ? '↓' : ' '
  console.log(
    `  ${marque} ${ligne.platform.padEnd(16)} ≤${String(ligne.max).padStart(3)}  ${String(ligne.titre.length).padStart(3)}  ${ligne.titre}`,
  )
}
console.log('')

// Le contrat, destination par destination : ça tient, et ça reste des mots entiers.
for (const platform of Object.keys(TITRE_MAX) as Platform[]) {
  const max = TITRE_MAX[platform]!
  const titre = titleForChannel(complete, platform)

  exige(titre.length <= max, `${platform} reçoit ${titre.length} caractères pour ${max} autorisés`)
  exige(titre.length > 0, `${platform} reçoit un titre vide`)
  exige(!titre.endsWith(' '), `${platform} reçoit un titre qui finit par une espace`)

  // Chaque mot du titre rendu doit exister entier dans l'une des variantes.
  const sources = [LONG, MOYEN, COURT].join(' ').toLowerCase()
  for (const mot of titre.toLowerCase().split(/\s+/)) {
    exige(sources.split(/\s+/).includes(mot), `${platform} : « ${mot} » n'est pas un mot entier de la source`)
  }
}

// Et le moteur de conformité doit désormais laisser passer partout.
for (const platform of Object.keys(TITRE_MAX) as Platform[]) {
  const adapte = annonce({ aiTitle: titleForChannel(complete, platform) })
  const verdict = verifierCanal(adapte, platform)
  const bloquants = verdict.ecarts.filter((e) => e.severite === 'bloquant')
  exige(
    !bloquants.some((e) => e.regle.startsWith('titre-max')),
    `${platform} refuse encore le titre adapté : ${bloquants.map((e) => e.message).join(' / ')}`,
  )
}

// Sans variantes enregistrées — les annonces importées avant aujourd'hui —
// le raccourci par mots doit prendre le relais sans rien casser.
const ancienne = annonce({ titleVariants: null })
for (const platform of Object.keys(TITRE_MAX) as Platform[]) {
  const titre = titleForChannel(ancienne, platform)
  exige(
    titre.length <= TITRE_MAX[platform]!,
    `sans variantes, ${platform} reçoit ${titre.length} caractères pour ${TITRE_MAX[platform]} autorisés`,
  )
}

// Le raccourci lui-même : par mots, jamais au milieu.
exige(trimToWords('Montre automatique homme acier', 20) === 'Montre automatique', 'trimToWords coupe mal')
exige(trimToWords('Montre', 3) === 'Mon', 'un mot unique plus long que la limite doit bien être coupé')
exige(trimToWords('Montre acier', 50) === 'Montre acier', 'trimToWords raccourcit un titre qui tenait déjà')

console.log(echecs === 0 ? 'Titres par canal : tout passe.' : `${echecs} échec(s).`)
process.exit(echecs === 0 ? 0 : 1)
