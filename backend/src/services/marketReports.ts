/**
 * Les rapports de marché des 48 agents locaux — lecture du contrat, rien d'autre.
 *
 * **D'où ils viennent.** Chaque jour, 24 agents RAYON et 24 agents MARKETING
 * (n8n, sur la machine de Max, sans coût d'API) écrivent un rapport par
 * catégorie sur le thème du jour, dans `MARKET-ANALYSES/rapports/`. Un
 * déposeur les envoie ici par `POST /api/agent/market-reports`. Ce fichier
 * lit le Markdown selon le contrat de `MARKET-ANALYSES/README.md` et refuse
 * ce qui ne le respecte pas — parce que **la liste des 20 produits d'un rapport
 * rayon doit devenir une liste d'annonces importables**, et qu'un tableau mal
 * formé donnerait des annonces sans adresse ou sans prix.
 *
 * **Le découpage des agents est une donnée, pas du code** : `marketAgents.json`
 * (copie de `MARKET-ANALYSES/agents.json`, que n8n lit en local — le banc
 * `check-market-agents.ts` vérifie que les deux sont identiques). Un rapport
 * dont la catégorie ou le thème n'y figure pas est refusé : sinon une faute de
 * frappe dans un agent créerait une 25ᵉ catégorie que l'écran ne saurait pas
 * ranger.
 */
import agents from './marketAgents.json' with { type: 'json' }

export interface ThemeAgent {
  id: string
  nom: string
}

export interface CategorieAgent {
  id: string
  nom: string
  themes: ThemeAgent[]
}

export const CATEGORIES: CategorieAgent[] = (agents as { categories: CategorieAgent[] }).categories

export type TypeRapport = 'rayon' | 'marketing'

/** Une ligne du tableau des 20 produits, telle que l'écran et l'import la lisent. */
export interface ProduitRapport {
  rang: number
  titre: string
  fournisseur: string
  url: string
  prixAchat: number | null
  prixVente: number | null
  margePct: number | null
  /** api | url | extension — décide qui peut importer sans humain. */
  import: 'api' | 'url' | 'extension'
  pourquoi: string
}

export interface RapportLu {
  type: TypeRapport
  day: string
  categorie: string
  theme: string
  titre: string
  accroche: string | null
  sources: number
  body: string
  produits: ProduitRapport[]
}

export class RapportInvalide extends Error {}

export function categorieDe(id: string): CategorieAgent | null {
  return CATEGORIES.find((c) => c.id === id) ?? null
}

/** Le thème du jour d'une catégorie : jour de l'année modulo 7, comme dans agents.json. */
export function themeDuJour(categorie: CategorieAgent, date = new Date()): ThemeAgent {
  const debut = Date.UTC(date.getUTCFullYear(), 0, 1)
  const jour = Math.floor((date.getTime() - debut) / 86_400_000) + 1
  return categorie.themes[(jour - 1) % 7]
}

/** Lit un nombre écrit à la française (« 9,80 », « 24.90 », « 1 234,5 »). */
export function nombreFr(texte: string): number | null {
  const propre = (texte ?? '').replace(/[€%\s ]/g, '').replace(',', '.')
  if (!propre) return null
  const n = Number(propre)
  return Number.isFinite(n) ? n : null
}

function lireEnTete(md: string): { champs: Record<string, string>; reste: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(md)
  if (!m) throw new RapportInvalide("En-tête YAML absent : le rapport doit commencer par '---'.")
  const champs: Record<string, string> = {}
  for (const ligne of m[1].split(/\r?\n/)) {
    const i = ligne.indexOf(':')
    if (i < 0) continue
    champs[ligne.slice(0, i).trim()] = ligne.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
  return { champs, reste: md.slice(m[0].length) }
}

const MODES = new Set(['api', 'url', 'extension'])

/**
 * Le tableau des 20 produits : la ligne d'en-tête fixe l'ordre des colonnes.
 * On lit par NOM de colonne, pas par position — un agent qui ajoute une
 * colonne au milieu ne casse rien, un agent qui en oublie une est refusé.
 */
export function lireProduits(md: string): ProduitRapport[] {
  const lignes = md.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.startsWith('|'))
  if (lignes.length < 3) return []

  const entetes = lignes[0].split('|').slice(1, -1).map((c) => c.trim().toLowerCase())
  const col = (motifs: RegExp) => entetes.findIndex((e) => motifs.test(e))
  const iTitre = col(/^titre/)
  const iFourn = col(/^fournisseur$/)
  const iUrl = col(/url/)
  const iAchat = col(/achat/)
  const iVente = col(/vente/)
  const iMarge = col(/marge/)
  const iImport = col(/^import/)
  const iPourquoi = col(/pourquoi/)
  const manquantes = [
    ['Titre', iTitre],
    ['Fournisseur', iFourn],
    ['URL fournisseur', iUrl],
    ['Prix achat €', iAchat],
    ['Prix vente conseillé €', iVente],
    ['Import', iImport],
  ].filter(([, i]) => i === -1).map(([n]) => n)
  if (manquantes.length) {
    throw new RapportInvalide(`Tableau des produits : colonne(s) manquante(s) — ${manquantes.join(', ')}.`)
  }

  const produits: ProduitRapport[] = []
  for (const ligne of lignes.slice(2)) {
    const cases = ligne.split('|').slice(1, -1).map((c) => c.trim())
    if (cases.length < entetes.length) continue
    const url = cases[iUrl].replace(/^<|>$/g, '')
    if (!/^https?:\/\//.test(url)) continue
    const mode = cases[iImport].toLowerCase()
    produits.push({
      rang: produits.length + 1,
      titre: cases[iTitre],
      fournisseur: cases[iFourn],
      url,
      prixAchat: nombreFr(cases[iAchat]),
      prixVente: nombreFr(cases[iVente]),
      margePct: iMarge >= 0 ? nombreFr(cases[iMarge]) : null,
      import: (MODES.has(mode) ? mode : 'extension') as ProduitRapport['import'],
      pourquoi: iPourquoi >= 0 ? cases[iPourquoi] : '',
    })
  }
  return produits
}

/** Lit un rapport complet et le refuse s'il ne respecte pas le contrat. */
export function lireRapport(md: string): RapportLu {
  const { champs, reste } = lireEnTete(md)
  const type = champs.type as TypeRapport
  if (type !== 'rayon' && type !== 'marketing') {
    throw new RapportInvalide(`Type inconnu « ${champs.type ?? ''} » : rayon ou marketing.`)
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(champs.date ?? '')) {
    throw new RapportInvalide('Date absente ou mal formée (AAAA-MM-JJ).')
  }
  const categorie = categorieDe(champs.categorie ?? '')
  if (!categorie) throw new RapportInvalide(`Catégorie inconnue « ${champs.categorie ?? ''} » (voir agents.json).`)
  const theme = categorie.themes.find((t) => t.id === champs.theme)
  if (!theme) throw new RapportInvalide(`Thème inconnu « ${champs.theme ?? ''} » pour ${categorie.nom}.`)
  const titre = (champs.titre ?? '').trim()
  if (!titre) throw new RapportInvalide('Titre absent.')

  const body = reste.trim()
  if (body.length < 200) throw new RapportInvalide('Corps du rapport trop court pour être une analyse.')

  const produits = type === 'rayon' ? lireProduits(body) : []
  if (type === 'rayon' && produits.length < 5) {
    throw new RapportInvalide(`Rapport rayon : ${produits.length} produit(s) lisible(s), il en faut au moins 5 (20 attendus).`)
  }

  return {
    type,
    day: champs.date,
    categorie: categorie.id,
    theme: theme.id,
    titre,
    accroche: champs.accroche?.trim() || null,
    sources: Number(champs.sources) || 0,
    body,
    produits,
  }
}

/*
 * ---------------------------------------------------------------------------
 * Le rattachement rayon ↔ catégorie d'agents
 * ---------------------------------------------------------------------------
 *
 * Deux découpages coexistent, et ils ne sont pas les mêmes : les chefs de rayon
 * portent les 24 clés du référentiel de catégories (`departments.ts`), les 48
 * agents locaux portent les 24 catégories d'`agents.json`. « Électronique » d'un
 * côté, « Informatique » et « TV, son et photo » de l'autre.
 *
 * Sans table, le bloc « Analyses de marché » d'un rayon ne saurait pas quels
 * rapports lui reviennent, et un rapprochement par ressemblance de libellé
 * rangerait « Bijoux et montres » sous « Sacs et bagages » un jour sur deux.
 * La table est donc écrite à la main, et le banc `check-market-agents.ts`
 * vérifie ses trois bornes : toute clé citée est un vrai rayon, tout rayon lit
 * au moins une catégorie, et toute catégorie est lue par au moins un rayon —
 * sinon un rapport écrit chaque matin n'apparaîtrait nulle part, et l'écran
 * serait vide comme un jour sans dépôt.
 *
 * Un rayon peut lire plusieurs catégories ; une catégorie peut être lue par
 * plusieurs rayons (les motos lisent l'automobile).
 */
export const CATEGORIES_PAR_RAYON: Record<string, string[]> = {
  electronique: ['informatique', 'tv-son-photo'],
  'telephones-portables-et-accessoires': ['telephonie'],
  'appareils-electromenagers': ['electromenager'],
  'vetements-pour-femmes': ['mode-femme'],
  'vetements-pour-hommes': ['mode-homme'],
  chaussures: ['chaussures-maroquinerie'],
  'bijoux-et-accessoires': ['bijoux-montres'],
  'sacs-et-bagages': ['chaussures-maroquinerie'],
  'beaute-et-sante': ['beaute', 'sante-bien-etre'],
  'extensions-de-cheveux-et-perruques': ['beaute'],
  'outils-et-bricolage': ['bricolage'],
  'terrasse-pelouse-et-jardin': ['jardin'],
  meubles: ['meubles', 'maison-decoration', 'linge-de-maison', 'cuisine-table', 'salle-de-bain'],
  'arts-artisanat-et-couture': ['loisirs-creatifs'],
  'livres-et-medias': ['loisirs-creatifs'],
  'fournitures-de-bureau-et-scolaires': ['loisirs-creatifs'],
  'jouets-et-jeux': ['jouets-jeux'],
  'bebe-et-maternite': ['bebe-enfant'],
  'fournitures-pour-animaux-de-compagnie': ['animaux'],
  'sports-et-loisirs-de-plein-air': ['sport', 'voyage-plein-air'],
  automobile: ['automobile'],
  'motos-et-sports-motorises': ['automobile'],
  'commerce-industrie-et-science': ['bricolage'],
}

/** Les catégories d'agents lues par un rayon. Tableau vide si le rayon n'en couvre aucune. */
export function categoriesDuRayon(key: string): CategorieAgent[] {
  return (CATEGORIES_PAR_RAYON[key] ?? [])
    .map((id) => categorieDe(id))
    .filter((c): c is CategorieAgent => c !== null)
}

/*
 * ---------------------------------------------------------------------------
 * Les prompts publicitaires du rapport marketing
 * ---------------------------------------------------------------------------
 */

export interface PromptPub {
  /** image | video — la section d'où il vient. */
  genre: 'image' | 'video'
  /** Le format visé, première ligne du bloc : « TikTok 9:16 — 15 s ». */
  format: string | null
  texte: string
}

/**
 * Relève les prompts publicitaires d'un rapport marketing.
 *
 * Le contrat (MARKET-ANALYSES/README.md) les veut dans deux sections H2 —
 * « Prompts d'images publicitaires » et « Prompts de vidéos publicitaires » —
 * et chacun dans un bloc ``` autonome, copiable tel quel, avec le format visé
 * en première ligne derrière un `#`.
 *
 * **La section décide du genre, pas le texte du prompt.** Un prompt d'image qui
 * parle de mouvement resterait une image ; deviner au vocabulaire rangerait des
 * prompts sous le mauvais onglet sans que personne ne comprenne pourquoi.
 */
export function lirePrompts(body: string): PromptPub[] {
  const prompts: PromptPub[] = []
  let genre: 'image' | 'video' | null = null
  let dansBloc = false
  let courant: string[] = []

  const fermer = () => {
    const texte = courant.join('\n').trim()
    courant = []
    if (!texte || !genre) return
    const lignes = texte.split('\n')
    const entete = lignes[0].trim().startsWith('#') ? lignes[0].replace(/^#+\s*/, '').trim() : null
    prompts.push({ genre, format: entete || null, texte: entete ? lignes.slice(1).join('\n').trim() : texte })
  }

  for (const ligne of body.split(/\r?\n/)) {
    const titre = /^##\s+(.*)$/.exec(ligne.trim())
    if (titre && !dansBloc) {
      const t = titre[1].toLowerCase()
      if (/prompts?\s+d/.test(t) && /image/.test(t)) genre = 'image'
      else if (/prompts?\s+d/.test(t) && /vid/.test(t)) genre = 'video'
      else genre = null
      continue
    }
    if (/^\s*```/.test(ligne)) {
      if (dansBloc) fermer()
      dansBloc = !dansBloc
      continue
    }
    if (dansBloc) courant.push(ligne)
  }
  if (dansBloc) fermer()

  return prompts
}
