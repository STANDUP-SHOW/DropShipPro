import type { Product } from '@prisma/client'
import { verifierCanal, verifierCanaux } from './src/services/channelRules.js'

/**
 * Éprouve le moteur de conformité sur des annonces réellement fautives.
 *
 * Chaque cas correspond à un rejet que les places de marché prononcent vraiment :
 * un titre de deux cents caractères sur eBay, une annonce sans photo, un prix à
 * zéro. Le moteur doit refuser AVANT l'envoi, et dire quoi corriger.
 */
function annonce(patch: Partial<Product>): Product {
  return {
    id: 'p1',
    userId: 'u1',
    sourceUrl: 'https://exemple.fr/p',
    sourceSite: 'exemple.fr',
    sourceCategory: 'Montres',
    categoryId: 'bm-montre',
    shopId: null,
    title: 'Montre automatique acier inoxydable pour homme, 42 mm, étanche 10 ATM',
    description: 'Une montre mécanique à remontage automatique, pensée pour un port quotidien.',
    aiTitle: 'Montre automatique homme acier inoxydable 42 mm — étanche 10 ATM, 22 rubis',
    aiDescription:
      'Montre mécanique à remontage automatique, boîtier acier 42 mm, verre minéral durci, réserve de marche de 40 heures. Bracelet acier inoxydable 316L.',
    price: 40 as never,
    shippingCost: 5 as never,
    sellingPrice: 129.9 as never,
    currency: 'EUR',
    markupPercent: 50,
    images: ['/storage/a.jpg', '/storage/b.jpg', '/storage/c.jpg'],
    variants: null,
    metaTitle: null,
    metaDescription: null,
    metaKeywords: null,
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

// Une annonce complète passe là où son titre tient : un moteur qui refuse tout
// serait contourné dès le premier jour.
const bonne = annonce({})
for (const v of verifierCanaux(bonne, ['AMAZON', 'EBAY', 'OWN_SITE', 'GOOGLE_SHOPPING', 'SHOPIFY'])) {
  exige(v.publiable, `${v.platform} refuse une annonce complète : ${v.ecarts.map((e) => e.message).join(' / ')}`)
}

/*
 * Le conflit qui compte, et que ce banc d'essai a révélé.
 *
 * Le titre de référence fait 74 caractères : bon pour Amazon, qui en accepte
 * 200 et en veut au moins 60 pour le référencement — refusé par Vinted (70) et
 * par Leboncoin (50). Aucun titre unique ne peut satisfaire les deux bouts.
 *
 * Ce n'est pas un défaut du moteur, c'est le vrai problème du métier : il
 * faudra un titre par canal, raccourci par le rédacteur. En attendant, le
 * moteur le dit avant l'envoi au lieu de le laisser découvrir dans le
 * back-office de la plateforme.
 */
exige(verifierCanal(bonne, 'AMAZON').publiable, 'Amazon devrait accepter un titre de 74 caractères')
exige(!verifierCanal(bonne, 'VINTED').publiable, 'Vinted devrait refuser un titre de 74 caractères')
exige(!verifierCanal(bonne, 'LEBONCOIN').publiable, 'Leboncoin devrait refuser un titre de 74 caractères')

// Titre court : il passe chez les stricts, et déclenche l'avertissement de
// référencement chez les autres, sans les bloquer.
const titreCourt = annonce({ aiTitle: 'Montre automatique homme acier 42 mm' })
exige(verifierCanal(titreCourt, 'LEBONCOIN').publiable, 'Leboncoin refuse un titre de 36 caractères')
exige(verifierCanal(titreCourt, 'VINTED').publiable, 'Vinted refuse un titre de 36 caractères')

// eBay coupe à 80 caractères, Amazon à 200 : le même titre passe chez l'un et
// pas chez l'autre, et c'est exactement ce qu'il faut dire au vendeur.
const titreLong = annonce({ aiTitle: 'M'.repeat(150) })
exige(!verifierCanal(titreLong, 'EBAY').publiable, 'eBay accepte un titre de 150 caractères')
exige(verifierCanal(titreLong, 'AMAZON').publiable, 'Amazon refuse un titre de 150 caractères alors qu il en accepte 200')

const sansPhoto = annonce({ images: [] })
exige(!verifierCanal(sansPhoto, 'VINTED').publiable, 'Vinted accepte une annonce sans photo')

const prixZero = annonce({ sellingPrice: 0 as never })
exige(!verifierCanal(prixZero, 'OWN_SITE').publiable, 'Une annonce à prix zéro est publiable')

// À perte : ça part, mais ça se dit. Bloquer serait paternaliste — un vendeur
// peut vouloir un produit d'appel.
const aPerte = annonce({ sellingPrice: 30 as never })
const verdictPerte = verifierCanal(aPerte, 'OWN_SITE')
exige(verdictPerte.publiable, 'Une vente à perte est bloquée alors qu elle doit seulement avertir')
exige(
  verdictPerte.ecarts.some((e) => e.severite === 'avertissement' && /perte/i.test(e.message)),
  'La vente à perte ne déclenche aucun avertissement',
)

// Leboncoin n exige pas de categorie ; Amazon si. Le titre est raccourci pour
// que seule la categorie soit en jeu dans ce cas.
const sansCategorie = annonce({ categoryId: null, aiTitle: 'Montre automatique homme acier' })
exige(!verifierCanal(sansCategorie, 'AMAZON').publiable, 'Amazon accepte une annonce sans catégorie')
exige(verifierCanal(sansCategorie, 'LEBONCOIN').publiable, 'Leboncoin exige une catégorie alors que la règle ne le prévoit pas')

// TikTok Shop demande trois photos : deux ne suffisent pas.
const deuxPhotos = annonce({ images: ['/a.jpg', '/b.jpg'] })
exige(!verifierCanal(deuxPhotos, 'TIKTOK_SHOP').publiable, 'TikTok Shop accepte deux photos alors qu il en faut trois')
exige(verifierCanal(deuxPhotos, 'EBAY').publiable, 'eBay refuse deux photos alors qu une seule suffit')

// Chaque message doit dire quoi faire : un « titre invalide » ne répare rien.
for (const e of verifierCanal(titreLong, 'EBAY').ecarts) {
  exige(e.message.length > 40, `Message trop vague : « ${e.message} »`)
}

console.log(echecs === 0 ? 'Conformité : tout passe.' : `${echecs} échec(s).`)
process.exit(echecs === 0 ? 0 : 1)
