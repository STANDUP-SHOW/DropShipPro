import { createRequire } from 'node:module'
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
function resumeRapport(r: Pick<RapportPublic, 'type' | 'produits'> & { prompts?: RapportPublic['prompts'] }): string {
  if (r.type === 'marketing') return `analyse marketing${promptsAnnonces(r.prompts ?? [], ', prompts ')}`
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
const CONNECTEUR_INITIAL = /^(\s*(?:[-*+]\s+|\d+[.)]\s+)?)(?:mais|ensuite|plus\s+largement|donc|par\s+ailleurs|en\s+revanche)(?:\s*,\s*|\s+)(?=\p{L})/iu

/**
 * « Plus largement, la mode reste… », « Mais offre une cuisson uniforme » : a connector opening a paragraph or a
 * cell hung on a sentence that was filtered out. « Budget de test conseillé. Ensuite, … » : a bare label then the
 * connector, both go. The text starts again with a capital.
 */
export function sansConnecteurInitial(l: string): string {
  if (!l.trim() || /^\s*(#|\|)/.test(l)) return l
  const etiquette = /^(\s*(?:[-*+]\s+|\d+[.)]\s+)?)([^.!?:]{1,40})\.\s+(?=(?:ensuite|puis|donc)\s*,)/iu.exec(l)
  if (etiquette && etiquette[2].trim().split(/\s+/).length <= 4) l = etiquette[1] + l.slice(etiquette[0].length)
  const m = CONNECTEUR_INITIAL.exec(l)
  if (!m) return l
  const reste = l.slice(m[0].length)
  return m[1] + reste.charAt(0).toUpperCase() + reste.slice(1)
}

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
  /aliexpress|alibaba|\b1688\b|cj\s?drop|cjdropshipping|\btemu\b|\bshein\b|bigbuy|\baccio\b|dhgate|banggood|spocket|zendrop|syncee|vidaxl|made[-\s]in[-\s]china|global\s?sources|taobao|joybuy|lightinthebox|ankorstore|eprolo|webstaurant|printful|printify|hypersku|\bdoba\b|wholesale2b|dropshipzone|grilles?\s+revendeur|(achetée?s?|importée?s?|commandée?s?|à\s+confirmer(\s+directement)?)\s+(auprès\s+de|chez)\s|cité\s+par\s+\p{Lu}|notre\s+produit\s+\p{Lu}\p{L}+\s+\p{Lu}|fournisseur|salehoo|droppery|printkk|\bacopa\b|innovagoods|annuaires?\s+de\s+grossistes|comptes?\s+distributeur|prix\s+professionnel/iu
// « achat » alone is the shopper's purchase (« 51 % des achats sont déclenchés par une panne »), not ours.
const TERME_ACHAT = /prix\s*(d['’ ]?)?achat|achat\s*(unitaire|en\s*lot|group[ée]|local)|co[uû]t|marge|\broi\b|revient|\brendue?s?\b|transport compris|[ée]chantillon|\bfret\b|achat\s*(à|a|de|pour)\s*\d|€\s*d['’]\s*achat|\bachet[ée]e?s?\s+(au|à|en|chez)\b|d[ée]placement/i
const MONTANT = /\d\s*(€|eur\b|euros?\b)|€\s*\d/i
const MARGE_PCT = /(marge|\broi\b)[^.;]{0,40}\d\s*%|\d\s*%[^.;]{0,20}(de\s*)?(marge|\broi\b)/i
/** A ceiling the seller should buy under (« ≤ 4,13 € », « objectif 12,25 € ») is a buying price whatever the words around it. */
const PLAFOND = /(≤|<=|⩽|\bmax(imum)?\b|plafond|objectif|n[ée]goci\w*\s+(sous|à|a|au\s+plus))\s*:?\s*\d[\d\s\u00a0]*(?:[.,]\d+)?\s*€|prix\s*max|\d\s*€\s*nets?\b/i
/** A supplier's name, a foreign-currency price, a buying ceiling, or a buying term next to an amount (« coût rendu 18 € »). */
// A price converted from pounds or dollars, a rate, « à renégocier », « prix d'achat » itself: buying talk (eveil, 12/10/2026).
const ACHAT_EN_CLAIR = /\b(le|les|ce|ces|nos|notre|un|du)\s+prix\s+d['’ ]?achat|tarif\s+fournisseur|ren[ée]goci|taux\s+(indicatif|de\s+change|approximatif)|convertis?\s+(de|depuis|au)\b|€\s*\/\s*(£|\$)|\bcatalogue\s*«?\s*api\b|prix\s+indiqués?\s+plus\s+bas|lignes?\s+marquées?\s+«\s*estimation|canaux\s+b2b|guide\s+b2b|sourcing\s+alternatif|(achetée?s?|achat|lot|tarif|prix|sourcing)\s+(en\s+)?b2b|non\s+chiffré|tarifs?\s+(revendeur|distributeur|public)|sans\s+tarif|compte\s+revendeur|grossistes?\b|distributeurs?\s+agréés|\bsourcing\b|prix\s+de\s+gros|\bmoq\b|tarifs?\s+palier|palier\s+\d+\s*\+?\s*unités|marges?\s+(brute|nette|en\s+valeur)|(achat|importer|acheter|commander)\s+en\s+lots?\b|(?<!côté\s)\bb2b\b|(prix|tarif|grille|marge|remise|achat)[^.;,]{0,30}\brevendeurs?\b|peu\s+de\s+marge|dégage\s+une\s+marge|\bachet(er|é|ée|és|ées)\s+(à|a)\s+\d/i
// The agents' own working notes (« quota WebSearch épuisé », « à reclasser en `api` », « purchase_price … null »).
const JARGON =
  /conversion\s+usd|usd\s*(→|->|vers)\s*eur|websearch|quota\s+de\s+recherche|robots\.txt|politique\s+réseau|(de|cette)\s+session|reclass|colonne\s+import|note\s+import|purchase_price|landed_cost|estimated_|\bnull\b|compte\s+pro\b|prix\s+non\s+public|rendu\s+js|navigateur\s+réel|voir\s+(la\s+)?méthodologie|«\s*(url|api|extension)\s*»|import\s+(url|api|extension)|\/item\/|fiche\s+produit\s+générique|\bmaxime\b|rapport\s+rayon|retraité|connexions?\s+api|\bapi\s*\/\s*extension|^\s*(\*\*)?\s*(limite|note|point)s?\s+(de\s+)?méthod|^\s*(\*\*)?\s*méthodologie|`(api|url|extension)`|<code>(api|url|extension)<\/code>|n['’]ont\s+pas\s+pu\s+être\s+(interrogée?s?|consultée?s?|lue?s?)|refusé\s+l['’]accès|accès\s+automatisé|lecture\s+automatisée|recherche\s+automatisée?|prochain\s+passage\s+de\s+l['’]agent|l['’]agent\s+(marketing|rayon)|vérifier\s+manuellement|par\s+un\s+humain|dommage\s+d['’]inventer|ont\s+bloqué|honnêteté\s+d['’]abord|connexion\s+requise|non\s+vérifiée?s?|non\s+relevée?s?\s+aujourd|n['’]avons\s+pas\s+pu|pas\s+pu\s+(accéder|consulter|interroger|vérifier)|n['’]a\s+pu\s+être\s+(vérifiée?s?|consultée?s?|lue?s?)|non\s+accessibles?|que\s+j['’]ai\s+pu|nous\s+le\s+signalons|vérification\s+en\s+direct|connaissance\s+générale\s+du\s+secteur|chargée?\s+en\s+javascript|hors\s+session|lors\s+de\s+cette\s+recherche|sur\s+toute\s+la\s+recherche|résultats?\s+de\s+recherche|^\s*pas\s+de\s+recherche\s*$|comptes?\s+pub(licitaires?)?\s+de\s+(max|drop-?shipper)|depuis\s+le\s+compte\s+publicitaire|limitation\s+de\s+prix\s+public|sources?\s+extension|relevé\s+manuel|les\s+données\s+disponibles\s+ne\s+donnent/i
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
const ANAPHORE = /^(\*\*)?(c['’]est\s|ces\s|cette\s|cet\s|mieux vaut (les|le|la)|il vaut mieux (les|le|la)|ils\b|elles\b|ces derni|ce dernier|cette derni|celui-ci|celle-ci|ceux-ci|celles-ci|cela\b|ça\b|d['’]où\b|(tout|rien|ils?|elles?|ces?\s+\S+)\s+(a|ont|est|sont)\s+donc\b)/i
const LIBELLE_LISTE = /^\s*(\*\*)?\s*(éviter|à éviter|liste de surveillance|négocier|acheter maintenant|quantités)/i

// What a cut leaves around it: « 30-100 € . », « explicitement . », « préalable. . ».
const propre = (t: string) => t.replace(/(\S)\s+([.,])(?=\s|$)/g, '$1$2').replace(/([.!?])(?:\s*\.)+(?=\s|$)/g, '$1')

const STRUCTURE_ANNONCEE =
  /(?<![\p{L}])(deux|trois|quatre|cinq|six)\s+(étages|paliers|niveaux|blocs|strates|segments|familles|axes|points|leviers|risques|tendances|catégories|types|gammes|piliers|raisons|pièges|erreurs|profils|cibles|angles|formats|critères|étapes)(?![\p{L}])/iu
const ENUMERATION_EN_LIGNE =
  /\(\s*[1-9]\s*\)[^()]{3,}\(\s*[2-9]\s*\)|(?:^|\s)[1-9]\.\s+\*\*[^*]+\*\*.*\s[2-9]\.\s+\*\*/iu
const NOTE_DE_METHODE = /^\s*(?:[-*+]\s+)?(?:\*\*|\*)?\s*((limites?|notes?|points?)\s+(de\s+)?méthod|méthodologie|limites?\s+de\s+vérification|note\s+sur\s+la\s+colonne|note\s+import)/i

export function sansMentionsPrivees(corps: string): string {
  const sortie: string[] = []
  let dansCode = false
  // A lead-in that counts its list (« Pour un revendeur, trois constats : ») and whether an item of it was dropped.
  let annonce = -1
  const recomptees = new Set<number>()
  let introPrivee = false
  // « …le marché se lit en deux strates très différentes. » whose strates were the next paragraph, now gone.
  let suspens = -1
  let depuis = -1
  // The announcement closes its sentence: « …se lit en deux strates très différentes. », not « Trois familles… : (1) … ».
  const annonceFinale = (phrase: string) => {
    const m = STRUCTURE_ANNONCEE.exec(phrase)
    return !!m && phrase.length - (m.index + m[0].length) <= 40 && !/:/.test(phrase.slice(m.index))
  }
  const bilan = () => {
    if (depuis < 0) return
    let p = -1
    for (let k = sortie.length - 1; k >= depuis; k--) if (sortie[k].trim()) { p = k; break }
    if (suspens >= 0 && p < 0) {
      const phrases = sortie[suspens].split(/(?<=[.!?])\s+/)
      if (annonceFinale(phrases[phrases.length - 1])) sortie[suspens] = phrases.slice(0, -1).join(' ')
    }
    const fin = p >= 0 ? sortie[p].split(/(?<=[.!?])\s+/).pop() ?? '' : ''
    suspens = p >= 0 && annonceFinale(fin) ? p : -1
  }
  for (const brute of corps.replace(/\r\n/g, '\n').split('\n')) {
    if (/^\s*```/.test(brute)) dansCode = !dansCode
    if (!dansCode && brute.trim()) {
      bilan()
      depuis = sortie.length
    }
    const estPuce = /^\s*(?:[-*+]|\d+[.)])\s+/.test(brute)
    // The items under a dropped lead-in (« **Segmentation prix observée sur AliExpress** (…) : ») are its content: they go too.
    if (!dansCode && estPuce && introPrivee) continue
    // The agent's method notes (« **Limite méthodologique…** », « **Note sur la colonne Import** ») are about its tools, not the market.
    if (!dansCode && NOTE_DE_METHODE.test(brute)) continue
    if (!dansCode && brute.trim() && !estPuce) introPrivee = false
    if (!dansCode && brute.trim() && !estPuce) annonce = /:\s*(\*\*)?\s*$/.test(brute) ? sortie.length : -1
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
    // A paragraph built on an announced count (« trois étages », « (1) … (2) … (3) ») cannot lose a piece and still
    // read: it goes whole (12/10/2026).
    if (ENUMERATION_EN_LIGNE.test(ligne)) {
      if (estPuce && annonce >= 0) recomptees.add(annonce)
      continue
    }
    const puce = /^(\s*(?:[-*+]|\d+[.)])\s+)/.exec(ligne)?.[1] ?? ''
    let texte = ligne.slice(puce.length)
    const lib = /^([^:;.]{1,140}?)\s?:\s+(.*)$/.exec(texte)
    // « Nous entrons dans la fenêtre … pour ce rayon : octobre… » is a sentence, not a label: labels are short or bold.
    const libelle = lib && !estPrivee(lib[1]) && (/\*\*/.test(lib[1]) || (lib[1].length <= 60 && lib[1].split(/\s+/).length <= 8)) ? lib[1] : ''
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
        return LIBELLE_LISTE.test(libelle) || (estPuce && garde.split(/\s+/).length >= 4 && !relativeOrpheline(morceau)) ? garde : morceau
      }
      return morceau
    })
    // « …se structure sur trois étages. » whose étages went: an announcement that lost what follows it goes, with
    // the whole paragraph (12/10/2026).
    const iAnnonce = morceaux.findIndex((m) => STRUCTURE_ANNONCEE.test(m))
    if (iAnnonce >= 0 && morceaux.slice(iAnnonce, iAnnonce + 4).some((m) => !m.trim() || prive(m))) {
      if (estPuce && annonce >= 0) recomptees.add(annonce)
      continue
    }
    // « Côté gammes de prix : » with one band left out of four is not a picture of the bands any more.
    if (/gammes?|segments?|paliers?|fourchettes?/i.test(libelle) && morceaux.length >= 3 && morceaux.filter((m) => m.trim() && !prive(m)).length <= 1) {
      if (estPuce && annonce >= 0) recomptees.add(annonce)
      continue
    }
    const premierRetire = !!morceaux.length && (!morceaux[0].trim() || prive(morceaux[0]))
    // « Mieux vaut les proposer en kit » leans on the sentence before it: it goes with it.
    const reste = morceaux
      .filter((morceau, i) => morceau.trim() && !prive(morceau) && !(i > 0 && prive(morceaux[i - 1]) && (ANAPHORE.test(morceau) || (morceaux.slice(0, i).every((m) => !m.trim() || prive(m)) && /^(\S+\s+){0,7}?(donc|aussi)(?![\p{L}])/iu.test(morceau)))))
      .join(' ')
      .replace(/[\s;,]+$/, '')
      .trim()
      .replace(/[^.!?:…]$/, (fin) => fin + '.')
      .replace(/\s*;\s+(?=[A-ZÀ-Ý])/g, '. ')
    // A claim in bold (« **Importer des drones ne marche pas** : le Neo 2 coûte… ») stands alone once its figures go,
    // and what follows a dropped first sentence is a new sentence, not the label's explanation.
    const affirmation = /\*\*/.test(libelle)
    // « Ce qui est établi par les sources : <gone>. Recommandation : … » : the label lost what it labelled.
    const sansLibelle = premierRetire && !!libelle && !affirmation && !LIBELLE_LISTE.test(libelle) && /[.!?]\s*$/.test(morceaux[0])
    const nouvellePhrase = premierRetire && (affirmation || !libelle || sansLibelle)
    // A bold lead-in alone (« **Ce qui sature.** ») or a bare price band (« **< 30 €** ») says nothing once its text goes.
    const seulTitre = (t: string) => (/^\*\*[^*]+\*\*[.:]?$/.test(t.trim()) && t.trim().split(/\s+/).length < 4) || !/[a-zà-ÿ]{3}/i.test(t.replace(/\*\*/g, '').replace(/€/g, ''))
    if (reste && /[a-zà-ÿ]{3}/i.test(reste) && !(seulTitre(reste) && !libelle)) sortie.push(propre(`${puce}${libelle && !sansLibelle ? (nouvellePhrase ? `${libelle}. ` : `${libelle} : `) : ''}${nouvellePhrase ? reste.charAt(0).toUpperCase() + reste.slice(1) : libelle && premierRetire ? reste.replace(/^([A-ZÀ-Ý])(?=[a-zà-ÿ])/, (c) => c.toLowerCase()) : reste}`))
    else if (affirmation && libelle.replace(/\*\*/g, '').trim().split(/\s+/).length >= 6) sortie.push(`${puce}${libelle.replace(/[\s,;]+$/, '')}.`)
    else if (estPuce && annonce >= 0) recomptees.add(annonce)
    if (!estPuce && /:\s*(\*\*)?\s*$/.test(brute) && sortie.length === avant && /prix|co[uû]t|marge|achat|tarif/i.test(brute)) introPrivee = true
  }
  bilan()
  // « trois constats » over a list that lost one: the count goes, the words stay.
  for (const i of recomptees) {
    // The lead-in itself may have gone (« **Pièges fournisseurs…** : »): then index i is an item, not a count to fix.
    if (i >= sortie.length || !/:\s*(\*\*)?\s*$/.test(sortie[i]) || /^\s*(?:[-*+]|\d+[.)])\s+/.test(sortie[i])) continue
    sortie[i] = sortie[i].replace(/\b(deux|trois|quatre|cinq|six|sept|huit|neuf|dix|\d+)\s+(?=[a-zà-ÿ])/i, '')
    // « Pièges à éviter : » over a single item left: one sentence, in the singular.
    let j = i + 1
    while (j < sortie.length && !sortie[j].trim()) j++
    const items: number[] = []
    for (let k = j; k < sortie.length && /^\s*(?:[-*+]|\d+[.)])\s+/.test(sortie[k]); k++) items.push(k)
    if (items.length === 1) {
      const tete = sortie[i].replace(/\s*:\s*(\*\*)?\s*$/, (_m, gras?: string) => gras ?? '').replace(/^(\**)(\p{L}{4,})s(?![\p{L}])/u, '$1$2')
      sortie[i] = `${tete} : ${sortie[items[0]].replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '')}`
      sortie[items[0]] = ''
    }
  }
  // « **Strate 2 — …** » once « Strate 1 » went: the numbered parts are counted again from 1.
  const PARTIE = /^(\s*(?:[-*+]\s+)?\*\*\s*(?:strate|palier|niveau|étape|segment|bloc|famille)\s+)(\d+)(?=\s*(?:\*\*)?\s*[—–:.-])/i
  let rang = 0
  let parties: number[] = []
  // A lone « **Strate 1 — la saisonnalité courte.** » is no series: it melts into the text, without its number.
  const seule = () => {
    // « le marché se lit en deux strates » over what is left of them: the announcement goes, the parts stay.
    if (parties.length) {
      const ANNONCE = /(?<![\p{L}])(deux|trois|quatre|cinq)\s+(?:\p{L}+\s+)?(strates|paliers|niveaux|étapes|segments|blocs|familles)(?![\p{L}])/iu
      for (let k = parties[0] - 1; k >= 0 && !/^#{1,3}\s/.test(sortie[k]); k--) {
        const a = ANNONCE.exec(sortie[k])
        if (!a) continue
        if (NOMBRES[a[1].toLowerCase()] > parties.length) {
          sortie[k] = sortie[k]
            .split(/(?<=[.!?])\s+/)
            .filter((p) => !ANNONCE.test(p))
            .join(' ')
        }
        break
      }
    }
    if (parties.length === 1) {
      const k = parties[0]
      sortie[k] = sortie[k].replace(
        /^(\s*(?:[-*+]\s+)?)\*\*\s*(?:strate|palier|niveau|étape|segment|bloc|famille)\s+1\s*(?:[—–:.-]\s*)?(.*?)\s*\*\*\s*:?\s*/i,
        (_x, puce: string, titre: string) => (titre ? `${puce}**${titre.charAt(0).toUpperCase()}${titre.slice(1)}** ` : puce),
      )
      if (!/\*\*/.test(sortie[k].slice(0, 4))) sortie[k] = sortie[k].replace(/^(\s*(?:[-*+]\s+)?)(\p{Ll})/u, (_m, p: string, c: string) => p + c.toUpperCase())
    }
    parties = []
    rang = 0
  }
  for (let k = 0; k < sortie.length; k++) {
    const m = PARTIE.exec(sortie[k])
    if (m) {
      sortie[k] = sortie[k].replace(PARTIE, (_x, tete: string) => `${tete}${++rang}`)
      parties.push(k)
    } else if (/^#{1,3}\s/.test(sortie[k])) seule()
  }
  seule()
  // « Plus largement, la mode… », « Mais offre… » opening a paragraph: the sentence they hung on is gone.
  for (let k = 0; k < sortie.length; k++) sortie[k] = sansConnecteurInitial(sortie[k])
  // Items with no lead-in (« ## Publicités en cours » then « - une spécialisation… ; ») read as sentences.
  let introduits = false
  for (let k = 0; k < sortie.length; k++) {
    const l = sortie[k]
    if (!l.trim()) continue
    if (!/^\s*(?:[-*+]|\d+[.)])\s+/.test(l)) {
      introduits = /:\s*(\*\*)?\s*$/.test(l)
      continue
    }
    if (!introduits) sortie[k] = l.replace(/^(\s*(?:[-*+]|\d+[.)])\s+)(\p{Ll})(?!\p{Lu})/u, (_m, p: string, c: string) => p + c.toUpperCase()).replace(/\s*;\s*$/, '.')
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
      const annonce = !titre && l.trim() && !/^\s*([-*+]|\d+[.)])\s/.test(l) && /:\s*(\*\*)?\s*$/.test(l)
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
const POURQUOI_INTERNE = /voir\s+(la\s+)?note|non\s+vérifiable|rendu\s+js|sans\s+(navigateur|extension)|\bfret\b|prix\s+à\s+(vérifier|valider|reconfirmer)|estimée?s?(?![\p{L}])|estimation|fiche\s+(api|exacte|précise)|\bapi\b|via\s+l['’]extension|manuellement|lisible\s+sans|\bb2b\b|compte\s+professionnel|\bfetch\b|avant\s+import|à\s+re(confirmer|contrôler)|non\s+vérifié|sourcing|retraité|import\s+(url|api|extension)|b2b|revendeur|grossiste|marges?\b|\bmoq\b|prix\s+de\s+gros|palier|tarif|\bfiches?\b|vérifiée?s?|plateforme\s+générale|à\s+corriger|dès\s+accès|achet\w*\s+(à|a)\s+\d/iu

// The English verdicts of other agents (« WATCHLIST », « BUY IF NEGOTIATED »), translated as the import does.
const { verdictFr } = createRequire(import.meta.url)('../../rapports-etude.cjs') as { verdictFr: (t: string) => string }
function verdictPublic(champ: string): string {
  const t = champ.trim().replace(/\s+sauf\s+sourcing.*$/i, '')
  // « BUY NOW avec test GPU strict », « WATCHLIST / plutôt affiliation » : the capitals are the verdict, the rest qualifies it.
  const m = /^([A-Z][A-Z'’ ]*[A-Z])(?![a-zà-ÿ])(.*)$/.exec(t)
  if (!m || !/[A-Z]{3}/.test(m[1])) return champ
  const tete = m[1].trim()
  const fr = verdictFr(tete)
  if (fr === tete || /\b(IF|ONLY|AFTER|DEAL|TESTED|LOCAL)\b/.test(fr)) return champ
  const suite = m[2].replace(/^\s*[\/:—–-]\s*/, ', ').replace(/^\s+/, ' ')
  return fr.charAt(0) + fr.slice(1).toLowerCase() + suite
}

const pourquoiPrive = (t: string) =>
  TRAHIT_ACHAT.test(t) || CJ_SEUL.test(t) || JARGON.test(t) || POURQUOI_INTERNE.test(t) || FOURNISSEUR_NOMME.test(t) || ACHAT_EN_CLAIR.test(t)

export function pourquoiPublic(texte: string | null | undefined): string {
  if (!texte) return ''
  // The agents' « · »-separated fields (verdict · reason · audience) are filtered one by one.
  return texte
    .split(/\s+·\s+/)
    .map(verdictPublic)
    .map((champ) => {
      const sansParentheses = champ.replace(/\s*\(([^()]*)\)/g, (m, dedans: string) => (pourquoiPrive(dedans) ? '' : m))
      // A comma inside parentheses (« (véhicule pro, anti-vol) ») does not end a member.
      const membres = sansParentheses.split(/(?:\s*[;,]\s+|\s+[—–-]\s+)(?![^()]*\))/).map((m) => m.trim().replace(/[.\s]+$/, ''))
      // « attention, prix d'achat affiché… » : a one-word member announced what went with the next one.
      const net = membres
        .filter((m, i) => m && !pourquoiPrive(m) && !(m.split(/\s+/).length === 1 && i + 1 < membres.length && pourquoiPrive(membres[i + 1])))
        .join(', ')
      const equilibre = sansConnecteurInitial(parenthesesEquilibrees(net).trim())
      return /\p{L}/u.test(equilibre) ? equilibre.charAt(0).toUpperCase() + equilibre.slice(1) : ''
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

// « 1 299,00 € », with the French thousands space.
const montantPublic = (n: number) => n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+,)/g, '\u00a0')
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

/** The report's own sections as the page renders them: the analysis, never the private tables. */
function blocsPublics(r: RapportPublic): string {
  return blocsDe(r.body)
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
}

/**
 * Nothing left to read once the filters ran (outillage-main marketing du 18/09 : every field empty in the data):
 * the page leaves the sitemap and the lists, and its address leads to the rayon page of the same day.
 */
export function corpsVisibleVide(r: RapportPublic): boolean {
  if (r.produits.length || r.prompts.length) return false
  return !/\p{L}{2}/u.test(blocsPublics(r).replace(/<h2[^>]*>[\s\S]*?<\/h2>/g, ' ').replace(/<[^>]+>/g, ' '))
}

/** « image et vidéo » only for the kinds of prompts the page really shows (12/10/2026: one generic image prompt). */
function promptsAnnonces(prompts: Array<{ genre: string }>, avant: string): string {
  const image = prompts.some((p) => p.genre === 'image')
  const video = prompts.some((p) => p.genre === 'video')
  return image || video ? `${avant}${image && video ? 'image et vidéo' : image ? 'image' : 'vidéo'}` : ''
}

export function pageRapport(r: RapportPublic, autres: RapportPublic[] = []): string {
  const cat = r.categorieNom
  const theme = r.themeNom
  const url = cheminRapport(r)
  const estRayon = r.type === 'rayon'
  const title = titreRapport(r)
  // A price is « advised » on the page only when most rows show one (07/10: 0 prices out of 9).
  const prixConseilles = r.produits.filter((p) => p.prixVente != null).length * 2 >= r.produits.length
  const promesseVide =
    !!r.accroche &&
    ((r.type === 'marketing' && !r.prompts.length && /prompts?/i.test(r.accroche)) ||
      (!r.prompts.some((p) => p.genre === 'video') && /prompts?[^.]{0,40}vidéo/i.test(r.accroche)) ||
      (estRayon && !prixConseilles && /prix\s+(de\s+vente\s+)?conseillé/i.test(r.accroche)))
  const description =
    (r.accroche && !promesseVide ? r.accroche : '') ||
    (estRayon
      ? r.produits.length
        ? `Analyse de marché ${theme.toLowerCase()} du ${dateLongue(r.day)} et ${r.produits.length} produits à importer en dropshipping${prixConseilles ? ', avec prix de vente conseillé' : ''}.`
        : `Analyse de marché ${theme.toLowerCase()} du ${dateLongue(r.day)} : tendances, prix pratiqués, saisonnalité et pistes de produits à importer en dropshipping.`
      : r.prompts.length
        ? `Analyse marketing ${theme.toLowerCase()} du ${dateLongue(r.day)} : angles, audiences${promptsAnnonces(r.prompts, ', prompts publicitaires ')}.`
        : `Analyse marketing ${theme.toLowerCase()} du ${dateLongue(r.day)} : angles, audiences et réseaux sociaux.`)

  const fil = [
    { nom: 'Accueil', url: '/' },
    { nom: 'Analyses de marché', url: '/analyses/' },
    { nom: cat, url: cheminCategorie(r.categorie) },
    { nom: `${theme} — ${dateLongue(r.day)}` },
  ]

  const blocs = blocsPublics(r)

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
${jumeau ? `<h2>Le même jour</h2><ul class="liste"><li><a href="${cheminRapport(jumeau)}">${esc(jumeau.titre)}</a><small>${jumeau.type === 'rayon' ? 'Analyse de marché et produits gagnants' : jumeau.prompts.length ? 'Analyse marketing : angles et prompts publicitaires' : 'Analyse marketing : angles et audiences'}</small></li></ul>` : ''}
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
  /aliexpress|alibaba|\b1688\b|\btemu\b|(?<![\p{L}\d])CJ(?![\p{L}\d])|cjdropshipping|bigbuy|banggood|dhgate|dropizi|syncee|spocket|zendrop|autods|\bshein\b|sourcing|\bb2b\b|grossiste|fournisseur|dropshipping|\bfiche\b|\ben\s+gros\b/iu

/** A product's public title: the platform it was found on goes, the product stays readable (12/10/2026). */
export function titreProduitPublic(titre: string): string {
  // « Chaise de table de jardin en gros - Acheter à » : the page title's call to action, cut before its price.
  titre = titre.replace(/\s+[-—–|]\s+acheter\s+(à|a)\s*$/i, '')
  if (!PLATEFORME_TITRE.test(titre)) return titre
  const net = titre
    .replace(/\s*\(([^()]*)\)/g, (m, dedans: string) => (PLATEFORME_TITRE.test(dedans) ? '' : m))
    .split(/\s+[-—–|]\s+/)
    .map((morceau, i) =>
      i === 0 ? morceau : /reconditionn/i.test(morceau) ? 'reconditionné' : PLATEFORME_TITRE.test(morceau) ? '' : morceau,
    )
    .filter(Boolean)
    .join(' — ')
    // « Oxymètre de pouls LED portable, mention CE/ISO sur la fiche » : the clause about the page goes whole.
    .split(/,\s+/)
    .filter((morceau, i) => i === 0 || !PLATEFORME_TITRE.test(morceau))
    .join(', ')
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
      // A public price at or under zero is a parsing accident, never a price (« -10,00 € », 12/10/2026).
      const positif = (n: number | null | undefined) => (n != null && n > 0 ? n : null)
      const prix = { prixVente: positif(p.prixVente), ...(p.prixMin !== undefined ? { prixMin: positif(p.prixMin) } : {}), ...(p.prixMax !== undefined ? { prixMax: positif(p.prixMax) } : {}) }
      const prixSains = prix.prixVente === p.prixVente && (p.prixMin === undefined || prix.prixMin === p.prixMin) && (p.prixMax === undefined || prix.prixMax === p.prixMax)
      return t === p.titre && pourquoi === p.pourquoi && prixSains ? p : { ...p, ...prix, titre: t, pourquoi }
    })
}

function codeModele(titre: string): string | null {
  // An accessory « pour Insta360 X5 » is not the camera; a brand (« Insta360 ») is not a model code.
  if (/(?<![\p{L}])(pour|compatible|for|avec)(?![\p{L}])/iu.test(titre)) return null
  const codes = titre
    .split(/[\s,()]+/)
    .map((m) => m.replace(/[.;:]+$/, ''))
    .filter((m) => /^(?=.*\d)(?=.*[a-z])[a-z0-9\-\/]{6,}$/i.test(m) && !/^\d+([x×]\d+)*(cm|mm|ml|cl|l|go|gb|to|tb|w|mah|pa|hz|m|kg|g|pcs|pièces)$/i.test(m) && !/^\d+[x×]\d+/.test(m) && !/^\d+-in-\d+$/i.test(m) && !/\d(fps|hz|mah|gb|go|tb|to|cm|mm|ml|cl|pcs|w|wh|lm|l|v|a|m|g|kg|p|k|pa|pièces)$/i.test(m) && !/^ip\d+$/i.test(m) && /\d{2}/.test(m) && /[a-z]{2}/i.test(m) && /\d[a-z]|[a-z][-\/]?\d.*[a-z]/i.test(m) && !/^[a-z]+\d+$/i.test(m))
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
  'innovation|intelligence|iphone|ipad|android|amazon|aliexpress|instagram|influence|international|internet|un|une|essais?|écoute|utilisateurs?|acheteurs?|achats?|actions?|imports?|importations?|exports?|emballages?|étiquettes?|unités?|offres?|accroches?|articles?|annonces?|abonnements?|entrées?|expressions?|associations?|auteurs?|aimants?|aimantations?|adhésifs?|adhérence|écologie|encombrement|installations?|ensembles?|atouts?|angles?|alternatives?|argument|arguments|habitude|habitudes|herbe|hôtel|humour'
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
  reglementation: 'réglementation', ete: 'été', pieces: 'pièces', detachees: 'détachées', reparation: 'réparation',
  telephone: 'téléphone', telephones: 'téléphones', levitation: 'lévitation', neon: 'néon', passionnes: 'passionnés',
  eviter: 'éviter', etudiante: 'étudiante', etudiants: 'étudiants', banniere: 'bannière', eventail: 'éventail',
  protegez: 'protégez', degres: 'degrés', deballage: 'déballage', apres: 'après', temoignage: 'témoignage',
  decouvre: 'découvre', eblouissant: 'éblouissant', simulee: 'simulée', arrete: 'arrête',
  disposes: 'disposés', trempe: 'trempé',
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
/**
 * The prompts as the page shows them: repaired like the body, without the ones
 * that are only a title in quotes (« "# Outillage à main spécialisé…" », 19/09)
 * or that lost their only field (12/10/2026).
 */
// The 07/10 agent's one-size template, the same on printers, stickers and scooters (« autonomie mesurée, coût à la page »).
const GABARIT_PROMPT =
  /produit\s+au\s+centre\s+sur\s+fond\s+neutre|démo\s+produit\s+en\s+main|cadre\s+sublimé\s+grâce\s+au\s+produit|autonomie\s+mesurée,\s+coût\s+à\s+la\s+page|inspirational\s+board\s*:\s*scène\s+verticale|[—–-]\s?30\s?%\s+aujourd/i

/**
 * What a report's own data says is private (12/10/2026, constat de #90) : words alone missed « dès 15,43 € » in a
 * video prompt (product 15's purchase price) and « vases à moins de 2 € » (five purchases at 1,00 €). Every
 * purchase amount of the day's products, and every supplier name or domain they carry, is checked in the text.
 */
export type DonneesPrivees = { achats: number[]; ventes: number[]; noms: RegExp | null }

// Places where the analyses observe retail prices and where sellers publish: a supplier field naming them is a channel.
const CANAUX =
  /^(amazon|ebay|leboncoin|cdiscount|etsy|vinted|faire|fnac|rakuten|manomano|wish|allegro|google|tiktok|facebook|instagram|youtube|pinterest|reddit|shopify|drop-shipper|dropshipper)$/i
const NOM_GENERIQUE =
  /^(inconnu|divers|générique|generique|marque|fabricant|n\/?a|autre|autres|plusieurs|extension|url|api|web|site|boutique|shop|store|online|officiel|official|www|fr|com|non|aucun|none|null|undefined|-|—)$/i

function hoteDe(url: string): string | null {
  try {
    const h = new URL(url).hostname.toLowerCase().replace(/^www\d?\./, '')
    return h || null
  } catch {
    return null
  }
}

export function donneesPrivees(produits: Array<Pick<ProduitRapport, 'titre' | 'fournisseur' | 'url' | 'prixAchat' | 'prixVente' | 'achats'> & { prixMin?: number | null; prixMax?: number | null }>): DonneesPrivees {
  const achats = new Set<number>()
  const ventes = new Set<number>()
  const noms = new Set<string>()
  // « NVIDIA » as the supplier while the day lists « NVIDIA Jetson AGX » is a brand: the analysis may name it.
  const titres = produits.map((p) => String(p.titre ?? '')).join(' \n ')
  // Makers sold under their own name: their official store in the supplier field is still the brand.
  const FABRICANTS = /^(apple|samsung|xiaomi|google|huawei|honor|oppo|oneplus|motorola|sony|dji|gopro|insta360|nvidia|amd|intel|asus|acer|lenovo|hp|dell|msi|logitech|philips|bosch|dyson|lego|vtech|playmobil|nintendo|microsoft|anker|ugreen|jbl|bose|garmin|fitbit|withings|tefal|seb|moulinex|krups|delonghi|nespresso|ikea)$/i
  const marque = (nom: string) => FABRICANTS.test(nom.trim().split(/[\s.]/)[0]) || new RegExp(`(?<![\\p{L}\\d])${nom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\d])`, 'iu').test(titres)
  for (const p of produits) {
    for (const a of [p.prixAchat, ...(p.achats ?? [])]) if (a != null && a > 0) achats.add(a)
    for (const v of [p.prixVente, p.prixMin, p.prixMax]) if (v != null && v > 0) ventes.add(v)
    for (const morceau of String(p.fournisseur ?? '').split(/[/,;|()]|\s+[-–—]\s+/)) {
      const nom = morceau.trim().replace(/\.$/, '')
      if (nom.length >= 3 && nom.length <= 40 && /\p{L}{3}/u.test(nom) && !NOM_GENERIQUE.test(nom) && !CANAUX.test(nom.split(/[.\s]/)[0]) && !marque(nom)) noms.add(nom)
    }
    const hote = hoteDe(String(p.url ?? ''))
    if (hote) {
      const labels = hote.split('.')
      const i = labels.length >= 3 && /^(co|com)$/.test(labels[labels.length - 2]) ? labels.length - 3 : labels.length - 2
      const racine = labels[Math.max(0, i)]
      if (racine && racine.length >= 4 && !NOM_GENERIQUE.test(racine) && !CANAUX.test(racine) && !marque(racine)) {
        noms.add(racine)
        noms.add(labels.slice(Math.max(0, i)).join('.'))
      }
    }
  }
  const echappe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
  const liste = [...noms].sort((a, b) => b.length - a.length).map(echappe)
  return {
    achats: [...achats],
    ventes: [...ventes],
    noms: liste.length ? new RegExp(`(?<![\\p{L}\\d])(?:${liste.join('|')})(?![\\p{L}\\d])`, 'iu') : null,
  }
}

// « 15,43 € », « 1 299 € », « 12-18 € », « 50 euros » : every amount, both ends of a range.
const MONTANT_PRIX = /(\d{1,3}(?:[ \u00a0\u202f]\d{3})+|\d+)(?:[.,](\d{1,2}))?(?:\s*(?:[-–]|à)\s*(\d{1,3}(?:[ \u00a0\u202f]\d{3})+|\d+)(?:[.,](\d{1,2}))?)?\s*(?:€|euros?(?![\p{L}])|EUR(?![\p{L}]))/giu
const nombreDe = (ent: string, dec?: string) => Number(`${ent.replace(/[ \u00a0\u202f]/g, '')}.${dec ?? '0'}`)

/** True when a sentence carries a purchase amount (to 0,50 € near) that is not also a sale price it may show. */
export function porteUnAchat(phrase: string, d: DonneesPrivees, ventesPermises: number[] = d.ventes): boolean {
  if (!d.achats.length) return false
  const minVente = d.ventes.length ? Math.min(...d.ventes) : Infinity
  for (const m of phrase.matchAll(MONTANT_PRIX)) {
    const montants = [nombreDe(m[1], m[2]), ...(m[3] ? [nombreDe(m[3], m[4])] : [])]
    // « un kit à 30-80 € » is a market band: its ends only count when they are the exact purchase figure.
    const ecart = montants.length > 1 ? 0.01 : 0.5
    for (const n of montants) {
      if (ventesPermises.some((v) => Math.abs(v - n) < 0.01)) continue
      if (d.achats.some((a) => Math.abs(a - n) <= ecart)) return true
    }
    // « vases à moins de 2 € » : a ceiling under every sale price, above a purchase price, is the purchase level.
    const avant = phrase.slice(Math.max(0, (m.index ?? 0) - 25), m.index)
    if (/(moins\s+de|sous\s+les?|inférieurs?\s+à|<)\s*$/i.test(avant) && montants[0] < minVente && d.achats.some((a) => a < montants[0])) return true
  }
  return false
}

/** The text without the sentences that show the data's purchase amounts or supplier names; a table cell becomes « — ». */
export function sansDonneesPrivees(texte: string, d: DonneesPrivees, ventesPermises: number[] = d.ventes): string {
  if (!texte || (!d.achats.length && !d.noms)) return texte
  const prive = (t: string) => porteUnAchat(t, d, ventesPermises) || (d.noms ? d.noms.test(t) : false)
  return texte
    .split('\n')
    .flatMap((ligne) => {
      if (/^\s*#{1,6}\s/.test(ligne)) return [ligne]
      if (/^\s*\|/.test(ligne)) return [ligne.split('|').map((c) => (prive(c) ? ' — ' : c)).join('|')]
      const tete = /^(\s*(?:[-*+]|\d+[.)])\s+)?/.exec(ligne)![0]
      const phrases = ligne.slice(tete.length).split(/(?<=[.!?…])\s+(?=[\p{Lu}«"(\d*])/u)
      const gardees = phrases.filter((p) => !prive(p))
      if (gardees.length === phrases.length) return [ligne]
      return gardees.length ? [tete + gardees.join(' ')] : []
    })
    .join('\n')
}

export function promptsPublics<P extends { texte: string }>(prompts: P[]): P[] {
  return prompts
    // A prompt whose subject never got filled (« Photo lifestyle éclatante : undefined. ») has nothing to show.
    .filter((p) => !/(?<![\p{L}])undefined(?![\p{L}])/u.test(p.texte) && !GABARIT_PROMPT.test(p.texte))
    .map((p) => ({ ...p, texte: texteRepare(p.texte.trim().replace(/^"([\s\S]*)"$/, '$1')).trim() }))
    .filter((p) => {
      const lignes = p.texte.split('\n').filter((l) => l.trim())
      const sansTitre = lignes.filter((l) => !/^#+\s/.test(l.trim()))
      return sansTitre.join(' ').split(/\s+/).filter(Boolean).length >= 6
    })
}

export function texteRepare(texte: string): string {
  if (!texte) return texte
  return texte
    // « vendu around 50 € », « « QI + »anonymisé », « l'AUTO-SHIPPER », « # Shein/Temu Native Feed 4:5 ».
    .replace(/(?<![\p{L}])around(?![\p{L}])/gu, 'environ')
    .replace(/»anonymisée?s?/g, '»')
    // « …pour un import automatisé — l'AUTO-SHIPPER ne doit pas pousser… » : advice to the reader, not to our robot.
    .replace(/\s*pour\s+un\s+import\s+automatisé\s*[—–-]\s*l['’](?:AUTO-SHIPPER|AutoShipper)\s+ne\s+doit\s+pas/g, ' : mieux vaut ne pas')
    .replace(/l['’](?:AUTO-SHIPPER|AutoShipper)\s+ne\s+doit\s+pas/g, 'mieux vaut ne pas')
    .replace(/AUTO-SHIPPER/g, 'AutoShipper')
    // « Photo lifestyle éclatante : undefined. » : a field the agent never filled.
    .replace(/(^|[.!?\n])[ \t]*[^.!?\n]*(?<![\p{L}])undefined(?![\p{L}])[^.!?\n]*[.!?]?/gu, '$1')
    // A table cell that only says the agent did not check: the usual empty mark.
    .replace(/(\|[ \t]*)non\s+vérifiée?s?\.?(?=[ \t]*\|)/gi, '$1—')
    // « 159EUR », « des 9,90EUR ».
    .replace(/(\d)\s?EUR(?![\p{L}])/gu, '$1 €')
    // « Un smartphone complet a moins de 160 € », « -12 a -14% », « droit a la reparation ».
    .replace(/(?<![\p{L}\p{N}'’])a(?=\s+(?:moins\s+de\s+\d|-\d|\d[\d\s,.]*\s?(?:€|EUR|degrés|degres)))/gu, 'à')
    .replace(/(?<![\p{L}])(droit|grâce|jusqu['’]|face)\s+a(?=\s+(?:la|l['’]|\p{L}))/gu, '$1 à')
    .replace(/(?<![\p{L}])Marche(?=\s+(?:mondial|français|européen|global)(?![\p{L}]))/gu, 'Marché')
    // « déjà documentées dans le rapport rayon » : the twin report is a page of ours, not something the reader saw.
    .replace(/,?\s*(déjà\s+)?(documentée?s?|évoquée?s?|identifiée?s?|citée?s?|relevée?s?)\s+dans\s+le\s+rapport\s+rayon/giu, '')
    .replace(/(?<![\p{L}])gen(ériques?)(?![\p{L}])/gu, 'gén$1')
    .replace(/(?<![\p{L}])rugueisée?s?(?![\p{L}])/gu, 'renforcé')
    .replace(/^(#+\s*)(?:(?:shein|temu|aliexpress|alibaba|cj|bigbuy)\s*\/?\s*)+/gim, '$1')
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
    .replace(/\s*\([^()]*[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}][^()]*\)/gu, '')
    .replace(/\s*["“«]\s*[^"”»\n]*[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}][^"”»\n]*["”»]/gu, '')
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
    // « 1243,14 € », « 1199€ », « entre 200 et 1000 euros » : the French thousands space, and a space before €.
    .replace(/(?<![\d., ])(\d{1,3})(\d{3})(?=(?:[.,]\d{1,2})?\s?(?:€|euros?(?![\p{L}])))/gu, '$1 $2')
    .replace(/(\d)€/g, '$1 €')
    .replace(/^(#{1,6}\s*)Social places\s*$/gim, '$1Réseaux sociaux')
    .replace(/produits relevés par l['’]agent/g, 'produits retenus')
    // « (≈310-321 €, IP68/IP69, écran incurvé 14…) » : a member cut mid-figure says nothing.
    .replace(/,\s*[^,()\n]*\d…(?=\))/g, '')
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
