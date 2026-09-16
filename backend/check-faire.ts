import type { Product } from '@prisma/client'
import { COLONNES_FAIRE, OBLIGATOIRES_FAIRE, catalogueFaire, ligneFaire } from './src/services/faire.js'

/**
 * Éprouve l'export du catalogue au format de Faire.
 *
 * **Le contrat est écrit À LA MAIN ici** — les intitulés attendus, leur nombre,
 * leur ordre — et non recalculé depuis `COLONNES_FAIRE`. C'est la leçon du banc
 * Kaufland, et elle vaut exactement ici : si le banc relisait la même constante
 * que le code, une colonne renommée par erreur passerait des deux côtés et le
 * dépôt serait refusé par Faire, des heures plus tard, sans que rien n'ait
 * signalé quoi que ce soit.
 *
 * Les intitulés ci-dessous ont été relevés dans le modèle officiel téléchargé
 * depuis le portail marque le 16/09/2026.
 */

let echecs = 0
function verifier(nom: string, condition: boolean, detail = ''): void {
  if (!condition) {
    echecs++
    console.log(`ECHEC ${nom}${detail ? `\n  ${detail}` : ''}`)
  }
}

/* ------------------------------------------------------------------ *
 * Le gabarit, recopié du modèle officiel.
 * ------------------------------------------------------------------ */

const ATTENDU_DEBUT = [
  'Nom du produit',
  'Description',
  'Images du produit',
  'Prix revendeur : (EUR)',
  'Prix de vente (EUR)',
]
const ATTENDU_FIN = ['Précommande', "Date d'expédition", "Date d'expédition finale", 'Date limite de commande']

verifier('le gabarit compte 49 colonnes', COLONNES_FAIRE.length === 49, `compté : ${COLONNES_FAIRE.length}`)
verifier(
  'les cinq premières colonnes sont dans l’ordre du modèle',
  ATTENDU_DEBUT.every((c, i) => COLONNES_FAIRE[i] === c),
  `lu : ${COLONNES_FAIRE.slice(0, 5).join(' | ')}`,
)
verifier(
  'les quatre dernières colonnes sont dans l’ordre du modèle',
  ATTENDU_FIN.every((c, i) => COLONNES_FAIRE[COLONNES_FAIRE.length - 4 + i] === c),
  `lu : ${COLONNES_FAIRE.slice(-4).join(' | ')}`,
)
verifier(
  'les deux-points et l’espace de « Prix revendeur : (EUR) » sont conservés',
  COLONNES_FAIRE[3] === 'Prix revendeur : (EUR)',
  "Faire lit l'intitulé autant que la position : le « nettoyer » casse la correspondance.",
)
verifier(
  'aucune colonne en double',
  new Set(COLONNES_FAIRE).size === COLONNES_FAIRE.length,
  'le modèle répétait « Prix de l’échantillon (EUR) » six fois : les devises doivent être distinguées.',
)
verifier(
  'les huit colonnes obligatoires existent dans le gabarit',
  OBLIGATOIRES_FAIRE.every((c) => COLONNES_FAIRE.includes(c)),
)

/* ------------------------------------------------------------------ *
 * Une fiche complète.
 * ------------------------------------------------------------------ */

function produit(p: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    title: 'Écouteurs sans fil',
    aiTitle: 'Écouteurs sans fil à réduction de bruit',
    description: '<p>Un <b>bon</b> produit</p>',
    aiDescription: null,
    price: 10 as unknown as Product['price'],
    shippingCost: 2 as unknown as Product['shippingCost'],
    sellingPrice: 40 as unknown as Product['sellingPrice'],
    images: ['https://exemple.test/a.jpg', 'https://exemple.test/b.jpg'],
    exportImages: null,
    variants: null,
    supplierRef: 'REF-1',
    ...p,
  } as unknown as Product
}

const col = (nom: (typeof COLONNES_FAIRE)[number], valeurs: string[]) => valeurs[COLONNES_FAIRE.indexOf(nom)]

const bon = ligneFaire(produit())
verifier('une fiche complète est acceptée', !bon.refus, bon.refus)
verifier('la ligne a exactement 49 cellules', bon.valeurs.length === 49, `${bon.valeurs.length}`)
verifier('le titre réécrit prime sur le titre source', col('Nom du produit', bon.valeurs).startsWith('Écouteurs sans fil à'))
verifier(
  'la description est débarrassée de son HTML',
  col('Description', bon.valeurs) === 'Un bon produit',
  `lu : « ${col('Description', bon.valeurs)} »`,
)
verifier(
  'les photos sont séparées par des virgules',
  col('Images du produit', bon.valeurs) === 'https://exemple.test/a.jpg, https://exemple.test/b.jpg',
)
verifier('le prix de vente est repris tel quel', col('Prix de vente (EUR)', bon.valeurs) === '40.00')
verifier(
  'le prix de gros vaut la moitié du prix de vente par défaut',
  col('Prix revendeur : (EUR)', bon.valeurs) === '20.00',
  "la convention du gros, et elle doit rester un défaut affiché, pas un calcul caché.",
)
verifier('la méthode de vente est renseignée', col('Méthode de vente', bon.valeurs) === 'Par unité')
verifier('la quantité minimale est renseignée', col('Quantité minimale par commande', bon.valeurs) === '1')
verifier('l’UGS reprend la référence fournisseur', col('UGS', bon.valeurs) === 'REF-1')
verifier(
  'aucune colonne obligatoire ne sort vide',
  OBLIGATOIRES_FAIRE.every((c) => col(c, bon.valeurs) !== ''),
  OBLIGATOIRES_FAIRE.filter((c) => col(c, bon.valeurs) === '').join(', '),
)

/* ------------------------------------------------------------------ *
 * Les refus. Chacun protège d'une perte réelle.
 * ------------------------------------------------------------------ */

const perte = ligneFaire(produit({ sellingPrice: 20 as unknown as Product['sellingPrice'] }))
verifier(
  'un prix de gros sous le prix d’achat est refusé',
  Boolean(perte.refus) && /perdrait/.test(perte.refus ?? ''),
  `10 € de gros pour 12 € d'achat — ${perte.refus ?? 'accepté !'}`,
)

verifier(
  'une fiche sans photo est refusée',
  Boolean(ligneFaire(produit({ images: [] })).refus),
  'Faire exige au moins une image par produit.',
)
verifier(
  'une photo en adresse relative ne compte pas comme une photo',
  Boolean(ligneFaire(produit({ images: ['/storage/a.jpg'] })).refus),
  "Faire télécharge les images depuis chez nous : une adresse relative ne mène nulle part.",
)
verifier(
  'une fiche sans prix de vente est refusée',
  Boolean(ligneFaire(produit({ sellingPrice: 0 as unknown as Product['sellingPrice'] })).refus),
)

/* ------------------------------------------------------------------ *
 * Les variantes : Faire veut les LISTES, pas les combinaisons.
 * ------------------------------------------------------------------ */

const varie = ligneFaire(
  produit({ variants: { Couleur: ['Noir', 'Blanc'], Taille: ['S', 'M'], Matière: ['Coton'], Motif: ['Uni'] } as unknown as Product['variants'] }),
)
verifier("le nom de la première option est repris", col("Type d'option", varie.valeurs) === 'Couleur')
verifier('ses valeurs sont listées, pas combinées', col('Option(s)', varie.valeurs) === 'Noir, Blanc')
verifier('la troisième dimension est reprise', col("Type d'option 3", varie.valeurs) === 'Matière')
verifier(
  'au-delà de trois dimensions, on tronque au lieu d’échouer',
  !varie.refus && !varie.valeurs.join('|').includes('Motif'),
  'Faire ne gère que trois options ; échouer ferait perdre tout le catalogue pour une quatrième.',
)

/* ------------------------------------------------------------------ *
 * Le fichier complet.
 * ------------------------------------------------------------------ */

const cat = catalogueFaire([produit(), produit({ id: 'p2', images: [] }), produit({ id: 'p3' })])
verifier('deux produits sur trois sont retenus', cat.retenus === 2, `retenus : ${cat.retenus}`)
verifier('le produit écarté est nommé avec sa raison', cat.ecartes.length === 1 && cat.ecartes[0].id === 'p2')
verifier(
  'le fichier commence par un BOM',
  cat.csv.charCodeAt(0) === 0xfeff,
  "sans lui, Excel lit l'UTF-8 en latin-1 et « Écouteurs » devient « Ã‰couteurs » — c'est ce que Faire enregistrerait.",
)
verifier(
  'la première ligne est la ligne d’en-têtes',
  cat.csv.slice(1).startsWith('Nom du produit,Description,Images du produit,'),
)
verifier('les lignes sont séparées en CRLF', cat.csv.includes('\r\n'))
verifier(
  'chaque ligne porte 49 colonnes',
  cat.csv
    .slice(1)
    .trim()
    .split('\r\n')
    .every((l) => (l.match(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/g) || []).length === 48),
)

const virgule = catalogueFaire([produit({ aiTitle: 'Écouteurs, sans fil' })])
verifier(
  'un titre contenant une virgule est mis entre guillemets',
  virgule.csv.includes('"Écouteurs, sans fil"'),
  'sans quoi la ligne entière se décale d’une colonne.',
)

console.log(echecs === 0 ? 'Export Faire : tout passe.' : `${echecs} échec(s).`)
process.exitCode = echecs === 0 ? 0 : 1
