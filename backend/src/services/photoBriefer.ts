import { MODELE_PUISSANT, modele } from './aiModels.js'
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
  {
    cle: 'geste',
    consigne:
      "Le produit saisi en plein geste : la main qui le prend, le referme, l'ouvre. Léger flou de mouvement sur ce qui bouge, le produit net. Rien d'autre dans le cadre que ce qui sert au geste.",
  },
  {
    cle: 'graphique',
    consigne:
      "Parti pris graphique assumé : fond uni et franc, un socle géométrique simple, ombre portée dure et dirigée. Une image de campagne, pas de catalogue.",
  },
  {
    cle: 'matiere',
    consigne:
      "Le produit posé sur la matière qui lui répond — pierre, tissu froissé, eau, bois brut, papier — vue de très près, en lumière rasante. Le décor tient dans une seule matière.",
  },
  {
    cle: 'avant-apres',
    consigne:
      "Le produit au milieu de ce qu'il remplace ou de ce qu'il range : l'ordre qu'il installe se lit dans le cadre, sans qu'aucun texte ne l'explique.",
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
  /** Les couleurs du décor — du décor, jamais du produit. */
  palette: string
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
  /** L'enseigne, quand la photo sert sa publicité. */
  marque?: string | null
  /**
   * Les tons de la marque, en mots et jamais en hexadécimal.
   *
   * Le modèle d'image lit mal un code couleur, et surtout il s'en servirait
   * pour REPEINDRE le produit — qui doit rester celui du colis. « des tons
   * ocre » décrit le décor ; « #c8873a » finit sur l'objet.
   */
  ambiance?: string | null
}

const CONSIGNE = `Tu es directeur photo pour une marque qui vend en ligne, et tu
travailles comme pour une campagne : une image qui se remarque, pas une fiche.

On te donne une annonce et un PARTI PRIS IMPOSÉ. Tu écris le brief d'UNE photo,
en français, sous forme d'objet JSON et rien d'autre :

{
  "scene": "le décor, en une phrase concrète et située",
  "lumiere": "la lumière et le rendu, une phrase",
  "cadrage": "point de vue, distance, orientation, une phrase",
  "entourage": "ce qui est visible autour du produit, ou \\"rien\\"",
  "palette": "les couleurs du DÉCOR, deux ou trois, nommées"
}

Règles :
- Respecte le parti pris imposé. C'est lui qui distingue cette photo des autres.
- Sois concret : « sur un établi en bois clair, copeaux au sol » vaut mieux que
  « dans un décor adapté ». Un décor vague donne une image vague.
- Déduis le décor de ce que l'annonce dit vraiment du produit : sa catégorie,
  ses matières, son usage. Une cafetière ne va pas en forêt.
- Choisis une vraie intention de lumière : d'où elle vient, ce qu'elle creuse,
  ce qu'elle laisse dans l'ombre. « Lumière naturelle » ne dit rien à personne.
- La palette est celle du DÉCOR et de la lumière. Quand les tons de la marque
  sont donnés, fais-les vivre dans le fond, la surface, un accessoire — jamais
  sur le produit.
- Ne décris JAMAIS le produit lui-même : ni sa couleur, ni sa forme, ni sa
  marque. Il existe, il est sur les photos de référence, et le redessiner
  ferait vendre autre chose que ce qui sera livré.
- Aucun texte, aucun logo, aucun prix, aucune personne reconnaissable.
- Cinq phrases courtes au total. C'est un brief, pas une nouvelle.`

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
    palette: d.ambiance ?? '',
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
    d.marque ? `Marque : ${d.marque}` : '',
    d.ambiance ? `Tons de la marque, pour le DÉCOR seulement : ${d.ambiance}` : '',
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
      /*
       * Opus, depuis le 19/09/2026, et c'est une dépense assumée.
       *
       * Max : « pareil pour le graphiste qui refait les photos produits, on
       * améliore le modèle ». Une photo se paie 18 drops et le modèle d'image
       * coûte déjà plusieurs centimes : quelques centimes de plus pour décider
       * de la scène sont le meilleur endroit où les mettre, parce que c'est là
       * que tout se joue. Un petit modèle rend « sur un fond neutre, lumière
       * douce » ; un grand rend une image qu'on regarde.
       *
       * La consigne ne change jamais, donc mise en cache — dix photos ne la
       * relisent qu'une fois.
       */
      model: modele('AI_MODEL_BRIEF', MODELE_PUISSANT),
      max_tokens: 700,
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
      palette: String(ecrit.palette ?? d.ambiance ?? ''),
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
    b.palette ? `Couleurs du décor (jamais du produit) : ${b.palette}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}
