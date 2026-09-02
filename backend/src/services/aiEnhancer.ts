import { MODELE_REDACTION, MODELE_RAPIDE, TARIFS, modele } from './aiModels.js'
import Anthropic from '@anthropic-ai/sdk'
import { trimToWords } from './channelCopy.js'

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
  /**
   * Le titre en trois longueurs, pour que chaque destination recoive la plus
   * longue qui tient chez elle. Ecrites dans le meme appel : aucun cout de plus.
   */
  titleVariants: { court: string; moyen: string; long: string }
  /**
   * False when the model could not be reached and the source text was kept.
   *
   * Without this the failure is invisible: the import succeeds, the listing looks
   * finished, and the seller is charged a credit for a rewrite that never
   * happened. The caller refunds on false and flags the listing.
   */
  enhanced: boolean
  /**
   * Pourquoi la réécriture n'a pas eu lieu, quand elle n'a pas eu lieu.
   *
   * Absent quand tout va bien. L'import l'écrit dans les remarques de l'annonce :
   * sans elle, vingt-cinq imports « réussis » peuvent tous porter le texte du
   * fournisseur sans que rien ne le dise — le crédit étant rendu, même le solde
   * ne trahit pas la panne.
   */
  raison?: string
}

/**
 * Which model runs which task.
 *
 * The rewrite is what sells the product, so it keeps the stronger model by
 * default. Extracting size and colour options out of page text is mechanical, and
 * Haiku does it for a third of the price — measured cost is dominated by output
 * tokens, so the task that writes least is also the one worth downgrading first.
 *
 * Both are overridable without a deploy: a bad surprise on quality is one
 * environment variable away from being reverted.
 */
const MODEL_ENHANCE = modele('AI_MODEL_ENHANCE', MODELE_REDACTION)
const MODEL_EXTRACT = modele('AI_MODEL_EXTRACT', MODELE_RAPIDE)

/**
 * Per-million token prices, to turn usage into euros in the logs.
 *
 * Prise de `aiModels.ts` : une table écrite ici ne connaît pas le modèle
 * réellement appelé le jour où il change, et rend alors un coût faux — donc une
 * marge fausse, ce qui est pire qu'un coût absent.
 */
const PRICES = TARIFS

/**
 * Logs what a call actually cost.
 *
 * The whole pricing model rests on this number, and it was estimated from
 * character counts until now. Reading it from usage turns an estimate into a
 * measurement, per import, in production.
 */
function logCost(task: string, model: string, usage: { input_tokens: number; output_tokens: number }) {
  const price = PRICES[model]
  if (!price) return console.log(`[ia] ${task} ${model} ${usage.input_tokens}+${usage.output_tokens} tokens`)

  const dollars = (usage.input_tokens * price.in + usage.output_tokens * price.out) / 1e6
  console.log(
    `[ia] ${task} ${model} ${usage.input_tokens} entree + ${usage.output_tokens} sortie = ${dollars.toFixed(5)}`,
  )
}

const SYSTEM_PROMPT = `Tu es un expert en référencement e-commerce sur les marketplaces françaises
(Amazon, Cdiscount, La Redoute, Leclerc, Kiabi, Vinted, eBay, Google Shopping).

Ton travail : à partir d'une fiche produit source (souvent mal rédigée, traduite
automatiquement du chinois), produire une annonce optimisée pour le classement dans
les moteurs de recherche internes des marketplaces.

Règles :
- Garde exactement le même produit et les mêmes caractéristiques réelles. N'invente
  jamais une matière, une dimension, une certification ou une marque absente de la source.
- **Ne mentionne JAMAIS le nom de la place de marché d'où vient la fiche** — Temu,
  AliExpress, Shein, Wish, JoyBuy, Alibaba, DHgate, Banggood — ni dans le titre, ni
  dans la description, ni dans les attributs, ni dans les mots-clés. Le vendeur
  revend ce produit sous sa propre enseigne : afficher le nom de son fournisseur
  lui coûte la vente et lui apprend à ses clients où acheter moins cher. Si la
  source en contient un, retire-le sans le remplacer par un autre.
- Écarte de la même façon tout ce qui appartient à la plateforme source et non au
  produit : ses garanties, ses délais de livraison, ses codes promotionnels, ses
  mentions « livraison gratuite », ses libellés de navigation. Le vendeur a ses
  propres conditions, et une promesse qui n'est pas la sienne se retourne contre
  lui au premier litige.
- Reformule entièrement : les marketplaces pénalisent le contenu dupliqué.
- Titre : 60 à 130 caractères, structure "Type de produit + caractéristiques clés +
  matière + public". Les mots les plus recherchés en premier. Pas de MAJUSCULES
  intempestives, pas d'emoji, pas de nom de marque inventé.
- Bullet points : 5 à 7 arguments de vente, un bénéfice concret par ligne, 80 à 200
  caractères chacun, commençant par 2-3 mots en capitales servant d'accroche.
- Caractéristiques techniques : c'est le point le plus important. La fiche source
  contient presque toujours des précisions qui font vendre — « bracelet acier
  inoxydable », « 22 rubis sur le cadran », « mouvement automatique », « étanche
  100 m », « 1200 tr/min », « batterie 5000 mAh », « certifié CE ». Elles sont
  souvent noyées dans un texte mal traduit, en liste ou en tableau. Tu les
  relèves TOUTES et tu les conserves : dans la description ET dans les attributs.
  En perdre une, c'est perdre l'argument qui décidait l'acheteur, et c'est la
  faute la plus grave que tu puisses commettre ici.
- Attributs : entre six et quinze, adaptés au produit réel — pas une grille de
  mode plaquée sur une montre ou une perceuse. Nomme-les avec les termes du
  métier concerné (Mouvement, Étanchéité, Puissance, Capacité, Autonomie,
  Matière du bracelet, Diamètre du boîtier, Compatibilité, Norme…). Utilise
  UNIQUEMENT ce qui figure dans la source. Si une information est absente, omets
  l'attribut plutôt que d'inventer.
- Mots-clés : 15 à 25, en français, incluant les variantes orthographiques et les
  requêtes longue traîne que taperait un acheteur. Séparés par des virgules.
- metaDescription : 150 à 160 caractères maximum.
- Titres courts : en plus du titre principal, écris-en deux versions raccourcies.
  Aucune destination n'accepte la même longueur — Amazon en prend deux cents et en
  veut soixante au minimum, Leboncoin coupe à cinquante — et un titre tronqué au
  milieu d'un mot perd justement le mot-clé qui fait vendre.
  • titleMedium : 80 caractères STRICTEMENT au maximum. Le type de produit, sa
    caractéristique décisive, son public.
  • titleShort : 50 caractères STRICTEMENT au maximum. Le type de produit et ce
    qui le distingue, rien d'autre. Pas de marque inventée, pas d'abréviation
    obscure : ce titre doit rester une phrase qu'un acheteur taperait.
  Compte les caractères. Un titre trop long est refusé par la plateforme.`

/**
 * L'annonce telle quelle, quand la réécriture n'a pas eu lieu.
 *
 * **Au niveau du module, et non dans une fermeture**, parce que `callModel` en a
 * besoin lui aussi : c'est là que se décide si une réponse tronquée ou illisible
 * doit être traitée comme un échec. Tant que ce repli n'existait qu'à
 * l'intérieur de `enhanceListing`, `callModel` n'avait pas d'autre choix que de
 * rendre `enhanced: true` sur une réponse qu'il n'avait pas su lire.
 */
function passthroughDe(input: { title: string; description: string }): EnhancedListing {
  return {
    title: input.title,
    description: input.description,
    metaTitle: input.title,
    metaDescription: input.description.slice(0, 155),
    metaKeywords: '',
    bulletPoints: [],
    attributes: {},
    titleVariants: {
      long: input.title,
      moyen: trimToWords(input.title, 80),
      court: trimToWords(input.title, 50),
    },
    enhanced: false,
  }
}

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
      model: MODEL_EXTRACT,
      max_tokens: 700,
      system:
        "Tu extrais les options d'achat d'une fiche produit à partir du texte visible de la page. " +
        "Ne renvoie que des options réellement proposées à la sélection : tailles, couleurs, matières, " +
        "capacités. N'invente rien, n'inclus pas les quantités, les prix, les avis ni les produits " +
        'recommandés. Si la page ne propose aucune option, renvoie un objet vide.',
      messages: [
        {
          role: 'user',
          // Huit mille caractères et non quatre mille : le sélecteur de tailles
          // est souvent sous la galerie, la description et le tableau de
          // caractéristiques — au-delà de la coupe précédente, donc invisible.
          content: `Texte de la page :\n${pageText.slice(0, 8000)}\n\nRéponds UNIQUEMENT en JSON valide, sans texte autour :\n{"Taille": ["S", "M", "L"], "Couleur": ["Noir", "Blanc"]}`,
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
  /**
   * Le texte de la page, d'où viennent les caractéristiques techniques.
   *
   * Sans lui, le modèle ne voyait que `og:description` — une accroche
   * commerciale de cent cinquante caractères. « Bracelet acier inoxydable » et
   * « 22 rubis sur le cadran » vivent dans le corps de la page, dans une liste
   * ou un tableau, et disparaissaient donc à chaque import. Le texte était
   * pourtant déjà relevé par l'extension : il ne servait qu'aux variantes.
   */
  pageText?: string | null
}): Promise<EnhancedListing> {
  /** Keeps the scraped copy when the model can't be reached. */
  const passthrough = () => passthroughDe(input)

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
    const statut = (err as { status?: number }).status
    const message = (err as Error).message?.slice(0, 200) ?? 'sans message'
    console.error(`amélioration IA indisponible (statut ${statut ?? 'aucun'}), texte source conservé: ${message}`)

    /*
     * Le repli garde la raison, au lieu de la perdre.
     *
     * Le 02/09/2026, vingt-deux annonces sur vingt-cinq sont sorties avec le
     * texte brut de Temu. Le vendeur voyait vingt-cinq imports réussis ; rien,
     * nulle part, ne disait qu'aucune n'avait été réécrite. Le crédit était
     * rendu — donc même le solde ne trahissait pas la panne.
     *
     * Un repli silencieux est pire qu'un échec : il produit un objet qui
     * ressemble au bon. La raison remonte donc jusqu'à l'import, qui l'écrit
     * dans les remarques de l'annonce.
     */
    return { ...passthrough(), raison: `${statut ? `erreur ${statut}` : 'appel impossible'} — ${message}` }
  }
}

async function callModel(
  anthropic: Anthropic,
  input: { title: string; description: string; category: string | null; pageText?: string | null },
): Promise<EnhancedListing> {

  const message = await anthropic.messages.create({
    model: MODEL_ENHANCE,
    /*
     * Huit mille, et non deux mille cinq cents.
     *
     * Ce que la consigne demande, compté : un titre, deux variantes, une
     * description de trois à cinq paragraphes (600 caractères au minimum, souvent
     * 1 500), sept arguments de 80 à 200 caractères, jusqu'à quinze attributs,
     * une méta-description et vingt-cinq mots-clés. En français, où un mot coûte
     * plus de jetons qu'en anglais, l'ensemble dépasse régulièrement trois mille
     * jetons — et le plafond était à deux mille cinq cents.
     *
     * La réponse se faisait donc couper au milieu du JSON. Le plafond était la
     * cause ; l'absence de contrôle sur `stop_reason` est ce qui l'a rendue
     * invisible pendant des semaines.
     *
     * Huit mille laisse de la marge sans risquer le délai d'attente d'une
     * requête non diffusée en flux : la réécriture la plus longue mesurée
     * atteint la moitié de ce plafond.
     */
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Titre source : ${input.title}
Catégorie : ${input.category ?? 'inconnue'}
Description source : ${input.description || '(aucune description)'}
${
  input.pageText?.trim()
    ? `\nTexte complet de la fiche fournisseur — c'est là que se trouvent les caractéristiques techniques, souvent en liste ou en tableau. Relève-les toutes :\n${input.pageText.slice(0, 12000)}\n`
    : ''
}

Réponds UNIQUEMENT en JSON valide, sans texte autour ni bloc de code, avec ce format exact :
{
  "title": "...",
  "titleMedium": "80 caracteres au plus",
  "titleShort": "50 caracteres au plus",
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

  logCost('reecriture', MODEL_ENHANCE, message.usage)

  const text = message.content.find((b) => b.type === 'text')?.text ?? '{}'
  // The model occasionally wraps the JSON in prose or a code fence despite the
  // instruction, so take the outermost object rather than parsing the raw reply.
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  let parsed: Record<string, unknown> = {}
  let echec: string | null = null

  /*
   * Une réponse tronquée est un échec, pas un résultat.
   *
   * **C'est la panne du 02/09/2026, et elle était invisible par construction.**
   * `max_tokens` valait 2 500 pour une consigne qui demande un titre, deux
   * variantes, une description de trois à cinq paragraphes, sept arguments de
   * 80 à 200 caractères, jusqu'à quinze attributs et vingt-cinq mots-clés. La
   * réponse dépassait, se faisait couper au milieu du JSON, `JSON.parse` levait,
   * et chaque champ retombait sur sa valeur de repli — c'est-à-dire sur le texte
   * du fournisseur.
   *
   * Le tout était rendu avec `enhanced: true`. Vingt-deux annonces sur
   * vingt-cinq sont donc sorties avec le texte brut de Temu, zéro attribut, zéro
   * argument, zéro mot-clé — **facturées, et déclarées réussies**. Ni note, ni
   * alerte, ni crédit rendu : rien ne distinguait ces annonces des bonnes.
   *
   * `stop_reason` le dit sans ambiguïté, et c'est le seul signal fiable : un
   * JSON coupé peut parfois se parser quand même, s'il l'est juste après une
   * accolade fermante.
   */
  if (message.stop_reason === 'max_tokens') {
    echec = `réponse tronquée à ${message.usage.output_tokens} jetons de sortie`
  }

  try {
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {}
  } catch (err) {
    echec = echec ?? `réponse illisible (${(err as Error).message.slice(0, 80)})`
  }

  /*
   * Et une réponse vide de tout contenu utile en est un aussi.
   *
   * Le modèle peut répondre un objet valide mais sans titre ni description —
   * refus, malentendu, page illisible. Les replis produiraient alors la même
   * annonce non réécrite, avec le même air de réussite.
   */
  if (!echec && typeof parsed.title !== 'string' && typeof parsed.description !== 'string') {
    echec = 'réponse sans titre ni description'
  }

  if (echec) {
    console.error(`[ia] reecriture ratee : ${echec}`)
    return { ...passthroughDe(input), raison: echec }
  }

  const description = typeof parsed.description === 'string' ? parsed.description : input.description

  const titreLong = typeof parsed.title === 'string' ? parsed.title : input.title

  /**
   * Les longueurs sont vérifiées ici, pas seulement demandées.
   *
   * « 50 caractères STRICTEMENT » ne suffit pas : un modèle compte mal, et un
   * titre de 54 caractères serait refusé par Leboncoin après avoir traversé
   * toute la chaîne. On raccourcit donc par mots — jamais au milieu d'un mot,
   * qui perdrait justement le mot-clé qui fait vendre.
   */
  const variante = (valeur: unknown, max: number, repli: string) =>
    trimToWords(typeof valeur === 'string' && valeur.trim() ? valeur : repli, max)

  return {
    // The model answered and the JSON parsed: this is a real rewrite.
    enhanced: true,
    title: titreLong,
    titleVariants: {
      long: titreLong,
      moyen: variante(parsed.titleMedium, 80, titreLong),
      court: variante(parsed.titleShort, 50, titreLong),
    },
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
