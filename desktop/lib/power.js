'use strict'
/**
 * DESKTOP POWER (demande de Max du 24/10/2026) : le site s'ouvre en pleine page dans
 * l'application, et ses pages DESKTOP POWER (WebShipper, SmartMarket, AdsAnalyser,
 * MarketPlus…) posent un navigateur intégré dans un emplacement de la page.
 *
 * Ce fichier ne garde que les décisions, testables sans Electron (check-desktop.cjs) :
 * qui a le droit de parler à l'application, dans quel profil un navigateur s'ouvre,
 * quelle adresse est acceptée, où la vue se pose, quand une session de place de
 * marché compte comme reliée. Le câblage Electron est dans main.js.
 */
const { PLATEFORMES } = require('./plafonds')
const { ADAPTATEURS, sansSession } = require('./adaptateurs')

/**
 * Les profils du navigateur intégré. Chacun a sa partition persistante : les cookies
 * de l'un ne passent jamais dans l'autre. Les trois places de marché réutilisent la
 * partition où l'exécuteur publie : se connecter ici, c'est relier la plateforme.
 */
const PROFILS = {
  webshipper: { partition: 'persist:webshipper', nom: 'WebShipper' },
  ads: { partition: 'persist:ads', nom: 'AdsAnalyser' },
  ...Object.fromEntries(Object.entries(PLATEFORMES).map(([id, p]) => [id, { partition: p.partition, nom: p.nom, plateforme: id }])),
}

const LECTURE_MAX = 20000

/** Seule une page du site lui-même (et seulement elle) a accès au pont. */
function origineSure(adresse, site) {
  try {
    return new URL(String(adresse)).origin === new URL(site).origin
  } catch {
    return false
  }
}

/**
 * Ce que tape le vendeur dans la barre d'adresse : une adresse web, un domaine nu
 * (« temu.com »), ou des mots — cherchés alors sur Google. Jamais `javascript:`,
 * `file:` ni une page du site (elle porterait le pont dans une vue qui ne l'a pas).
 */
function adresseNavigateur(texte, site) {
  const brut = String(texte || '').trim()
  if (!brut) return null
  let candidate = brut
  if (!/^[a-z][a-z0-9+.-]*:/i.test(brut)) {
    if (/^[^\s/]+\.[a-z]{2,}(\/\S*)?$/i.test(brut)) candidate = `https://${brut}`
    else return `https://www.google.com/search?q=${encodeURIComponent(brut)}`
  }
  try {
    const u = new URL(candidate)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    if (site && u.origin === new URL(site).origin) return null
    return u.href
  } catch {
    return null
  }
}

/** L'emplacement donné par la page (pixels CSS), mis à l'échelle et borné à la fenêtre. */
function zoneSure(zone, { largeur, hauteur, zoom = 1 }) {
  if (!zone || typeof zone !== 'object') return null
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) * zoom : NaN)
  let x = n(zone.x)
  let y = n(zone.y)
  let w = n(zone.width)
  let h = n(zone.height)
  if ([x, y, w, h].some(Number.isNaN)) return null
  // Une partie de l'emplacement peut être sous la barre du haut ou hors de l'écran : on rogne.
  if (x < 0) (w += x), (x = 0)
  if (y < 0) (h += y), (y = 0)
  w = Math.min(w, largeur - x)
  h = Math.min(h, hauteur - y)
  if (w < 40 || h < 40) return null
  return { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) }
}

/** Le profil demandé, ou null : jamais une partition que la page aurait inventée. */
function profil(id) {
  return Object.prototype.hasOwnProperty.call(PROFILS, id) ? { id, ...PROFILS[id] } : null
}

/** L'adresse où l'on vérifie une session : le formulaire de dépôt, que seul un compte connecté voit. */
function adresseVerification(plateforme) {
  return (ADAPTATEURS[plateforme] && ADAPTATEURS[plateforme].formulaire) || null
}

/**
 * La plateforme est-elle reliée ? On le dit sur le formulaire de dépôt seulement :
 * une page d'accueil s'affiche aussi sans compte. Les signes d'absence sont ceux de
 * l'exécuteur (lib/adaptateurs.js), relevés sur les vraies pages le 30/09/2026.
 */
function etatSession(plateforme, page) {
  const cible = adresseVerification(plateforme)
  if (!cible || !page) return 'inconnu'
  if (sansSession(plateforme, page)) return 'absent'
  try {
    const ici = new URL(page.url)
    const attendu = new URL(cible)
    if (ici.hostname !== attendu.hostname || !ici.pathname.startsWith(attendu.pathname.replace(/\/$/, ''))) return 'inconnu'
  } catch {
    return 'inconnu'
  }
  return 'connecte'
}

/** La page lue pour l'analyse : titre, adresse, texte visible borné. */
function lecture({ url = '', titre = '', texte = '' } = {}) {
  return { url: String(url), titre: String(titre).slice(0, 300), texte: String(texte).slice(0, LECTURE_MAX) }
}

module.exports = { PROFILS, LECTURE_MAX, origineSure, adresseNavigateur, zoneSure, profil, adresseVerification, etatSession, lecture }
