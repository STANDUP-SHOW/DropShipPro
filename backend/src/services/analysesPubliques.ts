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
 * entière l'est, le tableau des produits gagnants aussi (titre, fournisseur,
 * prix de vente conseillé, marge, pourquoi), mais **ni l'adresse de la fiche
 * fournisseur ni le prix d'achat** : c'est ce que les rapports du jour offrent
 * aux comptes à 500 drops (`routes/marketReports.ts`), et c'est la valeur qui
 * fait ouvrir un compte. Le corps Markdown du rapport rayon contient ce tableau
 * avec ses adresses : il n'est jamais rendu tel quel, la section des produits
 * est remplacée par le rendu bridé.
 *
 * Adresses :
 *   /analyses/                                       toutes les catégories, dernier jour
 *   /analyses/<categorie>/                           l'archive d'une catégorie
 *   /analyses/<categorie>/<titre>-<AAAA-MM-JJ>/            le rapport rayon (analyse + produits gagnants)
 *   /analyses/<categorie>/<titre>-marketing-<AAAA-MM-JJ>/  le rapport marketing (angles, prompts)
 *   (l'ancienne forme <categorie>/<AAAA-MM-JJ>/<theme>/[marketing/] redirige en 301)
 *   /analyses/<AAAA-MM-JJ>/                          l'édition du jour : toutes les analyses et leurs produits gagnants
 *   /analyses/sitemap.xml
 */
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
  accroche: string | null
  body: string
  produits: ProduitRapport[]
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

/**
 * L'adresse d'un rapport, comme celle d'un article (demandé par Max le
 * 03/10/2026) : le sujet tiré du titre, puis la date —
 *   /analyses/automobile/meilleurs-accessoires-d-interieur-pour-voiture-2026-09-18/
 *   /analyses/automobile/les-tendances-deco-pour-2026-marketing-2026-09-18/
 * L'ancienne forme catégorie/date/thème redirige ici en 301 (routes/analysesPubliques.ts).
 */
export function cheminRapport(r: Pick<RapportPublic, 'categorie' | 'day' | 'theme' | 'type' | 'titre'>): string {
  // « …-bureau-2026-2026-09-19 » : l'année du titre fait doublon avec la date qui suit.
  // Ni « …-de-2026-09-19 » : un mot-outil ne termine pas un sujet.
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
      ? [...(n ? [`${t} : ${n} produits gagnants (${d})`, `${t} : ${n} produits (${d})`] : []), `${t} (${d})`]
      : [`${t} : analyse marketing (${d})`, `${t} : marketing (${d})`, `${t} (${d})`]
  const tient = candidats.find((c) => c.length <= TITRE_MAX)
  if (tient) return tient
  const place = TITRE_MAX - d.length - 4
  return `${t.slice(0, place).replace(/[\s,:;—-]+\S*$/, '')}… (${d})`
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
  return sortie.join('\n')
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
const ENTETE_PRIVEE = /fournisseur|prix\s*(d['’ ]?)?achat|\burl\b/i

export function sansTableauxPrives(corps: string): { corps: string; retires: number } {
  const lignes = corps.replace(/\r\n/g, '\n').split('\n')
  const sortie: string[] = []
  let retires = 0
  for (let i = 0; i < lignes.length; ) {
    if (lignes[i].trim().startsWith('|') && ENTETE_PRIVEE.test(lignes[i])) {
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

/** Le bloc « N produits proposés » : celui qui porte les adresses fournisseur. Jamais rendu tel quel. */
function estBlocProduits(titre: string, corps: string): boolean {
  return /produits/i.test(titre) && corps.trim().startsWith('|')
}

// --- Le gabarit ---------------------------------------------------------------

const CSS = `
:root{color-scheme:dark}*{box-sizing:border-box}
body{margin:0;background:#140f28;color:#e9e6f5;font:16px/1.65 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:#c4b5fd}.wrap{max-width:52rem;margin:0 auto;padding:0 1.25rem}
header{border-bottom:1px solid #ffffff1a}header .wrap{display:flex;align-items:center;justify-content:space-between;padding:1rem 1.25rem;gap:1rem}
.brand{font-weight:700;color:#fff;text-decoration:none;font-size:1.05rem}
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
<header><div class="wrap"><a class="brand" href="/">${NOM}</a><a class="cta small" href="/register">Créer un compte</a></div></header>
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

/** Les produits gagnants, bridés : ni adresse fournisseur, ni prix d'achat, ni marge (son unité varie selon l'agent). */
function tableauProduitsPublic(produits: ProduitRapport[]): string {
  if (!produits.length) return ''
  const euros = (n: number | null) => (n === null ? '—' : `${n.toFixed(2).replace('.', ',')} €`)
  return `<div class="tableau"><table>
<thead><tr><th>#</th><th>Produit</th><th>Fournisseur</th><th>Prix de vente conseillé</th><th>Pourquoi</th></tr></thead>
<tbody>${produits
    .map(
      (p) =>
        `<tr><td>${p.rang}</td><td>${esc(p.titre)}</td><td>${esc(p.fournisseur)}</td><td>${euros(p.prixVente)}</td><td>${esc(p.pourquoi)}</td></tr>`,
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
      ...(p.prixVente !== null ? { description: `Prix de vente conseillé ${p.prixVente.toFixed(2)} € — ${p.pourquoi}` } : {}),
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
        ? `Analyse de marché ${theme.toLowerCase()} du ${dateLongue(r.day)} et ${r.produits.length} produits à importer en dropshipping, avec fournisseur, prix de vente conseillé et marge.`
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
    .map((b) => {
      if (estBlocProduits(b.titre, b.corps)) {
        return `<h2 id="produits">${esc(b.titre.replace(/proposés/i, 'gagnants'))}</h2>${tableauProduitsPublic(r.produits)}`
      }
      const { corps, retires } = sansTableauxPrives(b.corps)
      // Sans produits structurés à montrer à la place, le lecteur sait au moins que la liste existe.
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
        .map((r) => `<li><a href="${cheminRapport(r)}">${esc(r.titre)}</a><small>${esc(r.themeNom)} · ${resumeRapport(r)}</small></li>`)
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
    .map((r) => `<li><a href="${cheminRapport(r)}">${esc(r.titre)}</a><small>${esc(r.categorieNom)} · ${dateLongue(r.day)} · ${resumeRapport(r)}</small></li>`)
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
export function pageJour(day: string, rapports: RapportPublic[], jourPrecedent?: string, jourSuivant?: string): string {
  const url = cheminJour(day)
  const date = dateLongue(day)
  const fil = [{ nom: 'Accueil', url: '/' }, { nom: 'Analyses de marché', url: '/analyses/' }, { nom: `Édition du ${date}` }]
  const rayons = rapports.filter((r) => r.type === 'rayon')
  const parCategorie = new Map<string, RapportPublic[]>()
  for (const r of rapports) parCategorie.set(r.categorie, [...(parCategorie.get(r.categorie) ?? []), r])
  const produits = rayons.flatMap((r) => r.produits)
  // Deux par rayon, et d'abord ceux qui ont un prix conseillé : une vitrine du jour, pas un inventaire.
  const top = rayons
    .flatMap((r) =>
      [...r.produits]
        .sort((x, y) => Number(y.prixVente !== null) - Number(x.prixVente !== null) || x.rang - y.rang)
        .slice(0, 2)
        .map((p) => ({ p, r })),
    )
    .slice(0, 12)
  const euros = (n: number | null) => (n === null ? '—' : `${n.toFixed(2).replace('.', ',')} €`)

  const body = `${crumb(fil)}
<h1>Produits gagnants et tendances du ${date}</h1>
<p class="lede">L'édition du jour des agents ${NOM} : ${parCategorie.size} catégorie${parCategorie.size > 1 ? 's' : ''} analysée${parCategorie.size > 1 ? 's' : ''}, ${rapports.length} rapport${rapports.length > 1 ? 's' : ''}${produits.length ? `, ${produits.length} produits gagnants repérés` : ''}.</p>
${
  top.length
    ? `<h2 id="produits">Les produits gagnants du jour</h2><div class="tableau"><table>
<thead><tr><th>Produit</th><th>Catégorie</th><th>Prix de vente conseillé</th><th>Pourquoi</th></tr></thead>
<tbody>${top.map(({ p, r }) => `<tr><td><a href="${cheminRapport(r)}#produits">${esc(p.titre)}</a></td><td>${esc(r.categorieNom)}</td><td>${euros(p.prixVente)}</td><td>${esc(p.pourquoi)}</td></tr>`).join('')}</tbody></table></div>`
    : ''
}
${[...parCategorie.values()]
  .map((liste) => {
    const nom = liste[0].categorieNom
    return `<h2>${esc(nom)}</h2>${liste
      .map((r) => `<h3><a href="${cheminRapport(r)}">${esc(r.titre)}</a></h3>${r.accroche ? `<p>${esc(r.accroche)}</p>` : ''}<p class="meta">${esc(r.themeNom)} · ${resumeRapport(r)}</p>`)
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
    modifie: rapports.reduce((d, r) => (r.updatedAt > d ? r.updatedAt : d), new Date(`${day}T06:00:00Z`)),
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

export function sitemapXml(rapports: Array<Pick<RapportPublic, 'categorie' | 'day' | 'theme' | 'type' | 'titre' | 'updatedAt'>>): string {
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
    `  <url><loc>${SITE}${loc}</loc><lastmod>${mod.toISOString().slice(0, 10)}</lastmod><changefreq>${freq}</changefreq><priority>${prio}</priority></url>`
  const dernier = rapports.reduce((d, r) => (r.updatedAt > d ? r.updatedAt : d), new Date(0))
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${ligne('/analyses/', rapports.length ? dernier : new Date(), '0.8', 'daily')}
${[...jours.entries()].map(([j, mod]) => ligne(cheminJour(j), mod, '0.7', 'weekly')).join('\n')}
${[...categories.entries()].map(([id, mod]) => ligne(cheminCategorie(id), mod, '0.7', 'daily')).join('\n')}
${rapports.map((r) => ligne(cheminRapport(r), r.updatedAt, '0.6', 'monthly')).join('\n')}
</urlset>
`
}
