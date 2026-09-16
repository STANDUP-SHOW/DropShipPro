/**
 * Rend en PDF les documents du dossier (`docs/dossier/*.html`).
 *
 * Même principe que `docs/youtube/rendre.cjs`, qui photographie les visuels :
 * Chrome est déjà sur la machine, il sait imprimer, et aucune dépendance n'est
 * ajoutée au projet pour ça. Les alternatives — Puppeteer, wkhtmltopdf — font
 * entrer un binaire de plus dans un dépôt qui n'en a pas besoin.
 *
 *   node docs/rendre-pdf.cjs                 # tous les documents
 *   node docs/rendre-pdf.cjs statuts         # ceux dont le nom commence par…
 *
 * **Le budget de temps virtuel n'est pas décoratif.** Le business plan compose
 * ses tableaux en JavaScript au chargement et va chercher ses polices chez
 * Google : sans ce délai, Chrome imprime une page à moitié vide, en Times New
 * Roman, et rien ne le signale — le PDF sort, il est simplement faux.
 */
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const DOSSIER = path.join(__dirname, 'dossier')

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((p) => p && fs.existsSync(p))

function rendre(nomHtml) {
  const source = path.join(DOSSIER, nomHtml)
  const sortie = source.replace(/\.html$/, '.pdf')
  const url = 'file:///' + source.replace(/\\/g, '/')
  const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-rendu-'))

  /*
   * **Le PDF précédent est effacé AVANT d'appeler Chrome.**
   *
   * Sans ça, le contrôle « le fichier existe » est satisfait par le rendu de la
   * veille : Chrome peut échouer, ne rien écrire, et le script annoncer un
   * succès en donnant le poids de l'ancien fichier. C'est arrivé le 16/09/2026
   * — deux rendus de suite, 1709 Ko à l'octet près, et les polices toujours
   * fausses parce que rien n'avait été réécrit. Un contrôle qu'un vieux fichier
   * peut satisfaire ne contrôle rien.
   */
  fs.rmSync(sortie, { force: true })

  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--allow-file-access-from-files',
    // Les marges et les en-têtes viennent de la feuille de style du document
    // (@page), jamais de Chrome : un document juridique se met en page lui-même.
    '--no-pdf-header-footer',
    '--print-to-pdf-no-header',
    '--virtual-time-budget=20000',
    `--user-data-dir=${profil}`,
    `--print-to-pdf=${sortie}`,
    url,
  ]

  const res = spawnSync(CHROME, args, { stdio: 'ignore', timeout: 120_000 })
  fs.rmSync(profil, { recursive: true, force: true })
  if (res.error) throw res.error
  if (!fs.existsSync(sortie)) throw new Error(`Chrome n'a rien écrit pour ${nomHtml}`)
  const ko = Math.round(fs.statSync(sortie).size / 1024)
  console.log(`✓ ${path.basename(sortie)}  ${ko} Ko`)
}

if (!CHROME) {
  console.error('Chrome introuvable : installer Google Chrome ou ajouter son chemin dans CHROME.')
  process.exit(1)
}

const filtre = process.argv[2]
const documents = fs
  .readdirSync(DOSSIER)
  .filter((f) => f.endsWith('.html'))
  .filter((f) => !filtre || f.startsWith(filtre))

if (!documents.length) {
  console.error(`Aucun document ne commence par « ${filtre} » dans ${DOSSIER}.`)
  process.exit(1)
}
for (const d of documents) rendre(d)
