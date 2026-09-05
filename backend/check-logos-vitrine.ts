/**
 * Les logos de vitrine : ce qui est accepté, ce qui est refusé, et sous quelle
 * forme c'est stocké.
 *
 *   cd backend && npx tsx check-logos-vitrine.ts
 *
 * **Pourquoi ce banc.** Un logo de vitrine n'est pas un logo de filigrane :
 * `saveVitrineLogo` garde le SVG tel quel au lieu de le rasteriser, et ne
 * détoure pas le fond blanc. Deux choses doivent tenir : (1) un SVG propre est
 * gardé en SVG, un PNG reste un PNG net et transparent — pas de traitement
 * filigrane ; (2) un SVG qui embarque du script est REFUSÉ, parce que son
 * adresse `/storage/...` est ouvrable en direct. Le contrat de refus est écrit
 * ici en dur : un SVG avec `<script>`, un gestionnaire `onload=`, un
 * `<foreignObject>` ou une URL `javascript:` ne doit jamais être stocké.
 *
 * En local sans R2, `putFile` écrit sous `storage/` et rend `/storage/...` : le
 * banc laisse écrire, relit le fichier pour l'inspecter, puis l'efface. Il
 * refuse de tourner si R2 est configuré (il écrirait pour de vrai en ligne).
 */
import sharp from 'sharp'
import { readFile, unlink } from 'fs/promises'
import path from 'path'
import { saveVitrineLogo } from './src/services/watermark.js'
import { usesObjectStorage } from './src/lib/storage.js'

if (usesObjectStorage()) {
  console.error('R2 est configuré : ce banc écrirait en ligne. Lancer sans R2.')
  process.exit(2)
}

const aEffacer: string[] = []
/** Écrit par saveVitrineLogo, relu depuis le disque local. */
async function stocke(chemin: string): Promise<{ type: string; octets: Buffer }> {
  const cle = chemin.replace(/^\/storage\//, '')
  aEffacer.push(cle)
  const octets = await readFile(path.resolve('storage', cle))
  const type = cle.endsWith('.svg') ? 'image/svg+xml' : 'image/png'
  return { type, octets }
}

let echecs = 0
function verifier(nom: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!ok) echecs++
}
async function refuse(nom: string, appel: () => Promise<unknown>, motifAttendu: RegExp) {
  try {
    await appel()
    verifier(nom, false, 'accepté alors qu\'il fallait refuser')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    verifier(nom, motifAttendu.test(msg), msg.slice(0, 60))
  }
}

async function main() {
  console.log('Ce qui est accepté')

  const svgPropre = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#e11d48"/></svg>',
  )
  const cheminSvg = await saveVitrineLogo(svgPropre, 'image/svg+xml', 400)
  const svgStocke = await stocke(cheminSvg)
  verifier('un SVG propre est gardé en SVG, octets intacts', svgStocke.type === 'image/svg+xml' && svgStocke.octets.equals(svgPropre))
  verifier('son chemin finit en .svg', /\.svg$/.test(cheminSvg))

  // Un PNG opaque de 800×800 : doit rester PNG, être plafonné à 500, et NE PAS
  // être détouré (le fond blanc reste blanc, opaque).
  const pngBlanc = await sharp({ create: { width: 800, height: 800, channels: 4, background: '#ffffff' } }).png().toBuffer()
  const pngStocke = await stocke(await saveVitrineLogo(pngBlanc, 'image/png', 500))
  const meta = await sharp(pngStocke.octets).metadata()
  verifier('un PNG est stocké en PNG', pngStocke.type === 'image/png' && meta.format === 'png')
  verifier('il est plafonné à 500 px', (meta.width ?? 0) <= 500 && (meta.height ?? 0) <= 500)
  // Le coin est encore blanc opaque : la moulinette du filigrane l'aurait effacé.
  const coin = await sharp(pngStocke.octets).ensureAlpha().extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer()
  verifier('le fond blanc n\'est PAS détouré (pas le traitement filigrane)', coin[3] === 255, `alpha du coin : ${coin[3]}`)

  console.log('\nCe qui est refusé — un SVG ouvrable en direct ne doit pas porter de script')
  await refuse('SVG avec <script>', () => saveVitrineLogo(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'image/svg+xml', 400), /SVG/)
  await refuse('SVG avec onload=', () => saveVitrineLogo(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>'), 'image/svg+xml', 400), /SVG/)
  await refuse('SVG avec <foreignObject>', () => saveVitrineLogo(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><foreignObject></foreignObject></svg>'), 'image/svg+xml', 400), /SVG/)
  await refuse('SVG avec href javascript:', () => saveVitrineLogo(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)">x</a></svg>'), 'image/svg+xml', 400), /SVG/)

  // Ne rien laisser sur le disque local.
  for (const cle of aEffacer) await unlink(path.resolve('storage', cle)).catch(() => {})

  console.log('')
  if (echecs) {
    console.log(`${echecs} attente(s) non tenue(s).`)
    process.exitCode = 1
  } else {
    console.log('Logos de vitrine : tout passe.')
  }
}

main().catch((e) => {
  console.error('Le banc lui-même a levé :', e)
  process.exitCode = 1
})
