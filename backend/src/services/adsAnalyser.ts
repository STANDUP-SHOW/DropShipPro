import Anthropic from '@anthropic-ai/sdk'
import { MODELE_REDACTION, modele } from './aiModels.js'
import { systemeCachable } from './chatBudget.js'

/**
 * AdsAnalyser (DESKTOP POWER, demande de Max du 24/10/2026).
 *
 * Le vendeur ouvre la bibliothèque publicitaire de Facebook ou de TikTok dans le
 * navigateur intégré de l'application desktop, cherche lui-même, s'arrête sur le
 * produit qui l'intéresse et lance l'analyse. L'application lit LA page qu'il voit
 * (texte visible, adresse) : rien n'est parcouru à sa place, aucune page n'est
 * ouverte en cachette — c'est la même règle que marketStudio.ts, qui refuse de
 * lire les bibliothèques lui-même.
 *
 * Le rapport reprend les six sections du rapport marketing des agents
 * (MARKET-ANALYSES/PROMPT-TACHES-PLANIFIEES.md, fichier `.marketing.md`) et y
 * ajoute ce que Max a demandé : les données financières — combien investi,
 * quel retour, le lien de la boutique, les signes de ventes.
 *
 * **Ce qui ne se voit pas ne s'invente pas.** En Europe, Meta affiche la portée
 * et les dates des publicités, pas leurs dépenses (sauf publicités politiques) ;
 * TikTok affiche les utilisateurs touchés. Le « retour » d'une publicité n'est
 * public nulle part. Le modèle écrit donc « Non visible sur la page » plutôt
 * qu'un chiffre vraisemblable, et une estimation, s'il en fait une, est
 * nommée estimation avec son calcul.
 */

const MODEL = modele('AI_MODEL_ANALYSIS', MODELE_REDACTION)
/** Trois recherches au plus : vérifier la boutique de l'annonceur et ses signes de ventes. */
const MAX_RECHERCHES = 3

export type PlateformeAds = 'facebook' | 'tiktok'

export const BIBLIOTHEQUES: Record<PlateformeAds, { nom: string; accueil: string }> = {
  facebook: { nom: 'Facebook Ad Library', accueil: 'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=FR&media_type=all' },
  tiktok: { nom: 'TikTok Ads Library', accueil: 'https://library.tiktok.com/ads?region=FR' },
}

/** Ce que l'application a lu sur la page. */
export interface PageLue {
  url: string
  titre: string
  texte: string
}

export interface DonneesFinancieres {
  investissement: string | null
  portee: string | null
  debut: string | null
  publicitesActives: string | null
  boutique: string | null
  signesDeVentes: string | null
  retour: string | null
}

const CONSIGNE = `Tu es le directeur marketing de DropShipper IA. Un vendeur en dropshipping a ouvert la bibliothèque publicitaire de Facebook ou de TikTok et s'est arrêté sur un produit. On te donne LE TEXTE VISIBLE de la page qu'il regardait, et son adresse.

Règles qui priment sur tout :
- Tu n'inventes rien. Un chiffre, une date, un nom de boutique, une adresse viennent de la page ou d'une source trouvée par ta recherche web, citée. Sinon tu écris « Non visible sur la page ».
- Les dépenses d'une publicité commerciale ne sont pas publiées par Meta en Europe ; TikTok publie une fourchette d'utilisateurs touchés. Le retour sur investissement n'est public nulle part. Si tu en proposes une estimation, écris « Estimation : » puis le calcul et ses hypothèses, jamais un chiffre nu.
- Une adresse de boutique n'est donnée que si elle est sur la page ou trouvée par une recherche citée.
- Tu peux faire au plus ${MAX_RECHERCHES} recherches web, seulement pour vérifier la boutique de l'annonceur et ses signes de ventes (avis, compteurs de ventes, présence sur des places de marché).

Réponds en français, en Markdown, avec exactement ces sections, dans cet ordre :
## Synthèse
(trois phrases : le produit, l'annonceur, ce qu'il faut en retenir pour le vendeur)
## Données financières
(une liste : Investissement visible, Portée, Diffusée depuis, Nombre de publicités actives, Boutique de l'annonceur, Signes de ventes, Retour sur investissement — chacun suivi de la valeur relevée ou de « Non visible sur la page »)
## Social places
## Publicités en cours
(ce que montrent les publicités de la page : accroches, formats, appels à l'action, durée de diffusion)
## Tendances du jour
## Tendances publicitaires
## Prompts d'images publicitaires
(trois prompts, chacun dans son propre bloc de code, format en première ligne, ex. « # Instagram 1:1 »)
## Prompts de vidéos publicitaires
(deux prompts, chacun dans son propre bloc de code, format en première ligne, ex. « # TikTok 9:16 — 15 s »)

Termine par un bloc de code \`json\` (et rien après) qui reprend les données financières : {"investissement": …, "portee": …, "debut": …, "publicitesActives": …, "boutique": …, "signesDeVentes": …, "retour": …} — chaque valeur est une chaîne courte, ou null quand elle n'est pas visible.`

export type AppelAds = (consigne: string, question: string) => Promise<string>

async function appelParDefaut(consigne: string, question: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) throw new Error("Les analyses ne sont pas disponibles sur ce serveur.")
  const message = await new Anthropic({ apiKey }).messages.create({
    model: MODEL,
    max_tokens: 6000,
    system: systemeCachable(consigne),
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: MAX_RECHERCHES, user_location: { type: 'approximate', country: 'FR' } }],
    messages: [{ role: 'user', content: question }],
  })
  return message.content
    .filter((bloc): bloc is Anthropic.TextBlock => bloc.type === 'text')
    .map((bloc) => bloc.text)
    .join('\n')
}

const CLES: Array<keyof DonneesFinancieres> = ['investissement', 'portee', 'debut', 'publicitesActives', 'boutique', 'signesDeVentes', 'retour']

/** Le bloc json final, lu sans confiance : une valeur absente ou vide devient null. */
export function lireDonnees(texte: string): DonneesFinancieres | null {
  const blocs = [...texte.matchAll(/```json\s*([\s\S]*?)```/g)]
  const dernier = blocs.at(-1)
  if (!dernier) return null
  try {
    const brut = JSON.parse(dernier[1]) as Record<string, unknown>
    const d = {} as DonneesFinancieres
    for (const c of CLES) {
      const v = brut[c]
      d[c] = typeof v === 'string' && v.trim() && !/^non visible/i.test(v.trim()) ? v.trim().slice(0, 300) : null
    }
    return d
  } catch {
    return null
  }
}

/** Le rapport sans le bloc json final, qui n'est là que pour la machine. */
export function corpsDuRapport(texte: string): string {
  return texte.replace(/```json\s*[\s\S]*?```\s*$/, '').trim()
}

/** Une page vide, ou qui n'est pas une bibliothèque publicitaire, ne se facture pas. */
export function pageAnalysable(plateforme: PlateformeAds, page: PageLue): string | null {
  let hote = ''
  try {
    hote = new URL(page.url).hostname
  } catch {
    return 'Adresse de la page illisible.'
  }
  const attendu = plateforme === 'facebook' ? /(^|\.)facebook\.com$/ : /(^|\.)tiktok\.com$/
  if (!attendu.test(hote)) return `Ouvrez d'abord la bibliothèque ${BIBLIOTHEQUES[plateforme].nom} dans le bloc ci-dessous.`
  if (page.texte.replace(/\s+/g, ' ').trim().length < 200) return "La page est presque vide : attendez qu'elle soit chargée, ou ouvrez la fiche d'une publicité."
  return null
}

export async function analyserPageAds(
  { plateforme, page, produit }: { plateforme: PlateformeAds; page: PageLue; produit?: string | null },
  appel: AppelAds = appelParDefaut,
): Promise<{ body: string; donnees: DonneesFinancieres | null }> {
  const question = [
    `Bibliothèque : ${BIBLIOTHEQUES[plateforme].nom}`,
    `Adresse de la page : ${page.url}`,
    `Titre de la page : ${page.titre || '(sans titre)'}`,
    produit ? `Produit que le vendeur veut analyser : ${produit}` : 'Le vendeur n’a pas nommé le produit : déduis-le de la page.',
    '',
    'Texte visible de la page (tel que le vendeur le voyait) :',
    '"""',
    page.texte,
    '"""',
  ].join('\n')
  const texte = await appel(CONSIGNE, question)
  const body = corpsDuRapport(texte)
  if (!/##\s*Données financières/i.test(body)) throw new Error("Le rapport est revenu incomplet : rien n'a été débité.")
  return { body, donnees: lireDonnees(texte) }
}
