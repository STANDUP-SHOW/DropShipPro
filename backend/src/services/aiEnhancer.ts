import Anthropic from '@anthropic-ai/sdk'

let client: Anthropic | null = null
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return client
}

export interface EnhancedListing {
  title: string
  description: string
  metaTitle: string
  metaDescription: string
  metaKeywords: string
  /** Short selling points — Amazon, Cdiscount and most Mirakl operators index these. */
  bulletPoints: string[]
  /** Structured attributes marketplaces turn into search filters (matière, coupe, saison…). */
  attributes: Record<string, string>
}

const SYSTEM_PROMPT = `Tu es un expert en référencement e-commerce sur les marketplaces françaises
(Amazon, Cdiscount, La Redoute, Leclerc, Kiabi, Vinted, eBay, Google Shopping).

Ton travail : à partir d'une fiche produit source (souvent mal rédigée, traduite
automatiquement du chinois), produire une annonce optimisée pour le classement dans
les moteurs de recherche internes des marketplaces.

Règles :
- Garde exactement le même produit et les mêmes caractéristiques réelles. N'invente
  jamais une matière, une dimension, une certification ou une marque absente de la source.
- Reformule entièrement : les marketplaces pénalisent le contenu dupliqué.
- Titre : 60 à 130 caractères, structure "Type de produit + caractéristiques clés +
  matière + public". Les mots les plus recherchés en premier. Pas de MAJUSCULES
  intempestives, pas d'emoji, pas de nom de marque inventé.
- Bullet points : 5 à 7 arguments de vente, un bénéfice concret par ligne, 80 à 200
  caractères chacun, commençant par 2-3 mots en capitales servant d'accroche.
- Attributs : le maximum d'attributs factuels déductibles de la source (matière,
  couleur principale, coupe, saison, style, public visé, type de col, entretien,
  occasion, motif, longueur de manche…). Utilise UNIQUEMENT ce qui est déductible.
  Si une information est absente, omets l'attribut plutôt que d'inventer.
- Mots-clés : 15 à 25, en français, incluant les variantes orthographiques et les
  requêtes longue traîne que taperait un acheteur. Séparés par des virgules.
- metaDescription : 150 à 160 caractères maximum.`

/**
 * Reads sizes and colours out of the page text.
 *
 * DOM heuristics fail on these sites: class names are obfuscated and the option
 * pickers have no stable structure. The visible text does contain the choices, so
 * the model extracts them from it. Returns null rather than guessing when the
 * page shows no options.
 */
export async function extractVariants(pageText: string): Promise<Record<string, string[]> | null> {
  const anthropic = getClient()
  if (!anthropic || !pageText.trim()) return null

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 700,
      system:
        "Tu extrais les options d'achat d'une fiche produit à partir du texte visible de la page. " +
        "Ne renvoie que des options réellement proposées à la sélection : tailles, couleurs, matières, " +
        "capacités. N'invente rien, n'inclus pas les quantités, les prix, les avis ni les produits " +
        'recommandés. Si la page ne propose aucune option, renvoie un objet vide.',
      messages: [
        {
          role: 'user',
          content: `Texte de la page :\n${pageText.slice(0, 4000)}\n\nRéponds UNIQUEMENT en JSON valide, sans texte autour :\n{"Taille": ["S", "M", "L"], "Couleur": ["Noir", "Blanc"]}`,
        },
      ],
    })

    const text = message.content.find((b) => b.type === 'text')?.text ?? '{}'
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null

    const parsed = JSON.parse(match[0]) as Record<string, unknown>
    const clean: Record<string, string[]> = {}
    for (const [name, values] of Object.entries(parsed)) {
      if (!Array.isArray(values)) continue
      const list = values.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).slice(0, 25)
      if (list.length > 1) clean[name] = list
    }
    return Object.keys(clean).length ? clean : null
  } catch (err) {
    console.error('extraction des variantes indisponible:', (err as Error).message)
    return null
  }
}

/**
 * Rewrites the scraped listing with Claude and derives everything marketplaces rank
 * on: an SEO title, bullet points, structured attributes and long-tail keywords.
 */
export async function enhanceListing(input: {
  title: string
  description: string
  category: string | null
}): Promise<EnhancedListing> {
  /** Keeps the scraped copy when the model can't be reached. */
  const passthrough = (): EnhancedListing => ({
    title: input.title,
    description: input.description,
    metaTitle: input.title,
    metaDescription: input.description.slice(0, 155),
    metaKeywords: '',
    bulletPoints: [],
    attributes: {},
  })

  const anthropic = getClient()
  // No API key configured: pass the scraped text through so the rest of the
  // pipeline (watermark, publish) still works end to end.
  if (!anthropic) return passthrough()

  try {
    return await callModel(anthropic, input)
  } catch (err) {
    // An expired, revoked or over-quota key must not destroy the import: the
    // product is still worth keeping, and the seller can rewrite it by hand or
    // relaunch the enhancement once the key is fixed.
    console.error("amélioration IA indisponible, texte source conservé:", (err as Error).message)
    return passthrough()
  }
}

async function callModel(
  anthropic: Anthropic,
  input: { title: string; description: string; category: string | null },
): Promise<EnhancedListing> {

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 2500,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Titre source : ${input.title}
Catégorie : ${input.category ?? 'inconnue'}
Description source : ${input.description || '(aucune description)'}

Réponds UNIQUEMENT en JSON valide, sans texte autour ni bloc de code, avec ce format exact :
{
  "title": "...",
  "description": "3 à 5 paragraphes courts",
  "bulletPoints": ["MATIÈRE PREMIUM : ...", "..."],
  "attributes": {"Matière": "...", "Couleur": "...", "Coupe": "...", "Saison": "...", "Style": "...", "Public": "..."},
  "metaTitle": "...",
  "metaDescription": "...",
  "metaKeywords": "mot1, mot2, mot3"
}`,
      },
    ],
  })

  const text = message.content.find((b) => b.type === 'text')?.text ?? '{}'
  // The model occasionally wraps the JSON in prose or a code fence despite the
  // instruction, so take the outermost object rather than parsing the raw reply.
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  let parsed: Record<string, unknown> = {}
  try {
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {}
  } catch {
    parsed = {}
  }

  const description = typeof parsed.description === 'string' ? parsed.description : input.description

  return {
    title: typeof parsed.title === 'string' ? parsed.title : input.title,
    description,
    metaTitle: typeof parsed.metaTitle === 'string' ? parsed.metaTitle : (parsed.title as string) || input.title,
    metaDescription:
      typeof parsed.metaDescription === 'string' ? parsed.metaDescription.slice(0, 160) : description.slice(0, 155),
    metaKeywords: typeof parsed.metaKeywords === 'string' ? parsed.metaKeywords : '',
    bulletPoints: Array.isArray(parsed.bulletPoints)
      ? parsed.bulletPoints.filter((b): b is string => typeof b === 'string')
      : [],
    attributes:
      parsed.attributes && typeof parsed.attributes === 'object' && !Array.isArray(parsed.attributes)
        ? Object.fromEntries(
            Object.entries(parsed.attributes as Record<string, unknown>)
              .filter(([, v]) => typeof v === 'string' && v.trim())
              .map(([k, v]) => [k, (v as string).trim()]),
          )
        : {},
  }
}
