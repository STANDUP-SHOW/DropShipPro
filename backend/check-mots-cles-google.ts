/**
 * Banc : Planificateur de mots-clés Google (services/motsClesGoogle.ts).
 *
 * Aucun appel réel : un faux `fetch` et un faux jeton. Le faux serveur écrit le
 * contrat EN DUR (forme de la doc Google Ads API v26) : ce banc prouve notre
 * lecture et nos refus, pas que Google répond — seul `/api/admin/mots-cles/etat?essai=1`
 * le prouve, une fois les variables Railway posées.
 */
import { MotsClesErreur, evolution, ideesMotsCles, motsClesManquants, trier, volumesMotsCles } from './src/services/motsClesGoogle.js'

let echecs = 0
function exige(condition: boolean, nom: string, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}
async function motifDe(p: Promise<unknown>): Promise<string | null> {
  try {
    await p
    return null
  } catch (e) {
    return e instanceof MotsClesErreur ? e.motif : `autre: ${e}`
  }
}

const CLE = JSON.stringify({ type: 'service_account', client_email: 'planif@projet.iam.gserviceaccount.com', private_key: '-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----\n' })
const ENV = { GOOGLE_ADS_SERVICE_ACCOUNT_JSON: CLE, GOOGLE_ADS_CUSTOMER_ID: '123-456-7890' } as NodeJS.ProcessEnv
const jeton = async () => 'jeton-de-banc'

const mois = (annee: number, m: string, n: number) => ({ month: m, year: String(annee), monthlySearches: String(n) })
const TENDANCE = [
  mois(2025, 'OCTOBER', 1000), mois(2025, 'NOVEMBER', 1000), mois(2025, 'DECEMBER', 1000),
  mois(2026, 'JANUARY', 1000), mois(2026, 'FEBRUARY', 1000), mois(2026, 'MARCH', 1000),
  mois(2026, 'APRIL', 1000), mois(2026, 'MAY', 1000), mois(2026, 'JUNE', 1000),
  mois(2026, 'SEPTEMBER', 2000), mois(2026, 'JULY', 1000), mois(2026, 'AUGUST', 1600),
]

let derniere: { url: string; init: RequestInit } | null = null
function fauxFetch(statut: number, corps: unknown): typeof fetch {
  return (async (url: string, init: RequestInit) => {
    derniere = { url, init }
    return new Response(typeof corps === 'string' ? corps : JSON.stringify(corps), { status: statut })
  }) as unknown as typeof fetch
}

console.log('Sans variables : rien n’est appelé')
exige(motsClesManquants({}).join(',') === 'GOOGLE_ADS_SERVICE_ACCOUNT_JSON,GOOGLE_ADS_CUSTOMER_ID', 'les deux variables sont nommées')
let appele = false
const espion = (async () => { appele = true; return new Response('{}') }) as unknown as typeof fetch
exige((await motifDe(volumesMotsCles(['coque iphone'], { env: {}, fetch: espion, jeton }))) === 'non-configure' && !appele, 'non configuré → erreur lisible, aucun appel')
exige((await motifDe(volumesMotsCles(['a'], { env: { ...ENV, GOOGLE_ADS_SERVICE_ACCOUNT_JSON: '{pas du json' }, fetch: espion, jeton }))) === 'configuration', 'JSON mal collé refusé')
exige((await motifDe(volumesMotsCles(['a'], { env: { ...ENV, GOOGLE_ADS_CUSTOMER_ID: '12345' }, fetch: espion, jeton }))) === 'configuration', 'numéro de compte trop court refusé')
exige(!appele, 'toujours aucun appel')

console.log('Tri de l’entrée')
const t = trier(['  Coque  iPhone ', 'coque iphone', 'x'.repeat(81), 'un deux trois quatre cinq six sept huit neuf dix onze', 3, ''], 500)
exige(t.gardes.length === 1 && t.gardes[0] === 'Coque iPhone', 'doublons et espaces nettoyés', JSON.stringify(t.gardes))
exige(t.refus.length === 2, 'trop long et trop de mots refusés avec raison')

console.log('Volumes : la requête envoyée')
const reponse = {
  results: [
    { text: 'coque iphone', closeVariants: ['coques iphone'], keywordMetrics: { avgMonthlySearches: '1100', competition: 'HIGH', competitionIndex: '87', lowTopOfPageBidMicros: '120000', highTopOfPageBidMicros: '1450000', monthlySearchVolumes: TENDANCE } },
  ],
}
const r = await volumesMotsCles(['coque iphone', 'Coques iPhone', 'lampe introuvable'], { env: { ...ENV, GOOGLE_ADS_LOGIN_CUSTOMER_ID: '999-888-7777' }, fetch: fauxFetch(200, reponse), jeton })
const envoye = JSON.parse(String(derniere!.init.body))
const entetes = derniere!.init.headers as Record<string, string>
exige(derniere!.url === 'https://googleads.googleapis.com/v26/customers/1234567890:generateKeywordHistoricalMetrics', 'URL v26, numéro sans tirets', derniere!.url)
exige(entetes.Authorization === 'Bearer jeton-de-banc' && entetes['login-customer-id'] === '9998887777' && !('developer-token' in entetes), 'en-têtes : jeton, compte administrateur, pas de jeton développeur')
exige(envoye.geoTargetConstants[0] === 'geoTargetConstants/2250' && envoye.language === 'languageConstants/1002' && envoye.keywordPlanNetwork === 'GOOGLE_SEARCH', 'France, français, recherche Google')

console.log('Volumes : la réponse lue')
const [a, b, c] = r.motsCles
exige(r.motsCles.length === 3, 'une ligne par mot-clé demandé')
exige(a.volumeMensuel === 1100 && a.concurrence === 'forte' && a.indiceConcurrence === 87, 'volume, concurrence, indice', JSON.stringify(a).slice(0, 120))
exige(a.enchereBasse === 0.12 && a.enchereHaute === 1.45, 'enchères converties des micros')
exige(a.tendance.length === 12 && a.tendance[0].mois === '2025-10' && a.tendance[11].mois === '2026-09', 'tendance triée par mois')
exige(a.evolution3Mois === 53, 'évolution 3 mois (1533 contre 1000)', String(a.evolution3Mois))
exige(b.texte === 'Coques iPhone' && b.volumeMensuel === 1100, 'variante proche rattachée à sa ligne')
exige(c.volumeMensuel === null && c.concurrence === null && c.tendance.length === 0, 'mot-clé sans réponse : null, jamais 0 inventé')
exige(evolution([{ mois: '1', recherches: 0 }, { mois: '2', recherches: 0 }, { mois: '3', recherches: 0 }, { mois: '4', recherches: 5 }, { mois: '5', recherches: 5 }, { mois: '6', recherches: 5 }]) === null, 'évolution depuis zéro : null')

console.log('Idées')
const idees = await ideesMotsCles(['lampe'], 2, {
  env: ENV, jeton,
  fetch: fauxFetch(200, { results: [
    { text: 'lampe de chevet', keywordIdeaMetrics: { avgMonthlySearches: '40500', competition: 'MEDIUM' } },
    { text: 'lampe led', keywordIdeaMetrics: { avgMonthlySearches: '90500', competition: 'LOW' } },
    { text: 'lampe rare', keywordIdeaMetrics: {} },
  ] }),
})
exige(JSON.parse(String(derniere!.init.body)).keywordSeed.keywords[0] === 'lampe' && derniere!.url.endsWith(':generateKeywordIdeas'), 'graines envoyées')
exige(idees.motsCles.map((m) => m.texte).join('|') === 'lampe led|lampe de chevet', 'triées par volume, limitées', idees.motsCles.map((m) => m.texte).join('|'))

console.log('Erreurs de Google traduites')
const refusExplorer = JSON.stringify({ error: { code: 403, details: [{ errors: [{ errorCode: { authorizationError: 'CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION' } }] }] } })
exige((await motifDe(volumesMotsCles(['a'], { env: ENV, jeton, fetch: fauxFetch(403, refusExplorer) }))) === 'acces-refuse', 'niveau Basic manquant → acces-refuse')
exige((await motifDe(volumesMotsCles(['a'], { env: ENV, jeton, fetch: fauxFetch(429, '{"error":{"status":"RESOURCE_EXHAUSTED"}}') }))) === 'quota', '429 → quota')
exige((await motifDe(volumesMotsCles(['a'], { env: ENV, jeton, fetch: fauxFetch(200, '<html>') }))) === 'reponse', 'réponse illisible → reponse')
const panne = (async () => { throw new Error('ECONNRESET') }) as unknown as typeof fetch
exige((await motifDe(volumesMotsCles(['a'], { env: ENV, jeton, fetch: panne }))) === 'reseau', 'panne réseau → reseau')

console.log(echecs ? `\n${echecs} échec(s)` : '\nTout est vert.')
process.exit(echecs ? 1 : 0)
