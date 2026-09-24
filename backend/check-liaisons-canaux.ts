/**
 * Banc : chacun des 314 canaux de l'annuaire a une voie de liaison, et ce
 * qu'on affirme sur elle est tenu.
 *
 * Le piège qu'il garde : une clé de `VERIFIES` qui n'existe pas dans
 * l'annuaire (le premier `channelFeeds` portait `facebook`, `google-ads` —
 * aucun n'existait, l'écran disait « pas reliée » sur des canaux servis).
 */
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
const live = PLATFORMS.filter((p) => p.integration === 'live' && !BOUTIQUES_DU_VENDEUR.includes(p.id))
const liveSansCanal = live.filter((p) => !branchees.some((b) => b.liaison.plateforme === p.id))
exige(liveSansCanal.length === 0, 'chaque destination LIVE de platforms.ts a son canal dans l’annuaire, marqué branché', liveSansCanal.map((p) => p.id).join(', '))

const ebay = liaisonPour(CANAUX.find((c) => c.id === 'ebay')!)
exige(ebay.voie === 'api' && ebay.etat === 'branche', 'eBay : publication directe, branchée')
const amazon = liaisonPour(CANAUX.find((c) => c.id === 'amazon')!)
exige(amazon.voie === 'api' && amazon.etat === 'compte-requis', 'Amazon : connecteur écrit, compte vendeur requis')
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

if (echecs) {
  console.error(`\n${echecs} attente(s) manquée(s).`)
  process.exit(1)
}
console.log('\nLiaisons des canaux : tout passe.')
