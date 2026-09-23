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
 *   /analyses/<categorie>/<AAAA-MM-JJ>/<theme>/            le rapport rayon (analyse + produits gagnants)
 *   /analyses/<categorie>/<AAAA-MM-JJ>/<theme>/marketing/  le rapport marketing (angles, prompts)
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

export function cheminRapport(r: Pick<RapportPublic, 'categorie' | 'day' | 'theme' | 'type'>): string {
  return `/analyses/${r.categorie}/${r.day}/${r.theme}/${r.type === 'marketing' ? 'marketing/' : ''}`
}

export function cheminCategorie(id: string): string {
  return `/analyses/${id}/`
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

export function dateLongue(day: string): string {
  const [a, m, j] = day.split('-').map(Number)
  return `${j} ${MOIS[m - 1] ?? ''} ${a}`
}

function nomCategorie(id: string): string {
  return categorieDe(id)?.nom ?? id
}

// --- Markdown → HTML, échappé -------------------------------------------------

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
    else out += `<a href="${esc(t)}" rel="nofollow noopener" target="_blank">${esc(t)}</a>`
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
.cta{display:inline-block;background:linear-gradient(90deg,#a855f7,#ec4899);color:#fff;text-decoration:none;font-weight:600;padding:.7rem 1.15rem;border-radius:.75rem}
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
.grille a small{display:block;color:#9d95c0}
footer{border-top:1px solid #ffffff1a;margin-top:3rem;padding:1.5rem 0;font-size:.85rem;color:#9d95c0}footer a{color:#9d95c0;margin-right:1rem}
.end{margin:2.5rem 0;text-align:center}
`

function layout(o: { url: string; title: string; description: string; jsonLd: unknown; body: string; publie?: Date; modifie?: Date }): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description)}">
<link rel="canonical" href="${SITE}${o.url}">
<meta name="robots" content="index, follow, max-snippet:-1">
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
  const title = estRayon
    ? `${r.titre} — ${r.produits.length} produits gagnants ${cat.toLowerCase()} (${dateLongue(r.day)})`
    : `${r.titre} — analyse marketing ${cat.toLowerCase()} (${dateLongue(r.day)})`
  const description =
    r.accroche ||
    (estRayon
      ? `Analyse de marché ${theme.toLowerCase()} du ${dateLongue(r.day)} et ${r.produits.length} produits à importer en dropshipping, avec fournisseur, prix de vente conseillé et marge.`
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
      return `${b.titre ? `<h2>${enLigne(b.titre)}</h2>` : ''}${markdownEnHtml(b.corps)}`
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
<p class="meta">${estRayon ? 'Analyse de marché et produits gagnants' : 'Analyse marketing'} · ${esc(cat)} › ${esc(theme)} · ${dateLongue(r.day)}${
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
        .map((v) => `<li><a href="${cheminRapport(v)}">${esc(v.titre)}</a><small>${dateLongue(v.day)} · ${v.type === 'rayon' ? 'produits gagnants' : 'marketing'}</small></li>`)
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
          '@type': 'Article',
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
        .map((r) => `<li><a href="${cheminRapport(r)}">${esc(r.titre)}</a><small>${esc(r.themeNom)} · ${r.type === 'rayon' ? `${r.produits.length} produits gagnants` : 'analyse marketing, prompts image et vidéo'}</small></li>`)
        .join('')}</ul>`,
  )
  .join('\n')}
${rapports.length ? '' : '<p>Aucune analyse publiée pour cette catégorie pour le moment.</p>'}`

  return layout({
    url,
    title: `Analyses de marché ${nom.toLowerCase()} — produits gagnants et tendances dropshipping`,
    description: `Les analyses de marché quotidiennes ${nom.toLowerCase()} de ${NOM} : tendances, prix, saisonnalité, et chaque jour des produits gagnants à importer en dropshipping.`,
    jsonLd: { '@context': 'https://schema.org', '@graph': [{ '@type': 'CollectionPage', name: `Analyses de marché ${nom}`, url: `${SITE}${url}`, inLanguage: 'fr-FR', publisher: ORGANISATION }, breadcrumbLd(fil)] },
    body,
  })
}

export function pageIndex(recents: RapportPublic[], compteParCategorie: Map<string, number>): string {
  const url = '/analyses/'
  const fil = [{ nom: 'Accueil', url: '/' }, { nom: 'Analyses de marché' }]
  const total = [...compteParCategorie.values()].reduce((t, n) => t + n, 0)
  const body = `${crumb(fil)}
<h1>Analyses de marché et produits gagnants du dropshipping, chaque jour</h1>
<p class="lede">${CATEGORIES.length} catégories, deux rapports par jour et par catégorie : le marché et ses produits à importer, le marketing et ses prompts publicitaires. Rédigés par les agents ${NOM}, ${total} rapports publiés à ce jour.</p>
<h2>Les dernières analyses</h2>
<ul class="liste">${recents
    .map((r) => `<li><a href="${cheminRapport(r)}">${esc(r.titre)}</a><small>${esc(r.categorieNom)} · ${dateLongue(r.day)} · ${r.type === 'rayon' ? `${r.produits.length} produits gagnants` : 'marketing'}</small></li>`)
    .join('')}</ul>
<h2>Par catégorie</h2>
<div class="grille">${CATEGORIES.map((c) => `<a href="${cheminCategorie(c.id)}">${esc(c.nom)}<small>${compteParCategorie.get(c.id) ?? 0} analyse${(compteParCategorie.get(c.id) ?? 0) > 1 ? 's' : ''}</small></a>`).join('')}</div>`
  return layout({
    url,
    title: 'Analyses de marché dropshipping et produits gagnants du jour',
    description: `Les analyses de marché quotidiennes de ${NOM} sur ${CATEGORIES.length} catégories : tendances, prix, produits gagnants à importer, angles et prompts publicitaires.`,
    jsonLd: { '@context': 'https://schema.org', '@graph': [{ '@type': 'CollectionPage', name: 'Analyses de marché', url: `${SITE}${url}`, inLanguage: 'fr-FR', publisher: ORGANISATION }, breadcrumbLd(fil)] },
    body,
  })
}

export function sitemapXml(rapports: Array<Pick<RapportPublic, 'categorie' | 'day' | 'theme' | 'type' | 'updatedAt'>>): string {
  const categories = new Map<string, Date>()
  for (const r of rapports) {
    const d = categories.get(r.categorie)
    if (!d || d < r.updatedAt) categories.set(r.categorie, r.updatedAt)
  }
  const ligne = (loc: string, mod: Date, prio: string, freq: string) =>
    `  <url><loc>${SITE}${loc}</loc><lastmod>${mod.toISOString().slice(0, 10)}</lastmod><changefreq>${freq}</changefreq><priority>${prio}</priority></url>`
  const dernier = rapports.reduce((d, r) => (r.updatedAt > d ? r.updatedAt : d), new Date(0))
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${ligne('/analyses/', rapports.length ? dernier : new Date(), '0.8', 'daily')}
${[...categories.entries()].map(([id, mod]) => ligne(cheminCategorie(id), mod, '0.7', 'daily')).join('\n')}
${rapports.map((r) => ligne(cheminRapport(r), r.updatedAt, '0.6', 'monthly')).join('\n')}
</urlset>
`
}
