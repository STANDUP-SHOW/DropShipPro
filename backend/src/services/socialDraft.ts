import type { Product } from '@prisma/client'

/**
 * Composer le message qui accompagne un produit sur un réseau.
 *
 * Écrit à partir de ce qui existe déjà — le titre réécrit, les arguments de
 * vente, le prix, les mots-clés — et **sans appeler le modèle**. Ouvrir la
 * fenêtre de publication coûterait sinon un appel payant à chaque clic, y
 * compris quand le vendeur la referme sans rien envoyer.
 *
 * Le vendeur relit et corrige avant d'envoyer : ce brouillon est un point de
 * départ, pas une décision.
 *
 * **Un message par réseau, et ce n'est pas cosmétique.** Le même texte partout
 * se voit tout de suite, et chaque réseau a ses contraintes réelles :
 *
 * - **Facebook** accepte les liens cliquables et les textes longs. C'est le seul
 *   endroit où l'adresse de la boutique sert à quelque chose.
 * - **Instagram** ne rend aucun lien cliquable dans une légende — en mettre un
 *   fabrique une ligne inutile que personne ne peut suivre. En revanche les
 *   mots-dièse y portent la découverte, ce qui est faux ailleurs.
 * - **LinkedIn et X** coupent court : 3 000 et 280 caractères.
 */

/** Les bornes réelles de chaque réseau, en caractères. */
const LONGUEURS: Record<string, number> = {
  facebook: 5000,
  instagram: 2200,
  linkedin: 2900,
  x: 275,
  threads: 490,
  tiktok: 2100,
  telegram: 4000,
  pinterest: 490,
}

/** Les réseaux où un lien est cliquable dans le message. */
const LIEN_CLIQUABLE = new Set(['facebook', 'linkedin', 'x', 'telegram', 'threads', 'pinterest'])

/** Les réseaux où les mots-dièse servent réellement à être trouvé. */
const MOTS_DIESE = new Set(['instagram', 'tiktok', 'threads', 'x'])

/** Coupe au mot, avec une ellipse, plutôt qu'au caractère. */
function couper(texte: string, max: number): string {
  const propre = texte.trim()
  if (propre.length <= max) return propre
  const tranche = propre.slice(0, max - 1)
  const espace = tranche.lastIndexOf(' ')
  return `${(espace > max * 0.6 ? tranche.slice(0, espace) : tranche).trimEnd()}…`
}

/**
 * Les mots-dièse tirés des mots-clés de l'annonce.
 *
 * Cinq au plus : au-delà, Instagram les traite comme du remplissage et la
 * publication porte moins loin qu'avec trois bien choisis. Les mots de plus de
 * deux termes sont écartés — « montre homme automatique acier » ne devient pas
 * un mot-dièse que quelqu'un cherche.
 */
function motsDiese(motsCles: string | null, max = 5): string[] {
  return (motsCles || '')
    .split(',')
    .map((m) => m.trim())
    .filter((m) => m.length > 2 && m.split(/\s+/).length <= 2)
    .slice(0, max)
    .map(
      (m) =>
        `#${m
          .toLowerCase()
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .replace(/[^a-z0-9]/g, '')}`,
    )
    .filter((m) => m.length > 3)
}

export interface BrouillonSocial {
  platform: string
  texte: string
  /** Ce qui a été retiré faute de place, pour que le vendeur le sache. */
  note: string | null
}

/**
 * Rend le brouillon pour un réseau donné.
 *
 * `lien` est l'adresse de la fiche sur la boutique du vendeur, quand il en a
 * une. Absente, aucun appel à l'action ne renvoie nulle part — et une invitation
 * à cliquer sans lien est pire que pas d'invitation.
 */
export function brouillonPour(
  produit: Pick<Product, 'aiTitle' | 'title' | 'bulletPoints' | 'sellingPrice' | 'currency' | 'metaKeywords' | 'aiDescription' | 'description'>,
  platform: string,
  lien?: string | null,
): BrouillonSocial {
  const max = LONGUEURS[platform] ?? 2000
  const titre = (produit.aiTitle || produit.title || '').trim()

  const arguments_ = (Array.isArray(produit.bulletPoints) ? produit.bulletPoints : [])
    .filter((b): b is string => typeof b === 'string' && b.trim().length > 0)
    .slice(0, 3)

  const prix = Number(produit.sellingPrice)
  const lignes: string[] = [titre]

  if (arguments_.length) {
    lignes.push('', ...arguments_.map((a) => `• ${a.trim()}`))
  } else {
    // Sans arguments de vente, la description tient lieu d'accroche — coupée
    // court, parce qu'une description de fiche produit n'est pas un post.
    const description = (produit.aiDescription || produit.description || '').trim()
    if (description) lignes.push('', couper(description.replace(/\s+/g, ' '), 300))
  }

  if (prix > 0) lignes.push('', `${prix.toFixed(2)} ${produit.currency}`)

  if (lien && LIEN_CLIQUABLE.has(platform)) {
    lignes.push('', `👉 ${lien}`)
  } else if (lien && platform === 'instagram') {
    // Instagram ne rend pas les liens cliquables : le renvoi vers la bio est la
    // seule façon honnête de diriger quelqu'un.
    lignes.push('', 'Lien en bio 👆')
  }

  const diese = MOTS_DIESE.has(platform) ? motsDiese(produit.metaKeywords) : []
  if (diese.length) lignes.push('', diese.join(' '))

  const complet = lignes.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  const texte = couper(complet, max)

  return {
    platform,
    texte,
    note:
      texte.length < complet.length
        ? `Message raccourci pour tenir dans les ${max} caractères de ce réseau.`
        : null,
  }
}
