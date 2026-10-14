/**
 * Banc du relevé AUTO-SHIPPER : la vraie fenêtre Electron cachée ouvre une fiche
 * servie en local (banc/fausse-fiche) et la lit avec les scripts de l'extension.
 * Lancer : npm run check:releve (Electron ; xvfb-run sur un serveur sans écran)
 */
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const zlib = require('node:zlib')
const { app } = require('electron')

// The hidden windows open and close one after another: closing the last must not quit.
app.on('window-all-closed', () => {})
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'dsp-releve-')))

/** A plain 600×600 PNG of one colour: a gallery photo as the scan measures it. */
function png(r, g, b) {
  const l = 600
  const ligne = Buffer.alloc(1 + l * 3)
  for (let x = 0; x < l; x++) ligne.set([r, g, b], 1 + x * 3)
  const brut = Buffer.concat(Array.from({ length: l }, () => ligne))
  const crc = (buf) => {
    let c = ~0
    for (const o of buf) {
      c ^= o
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
    }
    return ~c >>> 0
  }
  const bloc = (type, data) => {
    const t = Buffer.from(type)
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const c = Buffer.alloc(4)
    c.writeUInt32BE(crc(Buffer.concat([t, data])))
    return Buffer.concat([len, t, data, c])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(l, 0)
  ihdr.writeUInt32BE(l, 4)
  ihdr.set([8, 2, 0, 0, 0], 8)
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloc('IHDR', ihdr), bloc('IDAT', zlib.deflateSync(brut)), bloc('IEND', Buffer.alloc(0))])
}

const COULEURS = [[200, 30, 30], [30, 200, 30], [30, 30, 200], [200, 200, 30]]
const FICHE = `<!doctype html><html><head><meta charset="utf-8"><title>Lampe de bureau LED pliable</title>
<meta property="og:type" content="product"><meta property="og:title" content="Lampe de bureau LED pliable">
<meta property="product:price:amount" content="12.90"><meta property="product:price:currency" content="EUR"></head>
<body><h1>Lampe de bureau LED pliable</h1><div class="price">12,90 €</div>
<div class="gallery">${COULEURS.map((_, i) => `<img src="/photo-${i}.png" width="600" height="600" alt="Lampe ${i}">`).join('')}</div>
<div class="description"><p>Lampe LED pliable, trois intensités, port USB-C, bras orientable. Idéale pour le bureau et la lecture.</p></div>
</body></html>`
const MUR = '<!doctype html><html><head><title>Security check</title></head><body><h1>Please complete the captcha to continue</h1></body></html>'

let echecs = 0
const verifier = (nom, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'RATE'}  ${nom}${detail && !ok ? ` — ${detail}` : ''}`)
  if (!ok) echecs++
}

app.whenReady().then(async () => {
  const serveur = http.createServer((req, res) => {
    const m = req.url.match(/^\/photo-(\d)\.png$/)
    if (m) return res.writeHead(200, { 'Content-Type': 'image/png' }).end(png(...COULEURS[Number(m[1])]))
    if (req.url.startsWith('/mur')) return res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(MUR)
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(FICHE)
  })
  await new Promise((r) => serveur.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${serveur.address().port}`
  const { relever } = require('./lib/releveur')
  try {
    const r = await relever(`${base}/produit/lampe.html`, { delaiReleve: 60_000 })
    verifier('fiche lue dans la fenêtre cachée', r.ok === true, JSON.stringify(r).slice(0, 300))
    if (r.ok) {
      verifier('titre relevé', /Lampe de bureau/.test(r.payload.title), r.payload.title)
      verifier('prix relevé', r.payload.price === 12.9, String(r.payload.price))
      verifier('galerie relevée (4 photos)', Array.isArray(r.payload.images) && r.payload.images.length === 4, JSON.stringify(r.payload.images))
      verifier('adresse de la fiche', String(r.payload.sourceUrl).startsWith(`${base}/produit/`), r.payload.sourceUrl)
    }
    const mur = await relever(`${base}/mur`)
    verifier('mur anti-robot reconnu, rien lu', mur.bloque === true, JSON.stringify(mur))
  } catch (e) {
    verifier('relevé sans exception', false, e.stack)
  }
  serveur.close()
  console.log(echecs ? `\n${echecs} attente(s) manquée(s).` : '\nRelevé AUTO-SHIPPER : tout passe.')
  app.exit(echecs ? 1 : 0)
})
