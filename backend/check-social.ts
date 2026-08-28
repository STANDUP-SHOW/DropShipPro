import http from 'http'

/**
 * Éprouve la passerelle sociale contre un faux moteur.
 *
 * **Ce que ce banc prouve.** Que la correspondance vendeur ↔ profil ↔ comptes
 * tient chez nous, que l'isolation entre vendeurs est réelle, et qu'un compte
 * déconnecté est refusé avant l'appel plutôt qu'après.
 *
 * **Ce qu'il ne prouve pas.** Que le contrat de Zernio est celui-là : nous
 * n'avons pas de clé. Le faux serveur rend ce que la documentation annonce.
 *
 * L'isolation est le point critique, et il n'est pas théorique : la
 * documentation dit que le moteur valide les comptes contre **toute l'équipe**,
 * pas contre le profil. Un identifiant de compte copié publierait donc sur la
 * boutique d'un autre client — côté moteur, ce serait accepté.
 */

const PORT = 8797
process.env.ZERNIO_API_URL = `http://127.0.0.1:${PORT}/v1`
process.env.ZERNIO_API_KEY = 'cle-de-banc'

const { prisma } = await import('./src/lib/prisma.js')
const passerelle = await import('./src/services/socialGateway.js')
const { SocialError } = await import('./src/services/socialTypes.js')

let echecs = 0
const exige = (condition: boolean, message: string) => {
  if (!condition) {
    echecs++
    console.log(`ECHEC : ${message}`)
  }
}

/** Ce que le faux moteur a vu passer, pour vérifier ensuite. */
const vus: Array<{ url: string; requestId: string | null; corps: string }> = []
let compteurProfils = 0

const serveur = http.createServer((req, res) => {
  let brut = ''
  req.on('data', (c) => (brut += c))
  req.on('end', () => {
    const url = req.url ?? ''
    vus.push({ url, requestId: (req.headers['x-request-id'] as string) ?? null, corps: brut })

    const repondre = (code: number, corps: unknown) => {
      res.writeHead(code, { 'content-type': 'application/json' })
      res.end(JSON.stringify(corps))
    }

    if (req.headers.authorization !== 'Bearer cle-de-banc') {
      return repondre(401, { error: { code: 'unauthorized' } })
    }

    if (url.startsWith('/v1/profiles') && req.method === 'POST') {
      compteurProfils++
      return repondre(200, { _id: `prof_${compteurProfils}` })
    }

    if (url.startsWith('/v1/accounts')) {
      return repondre(200, {
        data: [
          { _id: 'acc_fb', platform: 'facebook', name: 'OGGUS France' },
          { _id: 'acc_ig', platform: 'instagram', name: 'oggus.fr' },
          { _id: 'acc_meta', platform: 'meta-ads', name: 'OGGUS Ads' },
          { _id: 'acc_mort', platform: 'tiktok', name: 'Ancien TikTok', disconnected: true },
        ],
      })
    }

    if (url.startsWith('/v1/connect/')) {
      return repondre(200, { url: 'https://facebook.com/oauth/fake' })
    }

    if (url.startsWith('/v1/posts')) {
      return repondre(200, {
        _id: 'post_1',
        status: 'published',
        results: [{ accountId: 'acc_fb', status: 'published', url: 'https://fb.com/p/1' }],
      })
    }

    if (url.startsWith('/v1/ads/create')) {
      return repondre(200, { _id: 'camp_1', status: 'in_review' })
    }

    repondre(404, { error: { code: 'not_found' } })
  })
})

await new Promise<void>((r) => serveur.listen(PORT, '127.0.0.1', r))

const marque = `banc-social-${Date.now()}`
const vendeur = await prisma.user.create({
  data: { email: `${marque}-a@exemple.test`, passwordHash: 'x', shopName: 'OGGUS' },
})
const voisin = await prisma.user.create({
  data: { email: `${marque}-b@exemple.test`, passwordHash: 'x', shopName: 'Voisin' },
})

try {
  exige(passerelle.socialConfigure(), 'le module doit se declarer configure quand la cle est posee')

  // --- Le profil se cree une fois, puis se relit ---------------------------
  const profil = await passerelle.profilDe(vendeur.id)
  exige(profil === 'prof_1', `profil ${profil}, attendu prof_1`)

  const encore = await passerelle.profilDe(vendeur.id)
  exige(encore === 'prof_1', 'le profil doit etre relu, pas recree')
  exige(compteurProfils === 1, `${compteurProfils} profils crees, attendu 1`)

  // Le nom porte notre identifiant : sans lui, un profil orphelin cote moteur
  // ne se rattache a personne.
  const creation = vus.find((v) => v.url.startsWith('/v1/profiles'))
  exige(
    creation?.corps.includes(vendeur.id) ?? false,
    'le nom du profil doit porter l identifiant interne du vendeur',
  )

  // --- La synchronisation garde les comptes -------------------------------
  const comptes = await passerelle.synchroniserComptes(vendeur.id)
  exige(comptes.length === 4, `${comptes.length} comptes gardes, attendu 4`)

  const pub = comptes.filter((c) => c.isAdAccount)
  exige(pub.length === 1 && pub[0].externalId === 'acc_meta', 'meta-ads doit etre marque publicitaire')

  const mort = comptes.find((c) => c.externalId === 'acc_mort')
  exige(mort?.connected === false, 'un compte deconnecte doit etre marque comme tel')

  // Resynchroniser ne duplique rien.
  const encore2 = await passerelle.synchroniserComptes(vendeur.id)
  exige(encore2.length === 4, `${encore2.length} comptes apres resynchro, attendu 4`)

  // --- L'isolation, le point critique -------------------------------------
  let etranger: unknown = null
  try {
    // Le voisin tente de publier sur le compte du premier vendeur. Cote moteur,
    // ce serait accepte : la validation porte sur l equipe, pas sur le profil.
    await passerelle.publier(voisin.id, { comptes: ['acc_fb'], texte: 'coucou' })
  } catch (e) {
    etranger = e
  }
  exige(etranger instanceof SocialError, 'publier sur le compte d un autre doit lever')
  exige(
    /ne vous appartient pas/i.test((etranger as Error)?.message ?? ''),
    `message inattendu : ${(etranger as Error)?.message}`,
  )

  // Et rien ne doit etre parti sur le reseau.
  exige(
    !vus.some((v) => v.url.startsWith('/v1/posts')),
    'un refus d isolation ne doit declencher aucun appel',
  )

  // --- Un compte deconnecte est refuse avant l'appel -----------------------
  let coupe: unknown = null
  try {
    await passerelle.publier(vendeur.id, { comptes: ['acc_mort'], texte: 'test' })
  } catch (e) {
    coupe = e
  }
  exige(
    (coupe as InstanceType<typeof SocialError>)?.actionnable === true,
    'un compte coupe doit etre actionnable',
  )
  exige(
    /plus connect/i.test((coupe as Error)?.message ?? ''),
    `message inattendu : ${(coupe as Error)?.message}`,
  )

  // --- La publication qui doit passer --------------------------------------
  const resultat = await passerelle.publier(vendeur.id, { comptes: ['acc_fb'], texte: 'bonjour' })
  exige(resultat.externalId === 'post_1', `publication ${resultat.externalId}`)
  exige(resultat.parCompte[0]?.url === 'https://fb.com/p/1', 'l adresse du post doit remonter')

  // L idempotence : sans identifiant de requete, un double clic publie deux fois.
  const envoi = vus.find((v) => v.url.startsWith('/v1/posts'))
  exige(Boolean(envoi?.requestId), 'chaque publication doit porter un x-request-id')

  // --- Une campagne ne part pas depuis une page ----------------------------
  let mauvaisCompte: unknown = null
  try {
    await passerelle.creerCampagne(vendeur.id, {
      compte: 'acc_fb',
      nom: 'essai',
      objectif: 'trafic',
      budgetJour: 1000,
      creative: { image: 'https://x/i.jpg', titre: 't', texte: 'b', url: 'https://x' },
    })
  } catch (e) {
    mauvaisCompte = e
  }
  exige(
    /compte publicitaire/i.test((mauvaisCompte as Error)?.message ?? ''),
    'une campagne depuis une page doit etre refusee avec la raison',
  )

  const campagne = await passerelle.creerCampagne(vendeur.id, {
    compte: 'acc_meta',
    nom: 'essai',
    objectif: 'trafic',
    budgetJour: 1000,
    creative: { image: 'https://x/i.jpg', titre: 't', texte: 'b', url: 'https://x' },
  })
  exige(campagne.externalId === 'camp_1', `campagne ${campagne.externalId}`)
  // Aucune regie n active a la creation : annoncer « active » ferait croire a
  // une diffusion qui n a pas commence.
  exige(campagne.etat !== 'active', `etat ${campagne.etat} : une campagne neuve n est jamais active`)

  console.log(echecs === 0 ? 'Passerelle sociale : tout passe.' : `${echecs} echec(s).`)
  process.exitCode = echecs === 0 ? 0 : 1
} finally {
  serveur.close()
  await prisma.user.deleteMany({ where: { id: { in: [vendeur.id, voisin.id] } } })
  await prisma.$disconnect()
}
