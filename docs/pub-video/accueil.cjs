/**
 * Rend les illustrations des 11 thèmes de l'accueil depuis accueil.html.
 *
 *   node accueil.cjs                        # les 11 boucles MP4 + affiches JPG + PNG détourés
 *   node accueil.cjs --theme diffusion      # un seul thème
 *   node accueil.cjs --apercu 3.5           # une image par thème → sortie/accueil/apercu-<slug>-3.5.png
 *   node accueil.cjs --fixe                 # seulement les PNG détourés
 *
 * Sorties dans sortie/accueil/ :
 *   <slug>.mp4   boucle de 8 s, 1280 × 720, sans son, H.264 (crf 26, ~1 Mo)
 *   <slug>.jpg   affiche (image de la boucle à 4 s) : poster de la vidéo et image de repli
 *   <slug>.png   proposition fixe : image détourée, fond transparent, 1280 × 960
 * Les séquences clips/h-* se préparent avec preparer.sh (section « Accueil »).
 */
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright-core')
const FFMPEG = require('ffmpeg-static')

const DOSSIER = __dirname
const SORTIE = path.join(DOSSIER, 'sortie', 'accueil')
const IPS = 30
const THEMES = ['scraping-produits', 'fournisseurs', 'annonces-ia', 'dropshop-ia', 'visuels-ia', 'reseaux-sociaux',
  'diffusion', 'analyses-de-marche', 'agents-ia', 'auto-shipper', 'les-drops']
const CHROME = [process.env.CHROME, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/usr/bin/chromium', '/usr/bin/google-chrome']
  .find((p) => p && fs.existsSync(p))

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null }

async function ouvrir(nav, slug, fixe) {
  const page = await nav.newPage({ viewport: { width: 1280, height: fixe ? 960 : 720 }, deviceScaleFactor: 1 })
  page.on('pageerror', (e) => console.error(slug, 'erreur dans la page :', e.message))
  await page.goto(`file://${path.join(DOSSIER, 'accueil.html')}?theme=${slug}${fixe ? '&fixe=1' : ''}`)
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all([...document.images].filter((im) => im.src).map((im) => im.decode().catch(() => {})))
    if (window.pret) await window.pret()
  })
  return page
}

async function boucle(nav, slug) {
  const page = await ouvrir(nav, slug, false)
  const mp4 = path.join(SORTIE, `${slug}.mp4`)
  const p = spawn(FFMPEG, ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(IPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-an', '-movflags', '+faststart', mp4],
  { stdio: ['pipe', 'inherit', 'inherit'] })
  const fin = new Promise((ok, ko) => p.on('close', (c) => (c === 0 ? ok() : ko(new Error('ffmpeg ' + c)))))
  const total = 8 * IPS
  for (let n = 0; n < total; n++) {
    await page.evaluate((t) => window.rendre(t), n / IPS)
    const img = await page.screenshot({ type: 'jpeg', quality: 94 })
    if (n === 4 * IPS) fs.writeFileSync(path.join(SORTIE, `${slug}.jpg`), await page.screenshot({ type: 'jpeg', quality: 86 }))
    if (!p.stdin.write(img)) await new Promise((r) => p.stdin.once('drain', r))
  }
  p.stdin.end()
  await fin
  await page.close()
  console.log(slug, '→', (fs.statSync(mp4).size / 1e6).toFixed(2), 'Mo')
}

async function fixe(nav, slug) {
  const page = await ouvrir(nav, slug, true)
  await page.evaluate(() => window.rendre(5))
  await page.screenshot({ path: path.join(SORTIE, `${slug}.png`), omitBackground: true })
  await page.close()
}

async function main() {
  fs.mkdirSync(SORTIE, { recursive: true })
  const nav = await chromium.launch({ executablePath: CHROME, args: ['--allow-file-access-from-files'] })
  const liste = arg('--theme') ? [arg('--theme')] : THEMES
  const apercu = arg('--apercu')
  for (const slug of liste) {
    if (apercu !== null) {
      const page = await ouvrir(nav, slug, false)
      await page.evaluate((t) => window.rendre(t), parseFloat(apercu))
      await page.screenshot({ path: path.join(SORTIE, `apercu-${slug}-${apercu}.png`) })
      await page.close()
      continue
    }
    if (!process.argv.includes('--fixe')) await boucle(nav, slug)
    await fixe(nav, slug)
  }
  await nav.close()
}
main().catch((e) => { console.error(e); process.exit(1) })
