import Anthropic from '@anthropic-ai/sdk'
import { DEPARTMENTS, findDepartment, type DepartmentProfile } from './departments.js'
import { choisirModele, messagesPour, systemeCachable } from './chatBudget.js'
import { catalogueDuRayon, catalogueEnTexte } from './departmentCatalog.js'
import { executerOutilChef, OUTILS_CHEF } from './chefOutils.js'

/**
 * La conversation avec un chef de rayon.
 *
 * Deux exigences qui tirent dans le même sens : l'agent doit rester dans son
 * rayon, et une réponse hors rayon ne doit pas être facturée. Un vendeur qui
 * paie pour s'entendre dire « je ne m'occupe pas de ça » aurait raison de le
 * mal prendre.
 *
 * Le refus est donc décidé par le modèle lui-même, qui connaît son périmètre,
 * puis reconnu ici sur un marqueur explicite — plutôt que deviné à partir de la
 * formulation, qui varierait d'une réponse à l'autre.
 */

/** Le modèle préfixe ainsi toute réponse hors de son rayon. */
const OUT_OF_SCOPE = '[HORS-RAYON]'

export interface ChatTurn {
  role: 'user' | 'agent'
  content: string
}

export interface ChatAnswer {
  content: string
  /** Faux quand la question sortait du rayon : rien n'est décompté. */
  billed: boolean
  /** Vrai quand le modèle n'a pas pu être joint. Rien n'est décompté non plus. */
  failed: boolean
}

function systemPrompt(profile: DepartmentProfile, catalogue: string) {
  const others = DEPARTMENTS.filter((d) => d.key !== profile.key)
    .map((d) => `${d.agentName} (${d.label})`)
    .join(', ')

  return [
    `Tu es ${profile.agentName}, chef du rayon « ${profile.label} » dans une application de dropshipping française.`,
    `Ton périmètre : ${profile.focus}`,
    `Familles de produits que tu couvres : ${profile.covers.join(', ')}.`,
    '',
    'Tu réponds en français, brièvement et concrètement, comme un professionnel du secteur qui parle à un vendeur.',
    "Tu peux parler sourcing, marges, saisonnalité, concurrence, conformité, choix de marketplace et façon de présenter une annonce.",
    '',
    "Tu as de vrais outils : la recherche chez les fournisseurs reliés du vendeur, le sondage des prix pratiqués dans son catalogue, la liste des produits gagnants repérés par les enquêtes, et la recherche web pour inspecter le marché — tendances, prix constatés, concurrence. Sers-t'en dès que la question s'y prête, au lieu de dire que tu n'as pas accès. Cite tes sources web quand tu t'en sers.",
    "Quand le vendeur donne des critères (entrepôt Europe, livraison rapide ou gratuite, prix maximum), applique-les au tri des résultats et dis clairement ce que la source ne précise pas, sans le deviner.",
    "Si un outil répond qu'aucun fournisseur n'est relié ou qu'une liaison est refusée, transmets le geste exact au vendeur — c'est une vraie réponse, pas un échec.",
    '',
    "Si la question sort de ton rayon, commence ta réponse par le marqueur exact " +
      OUT_OF_SCOPE +
      ", puis dis en une phrase que tu ne t'occupes que de ton rayon, et nomme le collègue à embaucher.",
    `Les autres chefs de rayon disponibles : ${others}.`,
    '',
    "N'invente jamais un chiffre. Si tu ne connais pas un prix ou un volume, dis-le et explique comment le vérifier.",
    "Ne promets jamais une publication automatique : le vendeur valide toujours lui-même.",
  ].join('\n')
}

export async function askDepartment(
  departmentKey: string,
  agentName: string,
  history: ChatTurn[],
  question: string,
  /** Le vendeur, pour lui mettre son catalogue sous les yeux — et ses outils. */
  userId?: string,
  /** Le rayon en base, pour relire ses opportunités. */
  departmentId?: string,
): Promise<ChatAnswer> {
  const profile = findDepartment(departmentKey)
  if (!profile) {
    return { content: "Ce rayon n'existe plus.", billed: false, failed: true }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return {
      content: "L'assistant est momentanément indisponible. Réessayez dans quelques minutes.",
      billed: false,
      failed: true,
    }
  }

  /*
   * Le catalogue du rayon, avant d'écrire la consigne.
   *
   * Sans lui, le chef répondait « je n'ai aucun accès à votre catalogue » —
   * et il disait vrai. On lui demandait un avis de chef de rayon en lui cachant
   * le rayon.
   */
  let catalogue = ''
  if (userId) {
    try {
      const lignes = await catalogueDuRayon(userId, profile.key)
      catalogue = catalogueEnTexte(lignes, profile.label)
    } catch {
      // Une base lente ne doit pas empêcher de répondre : il conseillera sans
      // le catalogue, comme avant.
      catalogue = ''
    }
  }

  try {
    const client = new Anthropic({ apiKey })
    /*
     * L'inspection web, en plus des outils maison — la capacité que Malik
     * avait montrée dans ses rapports (analyse de marché, avis produit) sans
     * jamais l'avoir en conversation : « pourquoi n'en est-il plus capable ? »
     * (05/09/2026). Trois recherches au plus par question : le plafond
     * quotidien borne déjà le nombre de questions, ceci borne leur coût.
     */
    const outils: Anthropic.Messages.MessageCreateParams['tools'] = userId
      ? [
          ...OUTILS_CHEF,
          {
            type: 'web_search_20260209',
            name: 'web_search',
            max_uses: 3,
            user_location: { type: 'approximate', country: 'FR' },
          },
        ]
      : []
    const messages: Anthropic.MessageParam[] = messagesPour(history, question)

    /*
     * La boucle d'outils : le chef cherche, lit le résultat, puis répond.
     *
     * Trois tours au plus — un chef qui enchaîne les recherches sans conclure
     * coûte sans répondre. Chaque résultat d'outil vient du réel (fournisseurs
     * reliés, catalogue, opportunités déposées) : la règle « rien n'est
     * inventé » tient, chaque chiffre a désormais une source.
     */
    let response = await client.messages.create({
      // Le grand modèle dès que les outils sont branchés : arbitrer des
      // résultats de recherche n'est pas une question de fait.
      model: choisirModele(question, outils.length > 0),
      max_tokens: 1200,
      // Le prénom est celui figé à l'embauche, pas celui du catalogue : le
      // vendeur ne doit pas voir son interlocuteur changer de nom.
      system: systemeCachable(systemPrompt({ ...profile, agentName }, catalogue)),
      ...(outils.length ? { tools: outils } : {}),
      messages,
    })

    for (let tour = 0; tour < 3 && response.stop_reason === 'tool_use'; tour++) {
      const resultats: Anthropic.ToolResultBlockParam[] = []
      for (const bloc of response.content) {
        if (bloc.type !== 'tool_use') continue
        resultats.push({
          type: 'tool_result',
          tool_use_id: bloc.id,
          content: await executerOutilChef(
            userId!,
            departmentId ?? null,
            bloc.name,
            (bloc.input ?? {}) as Record<string, unknown>,
          ),
        })
      }
      messages.push({ role: 'assistant', content: response.content })
      messages.push({ role: 'user', content: resultats })
      response = await client.messages.create({
        model: choisirModele(question, true),
        max_tokens: 1200,
        system: systemeCachable(systemPrompt({ ...profile, agentName }, catalogue)),
        tools: outils,
        messages,
      })
    }

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim()

    if (!text) {
      return { content: "Je n'ai pas de réponse à vous donner.", billed: false, failed: true }
    }

    const outOfScope = text.startsWith(OUT_OF_SCOPE)
    return {
      content: outOfScope ? text.slice(OUT_OF_SCOPE.length).trim() : text,
      billed: !outOfScope,
      failed: false,
    }
  } catch (err) {
    console.error('chat de rayon indisponible', err)
    return {
      content: "L'assistant est momentanément indisponible. Réessayez dans quelques minutes.",
      billed: false,
      failed: true,
    }
  }
}
