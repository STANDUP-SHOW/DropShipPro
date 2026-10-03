'use strict'
/**
 * Extra Serper readings that need no account: Google Shopping France (real
 * offers and displayed prices), autocomplete (what buyers start typing) and
 * Google Images (real image addresses). Enrichment only: a refusal cuts the
 * rest of the readings and is reported as such, it never fails the rayon, and
 * nothing unread is ever written as a number.
 */

const PAR_DEFAUT = { autocomplete: true, shopping: true, images: true, plafondShopping: 20, plafondImages: 10 }

/** "1 299,00 €" / "29,99 €" / "$29.99" -> number, or null when unreadable. */
function prixEnNombre(brut) {
  const s = String(brut || '').replace(/[\s ]/g, '').replace(/[^\d.,]/g, '')
  if (!s || !/\d/.test(s)) return null
  const virgule = s.lastIndexOf(',')
  const point = s.lastIndexOf('.')
  let n
  if (virgule >= 0 && point >= 0) {
    const decimal = virgule > point ? ',' : '.'
    n = Number(decimal === ',' ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, ''))
  } else if (virgule >= 0 || point >= 0) {
    const sep = virgule >= 0 ? ',' : '.'
    const morceaux = s.split(sep)
    // "29,99" is a decimal; "1.299" or "1,299" is a thousands separator
    n = morceaux.length === 2 && morceaux[1].length <= 2 ? Number(morceaux.join('.')) : Number(morceaux.join(''))
  } else {
    n = Number(s)
  }
  return Number.isFinite(n) && n > 0 ? n : null
}

function mediane(liste) {
  if (!liste.length) return null
  const t = [...liste].sort((a, b) => a - b)
  const m = Math.floor(t.length / 2)
  return t.length % 2 ? t[m] : Math.round(((t[m - 1] + t[m]) / 2) * 100) / 100
}

/**
 * @returns {{requetes:number, coupe:string|null, autocomplete:[], shopping:[], images:[]}}
 */
async function releverSerperEtendu({ rayon, noms, serper, config = {}, journal }) {
  const c = { ...PAR_DEFAUT, ...config }
  const res = { requetes: 0, coupe: null, autocomplete: [], shopping: [], images: [] }

  // After one refusal (credits, quota) every later reading is marked unread, not retried.
  async function appeler(bloc, fn) {
    if (res.coupe) return { statut: 'non_lu', raison: res.coupe }
    try {
      const valeur = await fn()
      res.requetes++
      return { statut: 'ok', valeur }
    } catch (err) {
      res.coupe = String((err && err.message) || err)
      journal && journal.erreur(`${rayon.categorie}/${rayon.theme} : Serper ${bloc} interrompu`, { raison: res.coupe })
      return { statut: 'erreur', raison: res.coupe }
    }
  }

  if (c.autocomplete && typeof serper.autocomplete === 'function') {
    const requetes = [...new Set([rayon.libelleTheme, rayon.libelleCategorie, ...noms.slice(0, 5)].map((x) => String(x || '').trim()).filter(Boolean))]
    for (const requete of requetes) {
      const r = await appeler('autocomplete', () => serper.autocomplete(requete))
      res.autocomplete.push({ requete, statut: r.statut, suggestions: r.valeur || [], raison: r.raison })
    }
  }

  if (c.shopping && typeof serper.shopping === 'function') {
    for (const modele of noms.slice(0, c.plafondShopping)) {
      const r = await appeler('shopping', () => serper.shopping(modele))
      const offres = (r.valeur || []).map((o) => ({ ...o, prixNombre: prixEnNombre(o.prix) }))
      const prix = offres.map((o) => o.prixNombre).filter((n) => n !== null)
      res.shopping.push({
        modele,
        statut: r.statut === 'ok' && !offres.length ? 'aucun' : r.statut,
        raison: r.raison,
        offres,
        prixMin: prix.length ? Math.min(...prix) : null,
        prixMax: prix.length ? Math.max(...prix) : null,
        prixMedian: mediane(prix),
      })
    }
  }

  if (c.images && typeof serper.images === 'function') {
    for (const modele of noms.slice(0, c.plafondImages)) {
      const r = await appeler('images', () => serper.images(modele))
      res.images.push({ modele, statut: r.statut === 'ok' && !(r.valeur || []).length ? 'aucun' : r.statut, raison: r.raison, images: r.valeur || [] })
    }
  }
  return res
}

const COURT = (t, n) => (String(t).length > n ? String(t).slice(0, n - 1) + '…' : String(t))
const EUR = (n) => `${String(n).replace('.', ',')} €`

/** Evidence text for the model; null when nothing was asked. */
function sectionsPreuvesSerper(res) {
  if (!res) return []
  const blocs = []
  const ok = res.autocomplete.filter((a) => a.statut === 'ok' && a.suggestions.length)
  if (ok.length) {
    blocs.push('# SUGGESTIONS DE RECHERCHE GOOGLE (autocomplétion, France)\n' + ok.map((a) => `## ${a.requete}\n` + a.suggestions.slice(0, 10).map((s) => `- ${s}`).join('\n')).join('\n'))
  }
  if (res.shopping.length) {
    const lignes = res.shopping.map((s) => {
      if (s.statut === 'non_lu' || s.statut === 'erreur') return `## ${s.modele}\nNon lu (${COURT(s.raison || 'Serper indisponible', 80)}).`
      if (s.statut === 'aucun') return `## ${s.modele}\nAucune offre Google Shopping trouvée en France.`
      const lu = s.offres.filter((o) => o.prixNombre !== null).length
      const synth = s.prixMin !== null
        ? `${lu} prix lus sur ${s.offres.length} offres, de ${EUR(s.prixMin)} à ${EUR(s.prixMax)} (médiane ${EUR(s.prixMedian)})`
        : `${s.offres.length} offres, prix illisibles (Non vérifié)`
      return `## ${s.modele} — ${synth}\n` + s.offres.slice(0, 4).map((o) => `- ${o.vendeur || 'vendeur non indiqué'} | ${o.prix || 'Non vérifié'} | ${COURT(o.titre, 90)}${o.url ? ` | ${o.url}` : ''}`).join('\n')
    })
    blocs.push('# PRIX ET VENDEURS RELEVÉS (Google Shopping France, offres réelles ; ce ne sont pas des prix fournisseur)\n' + lignes.join('\n'))
  }
  const avecImages = res.images.filter((i) => i.statut === 'ok' && i.images.length)
  if (avecImages.length) {
    blocs.push('# IMAGES TROUVÉES (adresses réelles, seules autorisées pour image_url)\n' + avecImages.map((i) => `## ${i.modele}\n` + i.images.slice(0, 3).map((x) => `- ${COURT(x.titre, 70)} | ${x.image}${x.source ? ` | source : ${x.source}` : ''}`).join('\n')).join('\n'))
  }
  return blocs
}

/** Seen offer pages that are real seller pages (Google's own redirect links are left out). */
function urlsVendeurs(res) {
  const sortie = []
  if (!res) return sortie
  for (const s of res.shopping) {
    for (const o of s.offres) {
      if (!o.url) continue
      let h = ''
      try { h = new URL(o.url).hostname } catch { continue }
      if (!/(^|\.)google\.[a-z.]+$/i.test(h)) sortie.push(o.url)
    }
  }
  return sortie
}

module.exports = { PAR_DEFAUT, prixEnNombre, releverSerperEtendu, sectionsPreuvesSerper, urlsVendeurs }
