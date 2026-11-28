/**
 * Banc : un Ctrl+C ne devient jamais un produit (28/11/2026), sur des comptes
 * JETABLES créés et détruits ici.
 *
 * Une application desktop d'avant 0.5.4 envoie encore chaque adresse copiée
 * avec la source « presse-papiers ». Vérifie que le serveur la refuse, ne rend
 * jamais à l'application les liens déjà en file, n'importe aucun d'eux, laisse
 * passer les partages voulus (desktop, mobile), et que le script de nettoyage
 * ne retient que les produits issus de ces liens, sans commande ni publication.
 */
import express from 'express'
import type { AddressInfo } from 'node:net'
import { execFileSync } from 'node:child_process'
import { prisma } from './src/lib/prisma.js'
import { agentRouter } from './src/routes/agent.js'
import { generateApiKey } from './src/middleware/apiKey.js'

let echecs = 0
function verifier(nom: string, condition: boolean, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail && !condition ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

async function main() {
  const marque = `banc-presse-${Date.now()}`
  const user = await prisma.user.create({ data: { email: `${marque}@exemple.test`, passwordHash: 'x', credits: 100 } })
  const cleDesk = generateApiKey('desktop')
  await prisma.apiKey.create({ data: { userId: user.id, name: 'desktop', keyHash: cleDesk.keyHash, prefix: cleDesk.prefix } })

  const app = express()
  app.use(express.json())
  app.use('/api/agent', agentRouter)
  const serveur = app.listen(0, '127.0.0.1')
  await new Promise((r) => serveur.once('listening', r))
  const base = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}/api/agent`
  const appel = async (methode: string, chemin: string, corps?: unknown) => {
    const r = await fetch(base + chemin, {
      method: methode,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cleDesk.key}` },
      body: corps === undefined ? undefined : JSON.stringify(corps),
    })
    return { statut: r.status, json: (await r.json().catch(() => ({}))) as Record<string, any> }
  }

  try {
    const r1 = await appel('POST', '/share', { url: 'https://www.youtube.com/watch?v=abc', source: 'presse-papiers' })
    verifier('une adresse copiée (source presse-papiers) est refusée (410)', r1.statut === 410, JSON.stringify(r1))
    verifier('… et rien n’est rangé', (await prisma.sharedLink.count({ where: { userId: user.id } })) === 0)

    const r2 = await appel('POST', '/share', { url: 'https://fr.aliexpress.com/item/1005006000000001.html', source: 'desktop' })
    verifier('un partage voulu (desktop) passe toujours', r2.statut === 201, JSON.stringify(r2))
    const r3 = await appel('POST', '/share', { url: 'https://www.temu.com/fr/x-g-601099512345678.html' })
    verifier('un partage mobile passe toujours', r3.statut === 201, JSON.stringify(r3))

    // A clipboard link queued before the fix, and the fake product it already made.
    const ancien = await prisma.sharedLink.create({ data: { userId: user.id, url: 'https://mail.google.com/mail/u/0/#inbox', source: 'presse-papiers', createdAt: new Date(Date.now() - 3600_000) } })
    const r4 = await appel('GET', '/share?status=NEW')
    verifier('les liens presse-papiers en file ne sont plus rendus à l’application', r4.json.count === 2 && !r4.json.links.some((l: { id: string }) => l.id === ancien.id), JSON.stringify(r4.json))
    const solde = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).credits
    const r5 = await appel('POST', '/import', { url: ancien.url, shareId: ancien.id })
    verifier('un lien presse-papiers n’est jamais importé (410), sans débit', r5.statut === 410 && (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).credits === solde, JSON.stringify(r5))

    const p = { userId: user.id, images: [], price: 1, sellingPrice: 2, description: 'x' }
    const faux = await prisma.product.create({ data: { ...p, title: 'Faux produit Gmail', sourceUrl: ancien.url } })
    const ancien2 = await prisma.sharedLink.create({ data: { userId: user.id, url: 'https://exemple.test/vendu', source: 'presse-papiers', createdAt: new Date(Date.now() - 3600_000) } })
    const vendu = await prisma.product.create({ data: { ...p, title: 'Issu du presse-papiers mais vendu', sourceUrl: ancien2.url } })
    await prisma.order.create({ data: { userId: user.id, productId: vendu.id, platform: 'EBAY', buyerName: 'A', buyerAddress: {}, amount: 2 } })
    const vrai = await prisma.product.create({ data: { ...p, title: 'Vrai produit AliExpress', sourceUrl: 'https://fr.aliexpress.com/item/1005006000000001.html' } })
    const avant = await prisma.product.create({ data: { ...p, title: 'Même adresse, créé avant le lien', sourceUrl: ancien.url, createdAt: new Date(Date.now() - 7200_000) } })

    const sec = execFileSync('npx', ['tsx', 'nettoyer-presse-papiers.ts', '--compte', user.id], { encoding: 'utf8' })
    verifier('nettoyage sans --ecrire : compte 1 supprimable, 1 gardé, rien écrit', /supprimables : 1\b/.test(sec) && /GARDÉS .* : 1\b/.test(sec) && (await prisma.product.count({ where: { userId: user.id } })) === 4, sec)
    execFileSync('npx', ['tsx', 'nettoyer-presse-papiers.ts', '--compte', user.id, '--ecrire'], { encoding: 'utf8' })
    const restent = (await prisma.product.findMany({ where: { userId: user.id }, select: { id: true } })).map((x) => x.id)
    verifier('--ecrire supprime le seul faux produit', !restent.includes(faux.id) && [vendu.id, vrai.id, avant.id].every((id) => restent.includes(id)), JSON.stringify(restent))
    verifier('… et les liens presse-papiers, pas les autres', (await prisma.sharedLink.count({ where: { userId: user.id, source: 'presse-papiers' } })) === 0 && (await prisma.sharedLink.count({ where: { userId: user.id } })) === 2)
  } finally {
    serveur.close()
    await prisma.order.deleteMany({ where: { userId: user.id } })
    await prisma.product.deleteMany({ where: { userId: user.id } })
    await prisma.sharedLink.deleteMany({ where: { userId: user.id } })
    await prisma.apiKey.deleteMany({ where: { userId: user.id } })
    await prisma.user.deleteMany({ where: { id: user.id } })
    await prisma.$disconnect()
  }

  if (echecs) {
    console.error(`\n${echecs} attente(s) manquée(s).`)
    process.exitCode = 1
    return
  }
  console.log('\nPresse-papiers : tout passe.')
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exitCode = 1
})
