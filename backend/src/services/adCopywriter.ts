import { MODELE_PUISSANT, modele } from './aiModels.js'
import {
  MISES_EN_PAGE,
  MISES_EN_PAGE_DESCRIPTION,
  TYPOGRAPHIES,
  charteEnTexte,
  normaliserPalette,
  type CharteAd,
  type MiseEnPage,
  type Typographie,
} from './adCharte.js'
import Anthropic from '@anthropic-ai/sdk'

/**
 * La direction artistique d'une publicité : le texte ET le parti visuel.
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
 * **Ce qui change le 19/09/2026.** Max : « l'agent IA utilisé pour la création
 * des publicités doit être augmenté même si plus cher, je souhaite vraiment
 * quelque chose de très créatif, avec de beaux textes, de beaux designs ».
 * Deux corrections, et la seconde est la vraie :
 *
 * 1. **Le modèle passe de Haiku à Opus.** Trois phrases sous contrainte, c'est
 *    précisément le travail où un petit modèle rend du convenable et un grand
 *    rend du bon : il reste des mots, pas des pages, et la différence est
 *    entièrement dans le choix.
 * 2. **Le modèle ne se contente plus d'écrire, il dirige.** Il reçoit les
 *    couleurs du logo de la boutique et rend, avec l'accroche, la palette du
 *    visuel, sa mise en page et sa typographie. C'est la « création libre »
 *    demandée — bornée par une seule règle qui ne se négocie pas : le contraste
 *    est vérifié chez nous (`normaliserPalette`), parce qu'un modèle écrit
 *    volontiers un titre illisible avec beaucoup de goût.
 *
 * Ce qu'il ne décide jamais : le prix, le nom de la boutique, l'adresse. Ils
 * sont dessinés à partir des vraies données — un prix inventé est une promesse
 * qu'on ne tiendra pas.
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
  /** La charte du visuel, contraste vérifié : couleurs, mise en page, typographie. */
  charte: CharteAd
  /** Ce que le directeur artistique a voulu, en une ligne. Pour le vendeur. */
  note?: string
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
  { cle: 'scene', consigne: "Raconte l'instant précis où il sert, comme une scène vue de près." },
  { cle: 'objection', consigne: "Prends de front la raison qu'on aurait de ne pas l'acheter, et règle-la." },
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
  /** L'enseigne au nom de laquelle la publicité parle. */
  boutique?: string | null
  /** La charte déterministe : point de départ du modèle, et filet quand il rate. */
  charte: CharteAd
  /** Le dossier de design (styles, ambiances) tiré de la bibliothèque. */
  dossierDesign?: string | null
  /** Ce que le vendeur a dicté sur l'ambiance : jamais écrasé. */
  hint?: string | null
}

const CONSIGNE = [
  "Tu es directeur artistique et rédactrice publicitaire pour une boutique en ligne française.",
  "Tu conçois UN visuel : l'accroche imprimée par-dessus la photo du produit, et le parti pris graphique qui la porte.",
  '',
  "Réponds UNIQUEMENT par un objet JSON, sans texte autour :",
  '{"titre":"…","argument":"…","bouton":"…","miseEnPage":"…","typographie":"…","palette":{"fond":"#……","texte":"#……","sourd":"#……","accent":"#……","accent2":"#……"},"note":"…"}',
  '',
  'CONTRAINTES DE PLACE, elles ne se négocient pas :',
  '- titre : 45 caractères maximum. Une phrase, pas une liste de mots-clés.',
  '- argument : 40 caractères maximum. Un seul bénéfice.',
  "- bouton : 18 caractères maximum, à l'infinitif ou à l'impératif.",
  '- note : une phrase pour le vendeur, ce que tu as cherché à faire.',
  '',
  'RÈGLES DU TEXTE :',
  "- N'invente jamais un chiffre, un délai, une réduction ni un avis client.",
  "- Ne recopie pas le titre du produit : il est déjà connu de qui regarde la photo.",
  '- Pas de superlatif creux : « incroyable », « révolutionnaire », « le meilleur ».',
  "- Pas de point d'exclamation.",
  '',
  'RÈGLES DE LA PALETTE — tu es libre, et la liberté a un sens précis ici :',
  "- Pars des couleurs du logo de la boutique : la publicité doit se reconnaître comme la sienne.",
  '- Tu peux en tirer une gamme entière, foncer, éclaircir, chercher une complémentaire.',
  "  Une palette qui n'a aucun rapport avec le logo est un refus de la consigne, pas de l'audace.",
  '- Le fond est celui du bandeau posé par-dessus la photo : il doit tenir le texte.',
  "- Le titre doit se lire sur le fond : vise un contraste franc, jamais deux tons voisins.",
  "- L'accent porte le bouton : c'est le point le plus vif de l'image.",
  '- Six chiffres hexadécimaux, toujours : "#1b2430", jamais un nom de couleur.',
  '',
  'MISE EN PAGE — choisis celle qui sert ce produit et ce réseau :',
  ...MISES_EN_PAGE.map((m) => `- ${MISES_EN_PAGE_DESCRIPTION[m]}`),
  '',
  'TYPOGRAPHIE — quatre voix possibles :',
  '- moderne : sans-serif lourde, contemporaine. Le choix sûr.',
  "- affirme : condensée en capitales, très serrée. Promotion, sport, outillage, ce qui s'annonce fort.",
  '- elegant : serif de titre. Bijou, montre, parfum, décoration, gastronomie.',
  "- editorial : serif légère, presque un magazine. Mode, beauté, art de vivre, ce qui se raconte.",
].join('\n')

/**
 * Écrit l'accroche et dirige le visuel.
 *
 * **Rend toujours une charte.** Sans clé, sans réseau ou sur une réponse
 * illisible, elle retombe sur celle du logo, calculée sans appeler personne :
 * une publicité reste aux couleurs de la boutique même quand le modèle n'a pas
 * répondu. C'est la même leçon que la rotation des angles — une qualité qui
 * dépend d'un appel réseau n'est pas une qualité, c'est une option.
 *
 * `titre` à `null` signale en revanche que le texte n'a pas été écrit :
 * l'appelant retombe alors sur le titre de l'annonce, ce qui reste mieux que
 * rien, mais il doit le savoir.
 */
export async function ecrireAccroche(d: DemandeAccroche): Promise<Accroche | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  // Le premier angle non encore servi pour ce produit.
  const restants = ANGLES.filter((a) => !(d.dejaVus ?? []).includes(a.cle))
  const angle = (restants.length ? restants : ANGLES)[0]

  const contexte = [
    `ANGLE IMPOSÉ — ${angle.cle} : ${angle.consigne}`,
    TON[d.platform] ?? '',
    '',
    "L'IDENTITÉ DE LA BOUTIQUE :",
    d.boutique ? `Enseigne : ${d.boutique}.` : '',
    charteEnTexte(d.charte),
    d.hint ? `\nCONSIGNE DU VENDEUR, prioritaire sur tout le reste : ${d.hint}` : '',
    d.dossierDesign ? `\nPISTES DE DESIGN pour ce genre de commerce (inspiration, jamais un gabarit) :\n${d.dossierDesign}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const fiche = [
    `Produit : ${d.titre}`,
    d.categorie ? `Catégorie : ${d.categorie}` : '',
    `Prix affiché : ${d.prix}`,
    d.arguments?.length ? `Arguments de l'annonce : ${d.arguments.slice(0, 6).join(' · ')}` : '',
    d.description ? `Description : ${d.description.slice(0, 900)}` : '',
    '',
    contexte,
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const client = new Anthropic({ apiKey })
    const reponse = await client.messages.create({
      /*
       * Opus, et c'est une dépense assumée.
       *
       * Une publicité se paie 20 drops et sort une fois : quelques centimes de
       * modèle y sont invisibles, alors qu'ils se voient dans l'image. Ce n'est
       * pas le raisonnement du chemin d'import, où le même appel se répète sur
       * mille annonces — d'où `MODELE_REDACTION` là-bas et `MODELE_PUISSANT`
       * ici. La variable reste réglable sans redéployer.
       */
      model: modele('AI_MODEL_ADCOPY', MODELE_PUISSANT),
      max_tokens: 900,
      // Les instructions sont identiques d'une publicité à l'autre : mises en
      // cache, six visuels ne les relisent qu'une fois.
      system: [{ type: 'text' as const, text: CONSIGNE, cache_control: { type: 'ephemeral' as const } }],
      messages: [{ role: 'user', content: fiche }],
    })

    const texte = reponse.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')

    const brut = texte.match(/\{[\s\S]*\}/)
    if (!brut) return null

    const ecrit = JSON.parse(brut[0]) as {
      titre?: string
      argument?: string
      bouton?: string
      miseEnPage?: string
      typographie?: string
      palette?: unknown
      note?: string
    }
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
      charte: charteProposee(d.charte, ecrit),
      note: ecrit.note ? couperAuMot(ecrit.note, 160) : undefined,
    }
  } catch (err) {
    console.error('accroche publicitaire indisponible', err)
    return null
  }
}

/**
 * La charte retenue : celle du modèle, ramenée dans les limites du lisible.
 *
 * Une mise en page ou une typographie inconnue n'est pas une erreur à remonter
 * au vendeur : on garde celle qu'on avait choisie par rotation. Ce qui compte,
 * c'est qu'une réponse fantaisiste ne fasse jamais échouer une publicité déjà
 * payée.
 */
export function charteProposee(
  depart: CharteAd,
  ecrit: { miseEnPage?: string; typographie?: string; palette?: unknown },
): CharteAd {
  const miseEnPage = MISES_EN_PAGE.includes(ecrit.miseEnPage as MiseEnPage)
    ? (ecrit.miseEnPage as MiseEnPage)
    : depart.miseEnPage
  const typographie = TYPOGRAPHIES.includes(ecrit.typographie as Typographie)
    ? (ecrit.typographie as Typographie)
    : depart.typographie

  return {
    ...depart,
    miseEnPage,
    typographie,
    palette: ecrit.palette ? normaliserPalette(ecrit.palette, depart.palette) : depart.palette,
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
