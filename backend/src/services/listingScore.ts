import type { Product } from '@prisma/client'

/**
 * La note d'une annonce, sur cent.
 *
 * Calculée par des règles pondérées, pas par un modèle — et c'est délibéré.
 * Une note produite par un modèle varie d'un appel à l'autre, coûte à chaque
 * affichage, et ne sait pas dire pourquoi elle a baissé. Ici la note est
 * reproductible, gratuite, et chaque point perdu vient avec sa correction :
 * « votre titre fait 34 caractères, il en faut 50 ».
 *
 * Les seuils viennent de ce que les places de marché acceptent réellement, pas
 * d'une idée générale de la qualité : un titre de 70 caractères est coupé sur
 * Google Shopping, une annonce à deux photos convertit mal partout.
 */

export interface ScoreCheck {
  /** Ce qui est mesuré, dit au vendeur. */
  label: string
  /** Points obtenus sur ce critère. */
  points: number
  max: number
  /** Quoi faire, quand des points manquent. Null quand tout va bien. */
  fix: string | null
}

export interface ListingScore {
  score: number
  /** vert, orange ou rouge — pour trier une liste d'un coup d'œil. */
  level: 'bon' | 'moyen' | 'faible'
  checks: ScoreCheck[]
  /** Les trois corrections qui rapportent le plus de points. */
  priorities: string[]
}

function textOf(value: string | null | undefined) {
  return (value ?? '').trim()
}

function countOf(value: unknown): number {
  if (Array.isArray(value)) return value.length
  if (value && typeof value === 'object') return Object.keys(value).length
  return 0
}

/**
 * Note une annonce.
 *
 * Cent points répartis sur huit critères. Le titre et les photos pèsent le plus
 * lourd parce que ce sont les deux seules choses que voit un acheteur dans une
 * liste de résultats — tout le reste ne compte que s'il a cliqué.
 */
export function scoreListing(product: Product): ListingScore {
  const checks: ScoreCheck[] = []

  // --- Titre : 20 points
  const title = textOf(product.aiTitle) || textOf(product.title)
  const titleLength = title.length
  let titlePoints = 0
  let titleFix: string | null = null

  if (titleLength >= 50 && titleLength <= 70) {
    titlePoints = 20
  } else if (titleLength >= 35 && titleLength < 50) {
    titlePoints = 13
    titleFix = `Titre un peu court (${titleLength} caractères) : visez 50 à 70, c'est ce qu'affichent les places de marché sans couper.`
  } else if (titleLength > 70 && titleLength <= 90) {
    titlePoints = 13
    titleFix = `Titre un peu long (${titleLength} caractères) : au-delà de 70, la fin est coupée dans les résultats.`
  } else if (titleLength > 0) {
    titlePoints = 5
    titleFix =
      titleLength < 35
        ? `Titre trop court (${titleLength} caractères) : un acheteur ne sait pas ce que vous vendez.`
        : `Titre trop long (${titleLength} caractères) : il sera tronqué partout.`
  } else {
    titleFix = 'Aucun titre.'
  }
  checks.push({ label: 'Titre', points: titlePoints, max: 20, fix: titleFix })

  // --- Photos : 20 points
  const images = Array.isArray(product.images) ? product.images.length : 0
  let imagePoints = 0
  let imageFix: string | null = null
  if (images >= 5) imagePoints = 20
  else if (images >= 3) {
    imagePoints = 14
    imageFix = `${images} photos : passez à cinq, c'est le seuil où les acheteurs arrêtent de douter.`
  } else if (images >= 1) {
    imagePoints = 6
    imageFix = `${images} photo(s) seulement : une annonce sous trois photos se vend mal partout.`
  } else {
    imageFix = 'Aucune photo : plusieurs places de marché refusent l’annonce.'
  }
  checks.push({ label: 'Photos', points: imagePoints, max: 20, fix: imageFix })

  // --- Description : 15 points
  const description = textOf(product.aiDescription) || textOf(product.description)
  let descPoints = 0
  let descFix: string | null = null
  if (description.length >= 600) descPoints = 15
  else if (description.length >= 300) {
    descPoints = 10
    descFix = 'Description courte : au-delà de 600 caractères, vous répondez aux questions avant qu’elles ne soient posées.'
  } else if (description.length > 0) {
    descPoints = 4
    descFix = 'Description trop maigre : elle ne lève aucune objection et ne porte aucun mot-clé.'
  } else {
    descFix = 'Aucune description.'
  }
  checks.push({ label: 'Description', points: descPoints, max: 15, fix: descFix })

  // --- Attributs : 12 points
  const attributes = countOf(product.attributes)
  let attrPoints = 0
  let attrFix: string | null = null
  if (attributes >= 8) attrPoints = 12
  else if (attributes >= 4) {
    attrPoints = 7
    attrFix = `${attributes} attributs : les places de marché filtrent dessus, chacun manquant vous retire d’un filtre.`
  } else {
    attrFix = "Aucun attribut renseigné : votre annonce n'apparaît dans aucun filtre."
  }
  checks.push({ label: 'Attributs', points: attrPoints, max: 12, fix: attrFix })

  // --- Arguments de vente : 10 points
  const bullets = countOf(product.bulletPoints)
  let bulletPoints = 0
  let bulletFix: string | null = null
  if (bullets >= 5) bulletPoints = 10
  else if (bullets >= 3) {
    bulletPoints = 6
    bulletFix = `${bullets} arguments : visez cinq à six, c'est ce que lit un acheteur pressé.`
  } else {
    bulletFix = 'Aucun argument de vente listé.'
  }
  checks.push({ label: 'Arguments de vente', points: bulletPoints, max: 10, fix: bulletFix })

  // --- Mots-clés : 8 points
  const keywords = textOf(product.metaKeywords).split(',').filter((k) => k.trim().length > 1).length
  let keywordPoints = 0
  let keywordFix: string | null = null
  if (keywords >= 15) keywordPoints = 8
  else if (keywords >= 8) {
    keywordPoints = 5
    keywordFix = `${keywords} mots-clés : montez à quinze pour couvrir les façons dont on cherche ce produit.`
  } else {
    keywordFix = 'Trop peu de mots-clés : vous ne sortez que sur le nom exact du produit.'
  }
  checks.push({ label: 'Mots-clés', points: keywordPoints, max: 8, fix: keywordFix })

  // --- Options d'achat : 8 points
  const variants = countOf(product.variants)
  let variantPoints = 0
  let variantFix: string | null = null
  if (variants >= 1) variantPoints = 8
  else {
    variantFix =
      "Aucune option (taille, couleur) : si le produit en a, l'acheteur ne peut pas choisir et passe son chemin."
  }
  checks.push({ label: "Options d'achat", points: variantPoints, max: 8, fix: variantFix })

  // --- Marge : 7 points
  const cost = Number(product.price) + Number(product.shippingCost)
  const selling = Number(product.sellingPrice)
  const margin = cost > 0 ? Math.round(((selling - cost) / cost) * 100) : null
  let marginPoints = 0
  let marginFix: string | null = null
  if (margin === null || selling <= 0) {
    marginFix = "Prix de vente non renseigné : impossible de savoir si l'annonce est rentable."
  } else if (margin >= 40) marginPoints = 7
  else if (margin >= 15) {
    marginPoints = 4
    marginFix = `Marge de ${margin} % : une fois la commission de la place de marché prélevée, il ne reste presque rien.`
  } else {
    marginFix = `Marge de ${margin} % : vous vendez à perte une fois la commission déduite.`
  }
  checks.push({ label: 'Marge', points: marginPoints, max: 7, fix: marginFix })

  const score = checks.reduce((n, c) => n + c.points, 0)

  // Les corrections qui rapportent le plus : un vendeur pressé en fait trois,
  // pas huit.
  const priorities = checks
    .filter((c) => c.fix)
    .sort((a, b) => b.max - b.points - (a.max - a.points))
    .slice(0, 3)
    .map((c) => c.fix!)

  return {
    score,
    level: score >= 80 ? 'bon' : score >= 55 ? 'moyen' : 'faible',
    checks,
    priorities,
  }
}
