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
}

/**
 * Remixes the source title/description with Claude: keeps the same product and
 * theme but rewrites the wording so listings aren't flagged as duplicate content
 * across platforms, and derives SEO meta fields at the same time.
 */
export async function enhanceListing(input: {
  title: string
  description: string
  category: string | null
}): Promise<EnhancedListing> {
  const anthropic = getClient()
  if (!anthropic) {
    // No API key configured yet: pass through the scraped text unchanged so the
    // rest of the pipeline (watermark, publish) still works end to end.
    return {
      title: input.title,
      description: input.description,
      metaTitle: input.title,
      metaDescription: input.description.slice(0, 155),
      metaKeywords: '',
    }
  }

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `Tu es un rédacteur e-commerce. Réécris ce titre et cette description produit en gardant exactement le même objet, les mêmes caractéristiques et le même thème, mais avec une formulation différente (pour éviter le duplicate content). Ajoute aussi des métadonnées SEO.

Titre source: ${input.title}
Catégorie: ${input.category ?? 'inconnue'}
Description source: ${input.description || '(aucune description)'}

Réponds UNIQUEMENT en JSON valide, sans texte autour, avec ce format exact:
{"title": "...", "description": "...", "metaTitle": "...", "metaDescription": "...", "metaKeywords": "mot1, mot2, mot3"}`,
      },
    ],
  })

  const text = message.content.find((b) => b.type === 'text')?.text ?? '{}'
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {}

  return {
    title: parsed.title || input.title,
    description: parsed.description || input.description,
    metaTitle: parsed.metaTitle || parsed.title || input.title,
    metaDescription: parsed.metaDescription || (parsed.description || input.description).slice(0, 155),
    metaKeywords: parsed.metaKeywords || '',
  }
}
