/*
 * Enregistre une VRAIE fiche fournisseur, telle que le navigateur du vendeur l'affiche,
 * pour le banc check-lot-reel.cjs (27/11/2026, règle de max : tous les tests sur du réel).
 *
 * Exécuté dans l'onglet de la fiche (Chrome de max), après chargement :
 *   1. charge les scripts de l'extension du commit SHA (raw.githubusercontent) ;
 *   2. lance le relevé de lot, qui fait défiler la fiche et monte sa description ;
 *   3. note la vérité de la page, lue sans l'extension : galerie affichée, prix
 *      affiché, caractéristiques, titres des produits voisins ;
 *   4. sérialise la page (racines fantômes du site comprises, scripts neutralisés,
 *      panneaux d'autres extensions retirés) et l'envoie au récepteur local.
 *
 * Variables attendues : window.__dspSha, window.__dspNom, window.__dspRecepteur.
 */
;(async () => {
  const base = `https://raw.githubusercontent.com/STANDUP-SHOW/DropShipPro/${window.__dspSha}/backend/extension/`
  const stub = {
    runtime: {
      onMessage: { addListener(f) { window.__dspEcouteurs = (window.__dspEcouteurs || []).concat(f) } },
      sendMessage: async () => ({}),
      getURL: (p) => p,
      id: 'banc',
    },
    storage: { local: { get: async () => ({}), set: async () => {}, remove: async () => {} } },
  }
  Object.defineProperty(window, 'chrome', { value: stub, configurable: true, writable: true })
  window.__dspEcouteurs = []
  for (const f of ['config.js', 'content/fill-helpers.js', 'content/image-scan.js', 'content/adapters.js', 'content/photo-preselect.js', 'content/capture.js']) {
    ;(0, eval)(await (await fetch(base + f)).text())
  }
  const releve = await new Promise((r) => window.__dspEcouteurs[0]({ type: 'dsp-relever-pour-lot' }, {}, r))
  // Une fenêtre d'avis ouverte par le relevé se referme avant la photo de la page.
  document.querySelectorAll('[class*="modal" i] [class*="close" i]').forEach((b) => b.click?.())
  await new Promise((r) => setTimeout(r, 800))

  // La vérité de la page, lue directement : ce que l'acheteur voit.
  const verite = {
    url: location.href,
    titreH1: document.querySelector('h1')?.innerText?.trim() || null,
    galerie: [...document.querySelectorAll('[class*="slider--img"] img, [class*="magnifier--wrap"] img, img[src*="product/fancy"]')].map(
      (i) => i.currentSrc || i.src,
    ),
    caracteristiques: document.querySelector('#nav-specification')?.innerText || null,
    prixAffiche: (document.querySelector('[class*="price-default--current"], [class*="product-price-current"], [class*="price--current"]')?.innerText || '').trim() || null,
    voisins: [...new Set([...document.querySelectorAll('a[href]')]
      .filter((a) => {
        const m = a.href.match(/\/item\/(\d+)|-g-(\d+)\.html/)
        return m && !location.href.includes(m[1] || m[2])
      })
      .map((a) => (a.innerText || a.title || '').trim().split('\n').sort((x, y) => y.length - x.length)[0])
      .filter((t) => t && t.length > 25))].slice(0, 40),
  }

  // Les tailles réelles des photos, pour que le banc les rende à l'identique hors ligne.
  const tailles = {}
  const mesurer = (u) =>
    new Promise((r) => {
      const i = new Image()
      const fin = (v) => r(v)
      i.onload = () => fin([i.naturalWidth, i.naturalHeight])
      i.onerror = () => fin(null)
      setTimeout(() => fin(null), 6000)
      i.src = u
    })
  const aMesurer = new Set([...(releve.payload?.images || []), ...verite.galerie])
  try {
    for (const u of self.dspAdapterImages(self.dspAdapterFor())) aMesurer.add(u)
  } catch {}
  for (const u of aMesurer) tailles[u] = await mesurer(u)

  // La page : racines fantômes du site gardées, panneaux d'autres extensions retirés, scripts inertes.
  for (const el of document.querySelectorAll('*')) {
    if (el.tagName.includes('-') && el.shadowRoot) el.remove()
  }
  document.querySelectorAll('[id^="dsp-"], [class^="dsp-"]').forEach((el) => el.remove())
  const racines = [...document.querySelectorAll('*')].map((e) => e.shadowRoot).filter(Boolean)
  let html = document.documentElement.getHTML({ shadowRoots: racines, serializableShadowRoots: true })
  html = html.replace(/<script\b/gi, '<script type="text/dsp-inerte"')
  html = `<!doctype html>\n<html lang="fr">${html}</html>`

  const fiche = { nom: window.__dspNom, enregistreLe: new Date().toISOString(), sha: window.__dspSha, url: location.href, verite, releve, tailles, html }
  const f = document.createElement('form')
  f.method = 'POST'
  f.enctype = 'text/plain'
  f.action = `${window.__dspRecepteur}/?nom=${encodeURIComponent(window.__dspNom)}.json`
  const t = document.createElement('textarea')
  t.name = 'f'
  t.value = JSON.stringify(fiche)
  f.appendChild(t)
  document.body.appendChild(f)
  window.__dspResume = { ok: releve.ok, erreur: releve.error, photos: releve.payload?.images?.length, galerie: verite.galerie.length, voisins: verite.voisins.length, taille: t.value.length }
  setTimeout(() => f.submit(), 50)
})()
