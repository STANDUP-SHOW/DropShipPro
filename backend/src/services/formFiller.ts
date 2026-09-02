import { MODELE_REDACTION } from './aiModels.js'
import Anthropic from '@anthropic-ai/sdk'
import type { Product } from '@prisma/client'

let client: Anthropic | null = null
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return client
}

/** One form control as seen by the extension on the marketplace page. */
export interface FormField {
  ref: string
  label: string
  type: string
  placeholder?: string
  required?: boolean
  maxLength?: number
  /** Available choices for <select>, radio groups and combobox-style pickers. */
  options?: string[]
}

export interface FillAssignment {
  ref: string
  /** For a select/radio, this must be one of the field's own options, verbatim. */
  value: string
  reason: string
}

export interface FillPlan {
  assignments: FillAssignment[]
  /** Fields the model deliberately left alone, with why — surfaced to the user. */
  skipped: Array<{ ref: string; label: string; reason: string }>
}

const SYSTEM_PROMPT = `Tu remplis des formulaires de mise en vente sur des marketplaces
(Vinted, Leboncoin, eBay, Amazon, Cdiscount, La Redoute, Facebook Marketplace…).

On te donne une fiche produit et la liste des champs réellement présents sur la page.
Tu renvoies la valeur à saisir dans chaque champ.

Règles absolues :
- N'invente JAMAIS une information absente de la fiche produit. Si un champ demande
  une donnée que tu n'as pas (EAN, numéro de série, marque, poids, dimensions
  précises), laisse-le dans "skipped" avec la raison. Une donnée inventée fait
  rejeter l'annonce, ou pire, engage la responsabilité du vendeur.
- Pour un champ à choix (options fournies), la valeur DOIT être exactement l'une des
  options, copiée à l'identique. Si aucune ne correspond, mets le champ dans "skipped".
- Respecte maxLength : tronque proprement sur un mot entier plutôt que de dépasser.
- Choisis le champ le plus pertinent pour chaque donnée : le titre va dans le champ
  titre, pas dans la description.
- Les champs de type mot de passe, email, téléphone, adresse, carte bancaire ou
  identifiant ne doivent JAMAIS être remplis : mets-les dans "skipped".
- Le prix à saisir est le prix de revente, jamais le prix d'achat fournisseur.
- Un champ "État" / "Condition" doit TOUJOURS être rempli à partir du champ "etat" de
  la fiche : choisis l'option la plus proche parmi celles proposées. C'est un champ
  obligatoire sur la plupart des marketplaces, le laisser vide bloque le dépôt.
- Quand un champ de variante (taille, couleur) propose plusieurs valeurs et que la
  fiche en liste plusieurs, choisis la PREMIÈRE de la liste des variantes plutôt que
  de laisser le champ vide : le vendeur ajustera, mais le formulaire doit être
  déposable en l'état.`

/**
 * Asks Claude which value goes in which field of a marketplace listing form.
 *
 * This is what makes the extension work on any marketplace instead of needing a
 * hand-written selector map per site: the extension describes whatever form it
 * finds, and the model maps the product onto it. Hard-coded selectors break on
 * every redesign and would never scale to 19 destinations.
 */
export async function buildFillPlan(
  product: Product,
  platform: string,
  targetCategory: string,
  fields: FormField[],
): Promise<FillPlan> {
  const anthropic = getClient()
  if (!anthropic) {
    return {
      assignments: [],
      skipped: fields.map((f) => ({ ref: f.ref, label: f.label, reason: 'Clé API IA non configurée' })),
    }
  }

  const variants = (product.variants as Record<string, string[]> | null) ?? {}
  const attributes = (product.attributes as Record<string, string> | null) ?? {}
  const bulletPoints = (product.bulletPoints as string[] | null) ?? []

  const productSheet = {
    titre: product.aiTitle || product.title,
    description: product.aiDescription || product.description,
    arguments_de_vente: bulletPoints,
    attributs: attributes,
    variantes: variants,
    prix_de_revente: Number(product.sellingPrice).toFixed(2),
    devise: product.currency,
    categorie_cible: targetCategory,
    mots_cles: product.metaKeywords,
    etat: 'Neuf avec étiquette',
  }

  const message = await anthropic.messages.create({
    model: MODELE_REDACTION,
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Plateforme : ${platform}

FICHE PRODUIT :
${JSON.stringify(productSheet, null, 2)}

CHAMPS DU FORMULAIRE :
${JSON.stringify(fields, null, 2)}

Réponds UNIQUEMENT en JSON valide, sans texte autour :
{
  "assignments": [{"ref": "f3", "value": "...", "reason": "titre du produit"}],
  "skipped": [{"ref": "f9", "label": "EAN", "reason": "donnée absente de la fiche"}]
}`,
      },
    ],
  })

  const text = message.content.find((b) => b.type === 'text')?.text ?? '{}'
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  let parsed: any = {}
  try {
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {}
  } catch {
    parsed = {}
  }

  const byRef = new Map(fields.map((f) => [f.ref, f]))
  const assignments: FillAssignment[] = (Array.isArray(parsed.assignments) ? parsed.assignments : [])
    .filter((a: any) => a && typeof a.ref === 'string' && typeof a.value === 'string')
    .filter((a: any) => {
      const field = byRef.get(a.ref)
      if (!field) return false
      // Guard against a hallucinated option: a select can only receive one of its
      // own values, otherwise the site silently keeps its default.
      if (field.options?.length) return field.options.includes(a.value)
      return true
    })
    .map((a: any) => {
      const field = byRef.get(a.ref)!
      let value: string = a.value
      if (field.maxLength && value.length > field.maxLength) {
        value = value.slice(0, field.maxLength).replace(/\s+\S*$/, '')
      }
      return { ref: a.ref, value, reason: typeof a.reason === 'string' ? a.reason : '' }
    })

  const assignedRefs = new Set(assignments.map((a) => a.ref))
  const skipped = fields
    .filter((f) => !assignedRefs.has(f.ref))
    .map((f) => {
      const declared = (Array.isArray(parsed.skipped) ? parsed.skipped : []).find((s: any) => s?.ref === f.ref)
      return {
        ref: f.ref,
        label: f.label,
        reason: typeof declared?.reason === 'string' ? declared.reason : 'non renseigné',
      }
    })

  return { assignments, skipped }
}
