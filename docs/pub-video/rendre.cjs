/**
 * Rend pub.html en MP4 vertical 1080 × 1920, 30 images/s, avec sa bande-son.
 *
 *   npm install                     # une fois : playwright-core + ffmpeg-static
 *   node rendre.cjs                 # → sortie/pub-dropshipper-30s.mp4
 *   node rendre.cjs --apercu 12.5   # une seule image → sortie/apercu-12.5.png
 *
 * Chaque image est posée par window.rendre(t) puis photographiée : aucune
 * animation ne tourne pendant la capture, donc aucune image n'est ratée ni
 * doublée, quelle que soit la lenteur de la machine. Les photos partent
 * directement dans ffmpeg par un tuyau, sans fichier intermédiaire.
 *
 * Les séquences d'images des vidéos (clips/) et la musique (sources/) se
 * préparent avec preparer.sh.
 */
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright-core')
const FFMPEG = require('ffmpeg-static')

const DOSSIER = __dirname
const SORTIE = path.join(DOSSIER, 'sortie')
const IPS = 30
const L = 1080, H = 1920

const CHROME = [
  process.env.CHROME,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => p && fs.existsSync(p))

function ffmpeg(args) {
  return new Promise((ok, ko) => {
    const p = spawn(FFMPEG, args, { stdio: ['pipe', 'inherit', 'pipe'] })
    let err = ''
    p.stderr.on('data', (d) => { err += d })
    p.on('close', (c) => (c === 0 ? ok() : ko(new Error(err.slice(-2000)))))
    p.done = null
    ffmpeg.dernier = p
  })
}

// Bande-son : la musique de Myneurovibe, son « drop » (25,6 s dans la source)
// calé sur la première coupe (3,0 s), puis un second passage de la partie forte
// fondu enchaîné pour couvrir la fin ; fondu de sortie sur la dernière seconde.
async function bandeSon(duree) {
  const wav = path.join(SORTIE, 'bande-son.wav')
  const src = path.join(DOSSIER, 'sources', 'neurovibe.mp4')
  const debut = 25.6 - 3.0
  await ffmpeg(['-loglevel', 'error', '-y', '-i', src, '-i', src, '-filter_complex',
    `[0:a]atrim=${debut}:${debut + 25.2},asetpts=PTS-STARTPTS[a];` +
    `[1:a]atrim=30:36,asetpts=PTS-STARTPTS[b];` +
    `[a][b]acrossfade=d=0.6,atrim=0:${duree},afade=t=in:d=0.3,afade=t=out:st=${duree - 1.2}:d=1.2,loudnorm=I=-14:TP=-1.5[s]`,
    '-map', '[s]', '-ar', '48000', '-ac', '2', wav])
  return wav
}

async function main() {
  if (!CHROME) throw new Error('Chrome introuvable (variable CHROME pour le désigner)')
  fs.mkdirSync(SORTIE, { recursive: true })
  const i = process.argv.indexOf('--apercu')
  const apercu = i > 0 ? parseFloat(process.argv[i + 1]) : null

  const nav = await chromium.launch({ executablePath: CHROME, args: ['--allow-file-access-from-files', '--force-device-scale-factor=1'] })
  const page = await nav.newPage({ viewport: { width: L, height: H }, deviceScaleFactor: 1 })
  page.on('pageerror', (e) => console.error('Erreur dans la page :', e.message))
  await page.goto('file://' + path.join(DOSSIER, 'pub.html'))
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all([...document.images].filter((im) => im.src).map((im) => im.decode().catch(() => {})))
  })
  const duree = await page.evaluate(() => window.DUREE)

  if (apercu !== null) {
    await page.evaluate((t) => window.rendre(t), apercu)
    const f = path.join(SORTIE, `apercu-${apercu}.png`)
    await page.screenshot({ path: f })
    console.log(f)
    await nav.close()
    return
  }

  const wav = await bandeSon(duree)
  const mp4 = path.join(SORTIE, 'pub-dropshipper-30s.mp4')
  const fin = ffmpeg(['-loglevel', 'error', '-y',
    '-f', 'image2pipe', '-framerate', String(IPS), '-c:v', 'mjpeg', '-i', '-',
    '-i', wav,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
    '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', mp4])
  const tuyau = ffmpeg.dernier.stdin

  const total = Math.round(duree * IPS)
  const t0 = Date.now()
  for (let n = 0; n < total; n++) {
    await page.evaluate((t) => window.rendre(t), n / IPS)
    const img = await page.screenshot({ type: 'jpeg', quality: 95 })
    if (!tuyau.write(img)) await new Promise((r) => tuyau.once('drain', r))
    if (n % 60 === 0) console.log(`image ${n}/${total} — ${((Date.now() - t0) / 1000).toFixed(0)} s`)
  }
  tuyau.end()
  await fin
  await nav.close()
  console.log('Terminé :', mp4)
}

main().catch((e) => { console.error(e); process.exit(1) })
