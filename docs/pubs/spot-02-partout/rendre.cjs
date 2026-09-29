#!/usr/bin/env node
// Renders spot.html into an MP4 (1080 × 1920, 30 fps, H.264 + AAC).
//
//   node rendre.cjs --rush <tunnel.mp4> [--sortie spot.mp4] [--de 0 --a 30] [--apercu 3,9,15]
//
// The tunnel rush (and its music) comes from Pinterest and stays out of the
// repo: pass its path. Frames are extracted once into ./.tunnel/.
// Needs `playwright-core` (or `playwright`) and an ffmpeg with libx264: set
// FFMPEG, or install `ffmpeg-static`. Modules are also looked up in NODE_PATH.
// --apercu writes a few still PNGs instead of the video (fast check).

const fs = require('fs')
const path = require('path')
const http = require('http')
const { spawn, spawnSync } = require('child_process')

const args = process.argv.slice(2)
const arg = (n, d) => { const i = args.indexOf('--' + n); return i < 0 ? d : args[i + 1] }
const ICI = __dirname
const RACINE = path.resolve(ICI, '../../..')
const FPS = 30

function charger(nom) {
  for (const n of [nom, nom.replace('-core', '')]) {
    try { return require(n) } catch {}
  }
  throw new Error(`Module introuvable : ${nom} (npm i ${nom}, ou NODE_PATH)`)
}
const ffmpeg = process.env.FFMPEG || (() => { try { return require('ffmpeg-static') } catch { return 'ffmpeg' } })()

const rush = arg('rush')
if (!rush || !fs.existsSync(rush)) {
  console.error('Donner le rush du tunnel : --rush <fichier.mp4>')
  process.exit(1)
}
const dossierTunnel = path.join(ICI, '.tunnel')
if (!fs.existsSync(path.join(dossierTunnel, '0705.jpg'))) {
  fs.mkdirSync(dossierTunnel, { recursive: true })
  console.log('Extraction des images du tunnel…')
  const r = spawnSync(ffmpeg, ['-loglevel', 'error', '-y', '-i', rush, '-t', '23.5',
    '-vf', 'fps=30,scale=1080:1920:flags=lanczos', '-q:v', '3', path.join(dossierTunnel, '%04d.jpg')], { stdio: 'inherit' })
  if (r.status !== 0) process.exit(1)
}

// Static server: the page reads fonts and logos, which file:// refuses.
const TYPES = { '.html': 'text/html', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2' }
const serveur = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0])
  const fichier = url.startsWith('/tunnel/')
    ? path.join(dossierTunnel, url.slice(8))
    : path.join(RACINE, url)
  if (!fichier.startsWith(RACINE) && !fichier.startsWith(dossierTunnel)) { res.writeHead(403); return res.end() }
  fs.readFile(fichier, (err, data) => {
    if (err) { res.writeHead(404); return res.end() }
    res.writeHead(200, { 'content-type': TYPES[path.extname(fichier)] || 'application/octet-stream' })
    res.end(data)
  })
})

async function main() {
  await new Promise((r) => serveur.listen(0, '127.0.0.1', r))
  const port = serveur.address().port
  const { chromium } = charger('playwright-core')
  const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => fs.existsSync(p))
  const nav = await chromium.launch(exe ? { executablePath: exe } : {})
  const page = await nav.newPage({ viewport: { width: 1080, height: 1920 } })
  page.on('pageerror', (e) => console.error('page :', e.message))
  const rel = path.relative(RACINE, path.join(ICI, 'spot.html')).split(path.sep).join('/')
  await page.goto(`http://127.0.0.1:${port}/${rel}?tunnel=/tunnel`)
  const canvas = await page.$('#c')

  const apercu = arg('apercu')
  if (apercu) {
    for (const t of apercu.split(',').map(Number)) {
      await page.evaluate((t) => window.rendre(t), t)
      const f = path.join(ICI, `.apercu-${String(t).replace('.', '_')}.png`)
      await canvas.screenshot({ path: f })
      console.log(f)
    }
    await nav.close(); serveur.close(); return
  }

  const de = +arg('de', 0), a = +arg('a', 30)
  const sortie = path.resolve(arg('sortie', path.join(ICI, 'spot-02-partout.mp4')))
  const enc = spawn(ffmpeg, ['-loglevel', 'error', '-y',
    '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-ss', String(de), '-t', String(a - de), '-i', rush,
    '-map', '0:v', '-map', '1:a?',
    '-af', `afade=t=in:d=0.3,afade=t=out:st=${Math.max(0, a - de - 1.5)}:d=1.5`,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
    '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', sortie], { stdio: ['pipe', 'inherit', 'inherit'] })

  const n0 = Math.round(de * FPS), n1 = Math.round(a * FPS)
  const debut = Date.now()
  for (let n = n0; n < n1; n++) {
    await page.evaluate((t) => window.rendre(t), n / FPS)
    const jpg = await canvas.screenshot({ type: 'jpeg', quality: 95 })
    if (!enc.stdin.write(jpg)) await new Promise((r) => enc.stdin.once('drain', r))
    if (n % 30 === 0) process.stdout.write(`\r${(n / FPS).toFixed(0)} s / ${a} s  (${((Date.now() - debut) / 1000).toFixed(0)} s écoulées)`)
  }
  enc.stdin.end()
  await new Promise((r) => enc.on('close', r))
  await nav.close(); serveur.close()
  console.log(`\n${sortie}`)
}
main().catch((e) => { console.error(e); process.exit(1) })
