import Anthropic from '@anthropic-ai/sdk'
import type { Product } from '@prisma/client'
import { MODELE_RAISONNEMENT } from './chatBudget.js'

/**
 * L'avis de Laurence : ce produit mérite-t-il un budget publicitaire ?
 *
 * Ce que ça remplace : une conversation pré-remplie. Le vendeur cliquait
 * « demander l'avis de Laurence », lisait la réponse, fermait l'écran — et
 * **l'avis disparaissait**. Le lendemain, il repayait pour la même réponse sur
 * le même produit, sans s'en apercevoir autrement qu'au relevé de crédits.
 *
 * L'avis est donc écrit sur l'annonce, comme l'analyse de marché. Un produit
 * dont la marge n'a pas bougé n'a pas d'avis nouveau à rendre.
 *
 * **Un seul appel, pas une conversation.** La question est toujours la même — la
 * poser en dialogue faisait payer un tour de chat pour une réponse qui ne se
 * discute pas. Et Sonnet plutôt que Haiku : il s'agit d'arbitrer un budget à
 * partir d'une marge, pas de retrouver un fait.
 */

/** Ce que coûte un avis. Écrit avant le clic, jamais découvert après. */
export const COUT_EN_CREDITS = 1

/**
 * Au-delà, l'avis est refait.
 *
 * Assez long pour qu'un vendeur indécis ne repaie pas dans la journée ; assez
 * court pour qu'un prix d'achat qui a bougé de trois euros ne soit pas conseillé
 * sur une marge périmée.
 */
export const FRAICHEUR_JOURS = 14

/** Vrai quand l'avis gardé est encore valable. */
export function avisEncoreFrais(produit: Pick<Product, 'adAdvice' | 'adAdvisedAt'>): boolean {
  if (!produit.adAdvice || !produit.adAdvisedAt) return false
  const jours = (Date.now() - produit.adAdvisedAt.getTime()) / 86400000
  return jours < FRAICHEUR_JOURS
}

const CONSIGNE = [
  "Tu es Laurence, responsable marketing d'un vendeur en dropshipping.",
  '',
  'On te donne une annonce et ses chiffres. Tu réponds à une seule question :',
  'ce produit mérite-t-il un budget publicitaire, et si oui à quelles conditions.',
  '',
  'Ta réponse tient en quatre paragraphes courts, sans titres ni listes à puces :',
  '',
  "1. Ton verdict en une phrase, et il tranche — « oui », « non », ou « pas encore, parce que ».",
  "2. Le coût par acquisition maximal à ne pas dépasser, calculé depuis la marge unitaire. Donne le chiffre.",
  "3. L'angle qui convertirait le mieux pour ce produit précis, et pourquoi celui-là.",
  "4. Ce qui te ferait changer d'avis.",
  '',
  "N'invente aucun chiffre de marché : tu ne disposes que de ce qui t'est donné.",
  'Une marge trop faible se dit franchement — un vendeur qui brûle son budget sur',
  'un produit à deux euros de marge perd deux fois.',
].join('\n')

export interface DemandeAvis {
  titre: string
  description?: string | null
  prixAchat: number
  port: number
  prixVente: number
  devise: string
  categorie?: string | null
  arguments?: string[]
}

/**
 * Rend l'avis, ou `null` quand le modèle n'a pas répondu.
 *
 * `null` et non une exception : l'appelant doit rendre le crédit, ce qu'une
 * exception rend facile à oublier en chemin.
 */
export async function redigerAvisPublicitaire(d: DemandeAvis): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const marge = d.prixVente - d.prixAchat - d.port
  const taux = d.prixVente > 0 ? (marge / d.prixVente) * 100 : 0

  const question = [
    `Produit : ${d.titre}`,
    d.categorie ? `Catégorie : ${d.categorie}` : '',
    `Prix d'achat : ${d.prixAchat.toFixed(2)} ${d.devise}`,
    `Frais de port fournisseur : ${d.port.toFixed(2)} ${d.devise}`,
    `Prix de vente : ${d.prixVente.toFixed(2)} ${d.devise}`,
    // La marge est calculée ici plutôt que laissée au modèle : c'est une
    // soustraction, et la lui faire faire ajoute une occasion de se tromper sur
    // le seul chiffre dont dépend toute la réponse.
    `Marge unitaire : ${marge.toFixed(2)} ${d.devise} (${taux.toFixed(0)} %)`,
    d.arguments?.length ? `Arguments de vente : ${d.arguments.slice(0, 5).join(' · ')}` : '',
    d.description ? `Description : ${d.description.slice(0, 800)}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const client = new Anthropic({ apiKey })
    const reponse = await client.messages.create({
      model: MODELE_RAISONNEMENT,
      max_tokens: 700,
      system: [{ type: 'text', text: CONSIGNE, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: question }],
    })

    const texte = reponse.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()

    return texte || null
  } catch (err) {
    console.error('avis publicitaire indisponible', err)
    return null
  }
}
