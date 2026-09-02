import { MODELE_RAPIDE } from './aiModels.js'
import Anthropic from '@anthropic-ai/sdk'

/**
 * Le brief d'une photo, écrit à partir de l'annonce.
 *
 * **Le défaut que ça corrige, signalé le 02/09/2026 :** « je regénère six
 * photos, elle me fait six fois la même ». Et pour cause — la boucle envoyait
 * six fois **exactement le même prompt**, avec les mêmes images de référence.
 * Un modèle d'image à qui l'on redemande la même chose rend la même chose ; il
 * n'y avait aucune raison qu'il en soit autrement.
 *
 * Le second défaut est du même ordre : le prompt ne connaissait que le titre.
 * Ni la description, ni les arguments de vente, ni les caractéristiques, ni
 * l'état. Une tronçonneuse et un flacon de parfum recevaient la même consigne —
 * « mise en situation réaliste » — et rendaient tous deux la photo du produit
 * sur un fond quelconque.
 *
 * Deux corrections, dans cet ordre d'importance :
 *
 * 1. **Un parti pris imposé, différent à chaque image.** C'est ce que fait déjà
 *    `adCopywriter` pour les accroches, et pour la même raison : demander de la
 *    variété sans dire de quoi elle est faite rend trois fois la même chose.
 *    Il est **déterministe** : même sans appel au modèle, six photos demandées
 *    donnent six mises en scène différentes.
 * 2. **L'annonce entière est lue**, et le modèle en tire une scène précise —
 *    le décor, la lumière, le cadrage, ce qui entoure le produit.
 *
 * Ce que le brief ne décide jamais : l'apparence du produit. Il est réel, il est
 * sur les photos de référence, et une scène qui le redessine vend autre chose
 * que ce qui sera livré.
 */

export interface PartiPris {
  cle: string
  consigne: string
}

/**
 * Les partis pris, dans l'ordre où on les sert.
 *
 * Ils décrivent **où et comment** le produit est montré, jamais ce qu'il est.
 * L'ordre n'est pas décoratif : les trois premiers conviennent à presque tout
 * produit, les suivants sont plus marqués. Six photos demandées d'affilée
 * doivent donner six images utilisables, pas trois bonnes et trois exercices de
 * style.
 */
export const PARTIS_PRIS: PartiPris[] = [
  {
    cle: 'usage',
    consigne:
      "Le produit en train de servir, dans le lieu où on s'en sert vraiment. Lumière naturelle, décor habité mais rangé, profondeur de champ courte. Des mains ou une silhouette peuvent apparaître si l'usage le demande, jamais un visage net.",
  },
  {
    cle: 'studio',
    consigne:
      "Prise de vue studio sur fond uni, teinte choisie pour faire ressortir le produit. Ombre portée douce et cohérente, léger reflet au sol. Rien d'autre dans le cadre.",
  },
  {
    cle: 'detail',
    consigne:
      "Gros plan serré sur la matière et la finition : grain, couture, texture, mécanisme. Le produit remplit le cadre, la mise au point est sur le détail qui prouve la qualité.",
  },
  {
    cle: 'composition',
    consigne:
      "Vue de dessus, à plat, sur une surface au caractère marqué (bois, lin, béton ciré, marbre). Deux ou trois objets du même univers posés autour, en retrait, sans jamais chevaucher le produit.",
  },
  {
    cle: 'ambiance',
    consigne:
      "Lumière rasante de fin de journée, contrastes marqués, arrière-plan flou et sombre. Une image d'atmosphère, où le produit est le seul élément net.",
  },
  {
    cle: 'echelle',
    consigne:
      "Le produit replacé dans son environnement complet, vu d'un peu plus loin, pour qu'on comprenne sa taille réelle et où il prend place.",
  },
]

export interface Brief {
  /** Le décor, en une phrase concrète. */
  scene: string
  /** La lumière et le rendu. */
  lumiere: string
  /** Cadrage et point de vue. */
  cadrage: string
  /** Ce qui entoure le produit, ou rien. */
  entourage: string
  /** Le parti pris retenu, gardé pour ne pas le reprendre. */
  partiPris: string
}

export interface DemandeBrief {
  titre: string
  description?: string | null
  arguments?: string[]
  attributs?: Record<string, string>
  categorie?: string | null
  /** Ce que le vendeur a dicté. Jamais écrasé. */
  hint?: string | null
  /** Les partis pris déjà servis pour ce produit. */
  dejaVus?: string[]
  /** Un visuel publicitaire réserve le tiers bas au texte. */
  pourPublicite?: boolean
}

const CONSIGNE = `Tu es directeur photo pour un catalogue de vente en ligne.

On te donne une annonce et un PARTI PRIS IMPOSÉ. Tu écris le brief d'UNE photo,
en français, sous forme d'objet JSON et rien d'autre :

{
  "scene": "le décor, en une phrase concrète et située",
  "lumiere": "la lumière et le rendu, une phrase",
  "cadrage": "point de vue, distance, orientation, une phrase",
  "entourage": "ce qui est visible autour du produit, ou \\"rien\\""
}

Règles :
- Respecte le parti pris imposé. C'est lui qui distingue cette photo des autres.
- Sois concret : « sur un établi en bois clair, copeaux au sol » vaut mieux que
  « dans un décor adapté ». Un décor vague donne une image vague.
- Déduis le décor de ce que l'annonce dit vraiment du produit : sa catégorie,
  ses matières, son usage. Une cafetière ne va pas en forêt.
- Ne décris JAMAIS le produit lui-même : ni sa couleur, ni sa forme, ni sa
  marque. Il existe, il est sur les photos de référence, et le redessiner
  ferait vendre autre chose que ce qui sera livré.
- Aucun texte, aucun logo, aucun prix, aucune personne reconnaissable.
- Quatre phrases courtes au total. C'est un brief, pas une nouvelle.`

/** Le parti pris à servir : le premier non encore utilisé pour ce produit. */
export function choisirPartiPris(dejaVus: string[] = []): PartiPris {
  const restants = PARTIS_PRIS.filter((p) => !dejaVus.includes(p.cle))
  return (restants.length ? restants : PARTIS_PRIS)[0]
}

/**
 * Écrit le brief.
 *
 * **Rend toujours quelque chose.** Sans clé, sans réseau ou sur une réponse
 * illisible, il retombe sur le parti pris seul — qui suffit déjà à ce que six
 * photos ne soient pas six fois la même. Une variété qui dépend d'un appel
 * réseau n'est pas une variété : c'est une option.
 */
export async function ecrireBrief(d: DemandeBrief): Promise<Brief> {
  const parti = choisirPartiPris(d.dejaVus)
  const repli: Brief = {
    scene: parti.consigne,
    lumiere: '',
    cadrage: '',
    entourage: '',
    partiPris: parti.cle,
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) return repli

  /*
   * L'annonce entière, et pas seulement son titre.
   *
   * C'est ce qui manquait : les arguments de vente et les caractéristiques
   * disent l'usage, la matière et le milieu du produit. « Étanche 5 ATM » ou
   * « bois de noyer massif » suffisent à décider d'un décor — le titre, jamais.
   */
  const attributs = Object.entries(d.attributs ?? {}).slice(0, 8)
  const fiche = [
    `Produit : ${d.titre}`,
    d.categorie ? `Catégorie : ${d.categorie}` : '',
    d.description ? `Description : ${d.description.slice(0, 700)}` : '',
    d.arguments?.length ? `Arguments de vente : ${d.arguments.slice(0, 6).join(' · ')}` : '',
    attributs.length ? `Caractéristiques : ${attributs.map(([k, v]) => `${k} = ${v}`).join(' · ')}` : '',
    '',
    `PARTI PRIS IMPOSÉ — ${parti.cle} : ${parti.consigne}`,
    d.hint ? `\nCONSIGNE DU VENDEUR, prioritaire sur tout le reste : ${d.hint}` : '',
    d.pourPublicite
      ? "\nCette photo servira de fond publicitaire : garde le tiers inférieur dégagé et sans détail important, il recevra le texte de l'offre."
      : '',
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const client = new Anthropic({ apiKey })
    const reponse = await client.messages.create({
      // Haiku suffit : quatre phrases sous contrainte. La consigne ne change
      // jamais, donc mise en cache — six photos ne la relisent qu'une fois.
      model: process.env.AI_MODEL_BRIEF?.trim() || MODELE_RAPIDE,
      max_tokens: 400,
      system: [{ type: 'text' as const, text: CONSIGNE, cache_control: { type: 'ephemeral' as const } }],
      messages: [{ role: 'user', content: fiche }],
    })

    const texte = reponse.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')

    const brut = texte.match(/\{[\s\S]*\}/)
    if (!brut) return repli

    const ecrit = JSON.parse(brut[0]) as Partial<Brief>
    if (!ecrit.scene) return repli

    return {
      scene: String(ecrit.scene),
      lumiere: String(ecrit.lumiere ?? ''),
      cadrage: String(ecrit.cadrage ?? ''),
      entourage: String(ecrit.entourage ?? ''),
      partiPris: parti.cle,
    }
  } catch {
    // Le brief est un confort, pas une condition : mieux vaut la photo du parti
    // pris seul qu'un crédit consommé pour une erreur.
    return repli
  }
}

/** Le brief, mis en phrases pour le modèle d'image. */
export function briefEnConsigne(b: Brief): string {
  return [
    `Décor : ${b.scene}`,
    b.lumiere ? `Lumière : ${b.lumiere}` : '',
    b.cadrage ? `Cadrage : ${b.cadrage}` : '',
    b.entourage && b.entourage.toLowerCase() !== 'rien' ? `Autour du produit : ${b.entourage}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}
