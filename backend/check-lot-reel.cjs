/**
 * Le relevé de lot, rejoué sur de VRAIES fiches fournisseur enregistrées.
 *
 *   cd backend && node check-lot-reel.cjs             # le code de la branche
 *   cd backend && node check-lot-reel.cjs --ref main  # le même banc sur une autre version
 *
 * **Pourquoi ce banc (27/11/2026).** Un lot de 5 imports AliExpress est sorti
 * avec les photos des produits recommandés et des descriptions mélangées, devant
 * des clients, alors que tous les bancs passaient : ils tournaient sur des pages
 * fabriquées (jsdom). Règle de max : tous les tests sur du réel.
 *
 * **Les fiches** (`bancs-reels/fiches/*.json.gz`) ont été enregistrées dans le
 * Chrome du vendeur par `bancs-reels/enregistrer-fiche.js` : la page telle
 * qu'affichée (racines fantômes comprises, scripts vidés), la vérité lue sur la
 * page sans l'extension (galerie affichée, prix affiché, caractéristiques,
 * titres des produits voisins) et la taille réelle de chaque photo.
 *
 * **Ce que le banc fait.** Il rouvre chaque page dans Chromium à son adresse
 * d'origine, sans réseau : les photos sont rendues à leur taille enregistrée, le
 * reste est refusé. Il charge les scripts de l'extension, lance le relevé de lot
 * et compare à la vérité de la page :
 *   - photos : exactement la galerie affichée, dans l'ordre, aucune autre ;
 *   - prix : celui affiché ;
 *   - titre : celui de la fiche ;
 *   - texte : les caractéristiques du produit, aucun titre de produit voisin,
 *     aucun bout de script ;
 *   - variantes : chaque rangée d'options affichée ;
 *   - fiche introuvable : refusée, rien d'importé.
 * Ajouter une fiche : l'enregistrer (voir l'en-tête d'enregistrer-fiche.js),
 * la déposer ici, relancer.
 */
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const { execFileSync } = require('child_process')
const { chromium } = require('playwright')

const SCRIPTS = ['config.js', 'content/fill-helpers.js', 'content/image-scan.js', 'content/adapters.js', 'content/photo-preselect.js', 'content/capture.js']
const refIndex = process.argv.indexOf('--ref')
const ref = refIndex > 0 ? process.argv[refIndex + 1] : null

function lireScript(f) {
  if (!ref) return fs.readFileSync(path.join(__dirname, 'extension', f), 'utf8')
  try {
    return execFileSync('git', ['show', `${ref}:backend/extension/${f}`], { cwd: __dirname, encoding: 'utf8', maxBuffer: 1 << 26 })
  } catch {
    return '' // a file that did not exist in that version
  }
}

let echecs = 0
function verifier(nom, condition, detail = '') {
  console.log(`  ${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

const cle = (u) => u.match(/\/kf\/([A-Za-z0-9]{16,})/)?.[1] ?? u
const prix = (t) => {
  const m = String(t || '').replace(/\s/g, '').match(/(\d+(?:[.,]\d{1,2})?)/)
  return m ? Number(m[1].replace(',', '.')) : null
}
const LIBELLES = /^(?:présentation|description|détails|report|signaler|voir plus|voir moins|view more|show more|spécifications|caractéristiques)$/i

async function relever(navigateur, fiche) {
  const page = await navigateur.newPage()
  const origine = new URL(fiche.url)
  await page.route('**/*', (route) => {
    const u = route.request().url()
    if (u.split('#')[0] === fiche.url.split('#')[0]) {
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fiche.html })
    }
    if (route.request().resourceType() === 'image' || /aliexpress-media|alicdn|kwcdn/.test(u)) {
      const t = fiche.tailles[u]
      if (!t) return route.fulfill({ status: 404, body: '' })
      return route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: `<svg xmlns="http://www.w3.org/2000/svg" width="${t[0]}" height="${t[1]}"><rect width="100%" height="100%" fill="#ccc"/></svg>`,
      })
    }
    return route.abort()
  })
  await page.addInitScript(() => {
    window.__dspEcouteurs = []
    const stub = {
      runtime: {
        onMessage: { addListener(f) { window.__dspEcouteurs.push(f) } },
        sendMessage: async () => ({}),
        getURL: (p) => p,
        id: 'banc',
      },
      storage: { local: { get: async () => ({}), set: async () => {}, remove: async () => {} } },
    }
    Object.defineProperty(window, 'chrome', { value: stub, configurable: true, writable: true })
  })
  await page.goto(origine.href, { waitUntil: 'domcontentloaded' })
  for (const f of SCRIPTS) {
    const code = lireScript(f)
    if (code) await page.addScriptTag({ content: code })
  }
  const releve = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const fin = setTimeout(() => resolve({ ok: false, error: 'pas de réponse en 60 s' }), 60000)
        const f = window.__dspEcouteurs[0]
        if (!f) return resolve({ ok: false, error: 'capture.js ne s’est pas enregistré' })
        f({ type: 'dsp-relever-pour-lot' }, {}, (r) => {
          clearTimeout(fin)
          resolve(r)
        })
      }),
  )
  // The option rows as the buyer sees them, read straight from the page.
  const rangees = await page.evaluate(() =>
    [...document.querySelectorAll('[data-sku-row]')].map((l) => [...l.querySelectorAll('[data-sku-col]')].length),
  )
  await page.close()
  return { releve, rangees }
}

;(async () => {
  const dossier = path.join(__dirname, 'bancs-reels', 'fiches')
  const fichiers = fs.readdirSync(dossier).filter((f) => f.endsWith('.json.gz')).sort()
  console.log(`Relevé de lot sur ${fichiers.length} fiches réelles — code : ${ref || 'branche courante'}\n`)
  const navigateur = await chromium.launch()
  try {
    for (const f of fichiers) {
      const fiche = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dossier, f))))
      console.log(`${fiche.nom}  (${fiche.url}, enregistrée le ${fiche.enregistreLe.slice(0, 10)})`)
      const { releve, rangees } = await relever(navigateur, fiche)
      const v = fiche.verite

      if (!v.galerie.length) {
        // A page that shows no product (404, item withdrawn): it must be refused, nothing imported.
        verifier('fiche introuvable refusée', releve.ok === false, releve.error || 'acceptée')
        verifier('aucune photo importée', !(releve.payload?.images || []).length)
        console.log('')
        continue
      }

      verifier('relevé accepté', releve.ok === true, releve.error || '')
      const p = releve.payload || {}

      const attendues = [...new Set(v.galerie.map(cle))]
      const obtenues = (p.images || []).map(cle)
      const intruses = obtenues.filter((k) => !attendues.includes(k))
      const absentes = attendues.filter((k) => !obtenues.includes(k))
      verifier(
        `photos = la galerie affichée (${attendues.length})`,
        !intruses.length && !absentes.length && obtenues.join() === attendues.join(),
        `${obtenues.length} relevée(s), ${intruses.length} étrangère(s), ${absentes.length} absente(s)`,
      )

      verifier('prix = prix affiché', prix(p.price) === prix(v.prixAffiche), `${p.price} relevé, ${v.prixAffiche} affiché`)
      verifier('titre de la fiche', Boolean(p.title) && (v.titreH1 || '').startsWith(p.title.slice(0, 30)), (p.title || '').slice(0, 60))

      const texte = `${p.description || ''}\n${p.pageText || ''}`
      const lignes = (v.caracteristiques || '')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 2 && !LIBELLES.test(l))
      const manquantes = lignes.filter((l) => !texte.includes(l))
      verifier(`caractéristiques du produit présentes (${lignes.length} lignes)`, lignes.length > 0 && !manquantes.length, manquantes.slice(0, 3).join(' | '))
      const voisins = v.voisins.filter((t) => t !== v.titreH1 && texte.includes(t))
      verifier(`aucun produit voisin dans le texte (${v.voisins.length} titres sur la page)`, !voisins.length, voisins.slice(0, 2).join(' | '))
      verifier('aucun bout de script dans le texte', !/window\.\w+\s*=|function\s*\(|=>\s*\{/.test(texte))

      const groupes = Object.values(p.variants || {}).map((x) => x.length).sort()
      const affichees = rangees.filter((n) => n > 1).map((n) => Math.min(n, 25)).sort()
      verifier(
        `variantes = rangées d'options affichées (${affichees.length})`,
        groupes.join() === affichees.join(),
        JSON.stringify(Object.fromEntries(Object.entries(p.variants || {}).map(([k, x]) => [k, x.length]))),
      )
      console.log('')
    }
  } finally {
    await navigateur.close()
  }
  if (echecs) {
    console.log(`${echecs} attente(s) non tenue(s).`)
    process.exitCode = 1
  } else {
    console.log('Relevé de lot sur fiches réelles : tout passe.')
  }
})()
