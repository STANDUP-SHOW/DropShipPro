import Anthropic from '@anthropic-ai/sdk'
import { catalogueThemes, themesPour, themeConnu, THEME_PAR_DEFAUT } from './themes.js'

/**
 * La vitrine écrite à partir de ce que le vendeur dit de son commerce.
 *
 * Ce qu'il tape — « je vends des bijoux en argent et des montres pour hommes,
 * plutôt haut de gamme » — ressort en un thème choisi, une accroche, un
 * sous-titre et un bandeau. C'est la promesse « une boutique en quelques
 * clics », et c'est tout ce qu'elle demande : un appel au modèle, pas une
 * génération de code.
 *
 * ## Pourquoi le modèle n'écrit que des réglages
 *
 * Il ne rend ni HTML, ni CSS, ni composant : un identifiant de thème pris dans
 * une liste fermée, et quatre phrases. Trois conséquences qui décident de tout :
 *
 * - **Ça coûte un appel de Haiku**, soit une fraction de centime, là où faire
 *   écrire une boutique coûterait des dizaines d'appels et une construction.
 * - **Le résultat est immédiat et réversible.** Rien à compiler, rien à
 *   déployer ; changer d'avis, c'est changer une ligne en base.
 * - **Le vendeur ne peut pas casser sa boutique.** Au pire elle est laide, et
 *   il regénère.
 *
 * ## Le choix du thème est borné, pas libre
 *
 * Les thèmes proposés au modèle sont **présélectionnés par secteur**
 * (`themesPour`). Lui donner les vingt et un, c'est le voir choisir « Pastel »
 * pour un vendeur de pièces automobiles une fois sur cinq — un modèle qui a le
 * choix finit toujours par prendre le mauvais, et c'est au moment où le vendeur
 * découvre sa boutique.
 */

export interface DemandeVitrine {
  /** Ce que le vendeur a écrit de son commerce. */
  description: string
  /** Le nom de la boutique, qui n'est pas à inventer. */
  nom: string
  /** Les rayons réellement présents dans son catalogue. */
  rayons: string[]
}

export interface VitrineProposee {
  themeId: string
  contenu: {
    accroche: string
    accrocheSuite: string
    sousTitre: string
    annonce: string
  }
  /** Pourquoi ce thème — montré au vendeur, qui a le droit de ne pas être d'accord. */
  raison: string
}

export class VitrineImpossible extends Error {}

/** Coupe au mot plutôt qu'à la lettre : « votre alli… » se lit, « votre all » se remarque. */
function couperAuMot(texte: string, max: number) {
  const propre = texte.trim().replace(/\s+/g, ' ')
  if (propre.length <= max) return propre
  const coupe = propre.slice(0, max)
  const espace = coupe.lastIndexOf(' ')
  return (espace > max * 0.6 ? coupe.slice(0, espace) : coupe).replace(/[,;:]$/, '')
}

const CONSIGNE = `Tu habilles la vitrine d'un marchand en ligne.

On te donne son nom de boutique, ce qu'il vend dans ses mots, ses rayons réels,
et une courte liste de thèmes possibles. Tu réponds UNIQUEMENT par un objet JSON :

{
  "themeId": "l'un des identifiants proposés, jamais un autre",
  "accroche": "première ligne du titre d'accueil",
  "accrocheSuite": "seconde ligne, mise en couleur",
  "sousTitre": "une phrase sous le titre",
  "annonce": "bandeau du haut, ou chaîne vide",
  "raison": "en une phrase, pourquoi ce thème"
}

Règles :
- Le titre se lit en deux lignes qui s'enchaînent. Première ligne 30 caractères
  au plus, seconde 30 au plus. Exemple : "Le bois, le noir," / "et votre allure."
- Le sous-titre dit ce qu'on vend et à qui, 160 caractères au plus. Pas de
  superlatif creux, pas de "leader", pas de "qualité premium".
- Le bandeau ne sert qu'à annoncer quelque chose de vrai : livraison offerte,
  nouvelle collection. Si le marchand n'a rien annoncé, renvoie "".
- N'invente ni promotion, ni délai, ni chiffre, ni garantie. Tu ne sais pas ce
  qu'il pratique.
- Écris en français, au vouvoiement, sans emoji.`

/**
 * Compose la vitrine.
 *
 * Rend `null` plutôt que de lever quand le modèle est indisponible : l'appelant
 * rend le crédit et le dit. Une erreur non rattrapée ici ferait perdre au
 * vendeur son crédit **et** son texte.
 */
export async function composerVitrine(d: DemandeVitrine): Promise<VitrineProposee | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) throw new VitrineImpossible("Le service d'écriture n'est pas configuré sur ce serveur.")

  const possibles = themesPour([...d.rayons, ...motsCles(d.description)])
  const catalogue = catalogueThemes().filter((t) => possibles.includes(t.id))
  // Le rapprochement peut ne rien trouver : mieux vaut proposer le généraliste
  // que de ne rien proposer du tout.
  const liste = catalogue.length ? catalogue : catalogueThemes().filter((t) => t.id === THEME_PAR_DEFAUT)

  const fiche = [
    `Boutique : ${d.nom}`,
    `Ce qu'il vend : ${d.description.slice(0, 700)}`,
    d.rayons.length ? `Rayons de son catalogue : ${d.rayons.slice(0, 12).join(', ')}` : '',
    '',
    'Thèmes possibles :',
    ...liste.map((t) => `- ${t.id} — ${t.nom}, mise en page « ${t.structure.nom} » (${t.structure.pour})`),
  ]
    .filter(Boolean)
    .join('\n')

  const client = new Anthropic({ apiKey })
  const reponse = await client.messages.create({
    // Haiku suffit : un choix dans une liste fermée et quatre phrases sous
    // contrainte. Les instructions ne changent jamais, donc mises en cache.
    model: process.env.AI_MODEL_VITRINE?.trim() || 'claude-haiku-4-5',
    max_tokens: 500,
    system: [{ type: 'text' as const, text: CONSIGNE, cache_control: { type: 'ephemeral' as const } }],
    messages: [{ role: 'user', content: fiche }],
  })

  const texte = reponse.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')

  const brut = texte.match(/\{[\s\S]*\}/)
  if (!brut) return null

  let ecrit: Record<string, string>
  try {
    ecrit = JSON.parse(brut[0])
  } catch {
    return null
  }
  if (!ecrit.accroche) return null

  /*
   * Le thème est vérifié, jamais cru sur parole.
   *
   * Le modèle invente un identifiant de temps en temps, ou en reprend un qui ne
   * lui était pas proposé. Écrire cette valeur donnerait une boutique qui
   * retombe silencieusement sur le thème par défaut — le vendeur croirait avoir
   * choisi, et verrait toujours l'autre.
   */
  const choisi = liste.some((t) => t.id === ecrit.themeId) && themeConnu(ecrit.themeId)
    ? ecrit.themeId
    : liste[0].id

  return {
    themeId: choisi,
    contenu: {
      // Les coupes sont faites ici et pas à l'affichage : un titre trop long
      // déborde du bandeau sur téléphone, et le modèle dépasse une fois sur cinq.
      accroche: couperAuMot(ecrit.accroche, 34),
      accrocheSuite: couperAuMot(ecrit.accrocheSuite ?? '', 34),
      sousTitre: couperAuMot(ecrit.sousTitre ?? '', 180),
      annonce: couperAuMot(ecrit.annonce ?? '', 90),
    },
    raison: couperAuMot(ecrit.raison ?? '', 160),
  }
}

/**
 * Les mots du texte libre qui peuvent désigner un secteur.
 *
 * Bête et volontairement : le rapprochement de thèmes est textuel, et faire
 * trancher le modèle sur ce point coûterait un appel de plus pour un choix que
 * quelques mots suffisent à faire. Les mots courts sont écartés — « de », « et »
 * rapprocheraient n'importe quel thème de n'importe quel commerce.
 */
function motsCles(texte: string): string[] {
  return texte
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9-]+/)
    .filter((m) => m.length >= 4)
    .slice(0, 30)
}
