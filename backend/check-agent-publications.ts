/**
 * Banc : la file de publication de l'application desktop (routes/agent.ts,
 * GET /publications et POST /publications/:id/resultat), sur des comptes
 * JETABLES créés et détruits ici.
 *
 * Ce qu'il vérifie : seules les publications PENDING des places de marché à
 * session sortent, celles du compte de la clé seulement ; le résultat ne touche
 * qu'une publication PENDING de ce compte ; un autre compte ne peut rien voir ni
 * modifier ; une clé révoquée ne passe pas.
 */
import express from 'express'
import type { AddressInfo } from 'node:net'
import { prisma } from './src/lib/prisma.js'
import { agentRouter } from './src/routes/agent.js'
import { generateApiKey } from './src/middleware/apiKey.js'

let echecs = 0
function verifier(nom: string, condition: boolean, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail && !condition ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

async function main() {
  const marque = `banc-agent-pub-${Date.now()}`
  const user = await prisma.user.create({ data: { email: `${marque}@exemple.test`, passwordHash: 'x', credits: 0 } })
  const autre = await prisma.user.create({ data: { email: `${marque}-autre@exemple.test`, passwordHash: 'x', credits: 0 } })
  const cle = generateApiKey()
  const cleAutre = generateApiKey()
  const cleRevoquee = generateApiKey()
  await prisma.apiKey.create({ data: { userId: user.id, name: 'banc', keyHash: cle.keyHash, prefix: cle.prefix } })
  await prisma.apiKey.create({ data: { userId: autre.id, name: 'banc autre', keyHash: cleAutre.keyHash, prefix: cleAutre.prefix } })
  await prisma.apiKey.create({ data: { userId: user.id, name: 'revoquee', keyHash: cleRevoquee.keyHash, prefix: cleRevoquee.prefix, revokedAt: new Date() } })

  const app = express()
  app.use(express.json())
  app.use('/api/agent', agentRouter)
  const serveur = app.listen(0, '127.0.0.1')
  await new Promise((r) => serveur.once('listening', r))
  const base = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}/api/agent`
  const appel = async (methode: string, chemin: string, k: string, corps?: unknown) => {
    const r = await fetch(base + chemin, {
      method: methode,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${k}` },
      body: corps === undefined ? undefined : JSON.stringify(corps),
    })
    return { statut: r.status, json: (await r.json().catch(() => ({}))) as Record<string, any> }
  }

  try {
    const base_ = { userId: user.id, sourceUrl: 'https://exemple.test/p', images: ['https://exemple.test/a.jpg'], price: 10, sellingPrice: 30, imagesWatermarked: true }
    const lampe = await prisma.product.create({ data: { ...base_, title: 'Lampe de bureau', description: 'Une lampe.', condition: 'reconditionne' } })
    const tapis = await prisma.product.create({ data: { ...base_, title: 'Tapis', description: 'Un tapis.' } })
    const chezAutre = await prisma.product.create({ data: { ...base_, userId: autre.id, title: 'Chez un autre', description: 'x' } })

    const pVinted = await prisma.publication.create({ data: { productId: lampe.id, platform: 'VINTED', status: 'PENDING', targetCategory: 'Maison > Luminaires' } })
    const pLbc = await prisma.publication.create({ data: { productId: tapis.id, platform: 'LEBONCOIN', status: 'PENDING' } })
    await prisma.publication.create({ data: { productId: lampe.id, platform: 'EBAY', status: 'PENDING' } })
    await prisma.publication.create({ data: { productId: tapis.id, platform: 'VINTED', status: 'PUBLISHED' } })
    await prisma.publication.create({ data: { productId: chezAutre.id, platform: 'VINTED', status: 'PENDING' } })

    console.log('Lecture de la file')
    const r = await appel('GET', '/publications', cle.key)
    const ids = (r.json.publications ?? []).map((p: { id: string }) => p.id).sort()
    verifier('seules les PENDING des places à session du compte sortent (2 sur 5)', r.statut === 200 && ids.length === 2 && ids.join() === [pVinted.id, pLbc.id].sort().join(), JSON.stringify(r.json).slice(0, 200))
    const v = (r.json.publications ?? []).find((p: { id: string }) => p.id === pVinted.id)
    verifier('la fiche porte titre, prix, photos, catégorie', v?.title === 'Lampe de bureau' && v.price === 30 && v.images.length === 1 && v.category === 'Maison > Luminaires')
    verifier('l’état est traduit pour la plateforme (reconditionné → « Très bon état » sur Vinted)', v?.condition === 'Très bon état', String(v?.condition))
    const filtre = await appel('GET', '/publications?platform=leboncoin', cle.key)
    verifier('filtre par plateforme', filtre.json.count === 1 && filtre.json.publications[0].id === pLbc.id)
    const autreVue = await appel('GET', '/publications', cleAutre.key)
    verifier('un autre compte ne voit que les siennes', autreVue.json.count === 1 && autreVue.json.publications[0].title === 'Chez un autre')
    verifier('clé révoquée : 401', (await appel('GET', '/publications', cleRevoquee.key)).statut === 401)

    console.log('\nRésultat')
    verifier('résultat invalide refusé (400)', (await appel('POST', `/publications/${pVinted.id}/resultat`, cle.key, { status: 'DONE' })).statut === 400)
    const intrus = await appel('POST', `/publications/${pVinted.id}/resultat`, cleAutre.key, { status: 'PUBLISHED' })
    verifier('un autre compte ne peut pas clore la publication (404)', intrus.statut === 404 && (await prisma.publication.findUniqueOrThrow({ where: { id: pVinted.id } })).status === 'PENDING')
    const ok = await appel('POST', `/publications/${pVinted.id}/resultat`, cle.key, { status: 'PUBLISHED', externalUrl: 'https://www.vinted.fr/items/123-lampe' })
    const apres = await prisma.publication.findUniqueOrThrow({ where: { id: pVinted.id } })
    verifier('publiée : statut, adresse et date écrits', ok.statut === 200 && apres.status === 'PUBLISHED' && apres.externalUrl === 'https://www.vinted.fr/items/123-lampe' && !!apres.publishedAt)
    verifier('déjà traitée : refusée, pas rejouée (404)', (await appel('POST', `/publications/${pVinted.id}/resultat`, cle.key, { status: 'FAILED' })).statut === 404)
    const echec = await appel('POST', `/publications/${pLbc.id}/resultat`, cle.key, { status: 'FAILED', error: 'Captcha vu' })
    const apresEchec = await prisma.publication.findUniqueOrThrow({ where: { id: pLbc.id } })
    verifier('échec : statut FAILED et raison écrite', echec.statut === 200 && apresEchec.status === 'FAILED' && apresEchec.error === 'Captcha vu')
    const ebay = await prisma.publication.findFirstOrThrow({ where: { productId: lampe.id, platform: 'EBAY' } })
    verifier('une publication hors places à session est refusée (404)', (await appel('POST', `/publications/${ebay.id}/resultat`, cle.key, { status: 'PUBLISHED' })).statut === 404)
    verifier('la file ne rend plus les traitées', (await appel('GET', '/publications', cle.key)).json.count === 0)
  } finally {
    serveur.close()
    await prisma.publication.deleteMany({ where: { product: { userId: { in: [user.id, autre.id] } } } })
    await prisma.product.deleteMany({ where: { userId: { in: [user.id, autre.id] } } })
    await prisma.apiKey.deleteMany({ where: { userId: { in: [user.id, autre.id] } } })
    await prisma.user.deleteMany({ where: { id: { in: [user.id, autre.id] } } })
    await prisma.$disconnect()
  }

  if (echecs) {
    console.error(`\n${echecs} attente(s) manquée(s).`)
    process.exitCode = 1
    return
  }
  console.log('\nFile de publication desktop : tout passe.')
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exitCode = 1
})
