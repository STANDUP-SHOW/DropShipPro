import type { Platform, Product } from '@prisma/client'
import { OPERATEURS_MIRAKL } from './mirakl.js'

/**
 * Le référentiel de conformité, canal par canal.
 *
 * C'est l'actif défendable de Shoppingfeed — pas leur « mille canaux », qui est
 * une façade commerciale, mais le registre de règles maintenu par canal et
 * vérifié AVANT publication. Nous publiions sans rien vérifier : l'annonce
 * partait, la marketplace la refusait, et le vendeur découvrait le rejet dans
 * son back-office à elle, sans savoir quel champ corriger.
 *
 * Une règle dit trois choses, et les trois comptent :
 *
 * — ce qu'elle vérifie, en une phrase de vendeur et non de développeur ;
 * — si elle **bloque** ou si elle **avertit**. Un titre de 210 caractères sur
 *   Amazon est un rejet certain, donc bloquant ; une description un peu courte
 *   se publie et se vend moins bien, donc un avertissement. Tout bloquer
 *   ferait contourner le contrôle, tout avertir le rendrait inutile ;
 * — comment corriger, précisément. « Titre invalide » ne répare rien.
 *
 * Les valeurs viennent des documentations vendeur publiques. Elles changent :
 * ce fichier est fait pour être relu, pas pour être écrit une fois.
 */

export type Severite = 'bloquant' | 'avertissement'

export interface RegleCanal {
  id: string
  /** Ce qui est vérifié, dit au vendeur. */
  quoi: string
  severite: Severite
  /** Null quand la règle passe ; sinon, ce qu'il faut faire. */
  verifie: (p: Product) => string | null
}

const texte = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const nombre = (v: unknown) => (Array.isArray(v) ? v.length : 0)
const photos = (p: Product) =>
  Array.isArray(p.images) ? (p.images as unknown[]).filter((i) => typeof i === 'string').length : 0

/**
 * La longueur de titre acceptée par chaque destination.
 *
 * Sortie des règles pour être lisible d'ailleurs : c'est elle qui décide quel
 * titre part sur quel canal. Enfermée dans une fermeture, elle obligeait à
 * réécrire les mêmes chiffres à deux endroits — et deux endroits finissent
 * toujours par diverger.
 *
 * Les écarts sont énormes et c'est tout le problème : Leboncoin coupe à
 * cinquante caractères là où Amazon en veut au moins soixante pour le
 * référencement. Aucun titre unique ne satisfait les deux.
 */
export const TITRE_MAX: Partial<Record<Platform, number>> = {
  LEBONCOIN: 50,
  VINTED: 70,
  EBAY: 80,
  // Kaufland recommande 50 a 80 caracteres et raccourcit au-dela : 80 est donc
  // la limite utile, pas une borne technique.
  KAUFLAND: 80,
  FACEBOOK: 100,
  LA_REDOUTE: 120,
  LECLERC: 120,
  BHV: 120,
  KIABI: 120,
  BRANDALLEY: 120,
  SPARTOO: 120,
  MIINTO: 120,
  CDISCOUNT: 132,
  ETSY: 140,
  GOOGLE_SHOPPING: 150,
  WISH: 150,
  AMAZON: 200,
  TIKTOK_SHOP: 255,
  SHOPIFY: 255,
}

/** Le titre, longueur maximale imposée par la plateforme. */
function titreMax(max: number, plateforme: string): RegleCanal {
  return {
    id: `titre-max-${max}`,
    quoi: `Titre de ${max} caractères au plus`,
    severite: 'bloquant',
    verifie: (p) => {
      const t = texte(p.aiTitle) || texte(p.title)
      if (t.length <= max) return null
      return `${plateforme} refuse un titre de plus de ${max} caractères ; le vôtre en fait ${t.length}. Raccourcissez-le de ${t.length - max}.`
    },
  }
}

/** Le titre trop court se vend mal partout, sans être refusé nulle part. */
const TITRE_COURT: RegleCanal = {
  id: 'titre-court',
  quoi: 'Titre d’au moins 30 caractères',
  severite: 'avertissement',
  verifie: (p) => {
    const t = texte(p.aiTitle) || texte(p.title)
    return t.length >= 30
      ? null
      : `Un titre de ${t.length} caractères ne contient pas assez de mots-clés pour ressortir dans la recherche interne. Visez 60 à 130.`
  },
}

const DESCRIPTION: RegleCanal = {
  id: 'description',
  quoi: 'Description remplie',
  severite: 'bloquant',
  verifie: (p) => {
    const d = texte(p.aiDescription) || texte(p.description)
    return d.length >= 50 ? null : 'La description est vide ou trop courte : aucune place de marché ne publie une fiche sans texte.'
  },
}

const PRIX: RegleCanal = {
  id: 'prix',
  quoi: 'Prix de vente renseigné',
  severite: 'bloquant',
  verifie: (p) =>
    Number(p.sellingPrice) > 0
      ? null
      : "Le prix de vente est à zéro. Renseignez-le dans le calcul de marge avant de diffuser.",
}

const MARGE: RegleCanal = {
  id: 'marge',
  quoi: 'Prix de vente au-dessus du coût de revient',
  severite: 'avertissement',
  verifie: (p) => {
    const revient = Number(p.price) + Number(p.shippingCost)
    const vente = Number(p.sellingPrice)
    if (vente <= 0 || vente > revient) return null
    return `Vous vendriez à perte : ${vente.toFixed(2)} € pour un coût de revient de ${revient.toFixed(2)} €.`
  },
}

function photosMin(min: number, plateforme: string): RegleCanal {
  return {
    id: `photos-${min}`,
    quoi: `Au moins ${min} photo(s)`,
    severite: 'bloquant',
    verifie: (p) => {
      const n = photos(p)
      return n >= min
        ? null
        : `${plateforme} demande ${min} photo(s) au minimum ; l'annonce en compte ${n}.`
    },
  }
}

const CATEGORIE: RegleCanal = {
  id: 'categorie',
  quoi: 'Catégorie choisie',
  severite: 'bloquant',
  verifie: (p) =>
    texte(p.categoryId)
      ? null
      : "Aucune catégorie : la plateforme ne saura pas où ranger l'annonce, et la refusera ou la classera au hasard.",
}

function argumentsMin(min: number, plateforme: string): RegleCanal {
  return {
    id: `arguments-${min}`,
    quoi: `Au moins ${min} arguments de vente`,
    severite: 'avertissement',
    verifie: (p) => {
      const n = nombre(p.bulletPoints)
      return n >= min
        ? null
        : `${plateforme} indexe les arguments de vente : l'annonce en a ${n}, il en faudrait ${min}.`
    },
  }
}

function attributsMin(min: number, plateforme: string): RegleCanal {
  return {
    id: `attributs-${min}`,
    quoi: `Au moins ${min} attributs produit`,
    severite: 'avertissement',
    verifie: (p) => {
      const n =
        p.attributes && typeof p.attributes === 'object' && !Array.isArray(p.attributes)
          ? Object.keys(p.attributes as Record<string, unknown>).length
          : 0
      return n >= min
        ? null
        : `${plateforme} transforme les attributs en filtres de recherche : l'annonce en a ${n}, il en faudrait ${min}.`
    },
  }
}

/**
 * L'EAN — le mur commun à six destinations sur vingt-trois.
 *
 * Kaufland n'accepte pas une fiche libre : chaque offre est **appariée à sa
 * fiche catalogue par le code-barres**, et cet EAN doit venir du fabricant ou
 * de GS1. Découvert le 03/09/2026 en lisant leur guide de données produit.
 *
 * **Le même jour, en écrivant le connecteur Mirakl, la même contrainte est
 * apparue chez les cinq opérateurs** — La Redoute, E.Leclerc, BHV, Kiabi,
 * BrandAlley : leur import d'offres exige `product-id` et `product-id-type`,
 * c'est-à-dire un identifiant de catalogue. Ce n'est donc pas une bizarrerie
 * allemande, c'est le modèle de la place de marché à catalogue partagé.
 *
 * C'est la contrainte la plus dure de toute la liste, et celle qui touche le
 * plus un catalogue importé : un produit venu de Temu ou d'AliExpress n'en a
 * généralement aucun.
 *
 * Cherché dans les attributs plutôt que dans une colonne dédiée : le vendeur
 * les édite déjà sur la fiche, et l'IA en remplit parfois un quand la page
 * source le porte. Le jour où un EAN devient une donnée de premier plan — parce
 * que plusieurs destinations l'exigent — il méritera sa colonne.
 */
const EAN: RegleCanal = {
  id: 'ean',
  quoi: 'EAN / code-barres officiel',
  severite: 'bloquant',
  verifie: (p) => {
    const attributs =
      p.attributes && typeof p.attributes === 'object' && !Array.isArray(p.attributes)
        ? (p.attributes as Record<string, unknown>)
        : {}

    for (const [cle, valeur] of Object.entries(attributs)) {
      if (!/ean|gtin|barcode|code.?barres?/i.test(cle)) continue
      // Huit à quatorze chiffres : EAN-8, UPC-12, EAN-13, GTIN-14.
      if (/^\d{8}$|^\d{12,14}$/.test(String(valeur).replace(/\s/g, ''))) return null
    }

    return "Cette destination apparie chaque offre à sa fiche catalogue par l’EAN, qui doit venir du fabricant ou de GS1. Ajoutez un attribut « EAN » à l’annonce ; sans lui l’offre sera refusée."
  },
}

/**
 * Le fabricant, l'autre attribut obligatoire de Kaufland.
 *
 * Il figure dans leurs six champs requis, au même titre que l'EAN et la
 * catégorie. Un produit sans marque identifiée n'a rien à y mettre — c'est le
 * même mur que chez BrandAlley, dit autrement.
 */
const FABRICANT: RegleCanal = {
  id: 'fabricant',
  quoi: 'Fabricant ou marque',
  severite: 'bloquant',
  verifie: (p) => {
    const attributs =
      p.attributes && typeof p.attributes === 'object' && !Array.isArray(p.attributes)
        ? (p.attributes as Record<string, unknown>)
        : {}
    const trouve = Object.entries(attributs).some(
      ([cle, valeur]) => /fabricant|marque|brand|manufacturer/i.test(cle) && texte(valeur).length > 1,
    )
    return trouve
      ? null
      : "Kaufland exige un fabricant : ajoutez un attribut « Marque » ou « Fabricant » à l'annonce."
  },
}

/** Les règles que toute destination partage. */
const COMMUNES: RegleCanal[] = [DESCRIPTION, PRIX, MARGE, TITRE_COURT, photosMin(1, 'Toute destination')]

/**
 * Le registre, par plateforme.
 *
 * Une plateforme absente hérite des règles communes seules : mieux vaut ne
 * vérifier que le socle que d'inventer des contraintes qu'on n'a pas lues.
 */
export const REGLES_PAR_CANAL: Partial<Record<Platform, RegleCanal[]>> = {
  AMAZON: [
    ...COMMUNES,
    titreMax(TITRE_MAX.AMAZON!, 'Amazon'),
    CATEGORIE,
    photosMin(1, 'Amazon'),
    argumentsMin(5, 'Amazon'),
    attributsMin(5, 'Amazon'),
  ],
  CDISCOUNT: [...COMMUNES, titreMax(TITRE_MAX.CDISCOUNT!, 'Cdiscount'), CATEGORIE, argumentsMin(3, 'Cdiscount')],
  EBAY: [...COMMUNES, titreMax(TITRE_MAX.EBAY!, 'eBay'), CATEGORIE, photosMin(1, 'eBay')],
  ETSY: [...COMMUNES, titreMax(TITRE_MAX.ETSY!, 'Etsy'), CATEGORIE],
  GOOGLE_SHOPPING: [
    ...COMMUNES,
    titreMax(TITRE_MAX.GOOGLE_SHOPPING!, 'Google Shopping'),
    CATEGORIE,
    photosMin(1, 'Google Shopping'),
  ],
  VINTED: [...COMMUNES, titreMax(TITRE_MAX.VINTED!, 'Vinted'), photosMin(1, 'Vinted'), CATEGORIE],
  LEBONCOIN: [...COMMUNES, titreMax(TITRE_MAX.LEBONCOIN!, 'Leboncoin'), photosMin(1, 'Leboncoin')],
  FACEBOOK: [...COMMUNES, titreMax(TITRE_MAX.FACEBOOK!, 'Facebook Marketplace'), photosMin(1, 'Facebook Marketplace')],
  TIKTOK_SHOP: [...COMMUNES, titreMax(TITRE_MAX.TIKTOK_SHOP!, 'TikTok Shop'), CATEGORIE, photosMin(3, 'TikTok Shop')],
  SHOPIFY: [...COMMUNES, titreMax(TITRE_MAX.SHOPIFY!, 'Shopify')],
  LA_REDOUTE: [...COMMUNES, titreMax(TITRE_MAX.LA_REDOUTE!, 'La Redoute'), CATEGORIE, EAN, attributsMin(4, 'La Redoute')],
  LECLERC: [...COMMUNES, titreMax(TITRE_MAX.LECLERC!, 'E.Leclerc'), CATEGORIE, EAN],
  BHV: [...COMMUNES, titreMax(TITRE_MAX.BHV!, 'BHV Marais'), CATEGORIE, EAN],
  KIABI: [...COMMUNES, titreMax(TITRE_MAX.KIABI!, 'Kiabi'), CATEGORIE, EAN, attributsMin(4, 'Kiabi')],
  BRANDALLEY: [...COMMUNES, titreMax(TITRE_MAX.BRANDALLEY!, 'BrandAlley'), CATEGORIE, EAN],
  /*
   * Kaufland est la destination la plus exigeante de la liste, et il vaut mieux
   * le découvrir ici qu'après avoir payé un abonnement vendeur : EAN officiel,
   * fabricant, catégorie, cinq photos et un titre de quatre-vingts caractères.
   */
  KAUFLAND: [
    ...COMMUNES,
    titreMax(TITRE_MAX.KAUFLAND!, 'Kaufland'),
    CATEGORIE,
    EAN,
    FABRICANT,
    // Cinq a dix vues, resolution minimale de 1024 px : c est ce que leur guide
    // de donnees produit demande.
    photosMin(5, 'Kaufland'),
    attributsMin(4, 'Kaufland'),
  ],
  SPARTOO: [...COMMUNES, titreMax(TITRE_MAX.SPARTOO!, 'Spartoo'), CATEGORIE],
  MIINTO: [...COMMUNES, titreMax(TITRE_MAX.MIINTO!, 'Miinto'), CATEGORIE],
  WISH: [...COMMUNES, titreMax(TITRE_MAX.WISH!, 'Wish'), CATEGORIE],
  OWN_SITE: [...COMMUNES],
  INSTAGRAM: [...COMMUNES, photosMin(1, 'Instagram')],
}

/*
 * Tout opérateur Mirakl sans règles écrites reçoit le socle Mirakl : titre à
 * cent vingt caractères (la valeur des cinq premiers opérateurs), catégorie,
 * et l'EAN — le mur commun du modèle à catalogue partagé. En boucle et non
 * recopié trente-six fois : la trente-septième enseigne sera couverte sans
 * que personne y pense.
 */
for (const operateur of OPERATEURS_MIRAKL) {
  TITRE_MAX[operateur] ??= 120
  REGLES_PAR_CANAL[operateur] ??= [...COMMUNES, titreMax(120, 'Cet opérateur Mirakl'), CATEGORIE, EAN]
}

export interface Ecart {
  regle: string
  quoi: string
  severite: Severite
  message: string
}

export interface VerdictCanal {
  platform: Platform
  /** Faux dès qu'un écart bloquant subsiste. */
  publiable: boolean
  ecarts: Ecart[]
}

/** Confronte une annonce aux règles d'un canal. */
export function verifierCanal(product: Product, platform: Platform): VerdictCanal {
  const regles = REGLES_PAR_CANAL[platform] ?? COMMUNES
  const ecarts: Ecart[] = []

  // Une règle peut figurer deux fois — les communes et celles du canal se
  // recoupent sur les photos. On ne la signale qu'une.
  const vues = new Set<string>()

  for (const regle of regles) {
    if (vues.has(regle.id)) continue
    vues.add(regle.id)

    const message = regle.verifie(product)
    if (message) {
      ecarts.push({ regle: regle.id, quoi: regle.quoi, severite: regle.severite, message })
    }
  }

  return {
    platform,
    publiable: !ecarts.some((e) => e.severite === 'bloquant'),
    ecarts,
  }
}

/** Confronte une annonce à plusieurs canaux d'un coup. */
export function verifierCanaux(product: Product, platforms: Platform[]): VerdictCanal[] {
  return platforms.map((p) => verifierCanal(product, p))
}
