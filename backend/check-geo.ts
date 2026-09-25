/**
 * Banc : ce que les robots lisent de nous dit les MÊMES prix que l'application.
 *
 * Les questions fréquentes (frontend/scripts/geo-faq.cjs) sont écrites pour être
 * citées telles quelles par un assistant. Elles recopient des prix qui vivent
 * dans `services/tarifs.ts` — Vercel ne déploie pas backend/. Un tarif changé
 * d'un seul côté ferait citer un prix périmé par toutes les IA, avec notre
 * balisage FAQPage pour caution : pire que pas de prix.
 *
 * Et quand `frontend/dist` existe (après un build), la page d'accueil telle
 * qu'un robot la reçoit est relue : texte présent, schema.org valide.
 */
import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DROPS, DROPS_INSCRIPTION } from './src/services/tarifs.js'
import { SUPPLIERS } from './src/services/suppliers.js'
import { CANAUX } from './src/services/channelDirectory.js'
import { API_POWER, resumeApiPower } from './src/services/apiPower.js'

const require = createRequire(import.meta.url)
const scripts = resolve(import.meta.dirname, '../frontend/scripts')
const faq: Array<{ q: string; a: string }> = require(resolve(scripts, 'geo-faq.cjs'))({ nbCanaux: 100, nbFournisseurs: 38 })
const { ROBOTS_IA } = require(resolve(scripts, 'build-geo.cjs'))

let echecs = 0
function exige(condition: boolean, nom: string, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

const texte = faq.map((f) => f.a).join('\n')
const euros = (drops: number) => (drops / 100).toFixed(2).replace('.', ',')

console.log('Les prix cités dans les questions fréquentes sont ceux de tarifs.ts')
for (const [nom, drops] of [
  ['import', DROPS.import],
  ['import en lot', DROPS.importLot],
  ['création de boutique', DROPS.boutiqueCreation],
  ['journée AUTO-SHIPPER', DROPS.autoShipperJour],
  ['produit AUTO-SHIPPER', DROPS.autoShipperImport],
  ['drops offerts', DROPS_INSCRIPTION],
] as Array<[string, number]>) {
  exige(new RegExp(`\\b${drops} drops\\b`).test(texte), `${nom} : ${drops} drops`)
}
exige(texte.includes(`${euros(DROPS.import)} €`), `l'import en euros : ${euros(DROPS.import)} €`)
exige(texte.includes(`${euros(DROPS.boutiqueCreation)} €`), `la boutique en euros : ${euros(DROPS.boutiqueCreation)} €`)
exige(Math.floor(DROPS_INSCRIPTION / DROPS.import) === 10, '« dix annonces sans payer » tient toujours', `${DROPS_INSCRIPTION} / ${DROPS.import}`)

console.log('\nChaque réponse tient seule')
exige(faq.length >= 8, `${faq.length} questions`)
exige(faq.every((f) => f.q.endsWith('?') && f.a.length >= 120 && f.a.length <= 700), 'une question, une réponse de 120 à 700 caractères')
exige(!faq.some((f) => /ci-dessus|plus haut|voir plus bas/i.test(f.a)), 'aucune ne renvoie à une autre')
/*
 * Les deux listes de la frise de l'accueil sont des copies engendrées de
 * suppliers.ts et de l'annuaire (Vercel ne voit pas backend/). Un fournisseur
 * ajouté sans relancer `npx tsx exporter-fournisseurs.ts` manquerait à la
 * frise ; un logo déclaré sans fichier ferait une carte blanche vide.
 */
const fournisseursJson = JSON.parse(readFileSync(resolve(scripts, '../src/data/fournisseurs.json'), 'utf8')) as { fournisseurs: Array<{ id: string; logo: string | null }> }
exige(
  SUPPLIERS.length === fournisseursJson.fournisseurs.length && SUPPLIERS.every((s, i) => s.id === fournisseursJson.fournisseurs[i]?.id),
  'fournisseurs.json recopie suppliers.ts, dans l’ordre (sinon : npx tsx exporter-fournisseurs.ts)',
)
const logosAbsents = fournisseursJson.fournisseurs.filter((f) => f.logo && !existsSync(resolve(scripts, '../public', f.logo.slice(1))))
exige(logosAbsents.length === 0, 'chaque logo de fournisseur déclaré existe dans public/', logosAbsents.map((f) => f.id).join(', '))
const canauxJson = JSON.parse(readFileSync(resolve(scripts, '../src/data/canaux.json'), 'utf8')) as { canaux: Array<{ id: string; logo: string }> }
exige(
  canauxJson.canaux.length === CANAUX.length && canauxJson.canaux.every((c, i) => c.id === CANAUX[i]?.id),
  'canaux.json est engendré avec l’annuaire (sinon : node build-channel-directory.cjs)',
)
const apiPowerJson = JSON.parse(readFileSync(resolve(scripts, '../src/data/api-power.json'), 'utf8')) as { apis: Array<{ id: string; opportunites: unknown[] }>; resume: { opportunites: number } }
exige(
  apiPowerJson.apis.length === API_POWER.length && apiPowerJson.apis.every((a, i) => a.id === API_POWER[i]?.id) && apiPowerJson.resume.opportunites === resumeApiPower().opportunites,
  'api-power.json recopie le registre apiPower.ts (sinon : npx tsx exporter-api-power.ts)',
)
exige(
  API_POWER.every((a) => (a.etat === 'ecarte' ? a.opportunites.length === 0 && !!a.existant : a.opportunites.length > 0 && a.prerequis.length > 0)),
  'une API écartée dit pourquoi et ne promet rien ; une API retenue a ses opportunités et ses prérequis',
)
exige(
  API_POWER.flatMap((a) => a.opportunites).every((o) => o.donnees.length > 0 && o.gestes.length > 0 && o.quoi.length > 40),
  'chaque opportunité dit ce qui remonte, les gestes possibles, et où',
)
exige(ROBOTS_IA.length >= 12 && ROBOTS_IA.some(([a]: [string]) => a === 'GPTBot') && ROBOTS_IA.some(([a]: [string]) => a === 'ClaudeBot'), 'les robots des assistants sont nommés')

const index = resolve(import.meta.dirname, '../frontend/dist/index.html')
if (existsSync(index)) {
  console.log('\nLa page d’accueil telle qu’un robot la reçoit (frontend/dist)')
  const html = readFileSync(index, 'utf8')
  const lisible = html
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
  exige(lisible.length > 3000, 'du texte sans exécuter JavaScript', `${lisible.length} caractères (21 avant le 19/09/2026)`)
  exige(/<h1[^>]*>[^<]{20,}/.test(html), 'un titre de page')
  const bloc = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)
  let types: string[] = []
  try {
    types = JSON.parse(bloc?.[1] ?? '{}')['@graph'].map((n: { '@type': string }) => n['@type'])
  } catch {
    types = []
  }
  exige(['Organization', 'SoftwareApplication', 'FAQPage'].every((t) => types.includes(t)), 'un graphe schema.org lisible', types.join(', '))
  exige(!/aggregateRating/.test(html), 'aucune note inventée')
  exige((html.match(/<meta name="description"/g) ?? []).length === 1, 'une seule description')
} else {
  console.log('\n(frontend/dist absent : la page construite n’est pas relue — lancez npm run build côté frontend)')
}

if (echecs) {
  console.error(`\n${echecs} attente(s) manquée(s).`)
  process.exit(1)
}
console.log('\nRéférencement par les IA : tout passe.')
