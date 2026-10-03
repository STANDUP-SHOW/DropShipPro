import { createServer } from 'http'

/**
 * Éprouve l'adaptateur Pinterest contre un faux serveur, sans base de données.
 *
 * Le faux serveur écrit le contrat en dur, d'après la documentation publique :
 * un banc qui passe ne prouve pas la réalité de Pinterest. Il prouve que notre
 * logique (tableau, épingle, chaîne campagne, groupe, annonce, erreurs) fait ce
 * qu'on a écrit. Seules les fonctions pures prenant un jeton sont appelées :
 * jamais Prisma, jamais DATABASE_URL.
 */

let echecs = 0
const exige = (condition: boolean, message: string) => {
  if (!condition) {
    echecs++
    console.log(`ECHEC : ${message}`)
  }
}

interface Appel {
  methode: string
  chemin: string
  query: URLSearchParams
  entetes: Record<string, string | string[] | undefined>
  corps: any
}
const appels: Appel[] = []
let tableaux: Array<{ id: string }> = []
let refus: { status: number; corps: unknown } | null = null
let compteurId = 0

const serveur = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://local')
  let brut = ''
  for await (const m of req) brut += m
  const ctype = String(req.headers['content-type'] ?? '')
  const corps = !brut ? null : ctype.includes('json') ? JSON.parse(brut) : Object.fromEntries(new URLSearchParams(brut))
  appels.push({ methode: req.method ?? 'GET', chemin: url.pathname, query: url.searchParams, entetes: req.headers, corps })

  const repondre = (status: number, donnees: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(donnees))
  }
  if (refus) return repondre(refus.status, refus.corps)

  const p = url.pathname
  const m = req.method
  if (p === '/v5/oauth/token') {
    return repondre(200, {
      access_token: corps.grant_type === 'refresh_token' ? 'JETON_NEUF' : 'JETON_1',
      refresh_token: 'REFRESH_1',
      expires_in: 2592000,
    })
  }
  if (p === '/v5/user_account') return repondre(200, { username: 'oggus', account_type: 'BUSINESS' })
  if (p === '/v5/ad_accounts' && m === 'GET') return repondre(200, { items: [{ id: 'AD_1', name: 'Pub', currency: 'EUR' }] })
  if (p === '/v5/boards' && m === 'GET') return repondre(200, { items: tableaux })
  if (p === '/v5/boards' && m === 'POST') {
    const id = `BOARD_${++compteurId}`
    tableaux.push({ id })
    return repondre(201, { id, name: corps.name })
  }
  if (p === '/v5/pins') return repondre(201, { id: `PIN_${++compteurId}` })
  if (/\/campaigns$/.test(p) && m === 'POST') return repondre(200, { items: [{ data: { id: 'CAMP_1' } }] })
  if (/\/ad_groups$/.test(p) && m === 'POST') return repondre(200, { items: [{ data: { id: 'GROUPE_1' } }] })
  if (/\/ads$/.test(p) && m === 'POST') return repondre(200, { items: [{ data: { id: 'ANNONCE_1' } }] })
  if (/\/campaigns$/.test(p) && m === 'GET') {
    return repondre(200, { items: [{ id: 'CAMP_1', status: 'PAUSED' }, { id: 'CAMP_2', status: 'ACTIVE' }] })
  }
  if (/\/campaigns\/analytics$/.test(p)) {
    return repondre(200, [
      { CAMPAIGN_ID: 'CAMP_1', SPEND_IN_MICRO_DOLLAR: 12340000, IMPRESSION_1: 1000, CLICKTHROUGH_1: 40, TOTAL_CONVERSIONS: 3 },
      { CAMPAIGN_ID: 'CAMP_1', SPEND_IN_MICRO_DOLLAR: 660000, IMPRESSION_1: 500, CLICKTHROUGH_1: 10, TOTAL_CONVERSIONS: 1 },
      { campaign_id: 'CAMP_2', metrics: { SPEND_IN_MICRO_DOLLAR: 5000000, IMPRESSION_1: 200, CLICKTHROUGH_1: 5 } },
    ])
  }
  repondre(404, { code: 404, message: 'Not found' })
})

await new Promise<void>((resolve) => serveur.listen(0, resolve))
const port = (serveur.address() as { port: number }).port

process.env.PINTEREST_API_URL = `http://127.0.0.1:${port}`
process.env.PINTEREST_APP_ID = 'APP_TEST'
process.env.PINTEREST_APP_SECRET = 'SECRET_TEST'
process.env.PUBLIC_API_URL = 'https://api.test'
process.env.JWT_SECRET = 'secret-de-banc'

const mod = await import('./src/services/socialPinterest.js')
const { lireEtat } = await import('./src/services/oauthEtat.js')
const { SocialError } = await import('./src/services/socialTypes.js')

const compact = () => appels.splice(0, appels.length)
const erreurDe = async (f: () => Promise<unknown>) => {
  try {
    await f()
    return null
  } catch (e) {
    return e instanceof SocialError ? e : new Error(`pas une SocialError : ${String(e)}`)
  }
}

try {
  exige(mod.pinterestConfigure(), "l'adaptateur doit se déclarer utilisable")
  exige(mod.pinterest.id === 'pinterest' && mod.pinterest.plateformes?.[0] === 'pinterest', 'identité du moteur épingles')
  exige(mod.pinterestAds.id === 'pinterest-ads' && mod.pinterestAds.plateformes?.[0] === 'pinterest-ads', 'identité du moteur pub')

  // --- Le lien d'autorisation --------------------------------------------------
  for (const moteur of [mod.pinterest, mod.pinterestAds]) {
    const lien = new URL(await moteur.lienDeConnexion!('USER_1', 'pinterest', 'https://ignore.moi'))
    exige(lien.origin + lien.pathname === 'https://www.pinterest.com/oauth/', `hôte OAuth : ${lien}`)
    exige(lien.searchParams.get('client_id') === 'APP_TEST', 'client_id')
    exige(
      lien.searchParams.get('redirect_uri') === 'https://api.test/api/public/social/pinterest/callback',
      `redirect_uri figée : ${lien.searchParams.get('redirect_uri')}`,
    )
    exige(lien.searchParams.get('response_type') === 'code', 'response_type=code')
    const portee = (lien.searchParams.get('scope') ?? '').split(',')
    for (const s of ['boards:read', 'boards:write', 'pins:read', 'pins:write', 'user_accounts:read', 'ads:read', 'ads:write']) {
      exige(portee.includes(s), `portée manquante : ${s}`)
    }
    const etat = lireEtat(lien.searchParams.get('state') ?? '')
    exige(etat?.userId === 'USER_1' && etat?.plateforme === 'pinterest', 'state signé, lisible, porte le vendeur')
    exige(lireEtat((lien.searchParams.get('state') ?? '') + 'x') === null, 'un state altéré doit être refusé')
  }

  // --- Échange de code et renouvellement ---------------------------------------
  compact()
  const j = await mod.echangerCodePinterest('CODE', 'https://api.test/api/public/social/pinterest/callback')
  const ech = appels[0]
  exige(j.accessToken === 'JETON_1' && j.refreshToken === 'REFRESH_1' && j.expiresIn === 2592000, 'jetons lus')
  exige(ech.methode === 'POST' && ech.chemin === '/v5/oauth/token', "point d'échange")
  exige(
    ech.entetes.authorization === `Basic ${Buffer.from('APP_TEST:SECRET_TEST').toString('base64')}`,
    'authentification Basic app:secret',
  )
  exige(
    ech.corps.grant_type === 'authorization_code' && ech.corps.code === 'CODE' && ech.corps.redirect_uri.endsWith('/pinterest/callback'),
    'corps authorization_code',
  )
  compact()
  const r = await mod.rafraichirJetonPinterest('REFRESH_1')
  exige(r.accessToken === 'JETON_NEUF', 'jeton renouvelé')
  exige(appels[0].corps.grant_type === 'refresh_token' && appels[0].corps.refresh_token === 'REFRESH_1', 'corps refresh_token')

  // --- Tableau ------------------------------------------------------------------
  compact()
  tableaux = []
  const cree = await mod.choisirTableau('T')
  exige(cree === 'BOARD_1', `tableau créé : ${cree}`)
  const post = appels.find((a) => a.methode === 'POST' && a.chemin === '/v5/boards')
  exige(post?.corps?.name === 'DropShipper', 'le tableau créé s’appelle DropShipper')
  exige(appels[0].entetes.authorization === 'Bearer T', 'jeton porteur')
  compact()
  tableaux = [{ id: 'B_A' }, { id: 'B_B' }]
  exige((await mod.choisirTableau('T')) === 'B_A', 'premier tableau existant choisi')
  exige(!appels.some((a) => a.methode === 'POST'), 'aucune création quand un tableau existe')
  compact()
  exige((await mod.choisirTableau('T', 'B_FIXE')) === 'B_FIXE' && appels.length === 0, 'meta.boardId prime, sans appel')

  // --- Épingle : une image, plusieurs images, sans image ------------------------
  compact()
  const e1 = await mod.creerEpingle('T', {
    titre: `Une montre\n${'x'.repeat(200)}`,
    description: `Superbe montre. Voir https://boutique.test/montre. ${'y'.repeat(900)}`,
    images: ['https://a/1.jpg'],
    boardId: 'B_A',
  })
  exige(e1.url === `https://www.pinterest.com/pin/${e1.pinId}/`, `url de l'épingle : ${e1.url}`)
  const pin1 = appels.find((a) => a.chemin === '/v5/pins')!.corps
  exige(pin1.board_id === 'B_A', 'board_id')
  exige(pin1.title === 'Une montre', `titre = première ligne : ${pin1.title}`)
  exige(pin1.description.length === 800, `description ≤ 800 : ${pin1.description.length}`)
  exige(pin1.link === 'https://boutique.test/montre', `lien extrait : ${pin1.link}`)
  exige(pin1.media_source.source_type === 'image_url' && pin1.media_source.url === 'https://a/1.jpg', 'image_url')

  compact()
  await mod.creerEpingle('T', { titre: 'x'.repeat(150), description: 'sans lien', images: ['https://a/1.jpg', 'https://a/2.jpg', 'https://a/3.jpg'], boardId: 'B_A' })
  const pin2 = appels.find((a) => a.chemin === '/v5/pins')!.corps
  exige(pin2.title.length === 100, 'titre ≤ 100')
  exige(pin2.media_source.source_type === 'multiple_image_urls', 'plusieurs images : multiple_image_urls')
  exige(pin2.media_source.items.length === 3 && pin2.media_source.items[2].url === 'https://a/3.jpg', 'items des images')
  exige(!('link' in pin2), 'pas de lien quand le texte n’en contient pas')

  compact()
  const sans = await erreurDe(() => mod.creerEpingle('T', { titre: 't', description: 'd', images: [] }))
  exige(sans?.message.includes('au moins une image') === true, `texte seul refusé : ${sans?.message}`)
  exige(appels.length === 0, 'et sans aucun appel à Pinterest')
  const http = await erreurDe(() => mod.creerEpingle('T', { titre: 't', description: 'd', images: ['http://a/1.jpg'] }))
  exige(http !== null && appels.length === 0, 'une image non https est refusée avant tout appel')

  // --- Campagne : chaîne PAUSED par défaut, ACTIVE avec activer ----------------
  const campagne = {
    compte: 'AD_1',
    nom: 'Montres',
    objectif: 'trafic',
    budgetJour: 1000,
    creative: { image: 'https://a/1.jpg', titre: 'Montre auto', texte: 'Elle est belle', url: 'https://boutique.test/m' },
    ciblage: { paysCodes: ['fr', 'be'], ageMin: 25, ageMax: 40 },
  }
  compact()
  const c1 = await mod.creerCampagnePinterest('T', 'AD_1', campagne, 'B_A')
  exige(c1.campaignId === 'CAMP_1' && c1.adGroupId === 'GROUPE_1' && c1.adId === 'ANNONCE_1', 'identifiants de la chaîne')
  const ordre = appels.map((a) => a.chemin)
  exige(
    ordre.join(' ') === '/v5/pins /v5/ad_accounts/AD_1/campaigns /v5/ad_accounts/AD_1/ad_groups /v5/ad_accounts/AD_1/ads',
    `ordre épingle, campagne, groupe, annonce : ${ordre.join(' ')}`,
  )
  const [, aC, aG, aA] = appels
  exige(Array.isArray(aC.corps) && aC.corps.length === 1, 'les créations partent en lot (tableau)')
  exige(aC.corps[0].status === 'PAUSED' && aG.corps[0].status === 'PAUSED' && aA.corps[0].status === 'PAUSED', 'tout PAUSED par défaut')
  exige(aC.corps[0].objective_type === 'CONSIDERATION', 'trafic → CONSIDERATION')
  exige(aC.corps[0].daily_spend_cap === 10_000_000, `plafond en micro-devise : ${aC.corps[0].daily_spend_cap}`)
  exige(aG.corps[0].campaign_id === 'CAMP_1' && aG.corps[0].budget_in_micro_currency === 10_000_000, 'groupe rattaché, budget en micro')
  exige(aG.corps[0].billable_event === 'CLICKTHROUGH', 'trafic facturé au clic')
  exige(JSON.stringify(aG.corps[0].targeting_spec.GEO) === '["FR","BE"]', 'GEO en majuscules')
  exige(JSON.stringify(aG.corps[0].targeting_spec.AGE_BUCKET) === '["25-34","35-44"]', `AGE_BUCKET : ${JSON.stringify(aG.corps[0].targeting_spec.AGE_BUCKET)}`)
  exige(aG.corps[0].auto_targeting_enabled === true, 'ciblage automatique')
  exige(aA.corps[0].creative_type === 'REGULAR' && aA.corps[0].pin_id === c1.pinId && aA.corps[0].ad_group_id === 'GROUPE_1', 'annonce REGULAR sur la bonne épingle')
  exige(appels[0].corps.link === 'https://boutique.test/m', 'le lien de l’épingle est l’url de la créative')

  compact()
  await mod.creerCampagnePinterest('T', 'AD_1', { ...campagne, objectif: 'notoriete', activer: true, ciblage: undefined }, 'B_A')
  const [, bC, bG, bA] = appels
  exige(bC.corps[0].status === 'ACTIVE' && bG.corps[0].status === 'ACTIVE' && bA.corps[0].status === 'ACTIVE', 'activer → ACTIVE partout')
  exige(bC.corps[0].objective_type === 'AWARENESS' && bG.corps[0].billable_event === 'IMPRESSION', 'notoriété → AWARENESS, IMPRESSION')
  exige(!('GEO' in bG.corps[0].targeting_spec) && !('AGE_BUCKET' in bG.corps[0].targeting_spec), 'pas de ciblage non demandé')
  const plan = mod.construireCampagne('AD_1', { ...campagne, objectif: 'conversions' }, 'P')
  exige(plan.campagne.objective_type === 'WEB_CONVERSION', 'conversions → WEB_CONVERSION')
  exige(mod.construireCampagne('AD_1', { ...campagne, objectif: 'engagement' }, 'P').campagne.objective_type === 'CONSIDERATION', 'engagement → CONSIDERATION')

  // Campagne sans image : refusée avant toute création payante.
  compact()
  const sansImg = await erreurDe(() => mod.creerCampagnePinterest('T', 'AD_1', { ...campagne, creative: { ...campagne.creative, image: '' } }, 'B_A'))
  exige(sansImg !== null && appels.length === 0, 'campagne sans image refusée sans appel')

  // --- Lecture ---------------------------------------------------------------------
  const liste = await mod.campagnesPinterest('T', 'AD_1')
  exige(liste.length === 2 && liste[0].etat === 'brouillon' && liste[1].etat === 'active', 'états des campagnes')

  compact()
  const perfs = await mod.performancesPinterest('T', 'AD_1', ['CAMP_1', 'CAMP_2', 'CAMP_3'], 'EUR')
  const q = appels[0].query
  exige(q.get('columns') === 'SPEND_IN_MICRO_DOLLAR,IMPRESSION_1,CLICKTHROUGH_1,TOTAL_CONVERSIONS', `colonnes : ${q.get('columns')}`)
  exige(q.get('campaign_ids') === 'CAMP_1,CAMP_2,CAMP_3' && q.get('granularity') === 'TOTAL', 'paramètres analytics')
  exige(!!q.get('start_date') && !!q.get('end_date'), 'dates')
  const p1 = perfs[0]
  exige(p1.depense === 1300 && p1.impressions === 1500 && p1.clics === 50 && p1.conversions === 4, `CAMP_1 additionnée : ${JSON.stringify(p1)}`)
  exige(p1.devise === 'EUR', 'devise')
  exige(perfs[1].depense === 500 && perfs[1].conversions === null, `CAMP_2 (métriques imbriquées) : ${JSON.stringify(perfs[1])}`)
  exige(perfs[2].depense === 0 && perfs[2].impressions === 0, 'campagne sans ligne : zéros')

  // --- Erreurs traduites -----------------------------------------------------------
  const cas: Array<[number, unknown, (e: InstanceType<typeof SocialError>) => boolean, string]> = [
    [401, { code: 2, message: 'Authentication failed.' }, (e) => e.message.includes('reliez le compte') && e.actionnable, '401 → reconnecter'],
    [429, { code: 8, message: 'Too many' }, (e) => /Réessayez/.test(e.message) && !e.actionnable, '429 → attendre'],
    [403, { code: 29, message: 'Trial access' }, (e) => e.message.includes('« Standard »') && !e.actionnable, '403 → accès Standard'],
    [500, {}, (e) => e.message.includes('en panne'), '500 → panne'],
    [400, { code: 1, message: 'Invalid board' }, (e) => e.message === 'Pinterest : Invalid board', '400 → message repris'],
  ]
  for (const [status, corps, ok, nom] of cas) {
    refus = { status, corps }
    const e = await erreurDe(() => mod.appelPinterest('T', '/v5/boards'))
    exige(e instanceof SocialError && ok(e), `${nom} : ${e?.message}`)
  }
  refus = { status: 403, corps: { message: 'x' } }
  const eCamp = await erreurDe(() => mod.creerCampagnePinterest('T', 'AD_1', campagne, 'B_A'))
  exige(eCamp?.message.includes('« Standard »') === true, 'un 403 sur la chaîne est traduit aussi')
  refus = null

  // Un échec en cours de chaîne dit ce qui est déjà créé.
  const tordu = createServer((req, res) => {
    res.writeHead(/ad_groups$/.test(req.url ?? '') ? 400 : 200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(/pins/.test(req.url ?? '') ? { id: 'P' } : /ad_groups/.test(req.url ?? '') ? { message: 'budget trop bas' } : { items: [{ data: { id: 'CAMP_9' } }] }))
  })
  await new Promise<void>((resolve) => tordu.listen(0, resolve))
  process.env.PINTEREST_API_URL = `http://127.0.0.1:${(tordu.address() as { port: number }).port}`
  const partielle = await erreurDe(() => mod.creerCampagnePinterest('T', 'AD_1', campagne, 'B_A'))
  exige(partielle?.message.includes('CAMP_9') === true && partielle.message.includes('budget trop bas'), `chaîne interrompue : ${partielle?.message}`)
  tordu.close()
  process.env.PINTEREST_API_URL = `http://127.0.0.1:${port}`

  // --- La publication sans image ne touche ni la base ni le réseau ------------------
  compact()
  const sansVisuel = await mod.pinterest.publier!('USER_1', { comptes: ['oggus'], texte: 'Du texte seul' })
  exige(sansVisuel.etat === 'echouee' && sansVisuel.parCompte[0].erreur?.includes('au moins une image') === true, 'publier sans image : refus clair')
  exige(appels.length === 0, 'et sans appel')
} finally {
  serveur.close()
}

console.log(echecs === 0 ? 'Pinterest : tout passe.' : `Pinterest : ${echecs} echec(s).`)
process.exit(echecs === 0 ? 0 : 1)
