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
  // Service et non SoftwareApplication : sans note, Google tient une fiche Software App pour une erreur (audit du 03/10/2026).
  exige(['Organization', 'Service', 'FAQPage'].every((t) => types.includes(t)) && !types.includes('SoftwareApplication'), 'un graphe schema.org lisible, sans fiche logiciel invalide', types.join(', '))
  exige(!/aggregateRating/.test(html), 'aucune note inventée')
  exige((html.match(/<meta name="description"/g) ?? []).length === 1, 'une seule description')

  console.log('\nCe que l’audit du 03/10/2026 relevait')
  const dist = resolve(import.meta.dirname, '../frontend/dist')
  const robots = readFileSync(resolve(dist, 'robots.txt'), 'utf8')
  exige(!/^\s*LLM-/m.test(robots) && /^Sitemap: https:\/\/www\.drop-shipper\.fr\/sitemap\.xml$/m.test(robots), 'robots.txt : seulement des directives standard')
  for (const ecran of ['avis', 'confidentialite', 'register']) {
    const fichier = resolve(dist, ecran, 'index.html')
    const page = existsSync(fichier) ? readFileSync(fichier, 'utf8') : ''
    exige(
      page.includes(`<link rel="canonical" href="https://www.drop-shipper.fr/${ecran}" />`) && !page.includes('"Service"') && !/<title>DropShipper IA :/.test(page),
      `/${ecran} : sa propre tête (titre, canonical), pas celle de l’accueil`,
    )
  }
  const vercel = readFileSync(resolve(dist, '../vercel.json'), 'utf8')
  exige(['/avis', '/confidentialite', '/register'].every((u) => vercel.indexOf(`"${u}/index.html"`) !== -1 && vercel.indexOf(`"${u}/index.html"`) < vercel.indexOf('"/(.*)"')), 'vercel.json route ces écrans vers leur copie, avant le filet')
  const indexSitemaps = readFileSync(resolve(dist, 'sitemap.xml'), 'utf8')
  exige(
    indexSitemaps.includes('<sitemapindex') && indexSitemaps.includes('/sitemap-pages.xml</loc>') && indexSitemaps.includes('/analyses/sitemap.xml</loc>') && existsSync(resolve(dist, 'sitemap-pages.xml')),
    'sitemap.xml est un index : les pages du site et les analyses du jour',
  )
  const titre = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? ''
  exige(titre.length <= 60, 'le titre de l’accueil tient dans un résultat Google', `${titre.length} caractères`)

  console.log('\nLe pack SEO du 07/10/2026')
  const image = /<meta property="og:image" content="https:\/\/www\.drop-shipper\.fr\/([^"]+)"/.exec(html)?.[1] ?? ''
  exige(/1200x630/.test(image) && existsSync(resolve(dist, image)) && html.includes('summary_large_image'), 'une image de partage 1200×630 qui existe', image)
  exige(!/hreflang="en"/.test(html) && html.includes('hreflang="x-default"'), 'hreflang fr et x-default, pas de version anglaise annoncée')
  const tarifs = readFileSync(resolve(dist, 'tarifs/index.html'), 'utf8')
  exige(tarifs.includes('"FAQPage"') && (tarifs.match(/"@type":"Question"/g) ?? []).length === 4, '/tarifs/ : les quatre questions en FAQPage')
  exige(existsSync(resolve(dist, 'ai.txt')) && readFileSync(resolve(dist, 'ai.txt'), 'utf8') === readFileSync(resolve(dist, 'llms.txt'), 'utf8'), '/ai.txt reprend /llms.txt')
} else {
  console.log('\n(frontend/dist absent : la page construite n’est pas relue — lancez npm run build côté frontend)')
}

if (echecs) {
  console.error(`\n${echecs} attente(s) manquée(s).`)
  process.exit(1)
}
console.log('\nRéférencement par les IA : tout passe.')
