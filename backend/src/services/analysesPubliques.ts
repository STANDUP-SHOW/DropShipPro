/**
 * Les rapports des agents en PAGES publiques — /analyses/…
 *
 * Demandé par Max le 23/09/2026 : « tous nos rapports, analyses, prompts,
 * produits gagnants créent du contenu et des pages ; ces pages sont très mal
 * référençables ; je veux des pages statiques dans le sitemap, que notre
 * référencement s'enrichisse de nos données journalières ». Les 48 agents
 * écrivent chaque jour ; c'est le seul contenu du site qui se renouvelle, et
 * c'est précisément ce que les moteurs et les assistants cherchent.
 *
 * Tout ici est PUR : des données vers du HTML, sans base ni requête, pour que
 * le banc `check-analyses-publiques.ts` éprouve exactement ce qui est servi.
 * La lecture en base est dans `routes/analysesPubliques.ts`.
 *
 * Ce qui est public et ce qui ne l'est pas — la ligne est nette : l'analyse
 * entière l'est, le tableau des produits gagnants aussi (titre, prix de vente
 * conseillé, pourquoi), mais **ni le fournisseur (nom ou adresse) ni le prix
 * d'achat**, pas même glissés par l'agent dans le texte « pourquoi » : c'est ce que les rapports du jour offrent
 * aux comptes à 500 drops (`routes/marketReports.ts`), et c'est la valeur qui
 * fait ouvrir un compte. Le corps Markdown du rapport rayon contient ce tableau
 * avec ses adresses : il n'est jamais rendu tel quel, la section des produits
 * est remplacée par le rendu bridé.
 *
 * Adresses :
 *   /analyses/                                       toutes les catégories, dernier jour
 *   /analyses/<categorie>/                           l'archive d'une catégorie
 *   /analyses/<theme>/<sujet-tiré-du-titre>/                un rapport (rayon ou marketing), comme un article
 *   (les formes <categorie>/<AAAA-MM-JJ>/<theme>/[marketing/] et <categorie>/<sujet>-<date>/ redirigent en 301)
 *   /analyses/<AAAA-MM-JJ>/                          l'édition du jour : toutes les analyses et leurs produits gagnants
 *   /analyses/sitemap.xml
 */
import { createHash } from 'node:crypto'
import { CATEGORIES, categorieDe, type ProduitRapport } from './marketReports.js'

export const SITE = 'https://www.drop-shipper.fr'
const NOM = 'DropShipper IA'

export interface PromptPublic {
  genre: 'image' | 'video'
  format: string | null
  texte: string
}

export interface RapportPublic {
  id: string
  day: string
  categorie: string
  /** Le nom lisible, tel que la base le connaît (agents.json, ou le rapport lui-même). */
  categorieNom: string
  theme: string
  themeNom: string
  type: 'rayon' | 'marketing'
  titre: string
  /** Le titre du jour (champ facultatif `titre_du_jour` du rapport) : quand il existe, il devient le titre et l'adresse. */
  une?: string | null
  /** L'extrait percutant (accroche ou « Opportunité principale ») qui complète l'adresse. */
  extrait?: string | null
  accroche: string | null
  body: string
  produits: ProduitPublic[]
  /** Rapport marketing : ses prompts publicitaires image et vidéo. */
  prompts: PromptPublic[]
  sources: number
  updatedAt: Date
}

export function esc(texte: unknown): string {
  return String(texte ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** « Meilleurs accessoires d'intérieur pour voiture » → « meilleurs-accessoires-d-interieur-pour-voiture ». */
export function slugTitre(titre: string, max = 70): string {
  const slug = titre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (slug.length <= max) return slug
  return slug.slice(0, max + 1).replace(/-[^-]*$/, '')
}

const MOTS_OUTILS = /(-(en|de|du|des|le|la|les|pour|et|a|au|aux|sur|d|l|un|une|avec))+$/
/** Un mot-outil ne termine pas un sujet (« …-casques-bluetooth-de »), ni l'année en suffixe orphelin. */
function nettoyer(slug: string, annee: string): string {
  return slug.replace(new RegExp(`-(en-|de-)?${annee}$`), '').replace(MOTS_OUTILS, '')
}

export const SUJET_MAX = 100
const OUTILS = new Set(['a', 'au', 'aux', 'avec', 'd', 'de', 'des', 'du', 'en', 'et', 'l', 'la', 'le', 'les', 'pour', 'sur', 'un', 'une'])

/**
 * Le sujet d'un rapport, pour son adresse (Max, 03/10/2026 : « titre de
 * l'analyse et extrait percutant de l'analyse en question ») :
 *  - le titre du jour quand le rapport en porte un, seul ;
 *  - sinon le titre, puis l'extrait percutant sans les mots déjà dits ;
 *  - sinon le titre seul.
 * « ordinateurs-pour-ia-en-mode-local-egpu-docks-oculink-thunderbolt-5-… ».
 */
export function sujetRapport(r: Pick<RapportPublic, 'day' | 'theme' | 'titre' | 'une' | 'extrait'>): string {
  const annee = r.day.slice(0, 4)
  if (r.une) return nettoyer(slugTitre(r.une, SUJET_MAX), annee) || r.theme
  const titre = nettoyer(slugTitre(r.titre, 70), annee) || r.theme
  if (!r.extrait) return titre
  const dits = new Set(titre.split('-'))
  const reste = slugTitre(r.extrait, 200)
    .split('-')
    .filter((m) => m && !dits.has(m) && !OUTILS.has(m))
    .join('-')
  if (!reste) return titre
  return nettoyer(slugTitre(`${titre}-${reste}`, SUJET_MAX), annee) || titre
}

type Adressable = Pick<RapportPublic, 'id' | 'categorie' | 'day' | 'theme' | 'type' | 'titre' | 'une' | 'extrait'>

/**
 * Les adresses attribuées, rapport par rapport. Ni catégorie ni date dans
 * l'adresse (Max, 03/10/2026 : « aucun intérêt en référencement ») : deux
 * rapports du même thème peuvent donc porter le même sujet (le rayon et le
 * marketing du 20/09 en informatique, par exemple). Le PREMIER publié garde
 * l'adresse nue, les suivants prennent -2, -3… dans l'ordre de publication :
 * une adresse donnée ne change pas quand un nouveau rapport arrive.
 * La date reste dans la page et dans datePublished, pas dans l'adresse.
 */
let attribuees = new Map<string, string>()

function calculerAdresses(rapports: Adressable[]): Map<string, string> {
  const prises = new Set<string>()
  const carte = new Map<string, string>()
  const rang = (r: Adressable) => `${r.day}|${r.type === 'rayon' ? 0 : 1}|${r.id}`
  const ordre = [...rapports].sort((a, b) => (rang(a) < rang(b) ? -1 : 1))
  for (const r of ordre) {
    const base = `/analyses/${r.theme}/${sujetRapport(r)}`
    let choix = `${base}/`
    for (let n = 2; prises.has(choix); n++) choix = `${base}-${n}/`
    prises.add(choix)
    carte.set(r.id, choix)
  }
  return carte
}

export function attribuerAdresses(rapports: Array<Adressable & { importeDrive?: boolean }>): void {
  attribuees = calculerAdresses(rapports)
  // Header-less Drive imports were titled by their bare theme until 12/10/2026
  // (/analyses/lavage-sechage/lavage-sechage-2/). Those addresses were in the
  // sitemap: replay that attribution and send each one to the current address.
  anciennes = new Map()
  if (!rapports.some((r) => r.importeDrive)) return
  const avant = calculerAdresses(rapports.map((r) => (r.importeDrive ? { ...r, titre: r.theme, une: null, extrait: null } : r)))
  const actuelles = new Set(attribuees.values())
  for (const r of rapports) {
    const ancienne = avant.get(r.id)
    if (r.importeDrive && ancienne && ancienne !== attribuees.get(r.id) && !actuelles.has(ancienne)) anciennes.set(ancienne, r.id)
  }
}

let anciennes = new Map<string, string>()
/** The report an old Drive-import address (bare theme as title) stood for, if any. */
export function rapportAncienneAdresse(chemin: string): string | null {
  return anciennes.get(chemin) ?? null
}

/** Le rapport qui porte cette adresse, s'il y en a un (après attribuerAdresses). */
export function rapportA(chemin: string): string | null {
  for (const [id, c] of attribuees) if (c === chemin) return id
  return null
}

/**
 * L'adresse d'un rapport, comme un article : le thème, puis le sujet —
 * /analyses/interieur/meilleurs-accessoires-d-interieur-pour-voiture/.
 * Les formes précédentes (catégorie/date/thème, puis catégorie/sujet-date)
 * redirigent ici en 301 (routes/analysesPubliques.ts).
 */
export function cheminRapport(r: Adressable): string {
  return attribuees.get(r.id) ?? `/analyses/${r.theme}/${sujetRapport(r)}/`
}

/** La forme du 03/10/2026 au soir (PR #25), gardée pour les redirections. */
export function cheminArticleDate(r: Pick<RapportPublic, 'categorie' | 'day' | 'theme' | 'type' | 'titre'>): string {
  const sujet =
    slugTitre(r.titre)
      .replace(new RegExp(`-${r.day.slice(0, 4)}$`), '')
      .replace(/(-(en|de|du|des|le|la|les|pour|et|a|au|aux|sur|d|l))+$/, '') || r.theme
  return `/analyses/${r.categorie}/${sujet}${r.type === 'marketing' ? '-marketing' : ''}-${r.day}/`
}

/** L'ancienne adresse (jusqu'au 03/10/2026), gardée pour les redirections. */
export function ancienCheminRapport(r: Pick<RapportPublic, 'categorie' | 'day' | 'theme' | 'type'>): string {
  return `/analyses/${r.categorie}/${r.day}/${r.theme}/${r.type === 'marketing' ? 'marketing/' : ''}`
}

/** L'édition d'un jour, comme un journal : /analyses/2026-09-18/. */
export function cheminJour(day: string): string {
  return `/analyses/${day}/`
}

export function cheminCategorie(id: string): string {
  return `/analyses/${id}/`
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

export function dateLongue(day: string): string {
  const [a, m, j] = day.split('-').map(Number)
  return `${j} ${MOIS[m - 1] ?? ''} ${a}`
}

/** 18/09/2026 : la date longue mangeait vingt caractères de chaque titre. */
export function dateCourte(day: string): string {
  const [a, m, j] = day.split('-')
  return `${j}/${m}/${a}`
}

/**
 * Le <title> d'un rapport : le premier qui tient en 65 caractères, du plus
 * complet au plus sobre. L'audit du 03/10/2026 en trouvait 40 trop longs
 * (« titre — 11 produits gagnants automobile (18 septembre 2026) »), et un
 * « 0 produits gagnants » quand le rapport n'en structurait aucun.
 */
export const TITRE_MAX = 65
export function titreRapport(r: Pick<RapportPublic, 'titre' | 'type' | 'day' | 'produits'>): string {
  const t = r.titre.trim()
  const d = dateCourte(r.day)
  const n = r.produits.length
  const candidats =
    r.type === 'rayon'
      ? n ? [`${t} : ${n} produits (${d})`] : [`${t} (${d})`]
      : [`${t} : analyse marketing (${d})`, `${t} : marketing (${d})`, `${t} (${d})`]
  const tient = candidats.find((c) => c.length <= TITRE_MAX)
  if (tient) return tient
  // A long rayon title keeps its count, like the short ones (12/10/2026).
  const suffixe = r.type === 'rayon' && n ? ` : ${n} produits (${d})` : ` (${d})`
  const place = TITRE_MAX - suffixe.length - 1
  return `${t.slice(0, place).replace(/[\s,:;—-]+\S*$/, '')}…${suffixe}`
}

/** Le résumé d'une ligne de liste : le nombre de produits seulement s'il y en a. */
function resumeRapport(r: Pick<RapportPublic, 'type' | 'produits'>): string {
  if (r.type === 'marketing') return 'analyse marketing, prompts image et vidéo'
  return r.produits.length ? `${r.produits.length} produits gagnants` : 'analyse de marché'
}

function nomCategorie(id: string): string {
  return categorieDe(id)?.nom ?? id
}

// --- Markdown → HTML, échappé -------------------------------------------------

function hote(adresse: string): string {
  try {
    return new URL(adresse).hostname.replace(/^www\./, '')
  } catch {
    return adresse
  }
}

/** Gras, code, liens et adresses nues ; tout le reste est du texte échappé. */
function enLigne(texte: string): string {
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\((https?:\/\/[^)\s]+)\)|https?:\/\/[^\s)<]+)/g
  let out = ''
  let i = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(texte))) {
    out += esc(texte.slice(i, m.index))
    const t = m[0]
    if (t.startsWith('**')) out += `<strong>${esc(t.slice(2, -2))}</strong>`
    else if (t.startsWith('`')) out += `<code>${esc(t.slice(1, -1))}</code>`
    else if (t.startsWith('[')) out += `<a href="${esc(m[2])}" rel="nofollow noopener" target="_blank">${esc(t.slice(1, t.indexOf('](')))}</a>`
    // A bare address reads as its site name: an URL as anchor text says nothing (audit of 03/10/2026).
    else out += `<a href="${esc(t)}" rel="nofollow noopener" target="_blank">${esc(hote(t))}</a>`
    i = m.index + t.length
  }
  return out + esc(texte.slice(i))
}

/**
 * Le sous-ensemble dont un rapport a besoin : paragraphes, listes, tableaux,
 * blocs de code (les prompts), titres H3. Les H2 ne sont pas rendus ici : la
 * page découpe le rapport sur les H2 (`blocsDe`) et titre chaque bloc.
 */
export function markdownEnHtml(texte: string): string {
  const lignes = texte.replace(/\r\n/g, '\n').split('\n')
  const sortie: string[] = []
  let i = 0
  while (i < lignes.length) {
    const l = lignes[i]
    if (!l.trim()) {
      i++
      continue
    }
    if (l.startsWith('```')) {
      const corps: string[] = []
      i++
      while (i < lignes.length && !lignes[i].startsWith('```')) corps.push(lignes[i++])
      i++
      const etiquette = corps[0]?.trim().startsWith('#') ? corps.shift()!.replace(/^#+\s*/, '').trim() : null
      sortie.push(
        `<figure class="prompt">${etiquette ? `<figcaption>${esc(etiquette)}</figcaption>` : ''}<pre>${esc(corps.join('\n'))}</pre></figure>`,
      )
      continue
    }
    if (l.trim().startsWith('|')) {
      const rangs: string[] = []
      while (i < lignes.length && lignes[i].trim().startsWith('|')) rangs.push(lignes[i++].trim())
      const cellules = (r: string) => r.split('|').slice(1, -1).map((c) => c.trim())
      const entetes = cellules(rangs[0])
      const corps = rangs.slice(2).map(cellules)
      sortie.push(
        `<div class="tableau"><table><thead><tr>${entetes.map((e) => `<th>${enLigne(e)}</th>`).join('')}</tr></thead><tbody>${corps
          .map((r) => `<tr>${r.map((c) => `<td>${enLigne(c)}</td>`).join('')}</tr>`)
          .join('')}</tbody></table></div>`,
      )
      continue
    }
    if (/^#{3,}\s/.test(l)) {
      sortie.push(`<h3>${enLigne(l.replace(/^#+\s*/, ''))}</h3>`)
      i++
      continue
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
      const items: string[] = []
      const ordonnee = /^\s*\d+\./.test(l)
      while (i < lignes.length && /^\s*([-*]|\d+\.)\s+/.test(lignes[i])) items.push(lignes[i++].replace(/^\s*([-*]|\d+\.)\s+/, ''))
      sortie.push(`<${ordonnee ? 'ol' : 'ul'}>${items.map((it) => `<li>${enLigne(it)}</li>`).join('')}</${ordonnee ? 'ol' : 'ul'}>`)
      continue
    }
    const para: string[] = []
    while (i < lignes.length && lignes[i].trim() && !/^(```|\||#{2,}\s|\s*([-*]|\d+\.)\s)/.test(lignes[i])) para.push(lignes[i++])
    if (para.length) sortie.push(`<p>${enLigne(para.join(' '))}</p>`)
    else i++
  }
  return sortie.map((l) => (l.trim().startsWith('|') || l.trim().startsWith('```') ? l : parenthesesEquilibrees(l))).join('\n')
}

/** A dropped clause can take its « ( » with it (« Fiche /item/ vérifiée, à convertir) »): an unmatched parenthesis goes. */
export function parenthesesEquilibrees(l: string): string {
  if (!/[()]/.test(l) || l.includes('](')) return l
  // A numbered item (« 1) ») keeps its marker.
  const puce = /^\s*(?:\d+|[a-z])\)\s+/i.exec(l)?.[0] ?? ''
  if (puce) return puce + parenthesesEquilibrees(l.slice(puce.length))
  const garde = new Set<number>()
  const ouvertes: number[] = []
  for (let i = 0; i < l.length; i++) {
    if (l[i] === '(') ouvertes.push(i)
    else if (l[i] === ')' && ouvertes.length) { garde.add(ouvertes.pop()!); garde.add(i) }
    // « 1) », « a) » : an inline enumeration, not a stray parenthesis.
    else if (l[i] === ')' && /(?:^|[\s(:;,])(?:\d{1,2}|[a-zA-Z])$/.test(l.slice(0, i))) garde.add(i)
  }
  return [...l].filter((c, i) => (c !== '(' && c !== ')') || garde.has(i)).join('')
}

/** Le rapport découpé sur ses H2. */
export function blocsDe(body: string): Array<{ titre: string; corps: string }> {
  const blocs: Array<{ titre: string; corps: string }> = []
  let courant = { titre: '', corps: '' }
  for (const ligne of body.replace(/\r\n/g, '\n').split('\n')) {
    const h2 = /^##\s+(.*)$/.exec(ligne)
    if (h2) {
      if (courant.titre || courant.corps.trim()) blocs.push(courant)
      courant = { titre: h2[1].trim(), corps: '' }
    } else courant.corps += `${ligne}\n`
  }
  if (courant.titre || courant.corps.trim()) blocs.push(courant)
  return blocs
}

/**
 * Un tableau de produits glissé AILLEURS que sous son H2 « Produits » — sous un
 * H3 « 16 produits proposés » au milieu de l'analyse, comme le rapport bricolage
 * du 18/09/2026 — passait au travers de `estBlocProduits` : prix d'achat et
 * adresses fournisseur en clair sur une page publique. Tout tableau dont l'en-tête
 * nomme un fournisseur, un prix d'achat ou une adresse est retiré, avec le titre
 * qui l'annonce.
 */
const ENTETE_PRIVEE = /fournisseur|achat|co[uû]t|marge|\broi\b|prix\s*max|\burl\b|\blien/i

/**
 * Sections that are about buying, whole (« Analyse sourcing », « Battle sheet
 * achat / revente », « Sources », which lists supplier pages). Other agents'
 * full reports carry them since 12/10/2026; they stay in the connected space.
 */
const SECTION_PRIVEE = /sourcing|battle|achat|fournisseur|^\s*(\d+\s*[.)]\s*)?sources?\s*$/i

/**
 * A sentence that names a supplier or a buying figure. The analysis text of an
 * imported report said « l'achat unitaire AliExpress est perdant » on a public
 * page (12/10/2026): Max's rule covers every section, not only the « Pourquoi »
 * column. « Faire » and « Wish » are left out: in French prose they are words.
 */
const FOURNISSEUR_NOMME =
  /aliexpress|alibaba|\b1688\b|cj\s?drop|cjdropshipping|\btemu\b|\bshein\b|bigbuy|\baccio\b|dhgate|banggood|spocket|zendrop|syncee|vidaxl|made[-\s]in[-\s]china|global\s?sources|taobao|joybuy|lightinthebox|ankorstore|fournisseur/i
// « achat » alone is the shopper's purchase (« 51 % des achats sont déclenchés par une panne »), not ours.
const TERME_ACHAT = /prix\s*(d['’ ]?)?achat|achat\s*(unitaire|en\s*lot|group[ée]|local)|co[uû]t|marge|\broi\b|revient|\brendue?s?\b|transport compris|[ée]chantillon|\bfret\b|achat\s*(à|a|de|pour)\s*\d|€\s*d['’]\s*achat|\bachet[ée]e?s?\s+(au|à|en|chez)\b|d[ée]placement/i
const MONTANT = /\d\s*(€|eur\b|euros?\b)|€\s*\d/i
const MARGE_PCT = /(marge|\broi\b)[^.;]{0,40}\d\s*%|\d\s*%[^.;]{0,20}(de\s*)?(marge|\broi\b)/i
/** A ceiling the seller should buy under (« ≤ 4,13 € », « objectif 12,25 € ») is a buying price whatever the words around it. */
const PLAFOND = /(≤|<=|⩽|\bmax(imum)?\b|plafond|objectif|n[ée]goci\w*\s+(sous|à|a|au\s+plus))\s*:?\s*\d[\d\s\u00a0]*(?:[.,]\d+)?\s*€|prix\s*max|\d\s*€\s*nets?\b/i
/** A supplier's name, a foreign-currency price, a buying ceiling, or a buying term next to an amount (« coût rendu 18 € »). */
// A price converted from pounds or dollars, a rate, « à renégocier », « prix d'achat » itself: buying talk (eveil, 12/10/2026).
const ACHAT_EN_CLAIR = /\b(le|les|ce|ces|nos|notre|un|du)\s+prix\s+d['’ ]?achat|tarif\s+fournisseur|ren[ée]goci|taux\s+(indicatif|de\s+change|approximatif)|convertis?\s+(de|depuis|au)\b|€\s*\/\s*(£|\$)|\bcatalogue\s*«?\s*api\b|prix\s+indiqués?\s+plus\s+bas|lignes?\s+marquées?\s+«\s*estimation|canaux\s+b2b|guide\s+b2b|sourcing\s+alternatif/i
// The agents' own working notes (« quota WebSearch épuisé », « à reclasser en `api` », « purchase_price … null »).
const JARGON =
  /websearch|quota\s+de\s+recherche|robots\.txt|politique\s+réseau|(de|cette)\s+session|reclass|colonne\s+import|note\s+import|purchase_price|landed_cost|estimated_|\bnull\b|compte\s+pro\b|prix\s+non\s+public|rendu\s+js|navigateur\s+réel|voir\s+(la\s+)?méthodologie|connexions?\s+api|\bapi\s*\/\s*extension|^\s*(\*\*)?\s*(limite|note|point)s?\s+(de\s+)?méthod|^\s*(\*\*)?\s*méthodologie|`(api|url|extension)`|<code>(api|url|extension)<\/code>/i
// « votre compte CJ », « la veste softshell CJ » : the supplier by its initials, capitals only.
const CJ_SEUL = /(?<![\p{L}\d])CJ(?![\p{L}\d])/u
const estPrivee = (texte: string) =>
  FOURNISSEUR_NOMME.test(texte) ||
  CJ_SEUL.test(texte) ||
  JARGON.test(texte) ||
  ACHAT_EN_CLAIR.test(texte) ||
  /\d\s*(\$|usd\b|¥|rmb\b|cny\b|£|gbp\b)|(\$|us\$|¥|£)\s*\d/i.test(texte) ||
  PLAFOND.test(texte) ||
  MARGE_PCT.test(texte) ||
  (TERME_ACHAT.test(texte) && MONTANT.test(texte))

/**
 * Drops what names a supplier or a buying figure, in the smallest piece that
 * carries it: a parenthesis first (« attrape-poils en lot (≤ 4,13 € rendu) »
 * keeps « attrape-poils en lot »), then a sentence or a « ; » clause. A bullet's
 * label (« Produit à éviter : ») stays with what is left of it; a line left
 * empty goes.
 */
/**
 * What a line says about the report's own workings, not the market: a pointer
 * to a table the page does not show, to another study or to the marketing
 * file, the share of a test budget spent on stock (« dont 511 € de drones
 * d'occasion »), a buying qualifier on a budget (« hors frais de port
 * Alibaba »), an unrepaired buying price in a table (« 50 € (brut) »).
 */
function publiable(ligne: string): string {
  let l = ligne
    // A link whose address is private keeps its label: removing « (url) » alone left « ([Test Achats]) ».
    .replace(/\[([^\]]*)\]\(([^()\s]*)\)/g, (m, lab: string, url: string) => (estPrivee(url) ? lab : m))
    // « (tapis … à 85 €, cf. tableau ci-dessous) » : an amount sent to the private table is a buying price.
    .replace(/\s*\(([^()]*\d\s*€[^()]*cf\.?\s*tableau[^()]*|[^()]*cf\.?\s*tableau[^()]*\d\s*€[^()]*)\)/gi, '')
    .replace(/\s*\(([^()]*)\)/g, (m, dedans: string) => (/bon de commande|plan de test|tableau\s*\d|identique à l['’ ]?étude|étude\s+[A-ZÉ]/i.test(dedans) ? '' : m))
    .replace(/voir le fichier marketing/gi, (m) => `${m[0]}oir l'analyse marketing du même jour`)
  if (/budget/i.test(l)) l = l.replace(/,?\s*dont\s+(environ\s+)?\d[^,.;()]*€[^,.;()]*/gi, (m) => (/\s$/.test(m) ? ' ' : '')).replace(/\s+hors\s+[^.;,()]*/gi, (m) => (estPrivee(m) ? (/\s$/.test(m) ? ' ' : '') : m))
  if (l.trim().startsWith('|')) l = l.replace(/\|[^|]*\(brut\)[^|]*(?=\|)/gi, '| — ')
  return l
}

/**
 * The notes under a bundle table explain costs the page no longer shows
 * (« Les bundles additionnent les coûts unitaires repris du top 20 ») : those
 * sentences go, the rest of the note stays.
 */
export function sansNotesDeCout(corps: string): string {
  return corps
    .split('\n')
    .map((l) => {
      if (/^\s*(\||#)/.test(l) || !l.trim()) return l
      const garde = l.split(/(?<=[.!?])\s+/).filter((phrase) => !/co[uû]ts?\b|rentab|pas\s+compt[ée]/i.test(phrase))
      return garde.length ? garde.join(' ') : null
    })
    .filter((l): l is string => l !== null)
    .join('\n')
}

// A bullet's label that names a list (« Éviter : a, b, c ») : each item is weighed alone, the first one too.
const ANAPHORE = /^(\*\*)?(mieux vaut (les|le|la)|il vaut mieux (les|le|la)|ils\b|elles\b|ces derni|ce dernier|cette derni|celui-ci|celle-ci|ceux-ci|celles-ci|cela\b|ça\b|d['’]où\b|(tout|rien|ils?|elles?|ces?\s+\S+)\s+(a|ont|est|sont)\s+donc\b)/i
const LIBELLE_LISTE = /^\s*(\*\*)?\s*(éviter|à éviter|liste de surveillance|négocier|acheter maintenant|quantités)/i

// What a cut leaves around it: « 30-100 € . », « explicitement . », « préalable. . ».
const propre = (t: string) => t.replace(/(\S)\s+([.,])(?=\s|$)/g, '$1$2').replace(/([.!?])(?:\s*\.)+(?=\s|$)/g, '$1')

const NOTE_DE_METHODE = /^\s*(?:[-*+]\s+)?(?:\*\*|\*)?\s*((limites?|notes?|points?)\s+(de\s+)?méthod|méthodologie|limites?\s+de\s+vérification|note\s+sur\s+la\s+colonne|note\s+import)/i

export function sansMentionsPrivees(corps: string): string {
  const sortie: string[] = []
  let dansCode = false
  // A lead-in that counts its list (« Pour un revendeur, trois constats : ») and whether an item of it was dropped.
  let annonce = -1
  const recomptees = new Set<number>()
  let introPrivee = false
  for (const brute of corps.replace(/\r\n/g, '\n').split('\n')) {
    if (/^\s*```/.test(brute)) dansCode = !dansCode
    const estPuce = /^\s*(?:[-*+]|\d+[.)])\s+/.test(brute)
    // The items under a dropped lead-in (« **Segmentation prix observée sur AliExpress** (…) : ») are its content: they go too.
    if (!dansCode && estPuce && introPrivee) continue
    // The agent's method notes (« **Limite méthodologique…** », « **Note sur la colonne Import** ») are about its tools, not the market.
    if (!dansCode && NOTE_DE_METHODE.test(brute)) continue
    if (!dansCode && brute.trim() && !estPuce) introPrivee = false
    if (!dansCode && brute.trim() && !estPuce) annonce = /:\s*$/.test(brute) ? sortie.length : -1
    // A pointer to a table the public page does not show (« bon de commande en « Bundles » ») goes, the sentence stays.
    const visible = dansCode ? brute : publiable(brute)
    const avant = sortie.length
    if (dansCode || !estPrivee(visible)) {
      sortie.push(visible)
      continue
    }
    if (visible.trim().startsWith('|')) continue
    const ligne = visible.replace(/\s*\(([^()]*)\)/g, (m, dedans: string) => (estPrivee(dedans) ? '' : m))
    if (!estPrivee(ligne)) {
      sortie.push(propre(ligne))
      continue
    }
    const puce = /^(\s*(?:[-*+]|\d+[.)])\s+)/.exec(ligne)?.[1] ?? ''
    let texte = ligne.slice(puce.length)
    const lib = /^([^:;.]{1,140}?)\s?:\s+(.*)$/.exec(texte)
    const libelle = lib && !estPrivee(lib[1]) ? lib[1] : ''
    if (libelle) texte = lib![2]
    // A label that talks margin or buying (« …gardent une marge, faible : environ 3,34 € nets ») makes its amounts private.
    const prive = (morceau: string) => estPrivee(morceau) || (TERME_ACHAT.test(libelle) && MONTANT.test(morceau))
    // After a label the text is often a list (« À surveiller : a, b, c ») : each item is weighed alone…
    const parListe = (morceau: string) =>
      morceau
        .split(/,\s+(?![^()]*\))/)
        // « …, ce qui comprime les marges » leans on the clause before it: it goes with it.
        .filter((element, i, tous) => !prive(element) && !(i > 0 && prive(tous[i - 1]) && /^(ce qui|ce que|ce dont|qui|dont|où)\b/i.test(element)))
        .join(', ')
        .replace(/[^.!?;]$/, (fin) => fin + (/[.!?;]$/.exec(morceau)?.[0] ?? ''))
    // « Dans le détail, <private>, ce qui en fait… » : once the clause and its relative go, the head says nothing.
    const relativeOrpheline = (morceau: string) =>
      morceau.split(/,\s+(?![^()]*\))/).some((element, i, tous) => i > 0 && prive(tous[i - 1]) && /^(ce qui|ce que|ce dont|qui|dont|où)\b/i.test(element))
    // « (ex. Bigjigstoys, ~58 € …) » is one sentence: no cut after an abbreviation.
    const morceaux = texte.split(/(?<!\b(?:ex|cf|env|réf|vs|ca|etc|p)\.)(?<=[.!?;])\s+/i).map((morceau) => {
      if (!libelle || !prive(morceau)) return morceau
      if (LIBELLE_LISTE.test(libelle) || !prive(morceau.split(/,\s+(?![^()]*\))/)[0])) {
        // …unless the first item is the private one: then the rest qualifies it (« …sur AliExpress, coût rendu supérieur… »),
        // and a remnant too short to stand (« En boutique. ») goes with it.
        const garde = parListe(morceau)
        return LIBELLE_LISTE.test(libelle) || garde.split(/\s+/).length >= 4 && !relativeOrpheline(morceau) ? garde : morceau
      }
      return morceau
    })
    const premierRetire = !!morceaux.length && (!morceaux[0].trim() || prive(morceaux[0]))
    // « Mieux vaut les proposer en kit » leans on the sentence before it: it goes with it.
    const reste = morceaux
      .filter((morceau, i) => morceau.trim() && !prive(morceau) && !(i > 0 && prive(morceaux[i - 1]) && ANAPHORE.test(morceau)))
      .join(' ')
      .replace(/[\s;,]+$/, '')
      .trim()
      .replace(/[^.!?:…]$/, (fin) => fin + '.')
      .replace(/\s*;\s+(?=[A-ZÀ-Ý])/g, '. ')
    // A claim in bold (« **Importer des drones ne marche pas** : le Neo 2 coûte… ») stands alone once its figures go,
    // and what follows a dropped first sentence is a new sentence, not the label's explanation.
    const affirmation = /\*\*/.test(libelle)
    const nouvellePhrase = premierRetire && (affirmation || !libelle)
    // A bold lead-in alone (« **Ce qui sature.** ») or a bare price band (« **< 30 €** ») says nothing once its text goes.
    const seulTitre = (t: string) => (/^\*\*[^*]+\*\*[.:]?$/.test(t.trim()) && t.trim().split(/\s+/).length < 4) || !/[a-zà-ÿ]{3}/i.test(t.replace(/\*\*/g, '').replace(/€/g, ''))
    if (reste && /[a-zà-ÿ]{3}/i.test(reste) && !(seulTitre(reste) && !libelle)) sortie.push(propre(`${puce}${libelle ? (nouvellePhrase ? `${libelle}. ` : `${libelle} : `) : ''}${nouvellePhrase ? reste.charAt(0).toUpperCase() + reste.slice(1) : libelle && premierRetire ? reste.replace(/^([A-ZÀ-Ý])(?=[a-zà-ÿ])/, (c) => c.toLowerCase()) : reste}`))
    else if (affirmation && libelle.replace(/\*\*/g, '').trim().split(/\s+/).length >= 6) sortie.push(`${puce}${libelle.replace(/[\s,;]+$/, '')}.`)
    else if (estPuce && annonce >= 0) recomptees.add(annonce)
    if (!estPuce && /:\s*$/.test(brute) && sortie.length === avant && /prix|co[uû]t|marge|achat|tarif/i.test(brute)) introPrivee = true
  }
  // « trois constats » over a list that lost one: the count goes, the words stay.
  for (const i of recomptees) {
    sortie[i] = sortie[i].replace(/\b(deux|trois|quatre|cinq|six|sept|huit|neuf|dix|\d+)\s+(?=[a-zà-ÿ])/i, '')
  }
  return sortie.join('\n')
}

/**
 * A sub-heading or a lead-in line (« Premier bon de commande chiffré : ») whose
 * table was removed announced nothing any more (« Tableau 5 — Plan de test »
 * stood alone on the page, 12/10/2026). It goes with its table.
 */
export function sansIntertitresVides(corps: string): string {
  let lignes = corps.split('\n')
  for (let change = true; change; ) {
    change = false
    const garde: string[] = []
    for (let i = 0; i < lignes.length; i++) {
      const l = lignes[i]
      const titre = /^(#{3,})\s/.exec(l)
      const annonce = !titre && l.trim() && !/^\s*([-*+]|\d+[.)])\s/.test(l) && /:\s*$/.test(l)
      if (titre || annonce) {
        let j = i + 1
        while (j < lignes.length && !lignes[j].trim()) j++
        const suivant = j < lignes.length ? /^(#{2,})\s/.exec(lignes[j]) : null
        const vide = j >= lignes.length || (suivant && (!titre || suivant[1].length <= titre[1].length))
        if (vide) {
          change = true
          continue
        }
      }
      garde.push(l)
    }
    lignes = garde
  }
  return lignes.join('\n')
}

export function sansTableauxPrives(corps: string, colonnes = false): { corps: string; retires: number } {
  const lignes = corps.replace(/\r\n/g, '\n').split('\n')
  const sortie: string[] = []
  let retires = 0
  for (let i = 0; i < lignes.length; ) {
    if (lignes[i].trim().startsWith('|') && ENTETE_PRIVEE.test(lignes[i])) {
      const elague = colonnes ? sansColonnesPrivees(lignes, i) : null
      if (elague) {
        sortie.push(...elague.lignes)
        i = elague.fin
        continue
      }
      while (i < lignes.length && lignes[i].trim().startsWith('|')) i++
      while (sortie.length && !sortie[sortie.length - 1].trim()) sortie.pop()
      if (sortie.length && /^#{3,}\s.*produits/i.test(sortie[sortie.length - 1])) sortie.pop()
      retires++
      continue
    }
    sortie.push(lignes[i++])
  }
  return { corps: sortie.join('\n'), retires }
}

/**
 * A bundle table (« Bundle | Contenu | Coût rendu | Prix de vente | Marge | ROI | Cible ») loses its cost
 * columns, not its rows: the « Meilleur bundle » of the Verdict must still be found on the page.
 */
function sansColonnesPrivees(lignes: string[], debut: number): { lignes: string[]; fin: number } | null {
  let fin = debut
  while (fin < lignes.length && lignes[fin].trim().startsWith('|')) fin++
  const cases = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
  const entete = cases(lignes[debut])
  if (!/bundle/i.test(entete[0])) return null
  const garder = entete.map((t, k) => k === 0 || !ENTETE_PRIVEE.test(t))
  if (garder.filter(Boolean).length < 3 || fin - debut < 3) return null
  const sortie = lignes.slice(debut, fin).map((l, n) => {
    const c = cases(l).filter((_, k) => garder[k])
    return `| ${(n === 1 ? c.map(() => '---') : c.map((x) => x.replace(/\s*\(([^()]*)\)/g, (m, dedans: string) => (TERME_ACHAT.test(dedans) || estPrivee(dedans) ? '' : m))).map((x) => (n > 1 && estPrivee(x) ? '—' : x))).join(' | ')} |`
  })
  return { lignes: sortie, fin }
}

/** Le bloc « N produits proposés » : celui qui porte les adresses fournisseur. Jamais rendu tel quel. */
function estBlocProduits(titre: string, corps: string): boolean {
  // Other agents open their « TOP 20 produits gagnants » with a sentence before the table.
  return /produits/i.test(titre) && (corps.trim().startsWith('|') || /^\s*\|/m.test(corps))
}

// --- Le gabarit ---------------------------------------------------------------

const CSS = `
:root{color-scheme:dark}*{box-sizing:border-box}
body{margin:0;background:#140f28;color:#e9e6f5;font:16px/1.65 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:#c4b5fd}.wrap{max-width:52rem;margin:0 auto;padding:0 1.25rem}
header{border-bottom:1px solid #ffffff1a}header .wrap{display:flex;align-items:center;justify-content:space-between;padding:1rem 1.25rem;gap:1rem}
.brand{display:flex;align-items:flex-start;gap:5px;height:34px;text-decoration:none;flex:none}
.brand img{display:block}
.brand .mot{height:21.8px;width:auto;margin-top:8.3px}
.cta{display:inline-block;background:linear-gradient(90deg,#f28a4b,#e85290);color:#fff;text-decoration:none;font-weight:600;padding:.7rem 1.15rem;border-radius:.75rem}
.cta.small{padding:.5rem .9rem;font-size:.9rem}
h1{font-size:1.8rem;line-height:1.25;margin:1.5rem 0 .5rem}h2{font-size:1.25rem;margin:2.25rem 0 .5rem}h3{font-size:1rem;margin:1.5rem 0 .35rem}
p{margin:.6rem 0}.lede{font-size:1.08rem;color:#cfc9e8}.meta{font-size:.85rem;color:#9d95c0}
.crumb{font-size:.82rem;color:#9d95c0;padding-top:1.25rem}.crumb a{color:#9d95c0}
.tableau{overflow-x:auto;margin:1rem 0;border:1px solid #ffffff1a;border-radius:.75rem}
table{width:100%;border-collapse:collapse;font-size:.9rem}th,td{text-align:left;padding:.55rem .6rem;border-bottom:1px solid #ffffff12;vertical-align:top}th{color:#9d95c0;font-weight:600;font-size:.8rem;text-transform:uppercase;letter-spacing:.03em}
.prompt{margin:1rem 0;border:1px solid #a855f740;background:#0000004d;border-radius:.75rem;overflow:hidden}
.prompt figcaption{padding:.4rem .8rem;font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#d8b4fe;border-bottom:1px solid #ffffff12}
.prompt pre{margin:0;padding:.75rem .9rem;white-space:pre-wrap;font:13px/1.5 ui-monospace,Menlo,Consolas,monospace;color:#f3f0ff}
.garde{border:1px solid #34d39940;background:#34d39912;border-radius:.75rem;padding:.85rem 1rem;margin:1rem 0;font-size:.92rem}
.liste{list-style:none;padding:0;margin:1rem 0;display:grid;gap:.6rem}
.liste li{border:1px solid #ffffff1a;background:#ffffff0d;border-radius:.75rem;padding:.75rem .9rem}
.liste a{text-decoration:none;color:#fff;font-weight:600}.liste small{display:block;color:#9d95c0;margin-top:.15rem}
.grille{display:grid;gap:.6rem;grid-template-columns:repeat(auto-fill,minmax(14rem,1fr));margin:1rem 0}
.grille a{display:block;border:1px solid #ffffff1a;background:#ffffff0d;border-radius:.75rem;padding:.7rem .85rem;text-decoration:none;color:#e9e6f5}
.grille a small,.grille span small{display:block;color:#9d95c0}
.grille .vide{display:block;border:1px dashed #ffffff1a;border-radius:.75rem;padding:.7rem .85rem;color:#9d95c0}
footer{border-top:1px solid #ffffff1a;margin-top:3rem;padding:1.5rem 0;font-size:.85rem;color:#9d95c0}footer a{color:#9d95c0;margin-right:1rem}
.end{margin:2.5rem 0;text-align:center}
`

function layout(o: { url: string; title: string; description: string; jsonLd: unknown; body: string; publie?: Date; modifie?: Date; indexable?: boolean }): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description)}">
<link rel="canonical" href="${SITE}${o.url}">
<meta name="robots" content="${o.indexable === false ? 'noindex, follow' : 'index, follow, max-snippet:-1'}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="${NOM}">
<meta property="og:locale" content="fr_FR">
<meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(o.description)}">
<meta property="og:url" content="${SITE}${o.url}">
${o.publie ? `<meta property="article:published_time" content="${o.publie.toISOString()}">` : ''}
${o.modifie ? `<meta property="article:modified_time" content="${o.modifie.toISOString()}">` : ''}
<link rel="icon" type="image/png" sizes="48x48" href="/favicon-48.png">
<link rel="alternate" type="text/plain" href="${SITE}/llms.txt" title="Description pour les assistants IA">
<style>${CSS}</style>
<script type="application/ld+json">${JSON.stringify(o.jsonLd)}</script>
</head>
<body>
<header><div class="wrap"><a class="brand" href="/" aria-label="${NOM}, accueil"><img src="${SITE}/marque/dropshipper-icone.png" alt="" width="34" height="34"><img class="mot" src="${SITE}/marque/dropshipper-mot.png" alt="${NOM}" width="120" height="22"></a><a class="cta small" href="/register">Créer un compte</a></div></header>
<main class="wrap">
${o.body}
<div class="end"><a class="cta" href="/register">Essayer ${NOM} — 120 drops offerts</a></div>
</main>
<footer><div class="wrap"><a href="/">Accueil</a><a href="/analyses/">Analyses de marché</a><a href="/tarifs/">Tarifs</a><a href="/faq/">Questions fréquentes</a><a href="/a-propos/">À propos</a></div></footer>
</body>
</html>
`
}

function crumb(items: Array<{ nom: string; url?: string }>): string {
  return `<nav class="crumb">${items.map((i) => (i.url ? `<a href="${i.url}">${esc(i.nom)}</a>` : esc(i.nom))).join(' › ')}</nav>`
}

function breadcrumbLd(items: Array<{ nom: string; url?: string }>) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.nom, ...(it.url ? { item: `${SITE}${it.url}` } : {}) })),
  }
}

const ORGANISATION = { '@type': 'Organization', '@id': `${SITE}/#organisation`, name: NOM, url: `${SITE}/` }

/**
 * Ce qui, dans un texte libre d'agent, trahit l'achat : un prix d'achat
 * (« 1,91 US$ relevé sur la fiche »), un coût, une devise étrangère, ou le nom
 * d'un fournisseur. Les agents l'écrivent dans « pourquoi » : la colonne
 * fournisseur retirée ne suffit pas, le texte est filtré au rendu.
 */
const TRAHIT_ACHAT = /achat|fournisseur|relev|sur la fiche|co[uû]t|usine|grossiste|ren[ée]goci|convertis?\s+(de|depuis|au)\b|taux\s+(indicatif|de\s+change|approximatif)|£|catalogue\s*«?\s*api|connecteur officiel|flux manuel|méthodes d['’]import|\$|US\s?\$|¥|yuan|rmb|cny|aliexpress|alibaba|1688|cj\s?drop|cjdropshipping|temu|shein|bigbuy|accio|dhgate|banggood|spocket|zendrop|syncee/i

/** « pourquoi » sans ce qui trahit l'achat : chaque parenthèse et chaque membre de phrase fautif est retiré. Exporté pour le banc. */
// A pointer to a note the public page does not show, or how the agent read the page.
const POURQUOI_INTERNE = /voir\s+(la\s+)?note|non\s+vérifiable|rendu\s+js|sans\s+(navigateur|extension)|\bfret\b|prix\s+à\s+(vérifier|valider|reconfirmer)|estimée?s?(?![\p{L}])|estimation|fiche\s+(api|exacte|précise)|\bapi\b|via\s+l['’]extension|manuellement|lisible\s+sans|\bb2b\b|compte\s+professionnel|\bfetch\b|avant\s+import|à\s+re(confirmer|contrôler)|non\s+vérifié/iu

export function pourquoiPublic(texte: string | null | undefined): string {
  if (!texte) return ''
  // The agents' « · »-separated fields (verdict · reason · audience) are filtered one by one.
  return texte
    .split(/\s+·\s+/)
    .map((champ) => {
      const sansParentheses = champ.replace(/\s*\(([^()]*)\)/g, (m, dedans: string) => (TRAHIT_ACHAT.test(dedans) || CJ_SEUL.test(dedans) || JARGON.test(dedans) || POURQUOI_INTERNE.test(dedans) ? '' : m))
      const net = sansParentheses
        .split(/\s*[;,]\s+|\s+[—–-]\s+/)
        .map((m) => m.trim().replace(/[.\s]+$/, ''))
        .filter((m) => m && !TRAHIT_ACHAT.test(m) && !CJ_SEUL.test(m) && !JARGON.test(m) && !POURQUOI_INTERNE.test(m))
        .join(', ')
      const equilibre = parenthesesEquilibrees(net).trim()
      return equilibre ? equilibre.charAt(0).toUpperCase() + equilibre.slice(1) : ''
    })
    .filter(Boolean)
    .join(' · ')
}

/** A product as public pages show it: one row per product, the advised price as a span when its offers differ. */
export type ProduitPublic = ProduitRapport & { prixMin?: number | null; prixMax?: number | null; verdicts?: string }

/** Most favourable first: buy, buy if negotiated, try, watch, do not buy. */
function rangVerdict(v: string): number {
  const t = v.split(/\s+·\s+/)[0].toLowerCase()
  if (/ne pas acheter|éviter|a éviter|à éviter|passer/.test(t)) return 5
  if (/surveill/.test(t)) return 4
  if (/tester|décollage|candidat/.test(t)) return 3
  if (/acheter si|négoci/.test(t)) return 2
  if (/acheter/.test(t)) return 1
  return 3.5
}

/** The public « why » of a product; a grouped one shows the most favourable verdict, « selon l'offre ». */
function pourquoiAffiche(p: ProduitPublic): string {
  return p.verdicts ?? pourquoiPublic(p.pourquoi)
}

const montantPublic = (n: number) => n.toFixed(2).replace('.', ',')
function prixPublic(p: ProduitPublic): string {
  const min = p.prixMin ?? p.prixVente
  const max = p.prixMax ?? p.prixVente
  if (min == null || max == null) return '—'
  return min === max ? `${montantPublic(min)} €` : `${montantPublic(min)} à ${montantPublic(max)} €`
}

/** Les produits gagnants, bridés : ni fournisseur, ni prix d'achat, ni marge (son unité varie selon l'agent). */
function tableauProduitsPublic(produits: ProduitPublic[]): string {
  if (!produits.length) return ''
  return `<div class="tableau"><table>
<thead><tr><th>#</th><th>Produit</th><th>Prix de vente conseillé</th><th>Pourquoi</th></tr></thead>
<tbody>${produits
    .map(
      (p) =>
        `<tr><td>${p.rang}</td><td>${esc(p.titre)}</td><td>${prixPublic(p)}</td><td>${esc(pourquoiAffiche(p))}</td></tr>`,
    )
    .join('')}</tbody></table></div>
<p class="garde">La fiche fournisseur et le prix d'achat de chaque produit sont réservés aux comptes ${NOM} : <a href="/register">créez un compte</a> pour les ouvrir, les importer en un clic et les publier sur vos places de marché.</p>`
}

function produitsLd(r: RapportPublic) {
  return {
    '@type': 'ItemList',
    name: `Produits gagnants — ${r.themeNom}, ${dateLongue(r.day)}`,
    numberOfItems: r.produits.length,
    itemListElement: r.produits.slice(0, 20).map((p) => ({
      '@type': 'ListItem',
      position: p.rang,
      name: p.titre,
      ...(p.prixVente !== null ? { description: [`Prix de vente conseillé ${prixPublic(p)}`, pourquoiAffiche(p)].filter(Boolean).join(' — ') } : {}),
    })),
  }
}

export function pageRapport(r: RapportPublic, autres: RapportPublic[] = []): string {
  const cat = r.categorieNom
  const theme = r.themeNom
  const url = cheminRapport(r)
  const estRayon = r.type === 'rayon'
  const title = titreRapport(r)
  const description =
    r.accroche ||
    (estRayon
      ? r.produits.length
        ? `Analyse de marché ${theme.toLowerCase()} du ${dateLongue(r.day)} et ${r.produits.length} produits à importer en dropshipping, avec prix de vente conseillé.`
        : `Analyse de marché ${theme.toLowerCase()} du ${dateLongue(r.day)} : tendances, prix pratiqués, saisonnalité et pistes de produits à importer en dropshipping.`
      : `Analyse marketing ${theme.toLowerCase()} du ${dateLongue(r.day)} : angles, audiences, prompts publicitaires image et vidéo.`)

  const fil = [
    { nom: 'Accueil', url: '/' },
    { nom: 'Analyses de marché', url: '/analyses/' },
    { nom: cat, url: cheminCategorie(r.categorie) },
    { nom: `${theme} — ${dateLongue(r.day)}` },
  ]

  const blocs = blocsDe(r.body)
    // Le corps d'un rapport marketing MarketSpy n'est qu'une souche (« ## Analyse » puis le titre) : rien à montrer.
    .filter((b) => !(r.type === 'marketing' && b.corps.trim() === r.titre.trim()))
    .filter((b) => !SECTION_PRIVEE.test(b.titre))
    .map((b) => {
      if (estBlocProduits(b.titre, b.corps)) {
        // One row per product: the heading gives the real count (« TOP 20 » over 16 rows otherwise).
        const titre = b.titre.replace(/proposés/i, 'gagnants').replace(/\b\d+(?=\s+produits)/i, (n) => (r.produits.length ? String(r.produits.length) : n))
        return `<h2 id="produits">${esc(titre)}</h2>${tableauProduitsPublic(r.produits)}`
      }
      const { corps: sansTableaux, retires } = sansTableauxPrives(b.corps, /bundle/i.test(b.titre))
      const corps = sansIntertitresVides(pointsAnnonces(sansMentionsPrivees(/bundle/i.test(b.titre) ? sansNotesDeCout(sansTableaux) : sansTableaux)))
      // Sans produits structurés à montrer à la place, le lecteur sait au moins que la liste existe.
      // « Bundles proposés » whose every line was a cost: no heading over nothing.
      if (!corps.trim() && b.corps.trim() && !(retires && !r.produits.length)) return ''
      const garde =
        retires && !r.produits.length
          ? `<p class="garde">La liste des produits proposés ce jour-là, avec fournisseurs et prix d'achat, est réservée aux comptes ${NOM} : <a href="/register">créez un compte</a> pour l'ouvrir.</p>`
          : ''
      return `${b.titre ? `<h2>${enLigne(b.titre)}</h2>` : ''}${markdownEnHtml(corps)}${garde}`
    })
    .join('\n')

  // Un rapport MarketSpy ne porte pas son tableau dans le corps : les produits
  // sont à part, et sans ce bloc la page annonçait « 20 produits gagnants » dans
  // son titre et n'en montrait aucun (constaté sur la première page servie).
  const tableauDejaRendu = blocsDe(r.body).some((b) => estBlocProduits(b.titre, b.corps))
  const produitsEnPlus =
    estRayon && r.produits.length && !tableauDejaRendu
      ? `<h2 id="produits">${r.produits.length} produits gagnants</h2>${tableauProduitsPublic(r.produits)}`
      : ''

  const prompts = (genre: 'image' | 'video', titre: string) => {
    const liste = r.prompts.filter((p) => p.genre === genre)
    if (!liste.length) return ''
    return `<h2>${titre}</h2>${liste
      .map((p) => `<figure class="prompt">${p.format ? `<figcaption>${esc(p.format)}</figcaption>` : ''}<pre>${esc(p.texte)}</pre></figure>`)
      .join('')}`
  }

  const jumeau = autres.find((a) => a.day === r.day && a.theme === r.theme && a.type !== r.type)
  const voisins = autres.filter((a) => a !== jumeau && !(a.day === r.day && a.theme === r.theme && a.type === r.type)).slice(0, 8)

  const body = `${crumb(fil)}
<h1>${esc(r.titre)}</h1>
<p class="meta">${estRayon ? 'Analyse de marché et produits gagnants' : 'Analyse marketing'} · ${esc(cat)} › ${esc(theme)} · <a href="${cheminJour(r.day)}">édition du ${dateLongue(r.day)}</a>${
    r.sources ? ` · ${r.sources} sources consultées` : ''
  } · rédigé par les agents ${NOM}</p>
${r.accroche ? `<p class="lede">${esc(r.accroche)}</p>` : ''}
${blocs}
${produitsEnPlus}
${prompts('image', "Prompts d'images publicitaires, prêts à coller dans un générateur")}
${prompts('video', 'Prompts de vidéos publicitaires')}
${jumeau ? `<h2>Le même jour</h2><ul class="liste"><li><a href="${cheminRapport(jumeau)}">${esc(jumeau.titre)}</a><small>${jumeau.type === 'rayon' ? 'Analyse de marché et produits gagnants' : 'Analyse marketing : angles et prompts publicitaires'}</small></li></ul>` : ''}
${
  voisins.length
    ? `<h2>Autres analyses ${esc(cat.toLowerCase())}</h2><ul class="liste">${voisins
        .map((v) => `<li><a href="${cheminRapport(v)}">${esc(v.titre)}</a><small>${dateLongue(v.day)} · ${resumeRapport(v)}</small></li>`)
        .join('')}</ul>`
    : ''
}
<h2>Comment ces analyses sont produites</h2>
<p>Chaque jour, pour chacune des ${CATEGORIES.length} catégories, deux agents de ${NOM} lisent le web — tendances, prix pratiqués, avis, saisonnalité — et rédigent un rapport de marché avec ses produits à importer, et un rapport marketing avec ses angles et ses prompts publicitaires. Les comptes ${NOM} importent ces produits en un clic, à l'unité ou en lot, et les publient sur leurs places de marché.</p>`

  return layout({
    url,
    title,
    description,
    modifie: r.updatedAt,
    publie: new Date(`${r.day}T06:00:00Z`),
    jsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        {
          // Une analyse datée, publiée chaque jour : une actualité de marché.
          '@type': 'NewsArticle',
          '@id': `${SITE}${url}#article`,
          headline: r.titre,
          description,
          inLanguage: 'fr-FR',
          datePublished: `${r.day}T06:00:00Z`,
          dateModified: r.updatedAt.toISOString(),
          author: ORGANISATION,
          publisher: ORGANISATION,
          mainEntityOfPage: `${SITE}${url}`,
          articleSection: cat,
          keywords: [cat, theme, 'dropshipping', estRayon ? 'produits gagnants' : 'marketing'].join(', '),
        },
        ...(estRayon && r.produits.length ? [produitsLd(r)] : []),
        breadcrumbLd(fil),
      ],
    },
    body,
  })
}

function titreCategorie(nom: string): string {
  const long = `Analyses ${nom.toLowerCase()} : produits gagnants et tendances`
  return long.length <= TITRE_MAX ? long : `Analyses de marché ${nom.toLowerCase()}`
}

export function pageCategorie(id: string, rapports: RapportPublic[]): string {
  const cat = categorieDe(id)
  const nom = rapports[0]?.categorieNom ?? nomCategorie(id)
  const url = cheminCategorie(id)
  const fil = [{ nom: 'Accueil', url: '/' }, { nom: 'Analyses de marché', url: '/analyses/' }, { nom }]
  const parJour = new Map<string, RapportPublic[]>()
  for (const r of [...rapports].sort((a, b) => (a.day < b.day ? 1 : -1))) parJour.set(r.day, [...(parJour.get(r.day) ?? []), r])

  const body = `${crumb(fil)}
<h1>Analyses de marché ${esc(nom.toLowerCase())} : tendances et produits gagnants, jour après jour</h1>
<p class="lede">Chaque jour, un rapport de marché avec ses produits à importer et un rapport marketing avec ses prompts publicitaires, sur l'un des sept thèmes de la catégorie${
    cat ? ` : ${cat.themes.map((t) => t.nom.toLowerCase()).join(', ')}` : ''
  }.</p>
${[...parJour.entries()]
  .map(
    ([jour, liste]) =>
      `<h2>${dateLongue(jour)}</h2><ul class="liste">${liste
        .map((r) => `<li><a href="${cheminRapport(r)}">${esc(titreDansListe(r))}</a><small>${esc(r.themeNom)} · ${resumeRapport(r)}</small></li>`)
        .join('')}</ul>`,
  )
  .join('\n')}
${
  rapports.length
    ? ''
    : `<p>Aucune analyse publiée pour cette catégorie pour le moment : les agents de ${NOM} la couvriront dans les prochains jours. En attendant, <a href="/analyses/">les autres catégories</a> sont à jour.</p>`
}
<h2>Comment lire ces analyses</h2>
<p>Le rapport de marché dit ce qui se vend dans la catégorie, à quel prix, ce qui monte et ce qui recule, puis propose des produits à importer avec leur prix de vente conseillé. Le rapport marketing du même jour dit à qui les vendre et comment : angles, audiences, accroches, et des prompts d'images et de vidéos publicitaires prêts à coller dans un générateur.</p>
<p>Les produits se retrouvent dans l'application : un compte ${NOM} les importe en un clic, l'IA réécrit l'annonce, et elle part vers les places de marché choisies. Voir aussi <a href="/fonctions/analyses-de-marche/">comment les analyses sont produites</a> et <a href="/dropshipping/">le dropshipping expliqué</a>.</p>`

  return layout({
    url,
    // Vide, la page sert le visiteur qui arrive par un vieux lien, pas l'index.
    indexable: rapports.length > 0,
    title: titreCategorie(nom),
    description: `Les analyses de marché quotidiennes ${nom.toLowerCase()} de ${NOM} : tendances, prix, saisonnalité, et chaque jour des produits gagnants à importer en dropshipping.`,
    jsonLd: { '@context': 'https://schema.org', '@graph': [{ '@type': 'CollectionPage', name: `Analyses de marché ${nom}`, url: `${SITE}${url}`, inLanguage: 'fr-FR', publisher: ORGANISATION }, breadcrumbLd(fil)] },
    body,
  })
}

export function pageIndex(recents: RapportPublic[], compteParCategorie: Map<string, number>, jours: string[] = []): string {
  const url = '/analyses/'
  const fil = [{ nom: 'Accueil', url: '/' }, { nom: 'Analyses de marché' }]
  const total = [...compteParCategorie.values()].reduce((t, n) => t + n, 0)
  const body = `${crumb(fil)}
<h1>Analyses de marché et produits gagnants du dropshipping, chaque jour</h1>
<p class="lede">${CATEGORIES.length} catégories, deux rapports par jour et par catégorie : le marché et ses produits à importer, le marketing et ses prompts publicitaires. Rédigés par les agents ${NOM}, ${total} rapports publiés à ce jour.</p>
${
    jours.length
      ? `<h2>Les éditions</h2><div class="grille">${jours
          .slice(0, 14)
          .map((j) => `<a href="${cheminJour(j)}">Édition du ${dateLongue(j)}<small>tendances et produits gagnants du jour</small></a>`)
          .join('')}</div>`
      : ''
  }
<h2>Les dernières analyses</h2>
<ul class="liste">${recents
    .map((r) => `<li><a href="${cheminRapport(r)}">${esc(titreDansListe(r))}</a><small>${esc(r.categorieNom)} · ${dateLongue(r.day)} · ${resumeRapport(r)}</small></li>`)
    .join('')}</ul>
<h2>Par catégorie</h2>
<div class="grille">${CATEGORIES.map((c) => {
    const n = compteParCategorie.get(c.id) ?? 0
    // Une catégorie encore vide n'est pas un lien : l'audit du 03/10/2026 comptait onze liens vers des pages sans contenu.
    return n
      ? `<a href="${cheminCategorie(c.id)}">${esc(c.nom)}<small>${n} analyse${n > 1 ? 's' : ''}</small></a>`
      : `<span class="vide">${esc(c.nom)}<small>bientôt</small></span>`
  }).join('')}</div>`
  return layout({
    url,
    title: 'Analyses de marché dropshipping et produits gagnants du jour',
    description: `Les analyses de marché quotidiennes de ${NOM} sur ${CATEGORIES.length} catégories : tendances, prix, produits gagnants à importer, angles et prompts publicitaires.`,
    jsonLd: { '@context': 'https://schema.org', '@graph': [{ '@type': 'CollectionPage', name: 'Analyses de marché', url: `${SITE}${url}`, inLanguage: 'fr-FR', publisher: ORGANISATION }, breadcrumbLd(fil)] },
    body,
  })
}

/**
 * L'édition d'un jour (demandée par Max le 03/10/2026 : « chaque jour comme des
 * infos ») : chaque catégorie analysée ce jour-là, son accroche, ses meilleurs
 * produits gagnants (bridés comme partout : ni fournisseur en lien, ni prix
 * d'achat), et les liens vers les rapports complets. Une page par jour, une
 * adresse lisible, de quoi se faire indexer chaque matin.
 */
/**
 * A rayon lists the same product once per offer (MARKETSPY: one row per
 * supplier). The public pages hide the supplier, so those rows read as
 * duplicates: one entry per product, with the span of advised prices.
 */
/**
 * The analysis refers to products by their rank (« (n° 18) »). Once offers are
 * grouped the ranks move: each reference follows its product to its new row.
 */
export function renvoisRenumerotes(texte: string, produits: ProduitPublic[]): string {
  const ordre: string[] = []
  const nouveau = new Map<number, number>()
  for (const p of produits) {
    // « Casque audio Philips TAK4206PK/00 » and « Casque Philips TAK4206PK/00 » are one product: a model code says so.
    const cle = codeModele(p.titre) ?? (slugTitre(p.titre, 200) || p.titre)
    if (!ordre.includes(cle)) ordre.push(cle)
    if (!nouveau.has(p.rang)) nouveau.set(p.rang, ordre.indexOf(cle) + 1)
  }
  if ([...nouveau].every(([a, b]) => a === b)) return texte
  // « n° 3 à 11 » spans the rows its old ranks became; « n° 4 et 6 » maps each item, merged when they now share a row.
  return texte.replace(/\bn°\s*(\d{1,2}(?:\s*(?:,|et|ou|à|-|–)\s*\d{1,2})*)\b/gi, (m, suite: string) => {
    const vers = (n: number) => nouveau.get(n)
    const morceaux = suite.split(/\s*(,|\bet\b|\bou\b|à|-|–)\s*/)
    const nombres = morceaux.filter((_, i) => i % 2 === 0).map(Number)
    const seps = morceaux.filter((_, i) => i % 2 === 1)
    if (nombres.some((n) => !vers(n))) return m
    const out: string[] = []
    for (let i = 0; i < nombres.length; i++) {
      const sep = seps[i]
      if (sep && /^(à|-|–)$/.test(sep)) {
        const lignes: number[] = []
        for (let k = nombres[i]; k <= nombres[i + 1]; k++) if (vers(k)) lignes.push(vers(k)!)
        const a = Math.min(...lignes), b = Math.max(...lignes)
        out.push(a === b ? String(a) : `${a} ${sep} ${b}`)
        if (seps[i + 1]) out.push(seps[i + 1] === ',' ? ',' : seps[i + 1])
        i++
        continue
      }
      const v = String(vers(nombres[i]))
      if (!out.includes(v)) out.push(v)
      else if (out.length && !/^\d/.test(out[out.length - 1])) out.pop()
      if (sep) out.push(sep)
    }
    while (out.length && !/^\d/.test(out[out.length - 1].split(' ').pop()!)) out.pop()
    return 'n° ' + out.join(' ').replace(/ ,/g, ',')
  })
}

/** Rows an old import read wrongly: the table header as a product, a label repeated before the name. */
// Where a product was found, in its title (« … - AliExpress Business », « SHEIN LUNE… », « (fiche BigBuy « … ») »).
const PLATEFORME_TITRE =
  /aliexpress|alibaba|\b1688\b|\btemu\b|(?<![\p{L}\d])CJ(?![\p{L}\d])|cjdropshipping|bigbuy|banggood|dhgate|dropizi|syncee|spocket|zendrop|autods|\bshein\b|sourcing|\bb2b\b|grossiste|fournisseur|dropshipping|\bfiche\b/iu

/** A product's public title: the platform it was found on goes, the product stays readable (12/10/2026). */
export function titreProduitPublic(titre: string): string {
  if (!PLATEFORME_TITRE.test(titre)) return titre
  const net = titre
    .replace(/\s*\(([^()]*)\)/g, (m, dedans: string) => (PLATEFORME_TITRE.test(dedans) ? '' : m))
    .split(/\s+[-—–|]\s+/)
    .map((morceau, i) =>
      i === 0 ? morceau : /reconditionn/i.test(morceau) ? 'reconditionné' : PLATEFORME_TITRE.test(morceau) ? '' : morceau,
    )
    .filter(Boolean)
    .join(' — ')
    .replace(/\s+—\s+reconditionné$/, ' reconditionné')
    .replace(/^(?:shein|aliexpress|temu|bigbuy)\s+/i, '')
    .replace(/\s+en\s+gros$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return net && !PLATEFORME_TITRE.test(net) ? net : net.replace(new RegExp(PLATEFORME_TITRE.source, 'giu'), '').replace(/\s{2,}/g, ' ').trim() || titre
}

export function produitsNettoyes(produits: ProduitPublic[]): ProduitPublic[] {
  return produits
    .filter((p) => !/^(titre|produit|nom|name|title|#)$/i.test(p.titre.trim()))
    .map((p) => {
      let t = p.titre
      for (let k = 0; k < 3; k++) t = t.replace(/^((?:\S+\s+){2,4}?)\1/i, '$1')
      // « Casque audio Casque Philips… » : a two-word label in front of a title that starts with the same word.
      t = titreProduitPublic(texteRepare(apostrophesDuTexte(t.replace(/^(\p{L}+)\s+\p{L}+\s+(?=\1(?![\p{L}]))/iu, ''))))
      const pourquoi = p.pourquoi ? texteRepare(apostrophesDuTexte(p.pourquoi)) : p.pourquoi
      return t === p.titre && pourquoi === p.pourquoi ? p : { ...p, titre: t, pourquoi }
    })
}

function codeModele(titre: string): string | null {
  const codes = titre
    .split(/[\s,()]+/)
    .map((m) => m.replace(/[.;:]+$/, ''))
    .filter((m) => /^(?=.*\d)(?=.*[a-z])[a-z0-9\-\/]{6,}$/i.test(m) && !/^\d+([x×]\d+)*(cm|mm|ml|cl|l|go|gb|to|tb|w|mah|pa|hz|m|kg|g|pcs|pièces)$/i.test(m) && !/^\d+[x×]\d+/.test(m) && !/^\d+-in-\d+$/i.test(m) && !/\d(fps|hz|mah|gb|go|tb|to|cm|mm|ml|cl|pcs|w|wh|lm|l|v|a|m|g|kg|p|k|pa|pièces)$/i.test(m) && !/^ip\d+$/i.test(m) && /\d{2}/.test(m) && /[a-z]{2}/i.test(m))
  return codes.length ? `code:${codes[0].toLowerCase()}` : null
}

export function produitsUniques(produits: ProduitPublic[]): Array<ProduitPublic & { prixMin: number | null; prixMax: number | null }> {
  const parCle = new Map<string, ProduitPublic[]>()
  for (const p of produits) {
    const cle = codeModele(p.titre) ?? (slugTitre(p.titre, 200) || p.titre)
    parCle.set(cle, [...(parCle.get(cle) ?? []), p])
  }
  return [...parCle.values()].map((offres) => {
    const prix = offres.flatMap((o) => [o.prixMin ?? o.prixVente, o.prixMax ?? o.prixVente]).filter((n): n is number => n != null)
    const avecPrix = offres.find((o) => o.prixVente !== null) ?? offres[0]
    // A verdict is about one offer, and offers are hidden in public: the most favourable one, « selon l'offre » when
    // they disagree (12/10/2026). The per-offer detail stays in the signed-in list.
    const avis = [...new Set(offres.map((o) => pourquoiAffiche(o)).filter(Boolean))]
    const meilleur = [...avis].sort((a, b) => rangVerdict(a) - rangVerdict(b))[0]
    const verdicts =
      avis.length > 1 && meilleur
        ? meilleur.includes(" selon l'offre") ? meilleur : meilleur.replace(/^([^·]*?)(\s+·\s+|$)/, "$1 selon l'offre$2")
        : avecPrix.verdicts
    return { ...avecPrix, rang: Math.min(...offres.map((o) => o.rang)), prixMin: prix.length ? Math.min(...prix) : null, prixMax: prix.length ? Math.max(...prix) : null, verdicts }
  })
}

export function pageJour(day: string, rapports: RapportPublic[], jourPrecedent?: string, jourSuivant?: string): string {
  const url = cheminJour(day)
  const date = dateLongue(day)
  const fil = [{ nom: 'Accueil', url: '/' }, { nom: 'Analyses de marché', url: '/analyses/' }, { nom: `Édition du ${date}` }]
  const rayons = rapports.filter((r) => r.type === 'rayon')
  const parCategorie = new Map<string, RapportPublic[]>()
  for (const r of rapports) parCategorie.set(r.categorie, [...(parCategorie.get(r.categorie) ?? []), r])
  const produits = rayons.flatMap((r) => produitsUniques(r.produits))
  // Deux par rayon, et d'abord ceux qui ont un prix conseillé : une vitrine du jour, pas un inventaire.
  const top = rayons
    .flatMap((r) =>
      produitsUniques(r.produits)
        .sort((x, y) => Number(y.prixVente !== null) - Number(x.prixVente !== null) || x.rang - y.rang)
        .slice(0, 2)
        .map((p) => ({ p, r })),
    )
    .slice(0, 12)

  const body = `${crumb(fil)}
<h1>Produits gagnants et tendances du ${date}</h1>
<p class="lede">L'édition du jour des agents ${NOM} : ${parCategorie.size} catégorie${parCategorie.size > 1 ? 's' : ''} analysée${parCategorie.size > 1 ? 's' : ''}, ${rapports.length} rapport${rapports.length > 1 ? 's' : ''}${produits.length ? `, ${produits.length} produits gagnants repérés` : ''}.</p>
${
  top.length
    ? `<h2 id="produits">Les produits gagnants du jour</h2><div class="tableau"><table>
<thead><tr><th>Produit</th><th>Catégorie</th><th>Prix de vente conseillé</th><th>Pourquoi</th></tr></thead>
<tbody>${top.map(({ p, r }) => `<tr><td><a href="${cheminRapport(r)}#produits">${esc(p.titre)}</a></td><td>${esc(r.categorieNom)}</td><td>${prixPublic(p)}</td><td>${esc(pourquoiAffiche(p))}</td></tr>`).join('')}</tbody></table></div>`
    : ''
}
${[...parCategorie.values()]
  .map((liste) => {
    const nom = liste[0].categorieNom
    return `<h2>${esc(nom)}</h2>${liste
      .map((r) => `<h3><a href="${cheminRapport(r)}">${esc(titreDansListe(r))}</a></h3>${r.accroche ? `<p>${esc(r.accroche)}</p>` : ''}<p class="meta">${esc(r.themeNom)} · ${resumeRapport(r)}</p>`)
      .join('')}<p><a href="${cheminCategorie(liste[0].categorie)}">Toutes les analyses ${esc(nom.toLowerCase())}</a></p>`
  })
  .join('\n')}
<p class="meta">${jourPrecedent ? `<a href="${cheminJour(jourPrecedent)}">← Édition du ${dateLongue(jourPrecedent)}</a>` : ''}${jourPrecedent && jourSuivant ? ' · ' : ''}${
    jourSuivant ? `<a href="${cheminJour(jourSuivant)}">Édition du ${dateLongue(jourSuivant)} →</a>` : ''
  }</p>`

  const description = `Les analyses de marché du ${date} : tendances par catégorie${produits.length ? ` et ${produits.length} produits gagnants à importer en dropshipping` : ''}, avec prix de vente conseillés.`
  return layout({
    url,
    title: `Produits gagnants et tendances du ${dateCourte(day)}`,
    description,
    publie: new Date(`${day}T06:00:00Z`),
    modifie: datePage(url, rapports.reduce((d, r) => (r.updatedAt > d ? r.updatedAt : d), new Date(`${day}T06:00:00Z`))),
    jsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'CollectionPage',
          name: `Édition du ${date}`,
          url: `${SITE}${url}`,
          inLanguage: 'fr-FR',
          datePublished: `${day}T06:00:00Z`,
          publisher: ORGANISATION,
          hasPart: rapports.map((r) => ({ '@type': 'NewsArticle', headline: r.titre, url: `${SITE}${cheminRapport(r)}` })),
        },
        breadcrumbLd(fil),
      ],
    },
    body,
  })
}

export function sitemapXml(rapports: Array<Pick<RapportPublic, 'id' | 'categorie' | 'day' | 'theme' | 'type' | 'titre' | 'une' | 'extrait' | 'updatedAt'>>): string {
  const categories = new Map<string, Date>()
  for (const r of rapports) {
    const d = categories.get(r.categorie)
    if (!d || d < r.updatedAt) categories.set(r.categorie, r.updatedAt)
  }
  const jours = new Map<string, Date>()
  for (const r of rapports) {
    const d = jours.get(r.day)
    if (!d || d < r.updatedAt) jours.set(r.day, r.updatedAt)
  }
  const ligne = (loc: string, mod: Date, prio: string, freq: string) =>
    `  <url><loc>${SITE}${loc}</loc><lastmod>${mod.toISOString()}</lastmod><changefreq>${freq}</changefreq><priority>${prio}</priority></url>`
  const dernier = rapports.reduce((d, r) => (r.updatedAt > d ? r.updatedAt : d), new Date(0))
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${ligne('/analyses/', rapports.length ? datePage('/analyses/', dernier) : new Date(), '0.8', 'daily')}
${[...jours.entries()].map(([j, mod]) => ligne(cheminJour(j), datePage(cheminJour(j), mod), '0.7', 'weekly')).join('\n')}
${[...categories.entries()].map(([id, mod]) => ligne(cheminCategorie(id), datePage(cheminCategorie(id), mod), '0.7', 'daily')).join('\n')}
${rapports.map((r) => ligne(cheminRapport(r), r.updatedAt, '0.6', 'monthly')).join('\n')}
</urlset>
`
}

// --- Les apostrophes perdues ----------------------------------------------------

// Vowel-initial words that follow an elided l', d', qu'… in report titles.
const MOTS_ELIDES =
  'effets?|ann[ée]es?|encres?|accès|achats?|usages?|ambiances?|hivers?|été|autres?|offres?|objets?|images?|écrans?|idées?|heures?|histoires?|' +
  'utilisations?|installations?|entretiens?|expériences?|occasions?|origines?|enfants?|abord|appareils?|outils?|eau|énergies?|air|automne|' +
  'intérieur|extérieur|authenticité|esprit|usines?|applications?|éclairages?|ordinateurs?|achat|essentiels?|indispensables?|alimentation|' +
  'arrivée|avenir|autonomie|audio|assistance|hygiène|humidité|odeurs?|ombres?|or|argent|aspirateurs?|espaces?|étés?|édition|élégance|' +
  'efficacité|économies?|émotions?|engouement|envie|ergonomie|équipements?|essor|évolution|excellence|exclusivité|immersion|impact|' +
  'innovation|intelligence|iphone|ipad|android|amazon|aliexpress|instagram|influence|international|internet|un|une|essais?|écoute|utilisateurs?|acheteurs?|achats?|actions?|imports?|importations?|exports?|emballages?|étiquettes?|unités?|offres?|accroches?|articles?|annonces?|abonnements?'
// Verbs only after d' (« avant dacheter ») : « lavoir » is a word, « l'avoir » never in a title.
const VERBES_ELIDES = 'acheter|essayer|offrir|utiliser|installer|attendre|économiser|avoir|être|écouter|entretenir|ouvrir|investir|importer|expédier|éviter|améliorer|ajouter'

/**
 * Some imported titles lost every apostrophe (« Manettes gaming : leffet Hall
 * de lannée »). Puts them back for display only: the address was attributed
 * from the raw title and stays as it is. A title with any apostrophe is left
 * untouched, and only known vowel-initial words are rejoined.
 */
export function apostrophesRendues(texte: string): string {
  if (!texte || /['’]/.test(texte)) return texte
  return apostrophesSansGarde(texte)
}

/** The same rules on any text: they only rejoin a known word glued to l/d/qu, never touch « l'effet ». */
function apostrophesSansGarde(texte: string): string {
  if (!texte) return texte
  const elision = new RegExp(`(?<![\\p{L}\\d])(jusqu|lorsqu|puisqu|qu|[lLdD])(${MOTS_ELIDES})(?![\\p{L}\\d])`, 'giu')
  return texte
    .replace(/(?<![\p{L}])(aujourd)(hui)(?![\p{L}])/giu, "$1'$2")
    // « cur du marché », « mise en uvre » : the œ ligature was dropped.
    .replace(/(?<![\p{L}])([cC])ur(?=\s+(?:du|de|des|d['’]|de\s+la)(?![\p{L}]))/gu, '$1œur')
    .replace(/(?<![\p{L}])(mise\s+en\s+|main-d['’]?|chef-d['’]?)uvre(s?)(?![\p{L}])/giu, (m, a: string, pl: string) => a.replace(/d$/, "d'") + 'œuvre' + pl)
    // « coût déncre » : the apostrophe was turned into an accent.
    .replace(/(?<![\p{L}])([dD])é(ncres?)(?![\p{L}])/gu, "$1'e$2")
    .replace(/(?<![\p{L}])([cCnN])(est)(?![\p{L}])/gu, "$1'$2")
    .replace(/(?<![\p{L}])([sS](?=ils?(?![\p{L}]))|[qQ]u)(ils?|on)(?![\p{L}])/gu, "$1'$2")
    .replace(new RegExp(`(?<![\\p{L}\\d])([dD])(${VERBES_ELIDES})(?![\\p{L}\\d])`, 'gu'), "$1'$2")
    .replace(elision, (m, avant: string, mot: string) =>
      // « lune » is the moon, never « l'une » in a title.
      /^l$/i.test(avant) && /^une?$/i.test(mot) ? m : `${avant}'${mot}`,
    )
}

/**
 * The same, line by line, for a whole text (body, prompts): a line that lost
 * its apostrophes gets them back, a line with any apostrophe or a link is left
 * as it is. A report whose text is sound therefore renders unchanged.
 */
export function apostrophesDuTexte(texte: string): string {
  if (!texte) return texte
  return texte
    .split('\n')
    .map((l) => l.split(/(`[^`]*`|\S*(?:https?:|www\.)\S*)/).map((morceau, i) => (i % 2 ? morceau : apostrophesSansGarde(morceau))).join(''))
    .join('\n')
}

// Accents dropped by the writing agent (« generalement »): only words that never exist without them.
const SANS_ACCENTS: Record<string, string> = {
  generalement: 'généralement', egalement: 'également', particulierement: 'particulièrement', reellement: 'réellement',
  legerement: 'légèrement', completement: 'complètement', precisement: 'précisément', regulierement: 'régulièrement',
  entierement: 'entièrement', premierement: 'premièrement', deuxiemement: 'deuxièmement', troisiemement: 'troisièmement',
  specifiquement: 'spécifiquement', strategie: 'stratégie', qualite: 'qualité', securite: 'sécurité', deja: 'déjà',
  specialisee: 'spécialisée', specialise: 'spécialisé', reconditionnes: 'reconditionnés', reconditionne: 'reconditionné', rentree: 'rentrée',
  complementaires: 'complémentaires', recents: 'récents', ecran: 'écran', contrefacon: 'contrefaçon', verifies: 'vérifiés', majorite: 'majorité',
  memoire: 'mémoire', geopolitiques: 'géopolitiques', generique: 'générique', generiques: 'génériques', embarquee: 'embarquée',
  differenciation: 'différenciation', ecrans: 'écrans',
}
const SANS_ACCENTS_MOTS = new RegExp(`(?<![\\p{L}])(${Object.keys(SANS_ACCENTS).join('|')})(?![\\p{L}])`, 'giu')

function distance(a: string, b: string): number {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let diag = d[0]
    d[0] = i
    for (let j = 1; j <= b.length; j++) {
      const haut = d[j]
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = haut
    }
  }
  return d[b.length]
}

/**
 * Damage left by the writing agent, fixed for display: CJK characters in a
 * French text (« plateformes低-coût »), words without their accents, and a link
 * labelled with a near-miss of its own site (« Toute-la-France » on
 * toute-la-franchise.com, 12/10/2026).
 */
export function texteRepare(texte: string): string {
  if (!texte) return texte
  return texte
    // « - {"idea":"Landing page…","categorie":"facile a tester"} » : an item the agent left as JSON.
    .replace(/^(\s*[-*]\s+)(\{.*\})\s*$/gm, (m, puce: string, json: string) => {
      try {
        const o = JSON.parse(json) as Record<string, unknown>
        const texteItem = [o.idea, o.idee, o.titre, o.title, o.nom, o.name].find((v) => typeof v === 'string') as string | undefined
        if (!texteItem) return m
        const genre = [o.categorie, o.category, o.type].find((v) => typeof v === 'string') as string | undefined
        return `${puce}${texteItem}${genre ? ` (${genre})` : ''}`
      } catch {
        return m
      }
    })
    .replace(/\s*低[-\s]?(coût|cout|prix)/g, (_m, mot: string) => ` à bas ${mot === 'prix' ? 'prix' : 'coût'}`)
    .replace(/\s*[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+[-\s]?/gu, ' ')
    // Outside addresses: « /qualite-… » in a URL is not a typo.
    .split(/(\S*(?:https?:|www\.)\S*)/)
    .map((morceau, k) => (k % 2 ? morceau : morceau.replace(/(?<![\p{L}])a(?=\s+(?:tester|surveiller)(?![\p{L}]))/gu, 'à').replace(SANS_ACCENTS_MOTS, (m: string) => {
        const juste = SANS_ACCENTS[m.toLowerCase()]
        return m[0] === m[0].toUpperCase() ? juste[0].toUpperCase() + juste.slice(1) : juste
      })))
    .join('')
    .replace(/\[([^\]\s]+)([^\]]*)\]\((https?:\/\/(?:www\.)?([a-z0-9-]+)\.[a-z.]+[^()\s]*)\)/gi, (m, lab: string, reste: string, url: string, site: string) => {
      // « futura-sciences.com » is the address itself, not a near-miss.
      const a = lab.toLowerCase().replace(/\.[a-z]{2,4}$/, '').replace(/[^a-z0-9]/g, '')
      const b = site.toLowerCase().replace(/[^a-z0-9]/g, '')
      if (!/-/.test(lab) || a === b || a.length < 6 || distance(a, b) > 4 || a.slice(0, 4) !== b.slice(0, 4)) return m
      const nom = site.split('-').map((w, i) => (i === 0 || w.length > 3 ? w[0].toUpperCase() + w.slice(1) : w)).join('-')
      return `[${nom}${reste}](${url})`
    })
}

const ORDINAUX = ['Premièrement', 'Deuxièmement', 'Troisièmement', 'Quatrièmement', 'Cinquièmement']
const NOMBRES: Record<string, number> = { deux: 2, trois: 3, quatre: 4, cinq: 5 }

/**
 * « trois points de vigilance. Troisièmement, … » once the private filter took
 * the first two: the announcement follows what is left, the ordinals are
 * renumbered, and a single point loses its ordinal (12/10/2026, eveil 04/10).
 */
export function pointsAnnonces(corps: string): string {
  return corps
    .split('\n')
    .map((l) => {
      const annonce = /(?<![\p{L}])(deux|trois|quatre|cinq)\s+(\p{L}+)([^.!?:]*)([.!?:])/iu.exec(l)
      if (!annonce || !/^(points|risques|axes|leviers|conseils|enjeux|mesures|règles|pistes|erreurs|raisons|conditions|limites|tendances|questions|recommandations|signaux|critères|étapes|chantiers|priorités)$/i.test(annonce[2])) return l
      const apres = l.slice(annonce.index + annonce[0].length)
      const presents = ORDINAUX.filter((o) => new RegExp(`(?<![\\p{L}])${o}(?![\\p{L}])`, 'u').test(apres))
      const annonce_n = NOMBRES[annonce[1].toLowerCase()]
      if (!presents.length || presents.length >= annonce_n) return l
      let suite = apres
      if (presents.length === 1) {
        suite = suite.replace(new RegExp(`(?<![\\p{L}])${presents[0]},?\\s*(et\\s+c['’]est\\s+le\\s+point\\s+le\\s+plus\\s+\\p{L}+\\s*:\\s*)?(\\p{L})`, 'u'), (_m, _c, x: string) => x.toUpperCase())
      } else {
        presents.forEach((o, i) => (suite = suite.replace(new RegExp(`(?<![\\p{L}])${o}(?![\\p{L}])`, 'u'), `\u0000${i}\u0000`)))
        suite = suite.replace(/\u0000(\d)\u0000/g, (_m, i: string) => ORDINAUX[Number(i)])
      }
      const feminin = /^(mesures?|règles?|pistes?|erreurs?|questions?|recommandations?|raisons?|conditions?|limites?|tendances?)$/i.test(annonce[2])
      const nombre = presents.length === 1 ? (feminin ? 'une' : 'un') : presents.length === 2 ? 'deux' : presents.length === 3 ? 'trois' : 'quatre'
      const nom = presents.length === 1
        ? `${annonce[2].replace(/s$/, '')}${annonce[3].replace(/(?<![\p{L}])(\p{L}{3,})s(?![\p{L}])/gu, '$1')}`
        : `${annonce[2]}${annonce[3]}`
      const casse = annonce[1][0] === annonce[1][0].toUpperCase() ? nombre[0].toUpperCase() + nombre.slice(1) : nombre
      return `${l.slice(0, annonce.index)}${casse} ${nom}${annonce[4]}${suite}`
    })
    .join('\n')
}

/** A report's own title in a list where its twin of the same day sits next to it. */
export function titreDansListe(r: Pick<RapportPublic, 'titre' | 'type' | 'produits'>): string {
  if (r.type === 'marketing') return `${r.titre} : analyse marketing`
  return r.produits.length ? `${r.titre} : ${r.produits.length} produits gagnants` : `${r.titre} : analyse de marché`
}

// --- La date de modification ----------------------------------------------------

/**
 * What a reader sees of a report, as a fingerprint: the page without its own
 * dates and without its « other reports » links. A filter change that alters
 * the public text changes it; a redeploy that alters nothing does not.
 */
export function empreintePublique(r: RapportPublic): string {
  return empreinteTexte(pageRapport({ ...r, updatedAt: new Date(0) }, []))
}

/**
 * What a reader actually sees: the <body> text, without markup, scripts or
 * structured data. #83 changed the price format of the JSON-LD only and the
 * HTML fingerprint dated about fifty unchanged pages « now » (12/10/2026).
 */
export function texteVisible(html: string): string {
  const corps = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html
  return corps
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
function empreinteTexte(html: string): string {
  return createHash('sha256').update(texteVisible(html)).digest('hex').slice(0, 20)
}

export type RendusConnus = Record<string, { empreinte: string; le: string }>

/** An edition or hub page as a fingerprint: its HTML without its own modification date. */
export function empreintePage(html: string): string {
  return empreinteTexte(html)
}

/**
 * Editions and hubs (/analyses/, /analyses/<jour>/, /analyses/<catégorie>/) are
 * dated by their own text as well as by their reports (12/10/2026: #82 changed
 * the 12/10 edition, its date stayed put). Set by the router, by address.
 */
let datesDesPages = new Map<string, Date>()
export function fixerDatesDesPages(dates: Map<string, Date>): void {
  datesDesPages = dates
}
function datePage(chemin: string, base: Date): Date {
  const d = datesDesPages.get(chemin)
  return d && d > base ? d : base
}

/**
 * A Drive import whose public text was rebuilt on 12/10/2026: a MARKETSPY file
 * (no « ## Analyse » section, read section by section since #72, then filtered
 * by #73 to #77). An older import is one « Analyse » block that none of it touched,
 * and a marketing report is not concerned: a MARKETSPY one is a stub (title only).
 */
export function texteRefait(r: { body: string; type?: string }, importeDrive?: boolean): boolean {
  return !!importeDrive && r.type !== 'marketing' && !/^\s*##\s*Analyse\s*$/m.test(r.body.split('\n').find((l) => l.trim()) ?? '')
}

/**
 * The store of #77 (no version) dated « now » every Drive import seen for the
 * first time, the older ones too (07/10 and 08/10, 12/10/2026 19:40), and the
 * one of #78 (version 2) kept that date for marketing reports; the one of #79
 * (version 3) seeded older imports with a data date that a reader replay had
 * moved (18:17). Those entries go, so they start again from their data date.
 */
export const VERSION_RENDUS = 5

export function rendusMigres(brut: unknown, refaits: Set<string>): RendusConnus {
  const o = (brut && typeof brut === 'object' ? brut : {}) as Record<string, any>
  if (o.version === VERSION_RENDUS && o.rapports && typeof o.rapports === 'object') return o.rapports as RendusConnus
  const entrees = typeof o.version === 'number' && o.rapports && typeof o.rapports === 'object' ? o.rapports : o
  const garde: RendusConnus = {}
  for (const [id, v] of Object.entries(entrees as Record<string, any>)) if (v && typeof v === 'object' && typeof v.empreinte === 'string' && refaits.has(id)) garde[id] = v
  return garde
}

/**
 * article:modified_time and the sitemap's lastmod follow the public text, not
 * only the data (12/10/2026: #76 changed six pages, their date stayed put).
 * A known fingerprint keeps its date; a new one is dated now. A report seen
 * for the first time keeps its data date, except one whose text was rebuilt on
 * 12/10/2026 (`texteRefait`: a MARKETSPY import, read section by section since #72).
 */
export function datesPubliques(
  lignes: Array<{ id: string; updatedAt: Date; empreinte: string; texteRefait?: boolean }>,
  connus: RendusConnus,
  maintenant = new Date(),
): { dates: Map<string, Date>; connus: RendusConnus; change: boolean } {
  const suivants: RendusConnus = {}
  const dates = new Map<string, Date>()
  let change = false
  for (const l of lignes) {
    const avant = connus[l.id]
    let le: Date
    if (avant && avant.empreinte === l.empreinte) le = new Date(avant.le)
    else {
      le = avant || l.texteRefait ? maintenant : l.updatedAt
      change = true
    }
    suivants[l.id] = { empreinte: l.empreinte, le: le.toISOString() }
    dates.set(l.id, l.updatedAt > le ? l.updatedAt : le)
  }
  if (Object.keys(connus).some((id) => !(id in suivants))) change = true
  return { dates, connus: suivants, change }
}
