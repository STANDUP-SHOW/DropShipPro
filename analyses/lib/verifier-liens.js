'use strict'
/**
 * Product links of an analysis, checked page by page (13/11/2026).
 *
 * The synthesis of 13/11 gave 14 AliExpress links out of 24 and 20 Amazon links out of 24 that open
 * another product: the agent composed item ids and ASINs it never opened (« réchaud de camping » →
 * a sleeping mat; one ASIN for a coffee table, a garden hose and an overshirt). A model's promise is
 * not a check, so every product link of the structured data is opened here:
 *   - the page title (og:title, else <title>) must hold at least half of the product name's words;
 *   - the same link may not serve two different products;
 * otherwise the link is removed, the product gets a search page for its name (`search_url`) and
 * `url_status: "non_verifie"`. A verified product keeps its link with `url_page_title` and
 * `url_status: "verifie"`. An empty field is better than a likely one.
 *
 * Plain reading only: no disguised browser, no captcha. A page that refuses to be read is simply
 * « non vérifié ».
 */

const CHAMPS_NOM = ['product_name', 'nom', 'name', 'titre', 'title', 'produit', 'product']
// link fields that are never a product page
const NON_FICHE = /(^|_)(image|images|img|photo|search|recherche|source|sources|video|logo|trends?)(_|$)/i
const LIMITE_LIENS = 800
const DELAI_MS = 12000
const PARALLELE = 4

const sansAccents = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
const VIDES = new Set(['avec', 'pour', 'sans', 'dans', 'plus', 'tres', 'pack', 'lot', 'the', 'and', 'with', 'from', 'pour', 'size', 'taille', 'couleur', 'color'])

/** Significant words of a product name: 4 letters or more (3 when the name has none). */
function motsDe(nom) {
  const tous = sansAccents(nom).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  const longs = tous.filter((m) => m.length >= 4 && !VIDES.has(m))
  return [...new Set(longs.length ? longs : tous.filter((m) => m.length >= 3))]
}

/** At least half of the name's words appear in the page title. */
function titreCorrespond(nom, titre) {
  const mots = motsDe(nom)
  if (!mots.length || !titre) return false
  const t = sansAccents(titre).toLowerCase()
  // a word matches its plural or singular too (« tuyau » / « tuyaux », « coussin » / « coussins »)
  const trouve = mots.filter((m) => t.includes(m) || t.includes(m.replace(/[sx]$/, ''))).length
  return trouve * 2 >= mots.length
}

const ENTITES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
const decoder = (s) => String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
  return ENTITES[e.toLowerCase()] ?? m
})

/** og:title, else <title>, from an HTML page. */
function titreDeHtml(html) {
  const og = /<meta[^>]+(?:property|name)=["']og:title["'][^>]*content=["']([^"']+)["']/i.exec(html) || /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']og:title["']/i.exec(html)
  const t = og ? og[1] : (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html) || [])[1]
  return t ? decoder(t).replace(/\s+/g, ' ').trim() : ''
}

async function lireTitre(url, fetchImpl) {
  const ctrl = new AbortController()
  const minuteur = setTimeout(() => ctrl.abort(), DELAI_MS)
  try {
    const rep = await fetchImpl(url, { redirect: 'follow', signal: ctrl.signal, headers: { 'Accept-Language': 'fr-FR,fr;q=0.9' } })
    if (!rep.ok) return { titre: '', raison: `page introuvable (${rep.status})` }
    const html = (await rep.text()).slice(0, 600000)
    const titre = titreDeHtml(html)
    return { titre, raison: titre ? '' : 'page sans titre lisible' }
  } catch (err) {
    return { titre: '', raison: err && err.name === 'AbortError' ? 'page trop lente' : 'page illisible' }
  } finally {
    clearTimeout(minuteur)
  }
}

const recherche = (nom) => `https://fr.aliexpress.com/w/wholesale-${encodeURIComponent(String(nom).trim().replace(/\s+/g, '-'))}.html`

const estLien = (v) => typeof v === 'string' && /^https?:\/\//i.test(v.trim())

/** A search, category or listing page is not a product page and is left alone. */
function estPageDeRecherche(u) {
  try {
    const x = new URL(u)
    return /^\/(w|wholesale|s|search|searchlist|category|categories|catalog|c)(\/|[-_.]|$)/i.test(x.pathname) || /[?&](k|q|keyword|keywords|SearchText|search)=/i.test(x.search)
  } catch { return true }
}

/**
 * Every object of the data that names a product and carries product links.
 * @returns {Array<{ objet, nom, liens: Array<{ porteur, cle, url }> }>}
 */
function produitsDe(donnees) {
  const out = []
  const vus = new Set()
  const parcourir = (v) => {
    if (!v || typeof v !== 'object' || vus.has(v)) return
    vus.add(v)
    if (Array.isArray(v)) { v.forEach(parcourir); return }
    const cleNom = CHAMPS_NOM.find((k) => typeof v[k] === 'string' && v[k].trim())
    if (cleNom) {
      const liens = []
      const prendre = (porteur, cle) => {
        const url = porteur[cle]
        if (estLien(url) && !NON_FICHE.test(cle) && !estPageDeRecherche(url)) liens.push({ porteur, cle, url: url.trim() })
      }
      for (const cle of Object.keys(v)) {
        if (cle === 'url' || /_url$/i.test(cle)) prendre(v, cle)
        else if (/^(urls|liens|links)$/i.test(cle) && v[cle] && typeof v[cle] === 'object' && !Array.isArray(v[cle])) for (const k of Object.keys(v[cle])) prendre(v[cle], k)
      }
      if (liens.length) out.push({ objet: v, nom: v[cleNom].trim(), liens })
    }
    for (const k of Object.keys(v)) if (k !== 'urls' && k !== 'liens' && k !== 'links') parcourir(v[k])
  }
  parcourir(donnees)
  return out
}

const cleUrl = (u) => {
  try { const x = new URL(u); return `${x.host.replace(/^www\./, '').toLowerCase()}${x.pathname.replace(/\/+$/, '')}` } catch { return u }
}

/**
 * Checks (and corrects in place) the product links of `donnees`.
 * @returns {Promise<{ verifies:number, retires:number, doublons:number, nonLus:number, details: Array<{ nom, url, raison, titre? }>, remplacements: Map<string,string> }>}
 */
async function verifierLiens(donnees, { fetchImpl = fetch, limite = LIMITE_LIENS } = {}) {
  const produits = produitsDe(donnees)
  const bilan = { verifies: 0, retires: 0, doublons: 0, nonLus: 0, details: [], remplacements: new Map() }
  if (!produits.length) return bilan

  // rule: never the same link for two different products
  const parLien = new Map()
  for (const p of produits) for (const l of p.liens) {
    const k = cleUrl(l.url)
    if (!parLien.has(k)) parLien.set(k, new Set())
    parLien.get(k).add(motsDe(p.nom).join(' '))
  }
  const partages = new Set([...parLien].filter(([, noms]) => noms.size > 1).map(([k]) => k))

  // read each distinct page once
  const aLire = [...new Set(produits.flatMap((p) => p.liens.map((l) => l.url)).filter((u) => !partages.has(cleUrl(u))))].slice(0, limite)
  const titres = new Map()
  for (let i = 0; i < aLire.length; i += PARALLELE) {
    const lot = aLire.slice(i, i + PARALLELE)
    const lus = await Promise.all(lot.map((u) => lireTitre(u, fetchImpl)))
    lot.forEach((u, j) => titres.set(u, lus[j]))
  }

  for (const p of produits) {
    const titresBons = {}
    let echec = false
    for (const l of p.liens) {
      let raison = ''
      let titre = ''
      if (partages.has(cleUrl(l.url))) { raison = 'même lien donné pour un autre produit'; bilan.doublons++ }
      else if (!titres.has(l.url)) { raison = `non ouvert (plafond de ${limite} pages)`; bilan.nonLus++ }
      else {
        const lu = titres.get(l.url)
        titre = lu.titre
        if (!titre) { raison = lu.raison; bilan.nonLus++ }
        else if (!titreCorrespond(p.nom, titre)) raison = `la page parle d’autre chose : « ${titre.slice(0, 90)} »`
      }
      if (raison) {
        echec = true
        bilan.retires++
        bilan.details.push({ nom: p.nom, url: l.url, raison, titre: titre || undefined })
        bilan.remplacements.set(l.url, recherche(p.nom))
        l.porteur[l.cle] = ''
      } else {
        bilan.verifies++
        titresBons[l.cle] = titre
      }
    }
    const premier = Object.values(titresBons)[0]
    if (premier) p.objet.url_page_title = premier
    if (Object.keys(titresBons).length > 1) p.objet.url_page_titles = titresBons
    if (echec) {
      p.objet.search_url = p.objet.search_url && estLien(p.objet.search_url) ? p.objet.search_url : recherche(p.nom)
      p.objet.url_status = 'non_verifie'
    } else p.objet.url_status = 'verifie'
  }
  return bilan
}

/** The Markdown keeps no removed link: each becomes the product's search page, said as such. */
function corrigerMarkdown(markdown, remplacements) {
  let md = String(markdown)
  // longest first, so a link is never replaced inside a longer one
  for (const [url, rech] of [...remplacements].sort((a, b) => b[0].length - a[0].length)) md = md.split(url).join(`${rech} (recherche, lien non vérifié)`)
  return md
}

module.exports = { verifierLiens, corrigerMarkdown, produitsDe, motsDe, titreCorrespond, titreDeHtml, recherche }
