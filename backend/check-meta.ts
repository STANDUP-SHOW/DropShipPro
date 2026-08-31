import 'dotenv/config'
import { createServer } from 'http'
import { createHmac } from 'crypto'

/**
 * Éprouve l'adaptateur Meta natif contre un faux Graph API.
 *
 * Ce qu'il remplace : un moteur tiers à 6 $ par mois et par compte raccordé,
 * plus 0,20 $ la publication. Le coût fixe était le pire — il courait sur les
 * vendeurs dormants, et il aurait fallu le payer pour chacun des cent premiers
 * inscrits avant qu'un seul publie.
 *
 * Le faux serveur rejoue ce que Meta fait vraiment, y compris ses refus : ce
 * sont eux qui décident si le vendeur doit reconnecter, attendre, ou si c'est
 * notre application qui est en cause. Un adaptateur qui ne gère que le succès
 * ne dit rien de ce qui arrive en production.
 */

let echecs = 0
const exige = (condition: boolean, message: string) => {
  if (!condition) {
    echecs++
    console.log(`ECHEC : ${message}`)
  }
}

// --- Le faux Graph -----------------------------------------------------------

interface Appel {
  chemin: string
  methode: string
  params: Record<string, string>
}

const appels: Appel[] = []
let scenario: 'ok' | 'jetonExpire' | 'permissionManquante' | 'quota' = 'ok'

const serveur = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://local')
  let corps = ''
  for await (const morceau of req) corps += morceau

  const params: Record<string, string> = {}
  for (const [k, v] of new URLSearchParams(corps || url.search)) params[k] = v

  const chemin = url.pathname.replace(/^\/v\d+\.\d+\//, '')
  appels.push({ chemin, methode: req.method ?? 'GET', params })

  const refus = (code: number, message: string) => {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: { code, message } }))
  }

  // Un jeton expire casse les deux voies : la page **et** Instagram partagent
  // le meme jeton, puisque Meta n en delivre pas de separe pour Instagram.
  const publiant = /\/(photos|feed|media)$/.test(chemin)
  if (scenario === 'jetonExpire' && publiant) return refus(190, 'Session expired')
  if (scenario === 'permissionManquante' && chemin.includes('/photos')) {
    return refus(200, '(#200) Requires pages_manage_posts permission')
  }
  if (scenario === 'quota' && chemin.includes('/photos')) {
    return refus(4, 'Application request limit reached')
  }

  const repondre = (donnees: unknown) => {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(donnees))
  }

  if (chemin === 'oauth/access_token') {
    // Le premier échange rend un jeton court, le second un jeton long.
    return repondre({ access_token: params.grant_type ? 'JETON_LONG' : 'JETON_COURT' })
  }
  if (chemin === 'me/accounts') {
    return repondre({
      data: [
        {
          id: 'PAGE_1',
          name: 'OGGUS France',
          access_token: 'JETON_PAGE_1',
          instagram_business_account: { id: 'IG_1', username: 'oggus.fr' },
        },
        { id: 'PAGE_2', name: 'OGGUS High-Tech', access_token: 'JETON_PAGE_2' },
      ],
    })
  }
  if (chemin.endsWith('/photos')) {
    return repondre(params.published === 'false' ? { id: 'PHOTO_X' } : { post_id: 'POST_1', id: 'PHOTO_1' })
  }
  if (chemin.endsWith('/feed')) return repondre({ id: 'POST_FEED' })
  if (chemin.endsWith('/media')) return repondre({ id: 'CONTENEUR_1' })
  if (chemin.endsWith('/media_publish')) return repondre({ id: 'IG_POST_1' })

  res.writeHead(404)
  res.end('{}')
})

await new Promise<void>((resolve) => serveur.listen(0, resolve))
const port = (serveur.address() as { port: number }).port

process.env.META_GRAPH_URL = `http://127.0.0.1:${port}`
process.env.META_APP_ID = 'APP_TEST'
process.env.META_APP_SECRET = 'SECRET_TEST'
process.env.PUBLIC_API_URL = 'https://api.test'

// Importé après les variables : l'adaptateur les lit au chargement.
const { meta, enregistrerComptesMeta, oublierMeta, metaConfigure } = await import(
  './src/services/socialMeta.js'
)
const { prisma } = await import('./src/lib/prisma.js')

exige(metaConfigure(), "l'adaptateur doit se déclarer utilisable avec App ID et secret")

// --- Un vendeur jetable ------------------------------------------------------

const vendeur = await prisma.user.create({
  data: { email: `meta-${Date.now()}@banc.test`, passwordHash: 'x', shopName: 'Banc Meta' },
})

const nettoyer = async () => {
  await prisma.socialAccount.deleteMany({ where: { userId: vendeur.id } })
  await prisma.user.delete({ where: { id: vendeur.id } })
  serveur.close()
}

try {
  // --- Le raccordement -------------------------------------------------------

  const n = await enregistrerComptesMeta(vendeur.id, 'CODE_RETOUR', 'https://api.test/retour')
  exige(n === 3, `${n} comptes enregistrés, attendu 3 (2 pages + 1 Instagram)`)

  const comptes = await meta.listerComptes(vendeur.id)
  exige(comptes.length === 3, `${comptes.length} comptes listés`)
  exige(
    comptes.some((c) => c.platform === 'instagram' && c.externalId === 'IG_1'),
    'le compte Instagram lié doit être raccordé tout seul',
  )

  /*
   * Le jeton ne sort jamais du serveur.
   *
   * C'est la contrepartie du natif : avec un moteur tiers, le jeton restait chez
   * lui. Ici il vit chez nous, et un `findMany` sans `select` l'aurait envoyé au
   * navigateur avec le reste de la ligne. Un jeton de page publie au nom du
   * vendeur.
   */
  exige(
    !comptes.some((c) => 'token' in c),
    'la liste des comptes ne doit jamais porter de jeton',
  )

  // Deux échanges de jeton, pas un : le premier vit une heure, le second soixante jours.
  const echanges = appels.filter((a) => a.chemin === 'oauth/access_token')
  exige(echanges.length === 2, `${echanges.length} échanges de jeton, attendu 2`)
  exige(
    echanges[1].params.grant_type === 'fb_exchange_token',
    'le second échange doit demander la longue durée',
  )

  // --- La publication sur une page ------------------------------------------

  appels.length = 0
  const surPage = await meta.publier!(vendeur.id, {
    comptes: ['PAGE_1'],
    texte: 'Notre nouvelle montre automatique',
    medias: ['https://api.test/storage/photo.jpg'],
  })
  exige(surPage.etat === 'publiee', `état ${surPage.etat}`)
  exige(surPage.parCompte[0].url?.includes('POST_1') === true, `url rendue : ${surPage.parCompte[0].url}`)

  // --- Plusieurs photos : un album, pas cinq messages ------------------------

  appels.length = 0
  await meta.publier!(vendeur.id, {
    comptes: ['PAGE_1'],
    texte: 'Trois coloris',
    medias: ['https://a/1.jpg', 'https://a/2.jpg', 'https://a/3.jpg'],
  })
  const televersees = appels.filter((a) => a.chemin.endsWith('/photos'))
  exige(televersees.length === 3, `${televersees.length} photos téléversées`)
  exige(
    televersees.every((a) => a.params.published === 'false'),
    'chaque photo doit être téléversée sans être publiée',
  )
  const message = appels.find((a) => a.chemin.endsWith('/feed'))
  exige(Boolean(message), 'un seul message doit rassembler les photos')
  exige(
    message?.params['attached_media[0]']?.includes('PHOTO_X') === true,
    'les photos doivent être rattachées au message',
  )

  // --- Instagram : deux temps imposés ---------------------------------------

  appels.length = 0
  const surIg = await meta.publier!(vendeur.id, {
    comptes: ['IG_1'],
    texte: 'Disponible maintenant',
    medias: ['https://api.test/storage/photo.jpg'],
  })
  exige(surIg.etat === 'publiee', `Instagram : état ${surIg.etat}`)
  exige(
    appels.some((a) => a.chemin.endsWith('/media')) && appels.some((a) => a.chemin.endsWith('/media_publish')),
    'Instagram exige un conteneur puis une publication',
  )

  // Un texte seul est refusé **avant** l'appel, pas après : le refus arriverait
  // sinon au deuxième appel, après avoir laissé croire que ça partait.
  appels.length = 0
  const sansImage = await meta.publier!(vendeur.id, { comptes: ['IG_1'], texte: 'Sans visuel' })
  exige(sansImage.etat === 'echouee', 'Instagram sans image doit échouer')
  exige(appels.length === 0, 'et sans avoir appelé Meta')
  exige(
    sansImage.parCompte[0].erreur?.includes('au moins une image') === true,
    `message rendu : ${sansImage.parCompte[0].erreur}`,
  )

  // --- Un échec ne doit pas arrêter les autres comptes -----------------------

  scenario = 'jetonExpire'
  const partiel = await meta.publier!(vendeur.id, {
    comptes: ['PAGE_1', 'IG_1'],
    texte: 'Deux destinations',
    medias: ['https://a/1.jpg'],
  })
  exige(partiel.parCompte.length === 2, 'les deux comptes doivent porter un sort')
  exige(
    partiel.parCompte.every((c) => c.etat === 'echouee'),
    'jeton expiré : les deux échouent',
  )
  exige(
    partiel.parCompte[0].erreur?.includes('expiré') === true,
    `le vendeur doit lire qu'il faut reconnecter : ${partiel.parCompte[0].erreur}`,
  )

  // Une autorisation manquante est notre faute, pas la sienne : le message doit
  // le dire, sinon il cherche de son côté pendant des heures.
  scenario = 'permissionManquante'
  const refuse = await meta.publier!(vendeur.id, {
    comptes: ['PAGE_1'],
    texte: 'x',
    medias: ['https://a/1.jpg'],
  })
  exige(
    refuse.parCompte[0].erreur?.includes("L'application n'a pas encore reçu cette permission") === true,
    `message d'autorisation : ${refuse.parCompte[0].erreur}`,
  )

  scenario = 'quota'
  const limite = await meta.publier!(vendeur.id, {
    comptes: ['PAGE_1'],
    texte: 'x',
    medias: ['https://a/1.jpg'],
  })
  exige(
    limite.parCompte[0].erreur?.includes('limité le débit') === true,
    `message de quota : ${limite.parCompte[0].erreur}`,
  )
  scenario = 'ok'

  // --- L'isolation : un compte qui n'est pas le sien -------------------------

  const etranger = await meta.publier!(vendeur.id, {
    comptes: ['PAGE_DUN_AUTRE'],
    texte: 'x',
    medias: ['https://a/1.jpg'],
  })
  exige(
    etranger.parCompte[0].erreur?.includes("ne vous appartient pas") === true,
    'publier sur le compte d’un autre doit être refusé',
  )

  // --- Le lien d'autorisation -----------------------------------------------

  const lien = await meta.lienDeConnexion!(vendeur.id, 'facebook', 'https://ignore.moi')
  const u = new URL(lien)
  exige(u.hostname === 'www.facebook.com', `le vendeur s'authentifie chez Meta : ${u.hostname}`)
  // `state` porte l'identifiant du vendeur : sans lui, rejouer l'adresse de
  // retour rattacherait la page d'un vendeur au compte d'un autre.
  exige(u.searchParams.get('state') === vendeur.id, 'state doit porter le vendeur')
  exige(
    u.searchParams.get('redirect_uri') === 'https://api.test/api/public/social/meta/callback',
    `redirect_uri figée, reçue : ${u.searchParams.get('redirect_uri')}`,
  )
  const portee = u.searchParams.get('scope') ?? ''
  exige(portee.includes('pages_manage_posts'), 'la permission de publier doit être demandée')
  // Rien de publicitaire : le vendeur paie ses campagnes chez Meta, et
  // `ads_management` allongerait l'examen sans rien apporter.
  exige(!portee.includes('ads_management'), 'aucune permission publicitaire ne doit être demandée')

  // --- La suppression de données, exigée par Meta ----------------------------

  const efface = await oublierMeta(vendeur.id)
  exige(efface === 3, `${efface} comptes déconnectés, attendu 3`)
  const apres = await prisma.socialAccount.findMany({
    where: { userId: vendeur.id },
    select: { token: true, connected: true },
  })
  exige(
    apres.every((c) => c.token === null && !c.connected),
    'aucun jeton ne doit survivre à la suppression',
  )

  // La signature de Meta, vérifiée comme le fait la route.
  const charge = Buffer.from(JSON.stringify({ user_id: '42' })).toString('base64url')
  const signature = createHmac('sha256', 'SECRET_TEST').update(charge).digest('base64url')
  exige(signature.length > 20, 'la signature doit être calculable')
  const fausse = createHmac('sha256', 'AUTRE_SECRET').update(charge).digest('base64url')
  exige(signature !== fausse, 'une signature calculée avec un autre secret doit différer')
} finally {
  await nettoyer()
  await prisma.$disconnect()
}

console.log(
  echecs === 0 ? 'Adaptateur Meta : tout passe.' : `Adaptateur Meta : ${echecs} echec(s).`,
)
process.exit(echecs === 0 ? 0 : 1)
