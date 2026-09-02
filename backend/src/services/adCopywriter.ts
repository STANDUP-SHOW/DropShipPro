import { MODELE_RAPIDE, modele } from './aiModels.js'
import Anthropic from '@anthropic-ai/sdk'

/**
 * L'accroche d'une publicité, écrite plutôt que recopiée.
 *
 * Le défaut que ça corrige, signalé le 26/08/2026 : trois publicités
 * commandées, trois publicités identiques, « aucune force de vente ». Et pour
 * cause — le composeur posait le titre de l'annonce sur la photo. Or un titre
 * d'annonce et une accroche publicitaire ne font pas le même métier.
 *
 * « Montre automatique acier inoxydable 22 rubis » est un bon titre : il se
 * cherche, il se compare, il dit ce qu'on achète. Comme accroche, il ne dit rien
 * à personne qui ne cherchait pas déjà une montre.
 *
 * Ce que le modèle écrit ici : une accroche courte, un bénéfice, un bouton. Et
 * **un angle différent à chaque demande** — c'est ce qui fait qu'une deuxième
 * publicité n'est pas la copie de la première.
 */

export interface Accroche {
  /** La phrase qui arrête le pouce. Deux lignes au plus, une de préférence. */
  titre: string
  /** Le bénéfice, sous le prix. Une ligne, jamais deux. */
  argument: string
  /** Le texte du bouton, en deux ou trois mots. */
  bouton: string
  /** L'angle retenu, gardé pour ne pas le reprendre à la publicité suivante. */
  angle: string
}

/**
 * Les angles, dans l'ordre où on les essaie.
 *
 * Une liste fermée plutôt qu'un « sois créatif » : demander de la variété à un
 * modèle sans lui dire de quoi elle est faite donne trois formulations du même
 * argument. En imposant l'angle, la deuxième publicité est vraiment différente
 * de la première — pas seulement reformulée.
 */
export const ANGLES = [
  { cle: 'probleme', consigne: "Pars du problème que le produit règle, pas du produit." },
  { cle: 'benefice', consigne: 'Promets le résultat concret, ce que la vie devient après.' },
  { cle: 'preuve', consigne: "Appuie sur une caractéristique vérifiable de la fiche, celle qui impressionne." },
  { cle: 'urgence', consigne: "Joue la rareté ou le bon moment, sans jamais inventer une promotion." },
  { cle: 'identite', consigne: "Parle à qui l'achète : « pour celles et ceux qui… »." },
  { cle: 'comparaison', consigne: 'Oppose-le à la solution habituelle, sans nommer de marque.' },
] as const

/** Ce que chaque réseau attend, en une ligne. */
const TON: Record<string, string> = {
  facebook: 'Facebook : phrase directe, un public large, plutôt 35-65 ans.',
  instagram: 'Instagram : court, visuel, un ton qui se lit en une seconde.',
  'instagram-story': 'Story Instagram : trois ou quatre mots, plein écran, lu en passant.',
  tiktok: 'TikTok : ton parlé, tutoiement, comme une phrase dite à voix haute.',
  snapchat: 'Snapchat : très court, jeune, familier.',
  google: 'Google Display : factuel et clair, on cherchait déjà quelque chose.',
}

export interface DemandeAccroche {
  titre: string
  description?: string | null
  /** Les arguments déjà rédigés pour l'annonce, s'il y en a. */
  arguments?: string[]
  prix: string
  categorie?: string | null
  platform: string
  /** Les angles déjà servis pour ce produit, à ne pas reprendre. */
  dejaVus?: string[]
}

/**
 * Écrit une accroche, ou rend `null`.
 *
 * `null` n'est pas un échec silencieux : l'appelant retombe sur le titre de
 * l'annonce, ce qui reste mieux que rien. Mais il doit le savoir, parce qu'une
 * publicité sans accroche est précisément ce qu'on cherche à ne plus produire.
 */
export async function ecrireAccroche(d: DemandeAccroche): Promise<Accroche | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  // Le premier angle non encore servi pour ce produit.
  const restants = ANGLES.filter((a) => !(d.dejaVus ?? []).includes(a.cle))
  const angle = (restants.length ? restants : ANGLES)[0]

  const consigne = [
    "Tu es rédactrice publicitaire pour une boutique en ligne française.",
    "Tu écris l'accroche qui sera imprimée sur un visuel, par-dessus la photo du produit.",
    '',
    "Réponds UNIQUEMENT par un objet JSON, sans texte autour :",
    '{"titre":"…","argument":"…","bouton":"…"}',
    '',
    'CONTRAINTES DE PLACE, elles ne se négocient pas :',
    '- titre : 45 caractères maximum. Une phrase, pas une liste de mots-clés.',
    '- argument : 40 caractères maximum. Un seul bénéfice.',
    '- bouton : 18 caractères maximum, à l\'infinitif ou à l\'impératif.',
    '',
    'RÈGLES :',
    "- N'invente jamais un chiffre, un délai, une réduction ni un avis client.",
    "- Ne recopie pas le titre du produit : il est déjà connu de qui regarde la photo.",
    '- Pas de superlatif creux : « incroyable », « révolutionnaire », « le meilleur ».',
    "- Pas de point d'exclamation.",
    '',
    `ANGLE IMPOSÉ — ${angle.cle} : ${angle.consigne}`,
    TON[d.platform] ?? '',
  ]
    .filter(Boolean)
    .join('\n')

  const fiche = [
    `Produit : ${d.titre}`,
    d.categorie ? `Catégorie : ${d.categorie}` : '',
    `Prix affiché : ${d.prix}`,
    d.arguments?.length ? `Arguments de l'annonce : ${d.arguments.slice(0, 6).join(' · ')}` : '',
    d.description ? `Description : ${d.description.slice(0, 900)}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const client = new Anthropic({ apiKey })
    const reponse = await client.messages.create({
      // Haiku suffit : trois phrases courtes sous contrainte. Les instructions
      // sont identiques d'une publicité à l'autre, donc mises en cache.
      model: modele('AI_MODEL_ADCOPY', MODELE_RAPIDE),
      max_tokens: 300,
      system: [{ type: 'text' as const, text: consigne, cache_control: { type: 'ephemeral' as const } }],
      messages: [{ role: 'user', content: fiche }],
    })

    const texte = reponse.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')

    const brut = texte.match(/\{[\s\S]*\}/)
    if (!brut) return null

    const ecrit = JSON.parse(brut[0]) as { titre?: string; argument?: string; bouton?: string }
    if (!ecrit.titre) return null

    /*
     * La coupe est faite ici, pas laissée au composeur.
     *
     * Le modèle dépasse la limite une fois sur cinq, et un titre trop long
     * passait sur trois lignes puis mordait le prix. Couper au mot le plus
     * proche vaut mieux que couper au caractère : « Rangez enfin votre ate… »
     * se lit, « Rangez enfin votre atel » se remarque.
     */
    return {
      titre: couperAuMot(ecrit.titre, 45),
      argument: couperAuMot(ecrit.argument ?? '', 40),
      bouton: couperAuMot(ecrit.bouton ?? 'Découvrir', 18),
      angle: angle.cle,
    }
  } catch (err) {
    console.error('accroche publicitaire indisponible', err)
    return null
  }
}

/** Coupe une phrase à la limite, sur un mot entier. */
function couperAuMot(texte: string, max: number): string {
  const propre = texte.trim().replace(/\s+/g, ' ').replace(/[!]+/g, '')
  if (propre.length <= max) return propre

  const coupe = propre.slice(0, max)
  const espace = coupe.lastIndexOf(' ')
  return `${(espace > max * 0.6 ? coupe.slice(0, espace) : coupe).replace(/[\s.,;:]+$/, '')}…`
}
