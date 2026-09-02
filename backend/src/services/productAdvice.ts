import { MODELE_REDACTION } from './aiModels.js'
import Anthropic from '@anthropic-ai/sdk'

/**
 * « Info sur un produit » : l'avis d'un chef de rayon sur une adresse collée.
 *
 * Trois volets, parce que ce sont trois publics qui ne disent pas la même
 * chose : ce qu'en disent les fournisseurs (qui le vend, à quel prix, en quel
 * délai), ce qu'en disent les réseaux (est-ce que ça tourne sur TikTok, sur
 * Facebook), et ce qu'en disent les places de marché (à combien il se vend
 * vraiment, avec quelles critiques d'acheteurs).
 *
 * Le prix de revient, et pourquoi il est ce qu'il est : la recherche web est
 * facturée 10 $ les mille, plus la lecture des résultats. À cinq recherches,
 * l'avis coûte environ 0,15 € ; un crédit rapporte 0,08 € au plus gros paquet.
 * Un avis à un crédit se vendrait donc à perte. D'où trois crédits, et cinq
 * recherches au maximum — 38 % de marge sur tous les paquets.
 */

const MODEL = MODELE_REDACTION

/** Assez pour croiser fournisseurs, réseaux et places de marché. Pas plus. */
export const MAX_RECHERCHES = 5

/** Ce que coûte un avis au vendeur. */
export const COUT_EN_CREDITS = 3

/**
 * Combien de temps un avis reste servi sans repayer.
 *
 * Assez long pour qu'un vendeur indécis ne paie pas quatre fois la même
 * réponse dans la journée ; assez court pour qu'un produit qui s'effondre en
 * quinze jours ne soit pas conseillé sur des chiffres périmés.
 */
export const FRAICHEUR_JOURS = 7

export interface ProductAdvice {
  title: string | null
  verdict: string
  suppliers: string
  social: string
  marketplace: string
  sources: string[]
}

/**
 * Normalise l'adresse : c'est elle qui sert de clé de cache.
 *
 * Les paramètres de suivi changent à chaque partage — `utm_source`, `spm`,
 * `_t` — et deux liens vers la même fiche produiraient deux avis payants. Le
 * fragment et le `www.` disparaissent pour la même raison.
 */
export function normalizeUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null

    const jetables = /^(utm_|spm|scm|_t$|_bg|gclid|fbclid|ref$|refer|share|from$|sessionid)/i
    for (const cle of [...url.searchParams.keys()]) {
      if (jetables.test(cle)) url.searchParams.delete(cle)
    }

    url.hash = ''
    url.hostname = url.hostname.replace(/^www\./, '')
    url.protocol = 'https:'

    const chemin = url.pathname.replace(/\/+$/, '')
    return `${url.origin}${chemin}${url.search}`
  } catch {
    return null
  }
}

/** Lit le premier objet JSON du texte : le modèle l'enrobe parfois de prose. */
function parseJson(text: string): Record<string, unknown> {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return {}
  try {
    return JSON.parse(match[0])
  } catch {
    return {}
  }
}

function asString(value: unknown, defaut = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : defaut
}

const SYSTEM = [
  "Tu es chef de rayon dans une application française de dropshipping, et tu donnes un avis sur un produit dont le vendeur t'a collé l'adresse.",
  '',
  'Tu cherches sur le web avant de répondre. Tu ne réponds jamais de mémoire sur un prix, un volume ou une tendance :',
  "ces chiffres changent en quelques semaines, et un vendeur qui importe un produit sur un chiffre périmé perd de l'argent.",
  '',
  'Trois volets, et trois seulement :',
  "1. AVIS FOURNISSEURS — qui le vend en gros, dans quelle fourchette de prix, avec quels délais, et si l'offre est saturée",
  '   de revendeurs identiques. Dis franchement quand le produit est vendu partout au même prix : la marge y est déjà morte.',
  '2. AVIS RÉSEAUX — ce qui se voit sur TikTok, Instagram et Facebook : le produit tourne-t-il, depuis quand, sur quel angle,',
  '   et la vague est-elle montante ou déjà passée. Un produit qui a explosé il y a six mois est un piège.',
  "3. AVIS PLACES DE MARCHÉ — à combien il se vend réellement sur Amazon, Cdiscount, eBay, Vinted, et surtout ce que",
  '   reprochent les acheteurs dans les avis négatifs : ce sont les litiges que le vendeur héritera.',
  '',
  "N'invente aucun chiffre. Quand la recherche ne trouve pas, écris-le : « je n'ai pas trouvé » est une information utile,",
  'un chiffre inventé est une perte sèche. Cite tes sources.',
  '',
  "Ton verdict tranche en une ou deux phrases : ce produit vaut-il d'être importé, et à quelle condition.",
  "Tu es payé pour dire non quand c'est non.",
].join('\n')

export async function adviseOnProduct(url: string, rayon: string): Promise<ProductAdvice> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) throw new Error("L'assistant est momentanément indisponible.")

  const client = new Anthropic({ apiKey })
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 3000,
    system: SYSTEM,
    tools: [
      {
        type: 'web_search_20260209',
        name: 'web_search',
        max_uses: MAX_RECHERCHES,
        user_location: { type: 'approximate', country: 'FR' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Rayon concerné : ${rayon}.
Adresse du produit : ${url}

Cherche ce produit, puis réponds UNIQUEMENT en JSON valide, sans texte autour ni bloc de code :
{
  "title": "le nom du produit, tel que tu l'as trouvé",
  "verdict": "une ou deux phrases qui tranchent",
  "suppliers": "avis fournisseurs, quelques phrases",
  "social": "avis réseaux, quelques phrases",
  "marketplace": "avis places de marché, quelques phrases",
  "sources": ["https://..."]
}
Mets une chaîne vide dans un volet où tu n'as rien trouvé.`,
      },
    ],
  })

  const texte = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')

  const parsed = parseJson(texte)
  const absent = "Rien de concluant trouvé sur ce volet."

  return {
    title: asString(parsed.title) || null,
    verdict: asString(parsed.verdict, "Aucun avis n'a pu être formé sur ce produit."),
    suppliers: asString(parsed.suppliers, absent),
    social: asString(parsed.social, absent),
    marketplace: asString(parsed.marketplace, absent),
    sources: Array.isArray(parsed.sources)
      ? parsed.sources.filter((s): s is string => typeof s === 'string').slice(0, 12)
      : [],
  }
}
