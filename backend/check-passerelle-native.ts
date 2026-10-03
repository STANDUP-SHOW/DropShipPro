import 'dotenv/config'

/**
 * La passerelle sociale avec nos connexions maison (03/10/2026).
 *
 * Zernio n'est plus le moteur par défaut : chaque plateforme a le sien (Meta,
 * Meta Ads, TikTok, TikTok Ads, Pinterest, Pinterest Ads). Ce banc vérifie
 * l'aiguillage, avec une base jetable :
 *
 * - l'écran ne propose que les plateformes dont le connecteur est écrit, et
 *   dit « en attente » celles dont l'application n'a pas ses clés ;
 * - un lien de connexion part chez le bon moteur, avec un `state` signé ;
 * - une publication vers plusieurs comptes part chez le moteur de chaque
 *   compte, et un refus d'un côté n'efface pas le résultat de l'autre.
 *
 * Jamais la production : DATABASE_URL doit pointer une base jetable.
 */

process.env.JWT_SECRET ||= 'secret-de-banc'
delete process.env.SOCIAL_PROVIDER
for (const v of ['META_APP_ID', 'META_APP_SECRET', 'TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET', 'TIKTOK_ADS_APP_ID', 'TIKTOK_ADS_SECRET', 'PINTEREST_APP_ID', 'PINTEREST_APP_SECRET']) {
  delete process.env[v]
}

let echecs = 0
const exige = (condition: boolean, message: string, detail?: unknown) => {
  console.log(`${condition ? 'ok   ' : 'ECHEC'} ${message}${!condition && detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`)
  if (!condition) echecs++
}

const { prisma } = await import('./src/lib/prisma.js')
const passerelle = await import('./src/services/socialGateway.js')
const { lireEtat } = await import('./src/services/oauthEtat.js')

// 1. Rien de déclaré : rien d'utilisable, mais tout ce qui est écrit est listé.
let dispo = passerelle.plateformesDisponibles()
const ecrites = dispo.map((d) => d.platform).sort()
exige(
  JSON.stringify(ecrites) === JSON.stringify(['facebook', 'instagram', 'meta-ads', 'pinterest', 'pinterest-ads', 'tiktok', 'tiktok-ads']),
  'les sept plateformes écrites, et seulement elles',
  ecrites,
)
exige(!passerelle.socialConfigure() && dispo.every((d) => !d.prete), 'sans clés : rien de prêt, rien de promis')

// 2. Les clés de TikTok seules : TikTok prêt, le reste en attente.
process.env.TIKTOK_CLIENT_KEY = 'cle'
process.env.TIKTOK_CLIENT_SECRET = 'secret'
dispo = passerelle.plateformesDisponibles()
exige(dispo.find((d) => d.platform === 'tiktok')?.prete === true, 'TikTok prêt avec ses clés')
exige(dispo.find((d) => d.platform === 'tiktok-ads')?.prete === false, 'TikTok Ads attend les siennes')
exige(dispo.find((d) => d.platform === 'tiktok-ads')?.regie === true, 'TikTok Ads est une régie')

const marque = `passerelle-${Date.now()}`
const vendeur = await prisma.user.create({ data: { email: `${marque}@exemple.test`, passwordHash: 'x', credits: 0 } })

try {
  // 3. Le lien part chez TikTok, avec un state signé pour ce vendeur.
  const lien = new URL(await passerelle.lienDeConnexion(vendeur.id, 'tiktok', 'https://www.drop-shipper.fr/reseaux'))
  exige(lien.hostname.endsWith('tiktok.com'), 'le lien TikTok part chez TikTok', lien.hostname)
  exige(lireEtat(lien.searchParams.get('state') ?? '')?.userId === vendeur.id, 'state signé, pour ce vendeur')

  // 4. Une plateforme sans connecteur : refus clair, pas de lien vers nulle part.
  let refus = ''
  try {
    await passerelle.lienDeConnexion(vendeur.id, 'youtube', 'https://www.drop-shipper.fr/reseaux')
  } catch (err) {
    refus = err instanceof Error ? err.message : String(err)
  }
  exige(/pas propos/.test(refus), 'YouTube (pas de connecteur) : refus clair', refus)

  // 5. Publier sur deux comptes de deux moteurs : chaque refus reste à sa ligne.
  await prisma.socialAccount.createMany({
    data: [
      { userId: vendeur.id, provider: 'pinterest', externalId: `${marque}-pin`, platform: 'pinterest', label: 'Mon Pinterest', token: 't', connected: true },
      { userId: vendeur.id, provider: 'disparu', externalId: `${marque}-x`, platform: 'x', label: 'Vieux moteur', connected: true },
    ],
  })
  const r = await passerelle.publier(vendeur.id, { comptes: [`${marque}-pin`, `${marque}-x`], texte: 'Nouvelle lampe' })
  const pin = r.parCompte.find((c) => c.compte === `${marque}-pin`)
  const x = r.parCompte.find((c) => c.compte === `${marque}-x`)
  exige(r.parCompte.length === 2 && r.etat === 'echouee', 'deux lignes, publication échouée en tout', r)
  exige(/image/i.test(pin?.erreur ?? ''), 'Pinterest refuse un texte sans image, avec la raison', pin)
  exige(/ne sait pas encore/.test(x?.erreur ?? ''), 'un compte d’un moteur inconnu est dit, pas avalé', x)

  // 6. Un compte d'un autre vendeur n'est jamais publiable.
  let etranger = ''
  try {
    await passerelle.publier(vendeur.id, { comptes: ['compte-d-un-autre'], texte: 'x' })
  } catch (err) {
    etranger = err instanceof Error ? err.message : String(err)
  }
  exige(/ne vous appartient pas/.test(etranger), 'compte étranger : refusé', etranger)
} finally {
  await prisma.socialAccount.deleteMany({ where: { userId: vendeur.id } })
  await prisma.user.delete({ where: { id: vendeur.id } })
  await prisma.$disconnect()
}

console.log(echecs ? `\n${echecs} échec(s).` : '\nPasserelle sociale native : tout passe.')
process.exitCode = echecs ? 1 : 0
