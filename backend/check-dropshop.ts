import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { appliquerEditions, coutAppel, extraireDirections, extraireEditions, extraireHtml } from './src/services/siteGenerator.js'
import { dossierDesignPour, dossierEnTexte } from './src/services/designLibrary.js'
import { couleursDuLogo, gammesDepuis, contraste } from './src/services/logoCouleurs.js'

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

/** Le vérificateur avec ses drapeaux (--modes, --logo), lancé comme la production le fait : en processus enfant. */
function verifierAvec(page: string, drapeaux: string[]): Promise<{ ok: boolean; echecs: string[] }> {
  const fichier = path.join(os.tmpdir(), `dropshop-banc-${Math.random().toString(36).slice(2)}.html`)
  fs.writeFileSync(fichier, page)
  const r = spawnSync(process.execPath, [path.join('dropshop', 'verifier.cjs'), fichier, ...drapeaux], { encoding: 'utf8', timeout: 40_000, env: { PATH: process.env.PATH ?? '' } })
  fs.unlinkSync(fichier)
  try { return Promise.resolve(JSON.parse(r.stdout)) } catch { return Promise.resolve({ ok: false, echecs: ['sortie illisible : ' + r.stdout.slice(0, 100)] }) }
}

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

  console.log('\n— Les options : modes visiteur, logo, alignement —')
  const avecModes = EXEMPLE
    .replace('<style>', '<style>\n[data-theme="nuit"]{--fond:#000}[data-theme="papier"]{--fond:#fff}[data-theme="pop"]{--fond:#f0f}')
    .replace("'<a href=\"' + c.lien.panier + '\">Panier (' + c.panier.nombre + ')</a>'", "'<button data-mode=\"nuit\">Nuit</button><button data-mode=\"papier\">Papier</button><button data-mode=\"pop\">Pop</button><a href=\"' + c.lien.panier + '\">Panier (' + c.panier.nombre + ')</a>'")
  const sansModes = await verifierAvec(EXEMPLE, ['--modes'])
  attendre('sans sélecteur, une boutique « immersive » est refusée et nommée', !sansModes.ok && sansModes.echecs.some((e) => /data-theme|data-mode/.test(e)), sansModes.echecs[0]?.slice(0, 100))
  const avec = await verifierAvec(avecModes, ['--modes'])
  attendre('avec 3 boutons [data-mode] et 3 ambiances [data-theme], elle passe', avec.ok, avec.echecs.join(' | '))
  /*
   * Le logo est posé par le MOTEUR quand la page ne le pose pas.
   *
   * Ce banc attendait l'inverse — « une page qui n'affiche pas le logo est
   * refusée » — et c'était la règle du jour où la page était écrite. Elle ne
   * dit rien du marchand qui dépose son logo APRÈS : sa page, elle, est déjà
   * écrite, et aucun refus ne peut plus l'atteindre. Il voyait donc son logo
   * partir et rien changer sur sa boutique.
   *
   * Les deux sens comptent : le moteur pose ce qui manque, et ne double pas ce
   * qui est déjà là.
   */
  const sansLogo = await verifierAvec(EXEMPLE, ['--logo'])
  attendre('une page sans balise de logo reçoit quand même les deux logos du moteur', sansLogo.ok, sansLogo.echecs.join(' | '))
  const avecLogo = EXEMPLE.replace("'<a href=\"' + c.lien.accueil + '\"><strong>' + c.html(c.boutique.nom) + '</strong></a>'", "'<a href=\"' + c.lien.accueil + '\">' + (c.boutique.logoEntete ? '<img src=\"' + c.html(c.boutique.logoEntete) + '\" alt=\"\">' : '') + '<strong>' + c.html(c.boutique.nom) + '</strong></a>'")
  const okLogo = await verifierAvec(avecLogo, ['--logo'])
  attendre('une page qui affiche déjà le logo le garde, sans doublon', okLogo.ok, okLogo.echecs.join(' | '))
  const wrapCasse = EXEMPLE.replace('.wrap { width: min(1200px, 92vw); margin-inline: auto; }', '.wrap { width: min(1200px, 92vw); margin-inline: auto; }\n    .barre { width: 100%; }')
  const rWrap = await verifierAvec(wrapCasse, [])
  attendre('un .wrap qui reçoit width:100% d\'une autre classe est refusé, et la règle fautive est nommée', !rWrap.ok && rWrap.echecs.some((e) => /width:100%/.test(e) && /« \.barre »/.test(e)), rWrap.ok ? 'accepté à tort' : rWrap.echecs[0]?.slice(0, 160))
  const badgeAttribut = EXEMPLE.replace("'<a href=\"' + c.lien.panier + '\">Panier (' + c.panier.nombre + ')</a>'", "'<a href=\"' + c.lien.panier + '\" data-compte=\"' + c.panier.nombre + '\">Panier</a>'")
  const rBadge = await verifierAvec(badgeAttribut, [])
  attendre('un compteur de panier rendu par attribut (data-compte, ::after) est accepté', rBadge.ok, rBadge.echecs.join(' | '))

  console.log('\n— La bibliothèque de design —')
  const luxe = dossierDesignPour('Bijoux en argent et montres pour hommes, haut de gamme, élégant, bois et noir', ['Montres'])
  attendre('un brief de luxe trouve un type de commerce de luxe', /Luxury/.test(luxe.produit?.type ?? ''), luxe.produit?.type)
  attendre('il propose des appariements serif + sans (Cormorant, Playfair…)', luxe.polices.some((p) => /Cormorant|Playfair|Bodoni/.test(p.titre)), luxe.polices.map((p) => p.titre).join(', '))
  attendre('trois styles, trois palettes, un patron, du mouvement', luxe.styles.length === 3 && luxe.palettes.length === 3 && Boolean(luxe.patron) && luxe.mouvement.length > 0)
  const robots = dossierDesignPour('France ROBOTIQUE vend des robots humanoïdes et des drones, laboratoire du futur, bleu électrique, ton expert', ['Drones'])
  attendre('un brief tech reconnaît une boutique (e-commerce ou tech), pas un logiciel métier', /E-commerce|Tech|Electronics|Robot|Gadget|Smart/i.test(robots.produit?.type ?? '') && !/Manager|Dashboard|SaaS/i.test(robots.produit?.type ?? ''), robots.produit?.type)
  attendre('le dossier rédigé tient sous 9 000 caractères', dossierEnTexte(luxe).length < 9000, String(dossierEnTexte(luxe).length))

  console.log('\n— Les couleurs du logo —')
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#ffffff"/><circle cx="60" cy="50" r="40" fill="#2f6bff"/><rect x="120" y="20" width="60" height="60" fill="#e0342c"/></svg>'
  const couleurs = await couleursDuLogo(Buffer.from(svg))
  attendre('le fond blanc est écarté, le bleu et le rouge dominent', couleurs.length >= 2 && couleurs[0].hex === '#2f6bff' && couleurs[1].hex === '#e0342c', couleurs.map((c) => c.hex).join(' '))
  const gammes = gammesDepuis(couleurs)
  attendre('quatre gammes, texte lisible (≥ 4,5:1) et accent visible (≥ 3:1) sur chacune', gammes.length === 4 && gammes.every((g) => contraste(g.jetons.fond, g.jetons.texte) >= 4.5 && contraste(g.jetons.fond, g.jetons.accent) >= 3), gammes.map((g) => `${g.id} ${contraste(g.jetons.fond, g.jetons.texte).toFixed(1)}/${contraste(g.jetons.fond, g.jetons.accent).toFixed(1)}`).join(' '))
  attendre('sans logo, des gammes neutres sont quand même proposées', gammesDepuis([]).length === 4)

  console.log('\n— Les directions et le coût —')
  const dirs = extraireDirections('```json\n' + JSON.stringify({ directions: [
    { id: 'Atelier Nuit', titre: 'Atelier nuit', concept: 'x', ambiance: 'sombre', matiere: 'metal', palette: { fond: '#000', surface: '#111', texte: '#fff', sourd: '#999', accent: '#2f6bff', accent2: '#e0342c', ligne: 'rgba(255,255,255,.1)' }, polices: { titre: 'Exo', texte: 'Inter' }, hero: 'h', boutons: 'b', sections: ['a', 'b'] },
    { titre: 'Papier clair', concept: 'y', ambiance: 'clair', matiere: 'inconnue', palette: { fond: '#fff', surface: '#fff', texte: '#111', sourd: '#666', accent: '#0044aa', accent2: '#aa2200', ligne: 'rgba(0,0,0,.1)' }, polices: { titre: 'Playfair Display', texte: 'Inter' }, hero: 'h', boutons: 'b', sections: [] },
  ] }) + '\n```')
  attendre('deux directions lues, identifiants normalisés, matière inconnue rabattue', dirs.length === 2 && dirs[0].id === 'atelier-nuit' && dirs[1].id === 'direction-2' && dirs[1].matiere === 'papier', JSON.stringify(dirs.map((d) => [d.id, d.matiere])))
  attendre('sans bloc json, aucune direction', extraireDirections('rien').length === 0)
  attendre('le coût d\'un appel suit la grille (Sonnet 2 $/10 $ le million)', Math.abs(coutAppel('claude-sonnet-5', 20_000, 30_000) - 0.34) < 1e-9 && Math.abs(coutAppel('claude-haiku-4-5', 40_000, 3_000) - 0.055) < 1e-9)

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
