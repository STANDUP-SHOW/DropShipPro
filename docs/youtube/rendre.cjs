/**
 * Rend les visuels YouTube en PNG, aux dimensions exactes de chaque format.
 *
 * Chaque visuel est une page HTML de ce dossier, dessinée à sa taille finale ;
 * Chrome (headless) la photographie telle quelle. Pas de dépendance : Chrome
 * est déjà sur la machine, et le script le cherche à ses adresses habituelles.
 *
 *   node docs/youtube/rendre.cjs            # tout
 *   node docs/youtube/rendre.cjs banniere   # un seul (préfixe du nom)
 *
 * Le budget de temps virtuel laisse aux polices Google et aux logos le temps
 * d'arriver avant la capture : sans lui, la bannière sortait en Segoe UI.
 */
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const DOSSIER = __dirname

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((p) => p && fs.existsSync(p))

const VISUELS = [
  { html: 'banniere.html', png: 'banniere-2560x1440.png', w: 2560, h: 1440 },
  { html: 'banniere.html?guides', png: 'banniere-zones-de-recadrage.png', w: 2560, h: 1440 },
  { html: 'banniere.html?vue=ordinateur', png: 'apercu-ordinateur-2560x423.png', w: 2560, h: 423 },
  { html: 'banniere.html?vue=telephone', png: 'apercu-telephone-1546x423.png', w: 1546, h: 423 },
  { html: 'profil.html', png: 'profil-800x800.png', w: 800, h: 800 },
  { html: 'filigrane.html', png: 'filigrane-150x150.png', w: 150, h: 150, transparent: true },
  { html: 'miniature.html', png: 'miniature-1280x720.png', w: 1280, h: 720 },
]

function rendre(v) {
  const [fichier, requete] = v.html.split('?')
  const url = 'file:///' + path.join(DOSSIER, fichier).replace(/\\/g, '/') + (requete ? '?' + requete : '')
  const sortie = path.join(DOSSIER, v.png)
  const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'yt-rendu-'))
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--allow-file-access-from-files',
    '--force-device-scale-factor=1',
    '--virtual-time-budget=12000',
    `--user-data-dir=${profil}`,
    `--window-size=${v.w},${v.h}`,
    `--screenshot=${sortie}`,
  ]
  if (v.transparent) args.push('--default-background-color=00000000')
  args.push(url)

  const res = spawnSync(CHROME, args, { stdio: 'ignore', timeout: 90_000 })
  fs.rmSync(profil, { recursive: true, force: true })
  if (res.error) throw res.error
  if (!fs.existsSync(sortie)) throw new Error(`Chrome n'a rien écrit pour ${v.html}`)
  const ko = Math.round(fs.statSync(sortie).size / 1024)
  console.log(`✓ ${v.png}  ${v.w}×${v.h}  ${ko} Ko`)
}

if (!CHROME) {
  console.error('Chrome introuvable : installer Google Chrome ou ajouter son chemin dans CHROME.')
  process.exit(1)
}
const filtre = process.argv[2]
const choisis = filtre ? VISUELS.filter((v) => v.png.startsWith(filtre)) : VISUELS
if (!choisis.length) {
  console.error(`Aucun visuel ne commence par « ${filtre} ». Disponibles : ${VISUELS.map((v) => v.png).join(', ')}`)
  process.exit(1)
}
for (const v of choisis) rendre(v)
