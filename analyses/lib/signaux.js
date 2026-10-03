'use strict'
/**
 * Public signals that deepen a rayon: what Google Trends shows for the theme and
 * the models, and how many ads Meta's Ad Library shows for each model name.
 *
 * Rules:
 *  - what is measured goes into the evidence file; what could not be read is
 *    written as such ("illisible", "bloqué"), never guessed;
 *  - a normal hidden browser window, fixed spacing between loads, no fake
 *    profile, no captcha solving: the first block or login wall stops that
 *    source for the rest of the night;
 *  - an enrichment failure never fails the rayon (the report is still written).
 *
 * The browser is injected (`lire`) so the logic is testable without Electron.
 * The text extractors are pure functions for the same reason. They are written
 * for the pages as Google and Meta show them in French and English; a page that
 * changes its wording makes a line "illisible", it cannot make a number up.
 */
const { etatSession } = require('./sources')

const PAUSE_ENTRE_CHARGEMENTS_MS = 4000 // fixed, never random

const attendre = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------------------------------------------------------------- dates / nombres
const MOIS = {
  janv: 1, janvier: 1, jan: 1, january: 1,
  fevr: 2, fev: 2, fevrier: 2, feb: 2, february: 2,
  mars: 3, mar: 3, march: 3,
  avr: 4, avril: 4, apr: 4, april: 4,
  mai: 5, may: 5,
  juin: 6, jun: 6, june: 6,
  juil: 7, juillet: 7, jul: 7, july: 7,
  aout: 8, aug: 8, august: 8,
  sept: 9, sep: 9, septembre: 9, september: 9,
  oct: 10, octobre: 10, october: 10,
  nov: 11, novembre: 11, november: 11,
  dec: 12, decembre: 12, december: 12,
}

function sansAccents(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function iso(annee, mois, jour) {
  if (!(mois >= 1 && mois <= 12 && jour >= 1 && jour <= 31 && annee >= 2005 && annee <= 2100)) return null
  return `${annee}-${String(mois).padStart(2, '0')}-${String(jour).padStart(2, '0')}`
}

/** "12 sept. 2026", "12 septembre 2026", "Sep 12, 2026", "12 Sep 2026" -> "2026-09-12" or null. */
function parserDate(texte) {
  const t = sansAccents(texte)
  let m = t.match(/(\d{1,2})\s+([a-z]{3,9})\.?,?\s+(\d{4})/)
  if (m && MOIS[m[2]]) return iso(Number(m[3]), MOIS[m[2]], Number(m[1]))
  m = t.match(/([a-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/)
  if (m && MOIS[m[1]]) return iso(Number(m[3]), MOIS[m[1]], Number(m[2]))
  return null
}

/** "~1,2 K", "1.2K", "120", "1 200" -> number or null. */
function parserNombre(brut) {
  const s = String(brut).replace(/[\s ]/g, '')
  const m = s.match(/^~?([\d.,]+)([kKmM])?$/)
  if (!m) return null
  const mult = m[2] ? (/k/i.test(m[2]) ? 1e3 : 1e6) : 1
  let n
  if (m[2]) n = Number(m[1].replace(',', '.'))
  else n = Number(m[1].replace(/[.,]/g, ''))
  return Number.isFinite(n) ? Math.round(n * mult) : null
}

// ---------------------------------------------------------------- Meta Ad Library
const ANNONCES_VUES = /(identifiant de la biblioth[eè]que|library id)\s*:?\s*\d+/gi
const LIGNE_DIFFUSION = /(?:date de d[eé]but de diffusion|diffusion commenc[eé]e le|en diffusion depuis le|diffus[eé]e depuis le|started running on|active since)\s*:?\s*([^\n]{3,40})/gi
const AUCUN = /\b(aucun r[eé]sultat|pas de r[eé]sultat|no results?|0 r[eé]sultats?|0 results?)\b/i
const NB_RESULTATS = /(~?\s?[\d][\d\s .,  ]*\s?[kKmM]?)\s+(?:r[eé]sultats?|results?)\b/i

/**
 * @returns {{statut:'ok'|'aucun'|'illisible', resultats:number|null, annoncesVues:number, plusAncienne:string|null}}
 */
function extraireMetaAds(texte, aujourdhui = new Date()) {
  const t = String(texte || '')
  const dates = []
  let m
  LIGNE_DIFFUSION.lastIndex = 0
  while ((m = LIGNE_DIFFUSION.exec(t))) {
    const d = parserDate(m[1])
    if (d) dates.push(d)
  }
  const annoncesVues = (t.match(ANNONCES_VUES) || []).length
  const n = t.match(NB_RESULTATS)
  const resultats = n ? parserNombre(n[1]) : null
  if (!dates.length && !annoncesVues && resultats === null) {
    if (AUCUN.test(t)) return { statut: 'aucun', resultats: 0, annoncesVues: 0, plusAncienne: null, ancienneteJours: null }
    return { statut: 'illisible', resultats: null, annoncesVues: 0, plusAncienne: null, ancienneteJours: null }
  }
  const plusAncienne = dates.length ? dates.slice().sort()[0] : null
  const ancienneteJours = plusAncienne ? Math.max(0, Math.round((aujourdhui - new Date(plusAncienne + 'T00:00:00Z')) / 86400e3)) : null
  return { statut: 'ok', resultats: resultats === null ? (annoncesVues || null) : resultats, annoncesVues, plusAncienne, ancienneteJours }
}

// ---------------------------------------------------------------- Google Trends
/**
 * The explorer page loads its curves from .../widgetdata/multiline, whose body
 * starts with ")]}'". One series per keyword, weekly, relative scale 0-100.
 * @returns {Array<{mot, points, indiceMoyen, variationPct, pic, statut}>}
 */
function extraireTrends(corps, mots) {
  let j
  try {
    j = JSON.parse(String(corps).replace(/^\)\]\}',?\s*/, ''))
  } catch {
    return null
  }
  const ligne = j && j.default && j.default.timelineData
  if (!Array.isArray(ligne) || !ligne.length) return null
  return mots.map((mot, i) => {
    const serie = ligne.map((p) => ({
      v: Array.isArray(p.value) ? Number(p.value[i]) : NaN,
      avec: Array.isArray(p.hasData) ? p.hasData[i] !== false : true,
      quand: p.formattedAxisTime || p.formattedTime || '',
      t: Number(p.time),
    })).filter((p) => Number.isFinite(p.v))
    const utiles = serie.filter((p) => p.avec)
    if (!utiles.length || utiles.every((p) => p.v === 0)) return { mot, statut: 'sans_donnees', points: serie.length }
    const moy = (a) => a.reduce((s, p) => s + p.v, 0) / a.length
    const n = serie.length
    const k = Math.min(8, Math.floor(n / 2))
    const recent = k ? moy(serie.slice(n - k)) : null
    const avant = k ? moy(serie.slice(n - 2 * k, n - k)) : null
    const pic = serie.reduce((a, p) => (p.v > a.v ? p : a), serie[0])
    return {
      mot,
      statut: 'ok',
      points: n,
      indiceMoyen: Math.round(moy(serie)),
      variationPct: avant ? Math.round(((recent - avant) / avant) * 100) : null,
      pic: pic.quand || (pic.t ? new Date(pic.t * 1000).toISOString().slice(0, 10) : ''),
    }
  })
}

// ---------------------------------------------------------------- browser (Electron)
function lecteurSignaux({ BrowserWindow, delaiMs = 30000, rendu = 3000 }) {
  /**
   * @param {string} url
   * @param {{defilements?:number, capture?:RegExp}} opts  capture: keep the bodies of matching network responses
   */
  return async function lire(url, { defilements = 0, capture = null } = {}) {
    const fen = new BrowserWindow({
      show: false,
      width: 1280,
      height: 900,
      webPreferences: { partition: 'persist:signaux-publics', sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
    })
    const captures = []
    const suivis = new Set()
    const enCours = []
    const dbg = fen.webContents.debugger
    try {
      if (capture) {
        // The debugger can only attach once the window has a first page (a fresh window answers "target closed").
        await Promise.race([fen.loadURL('about:blank').catch(() => {}), attendre(3000)])
        try {
          dbg.attach('1.3')
          await dbg.sendCommand('Network.enable')
        } catch {
          // no capture possible: the caller reports "aucune courbe reçue" instead of crashing
          capture = null
        }
      }
      if (capture) {
        dbg.on('message', (_e, methode, p) => {
          if (methode === 'Network.responseReceived' && capture.test(p.response.url)) suivis.add(p.requestId)
          if (methode === 'Network.loadingFinished' && suivis.has(p.requestId)) {
            enCours.push(
              dbg.sendCommand('Network.getResponseBody', { requestId: p.requestId })
                .then((r) => captures.push(r.base64Encoded ? Buffer.from(r.body, 'base64').toString('utf8') : r.body))
                .catch(() => {}),
            )
          }
        })
      }
      const charge = new Promise((resolve) => {
        fen.webContents.once('did-finish-load', resolve)
        fen.webContents.once('did-fail-load', (_e, code, desc) => resolve({ erreur: `${code} ${desc}` }))
      })
      fen.loadURL(url).catch(() => {})
      const fin = await Promise.race([charge, attendre(delaiMs).then(() => ({ erreur: 'délai dépassé' }))])
      if (fin && fin.erreur) return { url, urlFinale: fen.webContents.getURL() || url, texte: '', champMotDePasse: false, captures, erreur: fin.erreur }
      await attendre(rendu)
      if (capture) {
        const limite = Date.now() + delaiMs
        while (!captures.length && !enCours.length && Date.now() < limite) await attendre(250)
          await Promise.all(enCours)
        }
      for (let i = 0; i < defilements; i++) {
        await fen.webContents.executeJavaScript('window.scrollTo(0, document.body.scrollHeight)')
        await attendre(1500)
      }
      const page = await fen.webContents.executeJavaScript(
        '({ texte: (document.body && document.body.innerText) || "", pw: !!document.querySelector("input[type=password]"), titre: document.title, url: location.href })',
      )
      return { url, urlFinale: page.url, titre: page.titre, texte: page.texte, champMotDePasse: page.pw, captures }
    } finally {
      try { if (capture && dbg.isAttached()) dbg.detach() } catch { /* window already gone */ }
      if (!fen.isDestroyed()) fen.destroy()
    }
  }
}

// ---------------------------------------------------------------- orchestration
/** Search term for the ad library / trends: brand + the next words of the model name, no more. */
function raccourcir(nom, mots = 3) {
  return String(nom).replace(/[()[\]{}"“”,;:/\\]+/g, ' ').trim().split(/\s+/).slice(0, mots).join(' ')
}

function etatPage(page, url) {
  // Reuses the generic reading of block / login signs. `urlConnexion` = the URL asked, so that
  // landing on the page we asked for is never taken for a redirect to a login page.
  return etatSession({ urlConnexion: url, texteDeconnecte: '' }, { url: page.urlFinale, texte: page.texte, champMotDePasse: page.champMotDePasse })
}

async function releverPubs({ noms, lire, base, plafond, pause = PAUSE_ENTRE_CHARGEMENTS_MS, journal, suivi }) {
  const lignes = []
  const vus = new Set()
  for (const nom of noms) {
    const terme = raccourcir(nom)
    if (!terme || vus.has(terme.toLowerCase())) continue
    if (vus.size >= plafond) break
    vus.add(terme.toLowerCase())
    if (suivi.meta) { lignes.push({ produit: nom, terme, statut: 'non_lu', raison: suivi.meta }); continue }
    const url = `${base}/ads/library/?active_status=active&ad_type=all&country=FR&q=${encodeURIComponent(terme)}&search_type=keyword_exact_phrase&media_type=all`
    let page
    try {
      page = await lire(url, { defilements: 2 })
    } catch (err) {
      lignes.push({ produit: nom, terme, statut: 'illisible', raison: String(err.message || err) })
      continue
    }
    if (page.erreur) { lignes.push({ produit: nom, terme, statut: 'illisible', raison: page.erreur }); continue }
    const e = etatPage(page, url)
    if (e.etat !== 'connecte') {
      suivi.meta = e.etat === 'bloque' ? `blocage détecté (${e.raison})` : 'la bibliothèque demande une connexion'
      journal.erreur(`Meta Ad Library arrêtée pour la nuit : ${suivi.meta}`)
      lignes.push({ produit: nom, terme, statut: e.etat === 'bloque' ? 'bloque' : 'connexion', raison: suivi.meta })
      continue
    }
    lignes.push({ produit: nom, terme, ...extraireMetaAds(page.texte) })
    await attendre(pause)
  }
  return lignes
}

async function releverTendances({ theme, noms, lire, base, plafond, pause = PAUSE_ENTRE_CHARGEMENTS_MS, journal, suivi }) {
  const groupes = [{ nom: 'thème', mots: [theme] }]
  const modeles = [...new Set(noms.map((n) => raccourcir(n)).filter(Boolean))].slice(0, 5)
  if (modeles.length >= 2) groupes.push({ nom: 'modèles', mots: modeles })
  const sorties = []
  for (const g of groupes.slice(0, plafond)) {
    if (suivi.trends) { sorties.push({ groupe: g.nom, statut: 'non_lu', raison: suivi.trends }); continue }
    const url = `${base}/trends/explore?date=today%2012-m&geo=FR&hl=fr&q=${encodeURIComponent(g.mots.join(','))}`
    let page
    try {
      page = await lire(url, { capture: /widgetdata\/multiline/ })
    } catch (err) {
      sorties.push({ groupe: g.nom, statut: 'illisible', raison: String(err.message || err) })
      continue
    }
    if (page.erreur) { sorties.push({ groupe: g.nom, statut: 'illisible', raison: page.erreur }); continue }
    const e = etatPage(page, url)
    if (e.etat === 'bloque') {
      suivi.trends = `blocage détecté (${e.raison})`
      journal.erreur(`Google Trends arrêté pour la nuit : ${suivi.trends}`)
      sorties.push({ groupe: g.nom, statut: 'bloque', raison: suivi.trends })
      continue
    }
    let series = null
    for (const c of page.captures || []) {
      series = extraireTrends(c, g.mots)
      if (series) break
    }
    if (!series) {
      sorties.push({ groupe: g.nom, statut: 'illisible', raison: 'aucune courbe reçue (limite de requêtes de Google ou page changée)' })
      continue
    }
    sorties.push({ groupe: g.nom, statut: 'ok', series })
    await attendre(pause)
  }
  return sorties
}

/**
 * @param {object} p
 * @param {{libelleTheme:string, libelleCategorie:string}} p.rayon
 * @param {string[]} p.noms  model names found for the rayon
 * @param {Function} p.lire  from lecteurSignaux
 * @param {object} p.config  { meta, trends, plafondPubsParRayon, plafondTendancesParRayon }
 * @param {{meta:?string, trends:?string}} p.suivi  shared for the night: a block stops the source for every later rayon
 */
async function releverSignaux({ rayon, noms, lire, config, bases, journal, suivi, pause }) {
  const sortie = { pubs: null, tendances: null }
  if (config.trends) {
    sortie.tendances = await releverTendances({ theme: rayon.libelleTheme, noms, lire, base: bases.trends, plafond: config.plafondTendancesParRayon, journal, suivi, pause })
  }
  if (config.meta) {
    sortie.pubs = await releverPubs({ noms, lire, base: bases.meta, plafond: config.plafondPubsParRayon, journal, suivi, pause })
  }
  return sortie
}

function plus(n) { return n > 0 ? `+${n}` : String(n) }

/** The evidence block read by the model. Unread values are stated as such. */
function sectionPreuves(sortie) {
  if (!sortie || (!sortie.pubs && !sortie.tendances)) return ''
  const l = ['# SIGNAUX PUBLICS MESURÉS PAR LE POSTE (une valeur absente ou illisible s’écrit « Non vérifié » ; n’en déduis rien)']
  if (sortie.tendances) {
    l.push('## Google Trends — France, 12 derniers mois, indice relatif 0-100 (comparaison à l’intérieur d’un même groupe)')
    for (const g of sortie.tendances) {
      if (g.statut !== 'ok') { l.push(`- groupe ${g.groupe} : ${g.statut} (${g.raison})`); continue }
      for (const s of g.series) {
        l.push(s.statut === 'ok'
          ? `- « ${s.mot} » (${g.groupe}) : indice moyen ${s.indiceMoyen}, 8 dernières semaines contre les 8 précédentes ${s.variationPct === null ? 'non calculable' : plus(s.variationPct) + ' %'}, pic : ${s.pic || 'non indiqué'}`
          : `- « ${s.mot} » (${g.groupe}) : pas assez de recherches pour une courbe`)
      }
    }
  }
  if (sortie.pubs) {
    l.push('## Meta Ad Library — annonces ACTIVES en France contenant le nom exact (le compte porte sur le texte des annonces, pas sur la marque seule)')
    for (const p of sortie.pubs) {
      if (p.statut === 'ok') {
        l.push(`- « ${p.terme} » : ${p.resultats === null ? 'nombre d’annonces non lu' : '~' + p.resultats + ' annonce(s)'}${p.plusAncienne ? `, plus ancienne diffusion vue ${p.plusAncienne} (${p.ancienneteJours} jours)` : ', ancienneté non lue'}`)
      } else if (p.statut === 'aucun') {
        l.push(`- « ${p.terme} » : aucune annonce active trouvée`)
      } else {
        l.push(`- « ${p.terme} » : ${p.statut}${p.raison ? ` (${p.raison})` : ''}`)
      }
    }
  }
  return l.join('\n')
}

module.exports = { parserDate, parserNombre, extraireMetaAds, extraireTrends, raccourcir, lecteurSignaux, releverPubs, releverTendances, releverSignaux, sectionPreuves }
