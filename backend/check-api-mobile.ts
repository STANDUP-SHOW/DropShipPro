/**
 * Banc : l'API Link de l'application mobile (routes/mobile.ts) tient le contrat
 * envoyé par Max (docs/v2/api-link-mobile.md) — chemins, noms de champs, format
 * d'erreur `{ detail }` — sur un compte JETABLE créé et détruit ici.
 *
 * Ce qu'il vérifie en priorité, parce que c'est ce qu'une application mobile
 * casse sans le dire : une erreur rendue en `{ error }` au lieu de `{ detail }`,
 * un chiffre du tableau de bord qui ne se retrouve pas dans les commandes, une
 * notification qui ne respecte pas les préférences, un téléphone inscrit au nom
 * d'un autre compte, une adresse partagée qui garde ses paramètres de pistage.
 */
import express from 'express'
import bcrypt from 'bcryptjs'
import type { AddressInfo } from 'node:net'
import { prisma } from './src/lib/prisma.js'
import { mobileRouter, adressePropre } from './src/routes/mobile.js'

let echecs = 0
function verifier(nom: string, condition: boolean, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

async function main() {
  console.log('Adresse partagée nettoyée (sans base)')
  verifier(
    'les paramètres de pistage sont retirés, l’identifiant du produit reste',
    adressePropre('Regarde ça https://fr.aliexpress.com/item/1005006.html?spm=a2g0o&utm_source=x&sku_id=12 !') === 'https://fr.aliexpress.com/item/1005006.html?sku_id=12',
  )
  verifier('un texte sans adresse rend null', adressePropre('pas de lien ici') === null)

  const marque = `banc-mobile-${Date.now()}`
  const motDePasse = 'banc-mobile-mdp'
  const user = await prisma.user.create({
    data: { email: `${marque}@exemple.test`, passwordHash: await bcrypt.hash(motDePasse, 4), credits: 50, shopName: 'Boutique du banc' },
  })
  const autre = await prisma.user.create({ data: { email: `${marque}-autre@exemple.test`, passwordHash: 'x', credits: 0 } })

  const app = express()
  app.use(express.json())
  app.use('/api/mobile', mobileRouter)
  const serveur = app.listen(0, '127.0.0.1')
  await new Promise((r) => serveur.once('listening', r))
  const base = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}/api/mobile`
  let jeton = ''
  const appel = async (methode: string, chemin: string, corps?: unknown, sansJeton = false) => {
    const r = await fetch(base + chemin, {
      method: methode,
      headers: { 'Content-Type': 'application/json', ...(jeton && !sansJeton ? { Authorization: `Bearer ${jeton}` } : {}) },
      body: corps === undefined ? undefined : JSON.stringify(corps),
    })
    return { code: r.status, json: (await r.json().catch(() => null)) as any }
  }

  try {
    // Les données d'une boutique : une vente à commander, une commande déposée
    // qui attend son règlement, un colis parti, un ticket ouvert avec une réponse.
    const produit = await prisma.product.create({
      data: { userId: user.id, sourceUrl: 'https://exemple.test/p', title: 'Lampe de banc', description: 'd', images: [], price: 10, shippingCost: 2, sellingPrice: 30 },
    })
    const adresse = { line1: '1 rue du Banc', city: 'Paris', zip: '75001', country: 'FR' }
    const maintenant = Date.now()
    await prisma.order.create({ data: { userId: user.id, productId: produit.id, platform: 'EBAY', buyerName: 'Alice', buyerAddress: adresse, amount: 30 } })
    const aRegler = await prisma.order.create({
      data: {
        userId: user.id,
        productId: produit.id,
        platform: 'SHOPIFY',
        buyerName: 'Bob',
        buyerAddress: adresse,
        amount: 40,
        status: 'ORDERED_FROM_SUPPLIER',
        supplierOrderId: 'CJ-123',
        supplierOrderCost: 15,
        supplierOrderedAt: new Date(maintenant - 3_600_000),
        supplierOrderUrl: 'https://cjdropshipping.com/order/CJ-123',
      },
    })
    await prisma.order.create({
      data: { userId: user.id, productId: produit.id, platform: 'EBAY', buyerName: 'Chloé', buyerAddress: adresse, amount: 20, status: 'SHIPPED', trackingNumber: '8G0001', carrier: 'Colissimo' },
    })
    await prisma.order.create({ data: { userId: user.id, productId: produit.id, platform: 'EBAY', buyerName: 'Rembours', buyerAddress: adresse, amount: 999, status: 'REFUNDED' } })
    const ticket = await prisma.ticket.create({ data: { userId: user.id, subject: 'Publicité floue, je veux un avoir', status: 'OUVERT' } })
    await prisma.ticketMessage.create({ data: { ticketId: ticket.id, author: 'vendeur', body: 'Bonjour', createdAt: new Date(maintenant - 120_000) } })
    await prisma.ticketMessage.create({ data: { ticketId: ticket.id, author: 'agent', body: 'Je regarde', createdAt: new Date(maintenant - 30_000) } })

    console.log('\n1. Authentification')
    let r = await appel('POST', '/auth/login', { email: user.email, password: 'faux' })
    verifier('mot de passe faux : 401 en { detail }', r.code === 401 && typeof r.json?.detail === 'string' && !('error' in r.json))
    r = await appel('POST', '/auth/login', { email: user.email.toUpperCase(), password: motDePasse })
    jeton = r.json?.token ?? ''
    verifier('connexion (email en majuscules accepté) : jeton et user au contrat', r.code === 200 && jeton.length > 20 && r.json.user.id === user.id && r.json.user.name === 'Boutique du banc' && r.json.user.plan === 'Drops' && r.json.user.picture === null)
    r = await appel('GET', '/auth/me', undefined, true)
    verifier('sans jeton : 401 en { detail } (requireAuth traduit)', r.code === 401 && typeof r.json?.detail === 'string')
    r = await appel('GET', '/auth/me')
    verifier('/auth/me rend { user }', r.code === 200 && r.json.user.email === user.email)

    console.log('\n2. Tableau de bord')
    r = await appel('GET', '/dashboard/summary')
    // Brut = 30 + 40 + 20 (le remboursement est exclu). Coûts : 12 + 15 (réel) + 12.
    verifier('chiffre brut hors remboursements', r.json?.revenue_gross === 90, JSON.stringify(r.json))
    verifier('bénéfice net : coût réel quand il existe, estimation sinon', r.json?.net_profit === 51 && r.json?.margin_pct === 56.7)
    verifier('commandes traitées par la plateforme / total', r.json?.ai_orders_processed === 1 && r.json?.ai_orders_total === 3)
    r = await appel('GET', '/dashboard/chart?range=7d')
    const somme = (r.json?.points ?? []).reduce((s: number, p: { revenue: number }) => s + p.revenue, 0)
    verifier('courbe 7 jours : sept points dont la somme égale le brut', r.json?.points?.length === 7 && somme === 90)
    r = await appel('GET', '/dashboard/chart?range=24h')
    verifier('courbe 24 h : vingt-quatre points horaires', r.json?.points?.length === 24 && /h$/.test(r.json.points[0].label))
    r = await appel('GET', '/dashboard/copilot')
    verifier('copilote : délai de réponse réel des agents, taux, file, agents', r.json?.avg_response_seconds === 90 && r.json?.resolution_rate === 0 && r.json?.sourcing_queue === 0 && r.json?.active_agents === 0, JSON.stringify(r.json))

    console.log('\n3. Notifications')
    r = await appel('GET', '/notifications')
    const types = (r.json?.items ?? []).map((i: { type: string }) => i.type)
    verifier('préférences par défaut : validation, solde bas, escalade ; ni vente ni expédition', types.includes('rpa_validation') && types.includes('low_balance') && types.includes('ai_escalation') && !types.includes('new_sale') && !types.includes('order_shipped'), types.join(','))
    const payer = r.json.items.find((i: { id: string }) => i.id === `pay:${aRegler.id}`)
    verifier('la commande à régler porte « Commande prête à être réglée pour Bob » et l’adresse fournisseur', payer?.title.includes('Bob') && payer?.url === 'https://cjdropshipping.com/order/CJ-123' && payer?.actions[0].id === 'approve_pay')
    verifier('unread compte les non lues', r.json.unread === r.json.items.length)
    r = await appel('POST', `/notifications/${encodeURIComponent(payer.id)}/action`, { action_id: 'refill_wallet' })
    verifier('une action que la notification ne propose pas est refusée', r.code === 400 && typeof r.json?.detail === 'string')
    r = await appel('POST', `/notifications/${encodeURIComponent(payer.id)}/action`, { action_id: 'approve_pay' })
    verifier('approve_pay ne paie rien : résolue, avec l’adresse où régler', r.code === 200 && r.json.item.resolved === true && r.json.item.resolution === 'payment_opened' && r.json.url === 'https://cjdropshipping.com/order/CJ-123')
    r = await appel('POST', '/notifications/pas-une-notif/read')
    verifier('notification inconnue : 404 en { detail }', r.code === 404 && typeof r.json?.detail === 'string')
    r = await appel('POST', '/notifications/read-all')
    r = await appel('GET', '/notifications')
    verifier('read-all : plus aucune non lue', r.json?.unread === 0)

    console.log('\n5. Préférences')
    r = await appel('PUT', '/settings/notifications', { new_sales: true })
    verifier('PUT partiel rend l’objet complet mis à jour', r.json?.new_sales === true && r.json?.rpa_validation === true && r.json?.order_shipped === false)
    r = await appel('PUT', '/settings/notifications', { inconnu: true })
    verifier('un champ inconnu est refusé', r.code === 400)
    r = await appel('GET', '/notifications')
    verifier('la vente apparaît dès que la préférence est levée', r.json.items.some((i: { type: string }) => i.type === 'new_sale'))

    console.log('\n3 bis. Push')
    r = await appel('POST', '/register-push', { user_id: autre.id, platform: 'android', device_token: 'fcm-jeton-de-banc-123456' })
    const appareil = await prisma.pushDevice.findUnique({ where: { deviceToken: 'fcm-jeton-de-banc-123456' } })
    verifier('le téléphone est inscrit au compte du JETON, pas à celui annoncé dans le corps', r.json?.status === 'registered' && appareil?.userId === user.id)

    console.log('\n4. Partage')
    r = await appel('POST', '/products/share', { text: 'Lampe LED top https://fr.aliexpress.com/item/1005006.html?spm=a2g0o&utm_campaign=z' })
    verifier('le partage est rangé, nettoyé, reconnu AliExpress, en file', r.code === 201 && r.json.item.clean_url === 'https://fr.aliexpress.com/item/1005006.html' && r.json.item.source === 'AliExpress' && r.json.item.status === 'queued')
    await appel('POST', '/products/share', { url: 'https://fr.aliexpress.com/item/1005006.html?utm_source=autre' })
    r = await appel('GET', '/products/shared')
    verifier('repartager la même fiche ne la double pas', r.json?.items?.length === 1)
    r = await appel('POST', '/products/share', { text: 'rien à voir' })
    verifier('un partage sans adresse est refusé en { detail }', r.code === 400 && typeof r.json?.detail === 'string')
    r = await appel('GET', '/dashboard/copilot')
    verifier('la file de sourcing compte le lien partagé', r.json?.sourcing_queue === 1)
  } finally {
    serveur.close()
    await prisma.order.deleteMany({ where: { userId: user.id } })
    await prisma.user.deleteMany({ where: { id: { in: [user.id, autre.id] } } })
    await prisma.$disconnect()
  }

  if (echecs) {
    console.error(`\n${echecs} attente(s) manquée(s).`)
    process.exit(1)
  }
  console.log('\nAPI Link mobile : tout passe.')
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
