import { createServer } from 'http'

/**
 * Éprouve le connecteur Meta Ads contre un faux Graph API. Aucune base : seules
 * les fonctions HTTP exportées (qui reçoivent le jeton) sont appelées.
 * Le faux Graph écrit le contrat en dur ; il ne prouve pas la réalité de Meta.
 */

let echecs = 0
const exige = (condition: boolean, message: string) => {
  if (!condition) {
    echecs++
    console.log(`ECHEC : ${message}`)
  }
}

interface Appel { chemin: string; methode: string; params: Record<string, string> }
const appels: Appel[] = []
type Scenario = 'ok' | 'sansPixel' | 'adimagesRefuse' | 'adsetRefuse' | 'erreur'
let scenario: Scenario = 'ok'
let erreurRendue: { code: number; error_subcode?: number; message: string; error_user_msg?: string } | null = null

const serveur = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://local')
  let corps = ''
  for await (const m of req) corps += m
  const params: Record<string, string> = {}
  for (const [k, v] of new URLSearchParams(corps || url.search)) params[k] = v
  const chemin = url.pathname.replace(/^\/v\d+\.\d+\//, '')
  appels.push({ chemin, methode: req.method ?? 'GET', params })

  const ok = (d: unknown) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(d)) }
  const refus = (e: object) => { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e })) }

  if (scenario === 'erreur' && erreurRendue) return refus(erreurRendue)
  if (scenario === 'adsetRefuse' && chemin.endsWith('/adsets')) return refus({ code: 100, error_subcode: 1487851, message: 'Invalid', error_user_msg: 'Le budget est trop bas.' })
  if (scenario === 'adimagesRefuse' && chemin.endsWith('/adimages')) return refus({ code: 100, message: 'Unsupported' })

  if (chemin === 'oauth/access_token') {
    return ok(params.grant_type ? { access_token: 'JETON_LONG', expires_in: 5183944 } : { access_token: 'JETON_COURT' })
  }
  if (chemin === 'me/adaccounts') {
    return ok({ data: [
      { id: 'act_111', name: 'Compte actif', currency: 'EUR', account_status: 1 },
      { id: 'act_222', name: 'Compte désactivé', currency: 'EUR', account_status: 2 },
    ] })
  }
  if (chemin === 'me/accounts') return ok({ data: scenario === 'sansPixel' && false ? [] : [{ id: 'PAGE_1', name: 'OGGUS France' }] })
  if (chemin.endsWith('/adspixels')) return ok({ data: scenario === 'sansPixel' ? [] : [{ id: 'PIXEL_1' }] })
  if (chemin.endsWith('/campaigns') && req.method === 'POST') return ok({ id: 'CAMP_1' })
  if (chemin.endsWith('/campaigns')) {
    return ok({ data: [
      { id: 'CAMP_1', effective_status: 'PAUSED' }, { id: 'CAMP_2', effective_status: 'ACTIVE' },
      { id: 'CAMP_3', effective_status: 'DISAPPROVED' }, { id: 'CAMP_4', effective_status: 'PENDING_REVIEW' },
    ] })
  }
  if (chemin.endsWith('/adsets')) return ok({ id: 'ADSET_1' })
  if (chemin.endsWith('/adimages')) return ok({ images: { 'img.jpg': { hash: 'HASH_1' } } })
  if (chemin.endsWith('/adcreatives')) return ok({ id: 'CREA_1' })
  if (chemin.endsWith('/ads')) return ok({ id: 'AD_1' })
  if (chemin.endsWith('/insights')) {
    return ok({ data: [{ spend: '12.34', impressions: '1500', clicks: '42', account_currency: 'EUR',
      actions: [{ action_type: 'link_click', value: '40' }, { action_type: 'purchase', value: '3' }] }] })
  }
  if (chemin === 'CAMP_1' && req.method === 'POST') return ok({ success: true })
  res.writeHead(404); res.end('{}')
})

await new Promise<void>((resolve) => serveur.listen(0, resolve))
const port = (serveur.address() as { port: number }).port
process.env.META_GRAPH_URL = `http://127.0.0.1:${port}`
process.env.META_APP_ID = 'APP_TEST'
process.env.META_APP_SECRET = 'SECRET_TEST'
process.env.PUBLIC_API_URL = 'https://api.test'
process.env.JWT_SECRET = 'secret-de-banc'

const m = await import('./src/services/socialMetaAds.js')
const { lireEtat } = await import('./src/services/oauthEtat.js')
const { SocialError } = await import('./src/services/socialTypes.js')

const attrape = async (f: () => Promise<unknown>): Promise<Error | null> => {
  try { await f(); return null } catch (e) { return e as Error }
}

try {
  exige(m.metaAdsConfigure(), 'configuré avec App ID et secret')
  exige(m.metaAds.id === 'meta-ads' && m.metaAds.plateformes?.[0] === 'meta-ads', 'id et plateformes')

  // --- Lien OAuth ----------------------------------------------------------
  const lien = await m.metaAds.lienDeConnexion!('USER_1', 'meta-ads', 'https://ignore.moi')
  const u = new URL(lien)
  exige(u.hostname === 'www.facebook.com' && u.pathname.endsWith('/dialog/oauth'), `dialogue Facebook : ${u.href}`)
  exige(u.searchParams.get('redirect_uri') === 'https://api.test/api/public/social/meta-ads/callback', `redirect_uri : ${u.searchParams.get('redirect_uri')}`)
  const portee = (u.searchParams.get('scope') ?? '').split(',')
  for (const p of ['ads_management', 'ads_read', 'business_management', 'pages_show_list', 'pages_read_engagement']) {
    exige(portee.includes(p), `permission ${p} demandée`)
  }
  exige(!portee.includes('pages_manage_posts'), 'pas de permission de publication organique')
  const etat = lireEtat(u.searchParams.get('state') ?? '')
  exige(etat?.userId === 'USER_1' && etat?.plateforme === 'meta-ads', 'state signé, lisible, porte vendeur et plateforme')
  exige(lireEtat((u.searchParams.get('state') ?? '') + 'x') === null, 'state altéré refusé')

  // --- Échange de jetons ---------------------------------------------------
  appels.length = 0
  const jeton = await m.echangerCode('CODE', 'https://api.test/retour', 'APP_TEST', 'SECRET_TEST')
  const ech = appels.filter((a) => a.chemin === 'oauth/access_token')
  exige(ech.length === 2, `${ech.length} échanges, attendu 2`)
  exige(ech[0].params.code === 'CODE' && ech[0].params.redirect_uri === 'https://api.test/retour', 'premier échange : code + redirect_uri')
  exige(ech[1].params.grant_type === 'fb_exchange_token' && ech[1].params.fb_exchange_token === 'JETON_COURT', 'second échange : longue durée')
  exige(jeton.token === 'JETON_LONG', 'jeton long retenu')
  const jours = (jeton.expire.getTime() - Date.now()) / 86400000
  exige(jours > 55 && jours < 65, `expiration ≈ 60 jours : ${jours.toFixed(1)}`)

  // --- Comptes publicitaires ----------------------------------------------
  appels.length = 0
  const comptes = await m.lireComptesAds('JETON_LONG')
  exige(comptes.length === 1 && comptes[0].id === 'act_111', 'seul le compte actif est gardé')
  exige(comptes[0].devise === 'EUR' && comptes[0].pages[0]?.id === 'PAGE_1', 'devise et page rattachées')
  exige(comptes[0].pixelId === 'PIXEL_1', 'pixel détecté')
  exige(appels.find((a) => a.chemin === 'me/adaccounts')?.params.fields === 'id,name,currency,account_status', 'champs demandés')

  // --- Chaîne complète, PAUSE par défaut ----------------------------------
  const compte = { id: 'act_111', devise: 'EUR', pages: comptes[0].pages, pixelId: 'PIXEL_1' }
  const base = {
    compte: 'act_111', nom: 'Montre auto', objectif: 'trafic', budgetJour: 1500,
    creative: { image: 'https://api.test/storage/p.jpg', titre: 'Montre', texte: 'Notre nouvelle montre', url: 'https://boutique.test/montre' },
  }
  appels.length = 0
  const r = await m.creerCampagneMeta('JETON_LONG', compte, base)
  const ordre = appels.map((a) => a.chemin.replace('act_111/', ''))
  exige(JSON.stringify(ordre) === JSON.stringify(['campaigns', 'adsets', 'adimages', 'adcreatives', 'ads']), `ordre des appels : ${ordre}`)
  exige(r.externalId === 'CAMP_1' && r.etat === 'brouillon', `résultat ${r.externalId}/${r.etat}`)
  exige(r.url?.includes('adsmanager.facebook.com') === true && r.url.includes('act=111') && r.url.includes('CAMP_1'), `url : ${r.url}`)
  exige(['campaigns', 'adsets', 'ads'].every((c) => appels.find((a) => a.chemin.endsWith(`/${c}`))?.params.status === 'PAUSED'), 'campagne, ensemble et annonce en PAUSE')
  const camp = appels[0].params
  exige(camp.objective === 'OUTCOME_TRAFFIC' && camp.special_ad_categories === '[]', 'objectif trafic, catégories spéciales vides')
  const ens = appels[1].params
  exige(ens.daily_budget === '1500', `budget en centimes : ${ens.daily_budget}`)
  exige(ens.billing_event === 'IMPRESSIONS' && ens.optimization_goal === 'LINK_CLICKS' && ens.bid_strategy === 'LOWEST_COST_WITHOUT_CAP', 'facturation, optimisation, enchère')
  const cib = JSON.parse(ens.targeting)
  exige(cib.geo_locations.countries[0] === 'FR' && cib.age_min === 18, 'ciblage par défaut : FR, 18+')
  exige(ens.campaign_id === 'CAMP_1' && Boolean(ens.start_time), 'ensemble rattaché, départ maintenant')
  const hist = JSON.parse(appels[3].params.object_story_spec)
  exige(hist.page_id === 'PAGE_1', 'créatif publié au nom de la page')
  exige(hist.link_data.link === 'https://boutique.test/montre' && hist.link_data.message === 'Notre nouvelle montre' && hist.link_data.name === 'Montre', 'link_data')
  exige(hist.link_data.image_hash === 'HASH_1' && hist.link_data.call_to_action?.type === 'SHOP_NOW', 'image_hash et bouton')
  exige(JSON.parse(appels[4].params.creative).creative_id === 'CREA_1' && appels[4].params.adset_id === 'ADSET_1', 'annonce liée au créatif et à l’ensemble')

  // --- Avec activer, ciblage fourni ----------------------------------------
  appels.length = 0
  const actif = await m.creerCampagneMeta('JETON_LONG', compte, { ...base, activer: true, ciblage: { paysCodes: ['BE', 'CH'], ageMin: 25, ageMax: 45 } })
  exige(actif.etat === 'en_revue', `activée : état ${actif.etat}`)
  exige(['campaigns', 'adsets', 'ads'].every((c) => appels.find((a) => a.chemin.endsWith(`/${c}`))?.params.status === 'ACTIVE'), 'tout ACTIVE avec activer')
  const c2 = JSON.parse(appels[1].params.targeting)
  exige(c2.geo_locations.countries.join() === 'BE,CH' && c2.age_min === 25 && c2.age_max === 45, 'ciblage fourni respecté')

  // --- Objectifs ------------------------------------------------------------
  const obj = async (o: string, c = compte) => { appels.length = 0; await m.creerCampagneMeta('T', c, { ...base, objectif: o }); return { camp: appels[0].params, ens: appels[1].params } }
  exige((await obj('notoriete')).camp.objective === 'OUTCOME_AWARENESS' && (await obj('notoriete')).ens.optimization_goal === 'REACH', 'notoriété → AWARENESS / REACH')
  exige((await obj('engagement')).camp.objective === 'OUTCOME_ENGAGEMENT', 'engagement → OUTCOME_ENGAGEMENT')
  const conv = await obj('conversions')
  exige(conv.camp.objective === 'OUTCOME_SALES' && JSON.parse(conv.ens.promoted_object).pixel_id === 'PIXEL_1', 'conversions avec pixel → OUTCOME_SALES + pixel')
  appels.length = 0
  const sansPx = await m.creerCampagneMeta('T', { ...compte, pixelId: null }, { ...base, objectif: 'conversions' })
  exige(appels[0].params.objective === 'OUTCOME_TRAFFIC', 'conversions sans pixel → trafic')
  exige(sansPx.remarque?.includes('pixel') === true, `le repli est dit : ${sansPx.remarque}`)

  // --- Devises sans centimes ------------------------------------------------
  exige(m.budgetMeta(1500, 'EUR') === 1500 && m.budgetMeta(150000, 'JPY') === 1500, 'budget : EUR en centimes, JPY en unités')

  // --- Page absente : refus avant tout appel --------------------------------
  appels.length = 0
  const sansPage = await attrape(() => m.creerCampagneMeta('T', { ...compte, pages: [] }, base))
  exige(sansPage instanceof SocialError && sansPage.message.includes('page Facebook'), `refus sans page : ${sansPage?.message}`)
  exige(appels.length === 0, 'aucun appel Meta avant ce refus')

  // --- Repli du visuel ------------------------------------------------------
  scenario = 'adimagesRefuse'
  appels.length = 0
  await m.creerCampagneMeta('T', compte, base)
  const repli = JSON.parse(appels.find((a) => a.chemin.endsWith('/adcreatives'))!.params.object_story_spec).link_data
  exige(repli.picture === base.creative.image && !repli.image_hash, 'adimages refusé : le créatif porte picture')

  // --- Nettoyage si l'ensemble est refusé -----------------------------------
  scenario = 'adsetRefuse'
  appels.length = 0
  const eAdset = await attrape(() => m.creerCampagneMeta('T', compte, base))
  exige(eAdset?.message.includes('Le budget est trop bas.') === true, `message utilisateur montré : ${eAdset?.message}`)
  exige(appels.some((a) => a.chemin === 'CAMP_1' && a.params.status === 'DELETED'), 'campagne orpheline supprimée')
  scenario = 'ok'

  // --- Lecture ---------------------------------------------------------------
  const liste = await m.lireCampagnes('T', 'act_111')
  exige(liste.map((l) => l.etat).join() === 'brouillon,active,refusee,en_revue', `états : ${liste.map((l) => l.etat)}`)
  appels.length = 0
  const perf = await m.lirePerformances('T', ['CAMP_1'])
  exige(perf[0].depense === 1234 && perf[0].impressions === 1500 && perf[0].clics === 42, `performances : ${JSON.stringify(perf[0])}`)
  exige(perf[0].conversions === 3 && perf[0].devise === 'EUR', 'achats et devise')
  exige(appels[0].chemin === 'CAMP_1/insights' && appels[0].params.fields.startsWith('spend,impressions,clicks,actions'), 'champs insights')

  // --- Traductions d'erreurs --------------------------------------------------
  scenario = 'erreur'
  const msg = async (e: typeof erreurRendue) => { erreurRendue = e; const x = await attrape(() => m.lireCampagnes('T', 'act_1')); return x }
  const e190 = await msg({ code: 190, message: 'Expired' })
  exige(e190 instanceof SocialError && e190.actionnable && e190.message.includes('expiré'), `190 : ${e190?.message}`)
  for (const code of [200, 10, 294]) {
    const e = await msg({ code, message: 'Requires ads_management' })
    exige(e?.message.includes('ads_management') === true && e?.message.includes('examen') === true && !(e as InstanceType<typeof SocialError>).actionnable, `${code} : ${e?.message}`)
  }
  for (const code of [17, 613, 80004]) {
    const e = await msg({ code, message: 'Too many calls' })
    exige(e?.message.includes('limité le débit') === true, `${code} : ${e?.message}`)
  }
  const e1487 = await msg({ code: 100, error_subcode: 1487222, message: 'Invalid parameter', error_user_msg: 'Votre compte doit avoir un moyen de paiement.' })
  exige(e1487?.message.includes('moyen de paiement') === true, `1487xxx : ${e1487?.message}`)
  const e100 = await msg({ code: 100, message: 'Invalid parameter', error_user_msg: 'Message pour le vendeur.' })
  exige(e100?.message.includes('Message pour le vendeur.') === true, `100 : ${e100?.message}`)
  scenario = 'ok'
} finally {
  serveur.close()
}

console.log(echecs === 0 ? 'Meta Ads : tout passe.' : `Meta Ads : ${echecs} echec(s).`)
process.exit(echecs === 0 ? 0 : 1)
