import 'dotenv/config'
import express from 'express'
import type { AddressInfo } from 'net'

/**
 * Le circuit d'une place de marché à autorisation, de bout en bout côté
 * DropShipper : retour d'autorisation → liaison éprouvée → diffusion.
 *
 * Les connecteurs (TikTok Shop, Amazon, Allegro) ont chacun leur banc contre
 * un faux serveur. Celui-ci vérifie ce qui les relie à l'application, avec une
 * vraie base jetable : que « connecté » n'est posé qu'après un appel réel
 * réussi, qu'un `state` forgé ne relie rien, que la diffusion dit « en attente »
 * avec le geste à faire tant que rien n'est relié, et qu'un jeton qui tourne
 * pendant un dépôt est gardé. C'est exactement ce qui manquait le 03/10/2026 :
 * l'écran disait « connecté » sur des plateformes sans une ligne d'envoi.
 *
 * Jamais la production : DATABASE_URL doit pointer une base jetable.
 */

process.env.JWT_SECRET ||= 'secret-de-banc'
process.env.PUBLIC_API_URL = 'https://api.test'

let echecs = 0
const exige = (condition: boolean, message: string, detail?: unknown) => {
  console.log(`${condition ? 'ok   ' : 'ECHEC'} ${message}${!condition && detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`)
  if (!condition) echecs++
}

const { prisma } = await import('./src/lib/prisma.js')
const { enregistrerConnecteur } = await import('./src/services/marchesApi.js')
await import('./src/services/marches.js')
const { signerEtat } = await import('./src/services/oauthEtat.js')
const { marchesPublicRouter } = await import('./src/routes/marches.js')
const { publishToPlatform } = await import('./src/services/publisher.js')

/*
 * Un faux connecteur Allegro, posé par-dessus le vrai : le banc éprouve le
 * circuit, pas l'API d'Allegro (check-allegro.ts s'en charge).
 */
let appConfiguree = false
let verificationRefusee = false
const deposes: string[] = []
enregistrerConnecteur({
  platform: 'ALLEGRO',
  label: 'Allegro',
  appConfiguree: () => appConfiguree,
  manque: () => "L'application Allegro de DropShipper n'est pas déclarée : ALLEGRO_CLIENT_ID et ALLEGRO_CLIENT_SECRET manquent.",
  lienAutorisation: (etat, retour) => `https://allegro.test/auth?state=${etat}&redirect_uri=${encodeURIComponent(retour)}`,
  finaliser: async (params) => {
    if (params.code !== 'bon-code') throw new Error('Code refusé par Allegro.')
    return { data: { accessToken: 'a1', refreshToken: 'r1' }, label: 'vendeur-pl' }
  },
  lire: (data) => {
    const d = data as { accessToken?: string; refreshToken?: string }
    return d?.accessToken && d?.refreshToken ? { accessToken: d.accessToken, refreshToken: d.refreshToken } : null
  },
  verifier: async () => {
    if (verificationRefusee) throw new Error('Compte Allegro non vérifié.')
  },
  deposer: async (creds, produit) => {
    deposes.push(`${produit.id}:${(creds as { accessToken: string }).accessToken}`)
    return { note: 'Offre active.', url: 'https://allegro.pl/oferta/42', majCreds: { accessToken: 'a2', refreshToken: 'r2' } }
  },
})

const marque = `marches-${Date.now()}`
const vendeur = await prisma.user.create({ data: { email: `${marque}@exemple.test`, passwordHash: 'x', credits: 0 } })
const produit = await prisma.product.create({
  data: {
    userId: vendeur.id,
    sourceUrl: 'https://exemple.test/p',
    images: ['https://exemple.test/a.jpg'],
    price: 10,
    sellingPrice: 30,
    title: 'Lampe de bureau',
    description: 'Une lampe.',
    imagesWatermarked: false,
  },
})

const app = express()
app.use('/api/public/marches', marchesPublicRouter)
const serveur = app.listen(0)
const base = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}/api/public/marches`
const retour = async (chemin: string) => {
  const r = await fetch(base + chemin, { redirect: 'manual' })
  return r.headers.get('location') ?? ''
}
const credential = () =>
  prisma.platformCredential.findUnique({ where: { userId_platform: { userId: vendeur.id, platform: 'ALLEGRO' } } })

try {
  // 1. Rien de déclaré : la diffusion attend, et dit pourquoi.
  let pub = await publishToPlatform(produit.id, 'ALLEGRO')
  exige(pub.status === 'PENDING' && /ALLEGRO_CLIENT_ID/.test(pub.error ?? ''), "app non déclarée : en attente, avec ce qui manque", pub.error)

  // 2. App déclarée, compte non relié : en attente, avec le geste.
  appConfiguree = true
  pub = await publishToPlatform(produit.id, 'ALLEGRO')
  exige(pub.status === 'PENDING' && /Relier mon compte Allegro/.test(pub.error ?? ''), 'compte non relié : en attente, avec le bouton à cliquer', pub.error)

  // 3. Un state forgé ne relie rien.
  let loc = await retour(`/allegro/callback?code=bon-code&state=${vendeur.id}`)
  exige(/marche=inconnu/.test(loc) && !(await credential()), 'state non signé : refusé, rien enregistré', loc)

  // 4. Un state signé pour une autre plateforme ne relie pas Allegro.
  loc = await retour(`/allegro/callback?code=bon-code&state=${encodeURIComponent(signerEtat(vendeur.id, 'AMAZON'))}`)
  exige(/marche=inconnu/.test(loc) && !(await credential()), 'state d’une autre plateforme : refusé', loc)

  // 5. La vérification échoue : pas « connecté ».
  verificationRefusee = true
  loc = await retour(`/allegro/callback?code=bon-code&state=${encodeURIComponent(signerEtat(vendeur.id, 'ALLEGRO'))}`)
  exige(/marche=erreur/.test(loc) && /non%20v%C3%A9rifi%C3%A9/.test(loc), 'vérification refusée : erreur affichée', loc)
  exige(!(await credential())?.connected, 'vérification refusée : jamais marqué connecté')

  // 6. Le bon chemin : relié après un appel réussi.
  verificationRefusee = false
  loc = await retour(`/allegro/callback?code=bon-code&state=${encodeURIComponent(signerEtat(vendeur.id, 'ALLEGRO'))}`)
  const cred = await credential()
  exige(/marche=ok/.test(loc) && /\/plateformes-vente/.test(loc), 'retour réussi : renvoi vers les plateformes de vente', loc)
  exige(Boolean(cred?.connected) && cred?.label === 'vendeur-pl', 'compte relié, avec son nom', cred)

  // 7. La diffusion publie, et garde le jeton qui a tourné.
  pub = await publishToPlatform(produit.id, 'ALLEGRO')
  exige(pub.status === 'PUBLISHED' && pub.externalUrl === 'https://allegro.pl/oferta/42', 'publiée, avec l’adresse de l’offre', pub)
  exige(deposes.at(-1) === `${produit.id}:a1`, 'le dépôt a reçu les identifiants enregistrés', deposes)
  const apres = (await credential())?.data as { accessToken?: string; refreshToken?: string }
  exige(apres?.accessToken === 'a2' && apres?.refreshToken === 'r2', 'le jeton tourné pendant le dépôt est gardé', apres)

  // 8. Le vrai connecteur Amazon, sans app déclarée : en attente, pas « publiée ».
  delete process.env.AMAZON_LWA_CLIENT_ID
  pub = await publishToPlatform(produit.id, 'AMAZON')
  exige(pub.status === 'PENDING', 'Amazon sans app déclarée : en attente', pub)
} finally {
  await prisma.publication.deleteMany({ where: { productId: produit.id } })
  await prisma.product.delete({ where: { id: produit.id } })
  await prisma.platformCredential.deleteMany({ where: { userId: vendeur.id } })
  await prisma.user.delete({ where: { id: vendeur.id } })
  serveur.close()
  await prisma.$disconnect()
}

console.log(echecs ? `\n${echecs} échec(s).` : '\nCircuit des places de marché : tout passe.')
process.exitCode = echecs ? 1 : 0
