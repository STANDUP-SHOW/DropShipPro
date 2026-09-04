import { MODELE_PUISSANT, modele } from './aiModels.js'
import Anthropic from '@anthropic-ai/sdk'
import { systemeCachable } from './chatBudget.js'
import type { Product } from '@prisma/client'

/**
 * Market analysis agent.
 *
 * Answers, for one product the seller already priced: who else sells it, at what
 * observed prices, shipped from where, in how long — and whether the intended
 * selling price holds up.
 *
 * Everything comes from web search with sources attached. No marketplace is
 * scraped: Amazon, Cdiscount and the others do not open their prices, and taking
 * them anyway is how an account gets closed. The consequence is stated plainly to
 * the seller — these are dated observations, not a price list.
 */
const MODEL = modele('AI_MODEL_ANALYSIS', MODELE_PUISSANT)

/** Caps the bill: each search is billed, and a runaway agent is a runaway invoice. */
const MAX_SEARCHES = 5

export interface MarketFinding {
  /** Where the product was seen for sale. */
  marketplace: string
  /** Observed price, in euros, as read on the page. */
  price: number | null
  url: string | null
}

export interface MarketAnalysis {
  /** Short verdict the seller reads first. */
  verdict: string
  /** Observed selling prices, lowest and highest, in euros. */
  priceLow: number | null
  priceHigh: number | null
  /** Price this agent would ask, given the purchase cost and what it observed. */
  suggestedPrice: number | null
  /** Typical delivery time seen, e.g. "10 à 20 jours". */
  deliveryTime: string | null
  /** Where it usually ships from. */
  origin: string | null
  /** How crowded the offer looks: 'faible' | 'moyenne' | 'forte'. */
  competition: string | null
  findings: MarketFinding[]
  /** Reasoning in plain French, shown under the verdict. */
  reasoning: string
  /** Sources actually consulted, so nothing has to be taken on trust. */
  sources: string[]
}

const SYSTEM_PROMPT = `Tu es analyste de marché pour des vendeurs français en dropshipping.

Ta mission : à partir d'une fiche produit, chercher sur le web où ce produit (ou son
équivalent le plus proche) est déjà vendu, à quels prix, expédié depuis où et en
combien de temps, puis dire au vendeur si son prix de vente tient la route.

Règles absolues :
- N'invente JAMAIS un prix, un délai ou une marketplace. Si tu n'as pas trouvé, tu
  le dis en mettant null, et tu l'expliques dans ton raisonnement.
- Ne donne que des prix que tu as réellement lus dans un résultat de recherche.
- Les prix sont en euros. Si tu lis un prix en dollars, convertis-le et dis-le.
- Concentre-toi sur le marché français : marketplaces et boutiques accessibles
  depuis la France.
- Ton raisonnement doit expliquer POURQUOI tu recommandes ce prix, pas seulement
  l'annoncer : marge obtenue, niveau de concurrence, délai de livraison qui pèse
  sur la décision d'achat.
- Sois honnête quand le produit est saturé ou quand la marge visée est intenable.
  Un vendeur préfère l'apprendre avant d'avoir publié.`

function client(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  return apiKey ? new Anthropic({ apiKey }) : null
}

/** Reads the outermost JSON object, the model sometimes wrapping it in prose. */
function parseJson(text: string): Record<string, unknown> {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return {}
  try {
    return JSON.parse(match[0])
  } catch {
    return {}
  }
}

function asNumber(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value.replace(',', '.')) : value
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export async function analyseProduct(product: Product): Promise<MarketAnalysis> {
  const anthropic = client()
  if (!anthropic) throw new Error("L'analyse de marché n'est pas disponible sur ce serveur.")

  const purchase = Number(product.price) + Number(product.shippingCost)
  const selling = Number(product.sellingPrice)

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: systemeCachable(SYSTEM_PROMPT),
    tools: [
      {
        type: 'web_search_20260209',
        name: 'web_search',
        max_uses: MAX_SEARCHES,
        user_location: { type: 'approximate', country: 'FR' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Produit à analyser :
Titre : ${product.aiTitle || product.title}
Description : ${(product.aiDescription || product.description || '').slice(0, 800)}
Prix d'achat du vendeur (produit + port fournisseur) : ${purchase.toFixed(2)} €
Prix de vente envisagé : ${selling.toFixed(2)} €

Cherche ce produit sur le web, puis réponds UNIQUEMENT en JSON valide, sans texte
autour ni bloc de code, avec exactement ce format :
{
  "verdict": "une phrase, le jugement d'ensemble",
  "priceLow": 0,
  "priceHigh": 0,
  "suggestedPrice": 0,
  "deliveryTime": "10 à 20 jours",
  "origin": "Chine",
  "competition": "faible|moyenne|forte",
  "findings": [{"marketplace": "Amazon", "price": 24.9, "url": "https://..."}],
  "reasoning": "deux à quatre phrases expliquant le prix conseillé",
  "sources": ["https://..."]
}
Mets null pour tout ce que tu n'as pas trouvé.`,
      },
    ],
  })

  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')

  const parsed = parseJson(text)

  const findings = Array.isArray(parsed.findings)
    ? parsed.findings
        .filter((f): f is Record<string, unknown> => Boolean(f) && typeof f === 'object')
        .map((f) => ({
          marketplace: asString(f.marketplace) ?? 'Inconnu',
          price: asNumber(f.price),
          url: asString(f.url),
        }))
        .slice(0, 12)
    : []

  return {
    verdict: asString(parsed.verdict) ?? "Analyse indisponible pour ce produit.",
    priceLow: asNumber(parsed.priceLow),
    priceHigh: asNumber(parsed.priceHigh),
    suggestedPrice: asNumber(parsed.suggestedPrice),
    deliveryTime: asString(parsed.deliveryTime),
    origin: asString(parsed.origin),
    competition: asString(parsed.competition),
    findings,
    reasoning: asString(parsed.reasoning) ?? '',
    sources: Array.isArray(parsed.sources)
      ? parsed.sources.filter((s): s is string => typeof s === 'string').slice(0, 12)
      : [],
  }
}
