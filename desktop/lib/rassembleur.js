'use strict'
/**
 * Le rassembleur de SmartMarket (voie hybride choisie par Max le 26/10/2026).
 *
 * Les fournisseurs sans API produits ouverte (Temu, Shein, Alibaba, et AliExpress
 * quand le vendeur ne l'a pas relié) : l'application ouvre LEUR page de recherche,
 * dans la session du vendeur (profil WebShipper), comme il le ferait lui-même, et
 * relève les offres affichées. Une recherche à la fois, espacées, aucune page de
 * plus que celle des résultats. Au premier signe de vérification anti-robot, on
 * s'arrête et on le dit : le vendeur la règle lui-même dans le navigateur intégré.
 * Jamais de contournement (CLAUDE.md, décision du 29/09/2026).
 *
 * Ce fichier garde les décisions, testables sans Electron (check-desktop.cjs) ; le
 * câblage est dans main.js.
 */

const SOURCES = {
  temu: {
    nom: 'Temu',
    hote: /(^|\.)temu\.com$/i,
    fiche: /-g-\d+\.html/i,
    recherche: (q) => `https://www.temu.com/search_result.html?search_key=${encodeURIComponent(q)}`,
  },
  shein: {
    nom: 'Shein',
    hote: /(^|\.)shein\.com$/i,
    fiche: /-p-\d+\.html/i,
    recherche: (q) => `https://fr.shein.com/pdsearch/${encodeURIComponent(q)}/`,
  },
  alibaba: {
    nom: 'Alibaba',
    hote: /(^|\.)alibaba\.com$/i,
    fiche: /\/product-detail\//i,
    recherche: (q) => `https://www.alibaba.com/trade/search?SearchText=${encodeURIComponent(q)}`,
  },
  aliexpress: {
    nom: 'AliExpress',
    hote: /(^|\.)aliexpress\.(com|us)$/i,
    fiche: /\/item\/\d+\.html/i,
    recherche: (q) => `https://fr.aliexpress.com/wholesale?SearchText=${encodeURIComponent(q)}`,
  },
}

const MAX_PRODUITS = 20
/** Entre deux recherches chez le même fournisseur. */
const ESPACEMENT_MS = 20000

function source(id) {
  return Object.prototype.hasOwnProperty.call(SOURCES, id) ? SOURCES[id] : null
}

/** Les mots cherchés : du texte, borné. */
function motsSurs(q) {
  const m = String(q || '').replace(/\s+/g, ' ').trim()
  return m && m.length <= 100 ? m : null
}

function adresseRecherche(id, q) {
  const s = source(id)
  const m = motsSurs(q)
  return s && m ? s.recherche(m) : null
}

/** Combien attendre encore avant la prochaine recherche chez ce fournisseur (0 = tout de suite). */
function attente(derniere, maintenant = Date.now()) {
  if (!derniere) return 0
  return Math.max(0, derniere + ESPACEMENT_MS - maintenant)
}

/**
 * Exécuté DANS la page de résultats (sans accès à Node) : les liens vers une fiche,
 * et pour chacun la carte qui l'entoure — son titre, sa photo, son texte. Aucun clic,
 * aucune saisie : on lit ce qui est affiché.
 */
function extracteur(motifFiche) {
  const re = new RegExp(motifFiche, 'i')
  const vus = new Set()
  const sortie = []
  for (const a of Array.from(document.querySelectorAll('a[href]'))) {
    if (sortie.length >= 60) break
    const href = a.href
    if (!re.test(href)) continue
    const cle = href.split('?')[0]
    if (vus.has(cle)) continue
    vus.add(cle)
    let carte = a
    for (let i = 0; i < 6 && carte.parentElement; i++) {
      if (carte.querySelector('img') && (carte.innerText || '').length > 15) break
      carte = carte.parentElement
    }
    const img = carte.querySelector('img')
    const image = img ? img.currentSrc || img.src || img.getAttribute('data-src') || '' : ''
    const titre = a.getAttribute('title') || a.getAttribute('aria-label') || (img && img.alt) || ''
    sortie.push({ href, titre, image, texte: (carte.innerText || '').slice(0, 400) })
  }
  return sortie
}

/** Un prix en euros lu dans le texte de la carte, ou null : jamais deviné. */
function prixEur(texte) {
  const t = String(texte || '').replace(/ | /g, ' ')
  const nombre = '(\\d{1,5}(?:[ .]\\d{3})*(?:,\\d{1,2})?|\\d{1,6}(?:\\.\\d{1,2})?)'
  const m = new RegExp(`${nombre}\\s?€`).exec(t) || new RegExp(`€\\s?${nombre}`).exec(t)
  if (!m) return null
  let s = m[1]
  if (s.includes(',')) s = s.replace(/[ .]/g, '').replace(',', '.')
  else s = s.replace(/ /g, '')
  const n = Number(s)
  return Number.isFinite(n) && n > 0 && n < 100000 ? Math.round(n * 100) / 100 : null
}

function lienSur(href, s) {
  try {
    const u = new URL(href)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    if (!s.hote.test(u.hostname) || !s.fiche.test(u.pathname)) return null
    return u
  } catch {
    return null
  }
}

function imageSure(src) {
  try {
    const u = new URL(String(src || ''))
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null
  } catch {
    return null
  }
}

/**
 * Les cartes brutes → les offres affichées dans SmartMarket. Un lien hors du
 * fournisseur, ou qui n'est pas une fiche, est écarté ; un titre manquant est pris
 * dans la première ligne de la carte ; le prix reste vide s'il n'est pas en euros.
 */
function nettoyer(id, bruts) {
  const s = source(id)
  if (!s || !Array.isArray(bruts)) return []
  const vus = new Set()
  const sortie = []
  for (const b of bruts) {
    if (sortie.length >= MAX_PRODUITS) break
    const u = lienSur(b && b.href, s)
    if (!u) continue
    const cle = `${u.hostname}${u.pathname}`
    if (vus.has(cle)) continue
    vus.add(cle)
    const lignes = String(b.texte || '')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 8 && !/€|\d+\s?%/.test(l))
    const titre = String(b.titre || '').trim() || lignes[0] || ''
    if (!titre) continue
    const url = `${u.origin}${u.pathname}`
    sortie.push({ ref: url, url, titre: titre.slice(0, 200), image: imageSure(b.image), prixEur: prixEur(b.texte), entrepot: null })
  }
  return sortie
}

module.exports = { SOURCES, MAX_PRODUITS, ESPACEMENT_MS, source, motsSurs, adresseRecherche, attente, extracteur, prixEur, nettoyer }
