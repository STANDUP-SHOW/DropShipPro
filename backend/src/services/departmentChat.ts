import Anthropic from '@anthropic-ai/sdk'
import { DEPARTMENTS, findDepartment, type DepartmentProfile } from './departments.js'

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

function systemPrompt(profile: DepartmentProfile) {
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

  try {
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 900,
      // Le prénom est celui figé à l'embauche, pas celui du catalogue : le
      // vendeur ne doit pas voir son interlocuteur changer de nom.
      system: systemPrompt({ ...profile, agentName }),
      messages: [
        ...history.slice(-10).map((t) => ({
          role: t.role === 'user' ? ('user' as const) : ('assistant' as const),
          content: t.content,
        })),
        { role: 'user' as const, content: question },
      ],
    })

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
