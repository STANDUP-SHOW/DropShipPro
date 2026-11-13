/**
 * Supplier links written by the analysis agent are not trusted until it proves it opened them.
 *
 * 13/11/2026 (max: « les liens des produits gagnants emmènent vers d'autres produits ») — the 24
 * winners of the day's synthesis, opened one by one from MAX-PC: 14 AliExpress links out of 24 and
 * 20 Amazon links out of 24 led to another product (a « réchaud de camping » to an air mattress, a
 * « sous-pull thermique » to a cardigan, one Amazon ASIN given to three products). The agent composes
 * real item ids it never opened (recaps/liens-gagnants-2026-11-13.md). Our import copies them as is.
 *
 * Until the agent writes the title of the page it opened (`url_page_title`) and that title carries the
 * product's name, a product-sheet link from its files is replaced by the SAME SITE's search for the
 * name: the seller (and the browser that imports) lands on matching products instead of a wrong one.
 * Pure module (no database): shared by the synthesis reader, the reports base and the import queue.
 */

const MOTS_VIDES = new Set([
  'avec', 'pour', 'sans', 'dans', 'des', 'les', 'une', 'aux', 'and', 'with', 'for', 'the', 'pack', 'lot', 'set', 'mini', 'pro', 'max', 'plus', 'new',
])

export const motsDuNom = (t: string) =>
  String(t ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((m) => m.length > 2 && !MOTS_VIDES.has(m))

/** A page title carries the name when it holds at least half of the name's meaningful words. */
export function titrePorteLeNom(titrePage: string | null | undefined, nom: string): boolean {
  const mots = motsDuNom(nom)
  if (!mots.length || !titrePage) return false
  const t = ` ${motsDuNom(titrePage).join(' ')} `
  return mots.filter((m) => t.includes(` ${m} `)).length * 2 >= mots.length
}

/** The search of a supplier site for a name; null for a site we cannot search or a name without words. */
export function rechercheDuNom(url: string, nom: string | null | undefined): string | null {
  const termes = motsDuNom(String(nom ?? ''))
  if (!termes.length) return null
  let h: string
  try {
    h = new URL(url).hostname
  } catch {
    return null
  }
  const texte = String(nom).replace(/\s+/g, ' ').trim().slice(0, 120)
  if (h.includes('aliexpress.')) return `https://fr.aliexpress.com/w/wholesale-${encodeURIComponent(termes.join('-'))}.html`
  if (h.includes('temu.')) return `https://www.temu.com/search_result.html?search_key=${encodeURIComponent(texte)}`
  if (h.includes('shein.')) return `https://fr.shein.com/pdsearch/${encodeURIComponent(texte)}/`
  if (/(^|\.)amazon\./.test(h)) return `https://${h.replace(/^(?!www\.)/, 'www.')}/s?k=${encodeURIComponent(texte)}`
  return null
}

/** A product sheet (or any non-search page) of a site `rechercheDuNom` can search. */
function estPageProduit(url: string): boolean {
  try {
    const u = new URL(url)
    const h = u.hostname
    const p = u.pathname
    if (h.includes('aliexpress.')) return !(/wholesale/.test(p) || u.searchParams.has('SearchText'))
    if (h.includes('temu.')) return !(/search_result/.test(p) || u.searchParams.has('search_key'))
    if (h.includes('shein.')) return !/^\/pdsearch\//.test(p)
    if (/(^|\.)amazon\./.test(h)) return !(p === '/s' || p.startsWith('/s/'))
    return false
  } catch {
    return false
  }
}

/**
 * The link to open for a product of the agent's files: the link itself when it is verified (or a search
 * already), otherwise the search for the name on the same site. Unknown sites are left untouched.
 */
export function lienAOuvrir(url: string, nom: string | null | undefined, titrePage?: string | null): string {
  if (!url || !estPageProduit(url)) return url
  if (titrePage && titrePorteLeNom(titrePage, String(nom ?? ''))) return url
  return rechercheDuNom(url, nom) ?? url
}
