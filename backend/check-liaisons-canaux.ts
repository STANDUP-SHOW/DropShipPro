/**
 * Banc : chacun des 314 canaux de l'annuaire a une voie de liaison, et ce
 * qu'on affirme sur elle est tenu.
 *
 * Le piège qu'il garde : une clé de `VERIFIES` qui n'existe pas dans
 * l'annuaire (le premier `channelFeeds` portait `facebook`, `google-ads` —
 * aucun n'existait, l'écran disait « pas reliée » sur des canaux servis).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { CANAUX } from './src/services/channelDirectory.js'
import { IDS_VERIFIES, liaisonPour, resumeLiaisons } from './src/services/liaisonsCanaux.js'
import { BOUTIQUES_DU_VENDEUR, PLATFORMS } from './src/services/platforms.js'

let echecs = 0
function exige(condition: boolean, nom: string, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

const ids = new Set(CANAUX.map((c) => c.id))
const fantomes = IDS_VERIFIES.filter((id) => !ids.has(id))
exige(fantomes.length === 0, 'toute clé vérifiée est un canal réel de l’annuaire', fantomes.join(', '))

const liaisons = CANAUX.map((c) => ({ canal: c, liaison: liaisonPour(c) }))
exige(liaisons.every((l) => l.liaison.voie && l.liaison.comment.length > 40), 'chaque canal a une voie et une explication')
exige(
  liaisons.filter((l) => l.liaison.voie === 'aucune').every((l) => l.liaison.etat === 'verifie' && l.liaison.comment.length > 60),
  '« pas un canal de vente » n’est jamais dit par défaut de famille : lu, et expliqué',
)
exige(
  liaisons.filter((l) => l.liaison.voie === 'flux').every((l) => l.liaison.flux && ['google', 'meta'].includes(l.liaison.flux.format)),
  'une voie « flux » porte toujours un format que nous servons',
)

const branchees = liaisons.filter((l) => l.liaison.etat === 'branche')
// Allegro (Pologne) n'est pas dans l'annuaire des 314 logos, tiré d'un gestionnaire de flux français.
// DropShop Market est notre propre place de marché : elle n'a pas à figurer dans un annuaire tiers.
// Wish n'y figure pas non plus (constaté le 08/10/2026, aucun logo « wish » dans channelDirectory.ts).
const HORS_ANNUAIRE = ['ALLEGRO', 'DROPSHOP_MARKET', 'WISH']
const live = PLATFORMS.filter((p) => p.integration === 'live' && !BOUTIQUES_DU_VENDEUR.includes(p.id) && !HORS_ANNUAIRE.includes(p.id))
const liveSansCanal = live.filter((p) => !branchees.some((b) => b.liaison.plateforme === p.id))
exige(liveSansCanal.length === 0, 'chaque destination LIVE de platforms.ts a son canal dans l’annuaire, marqué branché', liveSansCanal.map((p) => p.id).join(', '))

const ebay = liaisonPour(CANAUX.find((c) => c.id === 'ebay')!)
exige(ebay.voie === 'api' && ebay.etat === 'branche', 'eBay : publication directe, branchée')
const amazon = liaisonPour(CANAUX.find((c) => c.id === 'amazon')!)
exige(amazon.voie === 'api' && amazon.etat === 'branche', 'Amazon : connecteur écrit (03/10/2026), publication directe')
const cdiscount = liaisonPour(CANAUX.find((c) => /cdiscount/i.test(c.id))!)
exige(cdiscount.voie === 'api' && cdiscount.etat === 'branche', 'Cdiscount : connecteur écrit (08/10/2026), publication directe')
const idealo = liaisonPour(CANAUX.find((c) => c.id === 'idealo')!)
exige(idealo.voie === 'flux' && idealo.flux?.format === 'google', 'Idealo : par le flux Google Shopping')
const criteo = liaisonPour(CANAUX.find((c) => c.id === 'criteo')!)
exige(criteo.voie === 'flux', 'Criteo (régie) : par le flux')
const temu = liaisonPour(CANAUX.find((c) => c.id === 'temu_logo-svg')!)
exige(temu.voie === 'extension', 'Temu : par l’extension, pas « aucune »')
const fnac = liaisonPour(CANAUX.find((c) => c.id === 'fnac')!)
exige(fnac.voie === 'api' && fnac.etat === 'branche', 'Fnac : rapproché de « Fnac Marketplace » malgré le libellé différent')

const r = resumeLiaisons()
exige(r.total === CANAUX.length && Object.values(r.parVoie).reduce((t, n) => t + n, 0) === r.total, 'le résumé compte chaque canal une fois')
console.log(`\n${r.total} canaux : ${JSON.stringify(r.parVoie)} — états ${JSON.stringify(r.parEtat)}`)

// The public pages (build-llms, build-geo) print these counts from a JSON
// file; it must say what the directory says. `--ecrire` rewrites it.
const apiEcrits = liaisons.filter((l) => l.liaison.voie === 'api' && l.liaison.etat === 'branche').length
const resumePublic = {
  total: r.total,
  api: r.parVoie.api,
  apiEcrits,
  apiNonEcrits: r.parVoie.api - apiEcrits,
  flux: r.parVoie.flux,
  export: r.parVoie.export,
  extension: r.parVoie.extension,
  aucune: r.parVoie.aucune,
}
const fichierPublic = fileURLToPath(new URL('../frontend/src/data/liaisons-resume.json', import.meta.url))
const attendu = JSON.stringify(resumePublic, null, 2) + '\n'
if (process.argv.includes('--ecrire')) writeFileSync(fichierPublic, attendu)
const lu = existsSync(fichierPublic) ? readFileSync(fichierPublic, 'utf8') : ''
exige(lu === attendu, 'frontend/src/data/liaisons-resume.json dit les mêmes chiffres que l’annuaire (sinon : npx tsx check-liaisons-canaux.ts --ecrire)', lu === attendu ? '' : lu)

if (echecs) {
  console.error(`\n${echecs} attente(s) manquée(s).`)
  process.exit(1)
}
console.log('\nLiaisons des canaux : tout passe.')
