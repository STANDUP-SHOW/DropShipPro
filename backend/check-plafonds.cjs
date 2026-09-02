/**
 * Les nombres que le serveur et l'extension doivent dire pareil.
 *
 *   cd backend && node check-plafonds.cjs
 *
 * **Le défaut que ce banc rend impossible.** Le plafond de photos est passé de
 * 10 à 15 le 02/09/2026 dans `services/imageSelect.ts`. Il était aussi écrit en
 * dur **cinq fois ailleurs** : quatre dans le sélecteur de l'extension, une
 * dans `watermark.ts`. Trois corrections successives en ont rattrapé trois, et
 * le vendeur continuait de buter à dix — « ça bloque à 10 toujours », quatre
 * allers-retours pour un seul nombre.
 *
 * Deux programmes qui ne partagent pas de code ne peuvent pas partager une
 * constante : l'extension ne peut rien importer du serveur. Ce banc est donc le
 * seul lien possible — il lit les deux fichiers et exige qu'ils s'accordent.
 *
 * **Il interdit aussi le nombre nu** dans les endroits qui décident : un
 * `preselected.size < 10` est invisible à toute relecture, et c'est exactement
 * celui qui bloquait les clics. Le grep qui le cherchait est même passé à côté,
 * parce que la ligne contient le mot « size ».
 */
const fs = require('fs')
const path = require('path')

const lire = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8')

let echecs = 0
function verifier(nom, condition, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

/** Lit un `export const NOM = 12` ou `const NOM = 12` dans un fichier. */
function nombreDe(source, nom) {
  const m = source.match(new RegExp(`(?:export\\s+)?const\\s+${nom}\\s*=\\s*(\\d+)`))
  return m ? Number(m[1]) : null
}

// --- Le plafond de photos ----------------------------------------------------
console.log('\nLe plafond de photos par annonce')
{
  const serveur = nombreDe(lire("src/services/photoLimits.ts"), "PHOTOS_PAR_ANNONCE")
  const extension = nombreDe(lire('extension/content/capture.js'), 'PHOTOS_MAX')

  verifier('le serveur le déclare', serveur !== null, String(serveur))
  verifier("l'extension le déclare", extension !== null, String(extension))
  verifier('les deux disent le même nombre', serveur === extension, `serveur ${serveur}, extension ${extension}`)

  /*
   * `watermark.ts` ne doit pas le réécrire, il doit l'importer.
   *
   * C'est la copie qui a survécu le plus longtemps : le sélecteur laissait
   * cocher quinze photos, le serveur en rapatriait dix, et rien n'échouait —
   * cinq disparaissaient en silence.
   */
  const filigrane = lire('src/services/watermark.ts')
  verifier(
    'le rapatriement ne réécrit pas le plafond',
    /const MAX_IMAGES = PHOTOS_PAR_ANNONCE/.test(filigrane),
    (filigrane.match(/const MAX_IMAGES = .+/) ?? ['introuvable'])[0],
  )
  /*
   * Et il l'importe de `photoLimits.js`, pas de `imageSelect.js`.
   *
   * Première tentative : `watermark.ts` important le nombre depuis
   * `imageSelect.ts`, qui importe `watermark.ts`. Le cycle s'est refermé et le
   * serveur ne démarrait plus — « Cannot access 'PHOTOS_PAR_ANNONCE' before
   * initialization ». Une décision partagée ne peut pas habiter chez l'un de
   * ceux qui la partagent.
   */
  verifier(
    'et il l’importe depuis le fichier sans dépendance',
    /import \{[^}]*PHOTOS_PAR_ANNONCE[^}]*\} from '\.\/photoLimits\.js'/.test(filigrane),
  )
  verifier(
    'ce fichier-là n’importe rien',
    !/^import /m.test(lire('src/services/photoLimits.ts')),
  )
}

// --- Aucun nombre nu là où ça décide ----------------------------------------
console.log('\nLes nombres nus dans le sélecteur de photos')
{
  const source = lire('extension/content/capture.js')
  const lignes = source.split('\n')

  /*
   * On ne cherche pas « 10 » partout — le fichier en contient dans des tailles,
   * des marges et des délais, et un banc qui crie au loup n'est plus lu. On
   * cherche les lignes qui **décident d'une sélection** avec un nombre écrit
   * à la main.
   */
  const suspectes = lignes
    .map((l, i) => ({ n: i + 1, texte: l.trim() }))
    .filter(({ texte }) => /preselected|selection|coches|picked/i.test(texte))
    .filter(({ texte }) => /[<>]=?\s*\d+|slice\(\s*0\s*,\s*\d+\s*\)/.test(texte))
    .filter(({ texte }) => !texte.startsWith('*') && !texte.startsWith('//'))

  verifier(
    'aucune décision de sélection ne porte un nombre écrit à la main',
    suspectes.length === 0,
    suspectes.map((s) => `ligne ${s.n} : ${s.texte.slice(0, 60)}`).join(' · '),
  )
}

// --- La taille d'un lot ------------------------------------------------------
console.log("\nLa taille d'un lot d'import")
{
  const panneau = nombreDe(lire('extension/lot.js'), 'MAX_LOT')
  const routes = lire('src/routes/products.ts')
  /*
   * `urls: z.array(z.string().url()).min(1).max(25)` côté serveur.
   *
   * On ne tente pas de traverser les parenthèses imbriquées — `[^)]*` s'arrête
   * au premier `)` de `z.string().url()` et rendait NaN. On prend la ligne qui
   * déclare `urls:` et on y lit le `.max(n)`.
   */
  const ligneUrls = routes.split('\n').find((l) => /^\s*urls:\s*z\.array/.test(l)) ?? ''
  const serveur = Number((ligneUrls.match(/\.max\((\d+)\)/) ?? [])[1] ?? NaN)

  verifier('le panneau déclare son plafond', panneau !== null, String(panneau))
  verifier('le serveur déclare le sien', Number.isFinite(serveur), String(serveur))
  verifier(
    'les deux disent le même nombre',
    panneau === serveur,
    `panneau ${panneau}, serveur ${serveur}`,
  )
}

console.log(echecs ? `\n${echecs} échec(s).` : '\nTout passe.')
process.exit(echecs ? 1 : 0)
