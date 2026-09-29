/**
 * Transforme une vidéo en suite d'images pour une pub : clips/<nom>/0001.jpg…
 *
 *   node extraire.cjs t-miami sources/partout/miami.mp4
 *   node extraire.cjs p5-warp sources/x.mp4 --filtre "crop=720:720,scale=1080:1080"
 *   node extraire.cjs d-oguss sources/ecran.mp4 --de 120 --a 262     # images 120 à 262 (à 30 i/s)
 *
 * Pourquoi des images et pas la vidéo : le Chromium de Playwright ne lit pas le
 * H.264, et une <video> ne se positionne pas image par image. La page affiche
 * l'image de l'instant (img[data-clip][data-n]), le rendu reste exact.
 *
 * `fps=30` passe TOUJOURS avant le découpage : les enregistrements d'écran ont
 * une cadence variable, et -ss/-t ou un trim sans fps rendent de mauvais segments.
 * Et pas de `setpts` après le trim : ffmpeg se remettrait à caler la sortie sur
 * l'horloge et perdrait des images (26 au lieu de 30, constaté) ; `-fps_mode
 * passthrough` écrit chaque image telle quelle.
 */
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const FFMPEG = require('ffmpeg-static')

const [nom, source, ...reste] = process.argv.slice(2)
if (!nom || !source) { console.error('Usage : node extraire.cjs <nom> <vidéo> [--filtre "…"] [--de n] [--a n] [--hauteur 1280]'); process.exit(1) }
const opt = (n) => { const i = reste.indexOf(n); return i >= 0 ? reste[i + 1] : null }
const hauteur = opt('--hauteur') || '1280'
const filtres = ['fps=30']
if (opt('--de') || opt('--a')) filtres.push(`trim=start_frame=${opt('--de') || 0}${opt('--a') ? `:end_frame=${opt('--a')}` : ''}`)
filtres.push(opt('--filtre') || `scale=-2:${hauteur}`)

const dossier = path.join(__dirname, 'clips', nom)
fs.rmSync(dossier, { recursive: true, force: true })
fs.mkdirSync(dossier, { recursive: true })
const r = spawnSync(FFMPEG, ['-loglevel', 'error', '-i', source, '-vf', filtres.join(','), '-fps_mode', 'passthrough', '-q:v', '3', path.join(dossier, '%04d.jpg')], { stdio: 'inherit' })
if (r.status !== 0) process.exit(r.status)
const n = fs.readdirSync(dossier).length
console.log(`${nom} : ${n} images — dans la page : <img class="fondvideo" data-clip="${nom}" data-n="${n}" alt="">`)
