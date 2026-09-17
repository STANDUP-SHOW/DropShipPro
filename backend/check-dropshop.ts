import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { appliquerEditions, extraireEditions, extraireHtml } from './src/services/siteGenerator.js'

/**
 * Le moteur DropShop et son vérificateur, éprouvés l'un contre l'autre.
 *
 *   cd backend && npx tsx check-dropshop.ts
 *
 * Trois choses à prouver, et chacune protège une panne précise :
 *
 * 1. **Le squelette de référence passe le parcours du visiteur.** C'est la page
 *    donnée en exemple au modèle : si elle ne passait pas, le modèle apprendrait
 *    d'un mauvais exemple et chaque boutique naîtrait cassée.
 * 2. **Une page cassée est refusée, avec la raison écrite.** Le vérificateur ne
 *    vaut que par ce qu'il attrape : on casse la page de huit façons réelles
 *    (bouton d'ajout absent, formulaire non branché, appel réseau, script
 *    externe, pas de responsive, écran qui lève, catégorie vide, fiche sans
 *    prix) et on vérifie que l'échec nomme la faute — c'est ce texte que le
 *    modèle lit pour réparer.
 * 3. **Une boucle infinie est tuée** par le délai du processus enfant : un
 *    `while (true)` bloque le fil, donc aucun minuteur interne ne peut le
 *    sauver — seul le parent le peut, et c'est lui qu'on éprouve.
 * 4. **Les éditions ciblées** s'appliquent tout ou rien, et l'ambigu est refusé.
 */
const require = createRequire(import.meta.url)
const { verifier } = require('./dropshop/verifier.cjs') as { verifier: (html: string) => Promise<{ ok: boolean; echecs: string[] }> }

const EXEMPLE = fs.readFileSync(path.join('dropshop', 'exemple.html'), 'utf8')

let echecs = 0
function attendre(nom: string, condition: boolean, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

async function main() {
  console.log('— Le squelette de référence —')
  const bon = await verifier(EXEMPLE)
  attendre('le squelette passe le parcours du visiteur', bon.ok, bon.echecs.join(' | '))

  console.log('\n— Les pages cassées sont refusées, avec la raison —')
  const cas: Array<[string, string, RegExp]> = [
    ["bouton d'ajout absent", EXEMPLE.replace('data-ajouter="', 'data-ajout="'), /data-ajouter/],
    ['formulaire non branché', EXEMPLE.replace('<form data-commande>', '<form>'), /data-commande/],
    ['appel réseau dans la page', EXEMPLE.replace('<script>\n    function carte', '<script>\n    fetch("https://x.test");\n    function carte'), /aucun appel réseau/],
    ['script externe', EXEMPLE.replace('</body>', '<script src="https://cdn.x/a.js"></script></body>'), /script externe/],
    ['pas de @media', EXEMPLE.replace(/@media/g, '@medium'), /@media/],
    ['écran qui lève', EXEMPLE.replace('accueil: function (c) {', 'accueil: function (c) { throw new Error("boum");'), /nom de la boutique|Erreur JavaScript/],
    ['catégorie sans ses produits', EXEMPLE.replace("k.produits.map(function (p) { return carte(c, p) }).join('')", "''"), /catégorie/],
    ['fiche sans prix', EXEMPLE.replace("'<h1>' + c.html(p.title) + '</h1><p><strong>' + c.prix(p.price) + '</strong></p>'", "'<h1>' + c.html(p.title) + '</h1>'"), /prix/],
  ]
  for (const [nom, page, motif] of cas) {
    const r = await verifier(page)
    attendre(`« ${nom} » est refusée et nommée`, !r.ok && r.echecs.some((e) => motif.test(e)), r.ok ? 'acceptée à tort' : r.echecs[0].slice(0, 110))
  }

  console.log('\n— La boucle infinie est tuée par le parent —')
  const boucle = EXEMPLE.replace('<script>\n    function carte', '<script>\n    while (true) {}\n    function carte')
  const fichier = path.join(os.tmpdir(), 'dropshop-boucle.html')
  fs.writeFileSync(fichier, boucle)
  const debut = Date.now()
  const r = spawnSync(process.execPath, [path.join('dropshop', 'verifier.cjs'), fichier], { encoding: 'utf8', timeout: 8_000, env: { PATH: process.env.PATH ?? '' } })
  attendre('le processus enfant ne rend jamais la main et le parent le tue', r.status === null, `${Math.round((Date.now() - debut) / 1000)} s, signal ${r.signal}`)
  fs.unlinkSync(fichier)

  console.log('\n— Les éditions ciblées —')
  const a = appliquerEditions('aaa\nbbb\nccc', [{ chercher: 'bbb', remplacer: 'BBB' }])
  attendre("une édition unique s'applique", a.html === 'aaa\nBBB\nccc' && a.erreurs.length === 0)
  const b = appliquerEditions('x x', [{ chercher: 'x', remplacer: 'y' }])
  attendre('un extrait ambigu est refusé et la page laissée intacte', b.html === 'x x' && /ambigu/.test(b.erreurs[0]))
  const c = appliquerEditions('abc', [{ chercher: 'zzz', remplacer: 'y' }])
  attendre('un extrait absent est refusé', /introuvable/.test(c.erreurs[0]))
  const d = extraireEditions('Voici :\n```json\n{"resume":"ok","edits":[{"chercher":"a","remplacer":"b"}]}\n```')
  attendre("le bloc json d'éditions est lu", d !== null && d.edits.length === 1 && d.resume === 'ok')
  const e = extraireHtml('Bla\n```html\n<!doctype html>\n<html><body>x</body></html>\n```\nfin')
  attendre('le bloc html est extrait du doctype à </html>', e === '<!doctype html>\n<html><body>x</body></html>\n')
  attendre('sans doctype, rien n\'est extrait', extraireHtml('<div>rien</div>') === null)

  console.log(echecs ? `\n${echecs} attente(s) non tenue(s).` : '\nMoteur DropShop : tout passe.')
  process.exit(echecs ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
