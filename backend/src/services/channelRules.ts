import type { Platform, Product } from '@prisma/client'

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
    titreMax(200, 'Amazon'),
    CATEGORIE,
    photosMin(1, 'Amazon'),
    argumentsMin(5, 'Amazon'),
    attributsMin(5, 'Amazon'),
  ],
  CDISCOUNT: [...COMMUNES, titreMax(132, 'Cdiscount'), CATEGORIE, argumentsMin(3, 'Cdiscount')],
  EBAY: [...COMMUNES, titreMax(80, 'eBay'), CATEGORIE, photosMin(1, 'eBay')],
  ETSY: [...COMMUNES, titreMax(140, 'Etsy'), CATEGORIE],
  GOOGLE_SHOPPING: [
    ...COMMUNES,
    titreMax(150, 'Google Shopping'),
    CATEGORIE,
    photosMin(1, 'Google Shopping'),
  ],
  VINTED: [...COMMUNES, titreMax(70, 'Vinted'), photosMin(1, 'Vinted'), CATEGORIE],
  LEBONCOIN: [...COMMUNES, titreMax(50, 'Leboncoin'), photosMin(1, 'Leboncoin')],
  FACEBOOK: [...COMMUNES, titreMax(100, 'Facebook Marketplace'), photosMin(1, 'Facebook Marketplace')],
  TIKTOK_SHOP: [...COMMUNES, titreMax(255, 'TikTok Shop'), CATEGORIE, photosMin(3, 'TikTok Shop')],
  SHOPIFY: [...COMMUNES, titreMax(255, 'Shopify')],
  LA_REDOUTE: [...COMMUNES, titreMax(120, 'La Redoute'), CATEGORIE, attributsMin(4, 'La Redoute')],
  LECLERC: [...COMMUNES, titreMax(120, 'E.Leclerc'), CATEGORIE],
  BHV: [...COMMUNES, titreMax(120, 'BHV Marais'), CATEGORIE],
  KIABI: [...COMMUNES, titreMax(120, 'Kiabi'), CATEGORIE, attributsMin(4, 'Kiabi')],
  BRANDALLEY: [...COMMUNES, titreMax(120, 'BrandAlley'), CATEGORIE],
  SPARTOO: [...COMMUNES, titreMax(120, 'Spartoo'), CATEGORIE],
  MIINTO: [...COMMUNES, titreMax(120, 'Miinto'), CATEGORIE],
  WISH: [...COMMUNES, titreMax(150, 'Wish'), CATEGORIE],
  OWN_SITE: [...COMMUNES],
  INSTAGRAM: [...COMMUNES, photosMin(1, 'Instagram')],
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
