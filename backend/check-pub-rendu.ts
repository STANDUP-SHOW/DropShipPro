import sharp from 'sharp'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import http from 'http'
import { MISES_EN_PAGE, TYPOGRAPHIES, chartePour } from './src/services/adCharte.js'
import { composeAd } from './src/services/adComposer.js'
import { couleursDuLogo } from './src/services/logoCouleurs.js'

/**
 * Renders every layout on real photos, for the eye — and checks what an eye
 * would catch: nothing cut, nothing outside the image, the product still seen.
 *
 * Usage : npx tsx check-pub-rendu.ts <scene.jpg> [<scene2.jpg>…] --sortie <dossier>
 * Without scenes, a synthetic one is drawn (so `npm run controle` stays offline).
 */

const args = process.argv.slice(2)
const iSortie = args.indexOf('--sortie')
const sortie = iSortie >= 0 ? args[iSortie + 1] : null
const scenes = args.filter((a, i) => a !== '--sortie' && i !== iSortie + 1)

let echecs = 0
const exige = (ok: boolean, msg: string) => {
  if (!ok) {
    echecs++
    console.log(`ECHEC : ${msg}`)
  }
}

async function sceneSynthetique(): Promise<Buffer> {
  return sharp(
    Buffer.from(`<svg width="1200" height="1200" xmlns="http://www.w3.org/2000/svg">
      <defs><radialGradient id="g" cx="50%" cy="45%" r="60%"><stop offset="0%" stop-color="#d9d4cc"/><stop offset="100%" stop-color="#6b645c"/></radialGradient></defs>
      <rect width="1200" height="1200" fill="url(#g)"/>
      <rect x="430" y="330" width="340" height="460" rx="40" fill="#24324a"/>
      <rect x="470" y="380" width="260" height="40" rx="10" fill="#c88a4a"/>
    </svg>`),
  )
    .jpeg()
    .toBuffer()
}

async function logo(): Promise<string> {
  const png = await sharp(
    Buffer.from(`<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
      <circle cx="100" cy="100" r="92" fill="#c0392b"/><circle cx="100" cy="100" r="54" fill="#ffffff"/><circle cx="100" cy="100" r="30" fill="#2c3e50"/></svg>`),
  )
    .png()
    .toBuffer()
  // Served over HTTP: the composer fetches the logo like a real shop logo.
  const serveur = http.createServer((_, res) => {
    res.writeHead(200, { 'Content-Type': 'image/png' })
    res.end(png)
  })
  await new Promise<void>((ok) => serveur.listen(0, '127.0.0.1', ok))
  serveur.unref()
  const port = (serveur.address() as { port: number }).port
  logoPng = png
  return `http://127.0.0.1:${port}/logo.png`
}
let logoPng: Buffer = Buffer.alloc(0)

const COPIES = [
  {
    title: 'Partez léger, arrivez chic',
    price: '189,90 €',
    argument: 'Cuir pleine fleur, coutures doubles',
    ctaLabel: 'Commander',
  },
  {
    title: 'La tour sous le bureau a fait son temps',
    price: '642,51 €',
    argument: 'Toute la puissance, zéro encombrement',
    ctaLabel: 'Commander',
  },
]

const FORMATS = [
  { id: 'instagram', w: 1080, h: 1080 },
  { id: 'story', w: 1080, h: 1920 },
  { id: 'facebook', w: 1200, h: 628 },
]

async function main() {
  const fonds = scenes.length ? await Promise.all(scenes.map((s) => sharp(s).toBuffer())) : [await sceneSynthetique()]
  const logoUrl = await logo()
  const couleurs = await couleursDuLogo(logoPng)
  if (sortie) await mkdir(sortie, { recursive: true })

  let n = 0
  for (const [s, fond] of fonds.entries()) {
    for (const [m, mise] of MISES_EN_PAGE.entries()) {
      for (const f of FORMATS) {
        const charte = chartePour({ couleurs, index: m, miseEnPage: mise, typographie: TYPOGRAPHIES[(m + s) % TYPOGRAPHIES.length] })
        const copy = { ...COPIES[(s + m) % COPIES.length], shopName: 'Maison Lumen', logo: logoUrl }
        const img = await composeAd(fond, f.w, f.h, copy, charte)
        const meta = await sharp(img).metadata()
        exige(meta.width === f.w && meta.height === f.h, `${mise} ${f.id} : ${meta.width}×${meta.height}`)
        if (sortie) await writeFile(path.join(sortie, `s${s + 1}-${mise}-${f.id}.jpg`), img)
        n++
      }
    }
  }
  console.log(`${n} publicités composées, ${echecs} échec(s).`)
  process.exit(echecs ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
