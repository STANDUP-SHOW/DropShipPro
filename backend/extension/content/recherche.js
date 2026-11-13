/*
 * Une page de RECHERCHE fournisseur → la fiche du produit voulu (13/11/2026).
 *
 * Les gagnants des synthèses quotidiennes n'ont pas de fiche : leur lien est une
 * recherche (AliExpress /w/wholesale-<nom>.html). Le navigateur interne du
 * desktop et l'extension ouvrent cette recherche, prennent le PREMIER résultat
 * dont le titre porte le nom du gagnant, puis relèvent sa fiche. Aucun résultat
 * pertinent : échec avec son motif, jamais un produit au hasard.
 *
 * La règle de pertinence est celle du serveur (backend/src/services/
 * synthesesCompletion.ts, `pertinent`) : au moins la moitié des mots
 * significatifs du nom, et au moins un. Ce fichier est chargé dans la page
 * (extension : chrome.scripting ; desktop : copié dans extraction/ par
 * copier-extraction.cjs) et sous Node par les bancs.
 */
;(function (racine) {
  const MOTS_VIDES = new Set([
    'avec', 'pour', 'sans', 'dans', 'des', 'les', 'une', 'aux', 'and', 'with', 'for', 'the', 'pack', 'lot', 'set', 'mini', 'pro', 'max', 'plus', 'new',
  ])

  function mots(t) {
    return String(t || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .split(/[^a-z0-9]+/)
      .filter((m) => m.length > 2 && !MOTS_VIDES.has(m))
  }

  function pertinent(nom, titre) {
    const attendus = [...new Set(mots(nom))]
    if (!attendus.length) return false
    const trouves = new Set(mots(titre))
    const present = (m) => trouves.has(m) || trouves.has(m.replace(/s$/, '')) || trouves.has(`${m}s`)
    const communs = attendus.filter(present).length
    return communs >= 1 && communs >= Math.ceil(attendus.length / 2)
  }

  /** A supplier search page (not a product sheet), by its address. */
  function estRecherche(url) {
    try {
      const u = new URL(url)
      const h = u.hostname
      const p = u.pathname
      if (h.includes('aliexpress.')) return /wholesale/.test(p) || u.searchParams.has('SearchText')
      if (h.includes('temu.')) return /search_result/.test(p) || u.searchParams.has('search_key')
      if (h.includes('shein.')) return /^\/pdsearch\//.test(p)
      return false
    } catch {
      return false
    }
  }

  /** The product sheets a search page links to, per site. */
  function estFiche(href, hote) {
    if (hote.includes('aliexpress.')) return /\/item\/\d{6,}/.test(href)
    if (hote.includes('temu.')) return /-g-\d{6,}\.html/.test(href)
    if (hote.includes('shein.')) return /-p-\d{5,}/.test(href)
    return false
  }

  /** A product sheet of a site this file knows, by its full address. */
  function estFicheAdresse(url) {
    try {
      const u = new URL(url)
      if (u.hostname.includes('temu.') && (/goods\.html/.test(u.pathname) || u.searchParams.has('goods_id'))) return true
      return estFiche(u.pathname, u.hostname)
    } catch {
      return false
    }
  }

  /**
   * A link of a known site that is neither a sheet nor a search (13/11/2026).
   *
   * Report winners often carry a CATEGORY page (inbusiness.aliexpress.com/
   * category/…) or an address that names the product but leads nowhere
   * (temu.com/fr/produit/<nom>). Opened as is, the page shows other products'
   * photos and the import is rightly refused (« 0 sûre(s) sur 5 »). With the
   * product's name, the same site's SEARCH is the honest way to its sheet:
   * the first result that carries the name, or a refusal. Returns the search
   * address, or null when the link is fine (sheet, search, other site) or no
   * name is known. Same rule on the server (services/fileImport.ts).
   */
  function versRecherche(url, nom) {
    const termes = mots(nom)
    if (!termes.length) return null
    let u
    try {
      u = new URL(url)
    } catch {
      return null
    }
    const h = u.hostname
    if (estRecherche(url) || estFicheAdresse(url)) return null
    const texte = String(nom).replace(/\s+/g, ' ').trim().slice(0, 120)
    if (h.includes('aliexpress.')) return `https://fr.aliexpress.com/w/wholesale-${encodeURIComponent(termes.join('-'))}.html`
    if (h.includes('temu.')) return `https://www.temu.com/search_result.html?search_key=${encodeURIComponent(texte)}`
    if (h.includes('shein.')) return `https://fr.shein.com/pdsearch/${encodeURIComponent(texte)}/`
    return null
  }

  /** Visible text of a result card: the link's own text, else its title/alt, else its card's text. */
  function texteResultat(a) {
    const propre = (a.innerText || a.textContent || '').trim()
    if (propre.length > 12) return propre
    const img = a.querySelector && a.querySelector('img[alt]')
    const attribut = a.getAttribute('title') || (img && img.getAttribute('alt')) || ''
    if (attribut.trim().length > 12) return attribut.trim()
    const carte = a.closest && a.closest('[class*="card"],[class*="item"],[class*="product"],li,article')
    return ((carte && (carte.innerText || carte.textContent)) || propre || attribut).trim()
  }

  /**
   * The first result of the current page that carries `nom`, in page order.
   * Returns `{ url, titre }`, or `{ url: null, vus }` (how many sheets were seen).
   */
  function choisirResultat(nom, doc) {
    const d = doc || racine.document
    const hote = (d.location && d.location.hostname) || ''
    const vus = new Set()
    for (const a of d.querySelectorAll('a[href]')) {
      let href
      try {
        href = new URL(a.getAttribute('href'), d.location.href)
      } catch {
        continue
      }
      if (!estFiche(href.pathname, hote)) continue
      href.hash = ''
      const cle = href.origin + href.pathname
      if (vus.has(cle)) continue
      vus.add(cle)
      const titre = texteResultat(a).replace(/\s+/g, ' ').slice(0, 300)
      if (pertinent(nom, titre)) return { url: cle, titre }
    }
    return { url: null, vus: vus.size }
  }

  const api = { mots, pertinent, estRecherche, estFiche, estFicheAdresse, versRecherche, choisirResultat }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  else racine.__dspRecherche = api
})(typeof globalThis !== 'undefined' ? globalThis : this)
