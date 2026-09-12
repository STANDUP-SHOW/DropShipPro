/**
 * Génère src/theme-clair.css : le thème clair par INVERSION de la palette.
 *
 * Toute l'application est écrite pour le fond noir avec les utilitaires
 * Tailwind (text-white, bg-white/10, text-gray-400, text-purple-300…). Tailwind
 * v4 ne fige pas ces couleurs : chaque utilitaire lit une variable
 * (`color: var(--color-white)`, `color-mix(in oklab, var(--color-white) 10%, …)`).
 * Redéfinir les variables sous `[data-theme="light"]` retourne donc tout le
 * site d'un coup, sans toucher une seule classe dans cent cinquante fichiers.
 *
 * La règle : chaque échelle est retournée autour de 500 (50 ↔ 950, 100 ↔ 900,
 * 200 ↔ 800, 300 ↔ 700, 400 ↔ 600, 500 inchangé). Ce qui était clair sur noir
 * devient foncé sur blanc, les tons moyens ne bougent pas. `white` devient le
 * gris-noir des textes ; `black`, qui sert à assombrir des panneaux et des
 * voiles, devient un gris clair — pas du blanc, sinon les panneaux disparaissent.
 *
 *   node scripts/build-theme-clair.cjs     (à relancer si Tailwind change de palette)
 */
const fs = require('node:fs')
const path = require('node:path')

const SOURCE = path.join(__dirname, '..', 'node_modules', 'tailwindcss', 'theme.css')
const CIBLE = path.join(__dirname, '..', 'src', 'theme-clair.css')

const palette = new Map()
for (const ligne of fs.readFileSync(SOURCE, 'utf8').split('\n')) {
  const m = ligne.match(/^\s*--color-([a-z]+)-(\d{2,3}):\s*(.+);\s*$/)
  if (m) palette.set(`${m[1]}-${m[2]}`, m[3].trim())
}
if (!palette.size) throw new Error(`Aucune couleur lue dans ${SOURCE}`)

const INVERSE = { 50: 950, 100: 900, 200: 800, 300: 700, 400: 600, 500: 500, 600: 400, 700: 300, 800: 200, 900: 100, 950: 50 }
const lignes = []
for (const [cle, valeur] of palette) {
  const [teinte, pas] = cle.split('-')
  const miroir = palette.get(`${teinte}-${INVERSE[pas]}`)
  if (miroir && miroir !== valeur) lignes.push(`  --color-${cle}: ${miroir};`)
}
lignes.push(`  --color-white: ${palette.get('gray-900')};`)
lignes.push(`  --color-black: ${palette.get('gray-300')};`)

const css = `/* GÉNÉRÉ par scripts/build-theme-clair.cjs — ne pas éditer à la main.
 * Le thème clair : la palette Tailwind retournée autour de 500, white → gris-noir,
 * black → gris clair. Posé sur <html data-theme="light"> (voir lib/theme.ts). */
:root[data-theme="light"] {
${lignes.join('\n')}
}
`
fs.writeFileSync(CIBLE, css)
console.log(`✓ ${path.relative(process.cwd(), CIBLE)} : ${lignes.length} variables`)
