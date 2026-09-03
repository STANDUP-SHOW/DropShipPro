/**
 * Le panneau d'avancement ne doit jamais faire échouer ce dont il rend compte.
 *
 *   cd backend && node check-panneau-avancement.cjs
 *
 * **La panne du 03/09/2026 :** « annonce prête, censé ouvrir l'annonce
 * automatiquement, semble avoir problème, reste sur annonce prête sans ouvrir ».
 *
 * `done()` retirait le rouage `#dsp-spin`. `fail()`, appelé juste après quand
 * l'ouverture de l'onglet échouait, refaisait
 * `panel.querySelector('#dsp-spin').remove()` sur un élément **déjà retiré** :
 * `.remove()` de `null`, donc une exception. Elle remontait au `catch` de
 * l'import, qui appelait `fail()` une seconde fois, qui relevait la même
 * exception — cette fois sans personne pour l'attraper.
 *
 * Le vendeur voyait donc « Annonce prête » pour toujours, et **la vraie raison
 * n'était jamais affichée** : ni l'ouverture ratée, ni ce qui l'avait fait
 * rater. Une panne d'affichage qui masque la panne qu'elle devait annoncer.
 *
 * Le banc monte le panneau livré, dans une page vide, et rejoue l'enchaînement.
 */
const { JSDOM } = require('jsdom')
const fs = require('fs')
const path = require('path')

let echecs = 0
function verifier(nom, condition, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

const SOURCE = fs.readFileSync(path.join(__dirname, 'extension', 'content', 'capture.js'), 'utf8')

/*
 * On extrait `showProgress` du fichier livré plutôt que de charger tout
 * `capture.js`, qui exige un `chrome` complet et une page marchande. C'est bien
 * le code livré qui tourne : la fonction est copiée telle quelle, pas réécrite.
 */
const debut = SOURCE.indexOf('function showProgress()')
const fin = SOURCE.indexOf('\n  }', SOURCE.indexOf('remove: () => panel.remove(),'))
if (debut < 0 || fin < 0) {
  console.log('RATE  showProgress introuvable dans capture.js')
  process.exit(1)
}
const code = SOURCE.slice(debut, fin + 4)

const dom = new JSDOM('<div id="dsp-capture-wrap"></div>', { url: 'https://exemple.test/' })
const w = dom.window
global.document = w.document
global.setInterval = w.setInterval.bind(w)
global.clearInterval = w.clearInterval.bind(w)

// eslint-disable-next-line no-new-func
const showProgress = new Function('document', 'setInterval', 'clearInterval', `${code}\nreturn showProgress`)(
  w.document,
  w.setInterval.bind(w),
  w.clearInterval.bind(w),
)

console.log("\nL'enchaînement exact de la panne")
{
  const progress = showProgress()
  progress.step('Lecture de la page…')
  progress.done('Annonce prête')

  let leve = null
  try {
    // C'est cet appel-là qui levait, et qui gelait le panneau.
    progress.fail("Annonce enregistrée — le service n'a pas répondu")
  } catch (err) {
    leve = err
  }

  verifier('« échec » après « prête » ne lève plus', leve === null, leve ? leve.message : '')
  verifier(
    'et le vendeur lit bien la raison',
    w.document.querySelector('#dsp-step')?.textContent?.includes("n'a pas répondu"),
    w.document.querySelector('#dsp-step')?.textContent ?? '(rien)',
  )
  progress.remove()
}

console.log('\nChaque geste supporte d’être rejoué')
{
  const progress = showProgress()
  let leve = null
  try {
    progress.done('Annonce prête')
    progress.done('Annonce prête')
    progress.fail('Échec')
    progress.fail('Échec')
    progress.step('encore')
  } catch (err) {
    leve = err
  }
  verifier('done, fail et step sont idempotents', leve === null, leve ? leve.message : '')
  progress.remove()
}

console.log("\nLe lien de secours vers l'annonce")
{
  const progress = showProgress()
  progress.done('Annonce prête')
  progress.fail('Annonce enregistrée')
  progress.lien('https://www.drop-shipper.fr/products/abc123', "Ouvrir l'annonce →")

  const a = w.document.querySelector('#dsp-progress a')
  verifier('un lien cliquable est posé', Boolean(a), a?.textContent ?? '(aucun)')
  verifier(
    "il mène à l'annonce qui vient de naître",
    a?.getAttribute('href') === 'https://www.drop-shipper.fr/products/abc123',
    a?.getAttribute('href') ?? '(aucune adresse)',
  )
  verifier('il s’ouvre à côté, sans quitter la fiche', a?.getAttribute('target') === '_blank')
  progress.remove()
}

console.log("\nCe que l'import en fait")
{
  verifier(
    "l'échec d'ouverture ne peut plus emporter l'import",
    /opened = await chrome\.runtime\.sendMessage/.test(SOURCE) &&
      /catch \(err\)[\s\S]{0,200}n’a pas répondu/.test(SOURCE),
  )
  verifier(
    'et le lien est proposé quand elle rate',
    /if \(opened\?\.url\) progress\.lien\(opened\.url/.test(SOURCE),
  )

  const worker = fs.readFileSync(path.join(__dirname, 'extension', 'background.js'), 'utf8')
  verifier(
    "le worker rend l'adresse qu'il a tenté d'ouvrir",
    /sendResponse\(\{ ok: true, url: target \}\)/.test(worker) &&
      /sendResponse\(\{ ok: false, error: err\.message, url: target \}\)/.test(worker),
  )
  verifier(
    'et `target` vit hors du `try`, sinon le `catch` lèverait à son tour',
    /let target = null\n\s*try \{/.test(worker),
  )
}

console.log(echecs ? `\n${echecs} échec(s).` : '\nTout passe.')
process.exit(echecs ? 1 : 0)
