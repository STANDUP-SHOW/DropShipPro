import Anthropic from '@anthropic-ai/sdk'
import { MODELE_RAPIDE, modele } from './aiModels.js'

/**
 * Traduire une requête de recherche vers l'anglais, pour les catalogues qui
 * n'indexent que lui.
 *
 * **Pourquoi c'est nécessaire, et seulement là.** AliExpress indexe le
 * français : « écouteurs sans fil » y rend de vrais écouteurs sans fil. CJ
 * Dropshipping, lui, cherche dans `productNameEn` — un index anglais. Lui
 * envoyer « écouteurs sans fil » ne peut rien donner de juste : constaté le
 * 16/09/2026, il rendait une balayette de jardin et un fer à boucler, parce
 * qu'il s'accrochait au seul mot « fil ».
 *
 * Deux ou trois mots à traduire : Haiku suffit, et le résultat est **gardé en
 * mémoire** — un vendeur qui cherche « écouteurs sans fil » chez trois
 * fournisseurs, ou qui affine sa recherche, ne paie pas trois traductions.
 *
 * Sans clé d'API, on rend le texte inchangé plutôt que d'échouer : la
 * recherche sera moins bonne, elle ne sera pas cassée.
 */
const memoire = new Map<string, string>()

/** Au-delà, ce n'est plus une requête : on ne traduit pas des paragraphes. */
const LONGUEUR_MAX = 80

export async function traduireEnAnglais(texte: string): Promise<string> {
  const propre = texte.trim()
  if (!propre || propre.length > LONGUEUR_MAX) return propre

  const cle = propre.toLowerCase()
  const connu = memoire.get(cle)
  if (connu !== undefined) return connu

  /*
   * Déjà anglais ? On ne traduit pas.
   *
   * Le contrôle est grossier — accents et mots outils français — et c'est
   * voulu : se tromper coûte un appel inutile, pas une mauvaise recherche.
   */
  if (!/[àâäçéèêëîïôöùûüÿœ]/i.test(propre) && !/\b(sans|avec|pour|de|du|des|le|la|les|et)\b/i.test(propre)) {
    memoire.set(cle, propre)
    return propre
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return propre

  try {
    const client = new Anthropic({ apiKey })
    const reponse = await client.messages.create({
      model: modele('AI_MODEL_CATEGORY', MODELE_RAPIDE),
      max_tokens: 40,
      system:
        "Tu traduis une requête de recherche produit du français vers l'anglais, pour un catalogue de dropshipping. Réponds UNIQUEMENT par la traduction, deux à quatre mots, sans ponctuation ni explication. Exemple : « écouteurs sans fil » → wireless earbuds",
      messages: [{ role: 'user', content: propre }],
    })
    const texteRendu = reponse.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()
      .replace(/^["'«»\s]+|["'«»\s.]+$/g, '')

    // Une réponse bavarde n'est pas une traduction : on garde l'original.
    const retenu = texteRendu && texteRendu.length <= LONGUEUR_MAX ? texteRendu : propre
    memoire.set(cle, retenu)
    return retenu
  } catch (e) {
    console.error('[traduction] refus du modèle :', e instanceof Error ? e.message : e)
    return propre
  }
}

/**
 * Les résultats qui parlent vraiment de ce qu'on a demandé.
 *
 * **Le défaut que ça corrige.** `product/list` de CJ s'accroche à UN mot :
 * « wireless earbuds » rendait un nettoyeur haute pression sans fil, une tasse
 * pour bébé sans fil et un soutien-gorge d'allaitement sans fil. Tous
 * contiennent « wireless », aucun n'est un écouteur, et rien dans la réponse
 * ne classe par pertinence.
 *
 * On exige donc **tous** les mots significatifs de la requête dans le titre.
 * C'est sévère, et c'est ce qu'il faut : sur un catalogue de sourcing, une
 * liste courte et juste vaut mieux qu'une longue où rien n'est cherchable —
 * le vendeur importe ce qu'il voit, et une ligne hors sujet devient une
 * annonce hors sujet, facturée.
 */
export function gardeLesPertinents<T extends { titre: string }>(lignes: T[], requete: string): T[] {
  const attendus = motsSignificatifs(requete)
  if (!attendus.length) return lignes

  const retenus = lignes.filter((l) => {
    const mots = motsDuTitre(l.titre)
    return attendus.every((m) => mots.some((t) => memeMot(m, t)))
  })

  /*
   * Zéro résultat filtré est une réponse, pas un échec à rattraper. Rendre la
   * liste non filtrée « pour avoir quelque chose » remettrait exactement le
   * bruit qu'on vient d'enlever, et le vendeur ne saurait pas lequel des deux
   * il regarde.
   */
  return retenus
}

function sansAccents(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

/** Les mots qui portent le sens : ni les articles, ni les mots de liaison. */
const MOTS_OUTILS = new Set([
  'sans', 'avec', 'pour', 'des', 'les', 'une', 'and', 'the', 'for', 'with', 'from',
  'de', 'du', 'la', 'le', 'et', 'in', 'on', 'of', 'to',
])

/**
 * **Deux lettres suffisent à porter le sens d'une recherche produit.**
 *
 * Le premier jet exigeait trois lettres, et « mini pc » perdait « pc » : le
 * filtre ne demandait plus que « mini », et laissait donc passer un
 * presse-fleurs et une lampe anti-moustiques. Or « pc », « tv », « 4k »,
 * « hd » sont souvent le mot le PLUS discriminant de la requête. Ce sont les
 * mots outils qu'il faut nommer, pas une longueur qu'il faut deviner.
 */
function motsSignificatifs(requete: string): string[] {
  return sansAccents(requete)
    .split(/[^a-z0-9]+/)
    .filter((m) => m.length >= 2 && !MOTS_OUTILS.has(m))
}

/** Les mots d'un titre, sans accents ni ponctuation. */
function motsDuTitre(titre: string): string[] {
  return sansAccents(titre).split(/[^a-z0-9]+/).filter(Boolean)
}

/**
 * Deux mots désignent-ils la même chose ?
 *
 * **Comparer des morceaux, pas des mots, rendait n'importe quoi.** Le premier
 * filtre faisait `titre.includes('pc')` : « 30PCS Mini Hand Gesture
 * Figurines » passait pour un mini-PC, parce que « pc » est dans « pcs ». Sur
 * une recherche produit, les mots courts sont justement les plus
 * discriminants — et ce sont eux que la comparaison par morceaux détruit.
 *
 * On compare donc mot à mot. Le pluriel est toléré au-delà de trois lettres
 * (« earbud » ↔ « earbuds »), jamais en deçà : c'est précisément la tolérance
 * qui ferait rentrer « pcs » pour « pc ».
 */
function memeMot(attendu: string, trouve: string): boolean {
  if (attendu === trouve) return true
  if (attendu.length < 4) return false
  return trouve === `${attendu}s` || attendu === `${trouve}s`
}
