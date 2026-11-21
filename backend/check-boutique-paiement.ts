/**
 * Banc de bout en bout d'une boutique DropShop créée (21/11/2026 : « coquilles vides,
 * aucun moyen de paiement »).
 *
 * Le parcours d'un vrai client, dans un vrai Chromium, sur la vraie page servie par
 * `/b/<adresse>` (moteur inséré), le vrai flux produits et la vraie route de commande :
 *   boutique remplie à la création → accueil avec produits → fiche → ajout au panier
 *   → panier → formulaire de commande → paiement par carte (Stripe plateforme)
 *   → retour → « payé » → commandes marquées payées → vente virée au vendeur.
 *
 * Stripe est un FAUX serveur local (STRIPE_BANC_PORT) : il écrit le contrat en dur, il ne
 * prouve donc pas que le compte Stripe de production accepte Connect — seulement que notre
 * code envoie et relit ce qu'il faut.
 *
 * Base : UNIQUEMENT une Postgres locale jetable (refus si DATABASE_URL n'est pas localhost).
 *   DATABASE_URL=postgresql://postgres@localhost:5544/dsp npx tsx check-boutique-paiement.ts
 */
import http from 'node:http'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'

const url = process.env.DATABASE_URL ?? ''
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
  console.error('Refus : ce banc ne tourne que sur une base locale jetable (DATABASE_URL=…@localhost…).')
  process.exit(2)
}

let echecs = 0
function verifier(ok: unknown, libelle: string) {
  console.log(`${ok ? 'ok  ' : 'ÉCHEC'}  ${libelle}`)
  if (!ok) echecs++
}

/* ---------- Faux Stripe ---------- */
const appels: { methode: string; chemin: string; corps: string }[] = []
let paye = false
const fauxStripe = http.createServer((req, res) => {
  let corps = ''
  req.on('data', (d) => (corps += d))
  req.on('end', () => {
    appels.push({ methode: req.method ?? '', chemin: req.url ?? '', corps: decodeURIComponent(corps.replace(/\+/g, ' ')) })
    res.setHeader('Content-Type', 'application/json')
    const meta = Object.fromEntries([...new URLSearchParams(corps)].filter(([k]) => k.startsWith('metadata[')).map(([k, v]) => [k.slice(9, -1), v]))
    if (req.method === 'POST' && req.url === '/v1/checkout/sessions') {
      sessionMeta = meta
      return res.end(JSON.stringify({ id: 'cs_test_banc1', object: 'checkout.session', url: 'https://checkout.stripe.test/pay/cs_test_banc1' }))
    }
    if (req.method === 'GET' && req.url?.startsWith('/v1/checkout/sessions/cs_test_banc1')) {
      return res.end(JSON.stringify({
        id: 'cs_test_banc1', object: 'checkout.session', payment_status: paye ? 'paid' : 'unpaid', metadata: sessionMeta,
        amount_total: montantTotal, currency: 'eur',
        payment_intent: { id: 'pi_1', object: 'payment_intent', transfer_group: 'dsb-x', latest_charge: { id: 'ch_1', object: 'charge', balance_transaction: { id: 'txn_1', fee: 60 } } },
      }))
    }
    if (req.method === 'POST' && req.url === '/v1/transfers') return res.end(JSON.stringify({ id: 'tr_banc1', object: 'transfer' }))
    res.statusCode = 404
    res.end(JSON.stringify({ error: { message: `faux Stripe : ${req.method} ${req.url}` } }))
  })
})
let sessionMeta: Record<string, string> = {}
let montantTotal = 0

async function main() {
  await new Promise<void>((r) => fauxStripe.listen(0, '127.0.0.1', r))
  process.env.STRIPE_SECRET_KEY = 'sk_test_banc'
  process.env.STRIPE_BANC_PORT = String((fauxStripe.address() as AddressInfo).port)
  process.env.SMTP_HOST = ''

  const { prisma } = await import('./src/lib/prisma.js')
  const express = (await import('express')).default
  const { publicRouter } = await import('./src/routes/public.js')
  const { vitrineRouter } = await import('./src/routes/vitrine.js')
  const { remplirSiVide, produitsDuStudio } = await import('./src/services/boutiqueProduits.js')
  const { verserPartsBoutiqueEnAttente } = await import('./src/services/paiementBoutique.js')
  // Playwright is preinstalled globally in the bench container, not a backend dependency.
  const { chromium } = createRequire(import.meta.url)('playwright') as typeof import('playwright')

  const marque = `banc-${Date.now()}`
  const user = await prisma.user.create({ data: { email: `${marque}@jetable.test` } })
  try {
    const shop = await prisma.shop.create({
      data: { userId: user.id, name: 'Boutique Banc', slug: marque, siteHtml: readFileSync('dropshop/exemple.html', 'utf8') },
    })
    for (const [titre, prix] of [['Lampe Nuage', 29.9], ['Tapis Dune', 49], ['Sans prix', 0]] as const) {
      await prisma.product.create({
        data: { userId: user.id, sourceUrl: 'https://exemple.test/p', title: titre, description: `${titre} : description du banc.`, images: [], sellingPrice: prix, imagesWatermarked: false },
      })
    }

    /* 1. La boutique ne naît plus vide */
    const ajoutes = await remplirSiVide(user.id, shop.id)
    verifier(ajoutes === 2, `création : la boutique reçoit les produits du vendeur (${ajoutes} ajoutés, le produit sans prix exclu)`)
    const liste = await produitsDuStudio(user.id, shop.id)
    verifier(liste.filter((p) => p.dansBoutique).length === 2 && liste.some((p) => !p.vendable), 'studio : 2 en vente, le sans-prix signalé')
    verifier((await remplirSiVide(user.id, shop.id)) === 0, 'une boutique déjà remplie ne bouge plus')

    /* 2. Le vrai parcours, dans Chromium */
    const app = express()
    app.use(express.json())
    app.use('/api/public', publicRouter)
    app.use('/b', vitrineRouter)
    const serveur = app.listen(0, '127.0.0.1')
    await new Promise((r) => serveur.once('listening', r))
    const base = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`

    const flux = await (await fetch(`${base}/api/public/shops/${shop.shopKey}/products`)).json()
    verifier(flux.paiement === 'stripe' && flux.count === 2, `flux : 2 produits, paiement « ${flux.paiement} » sans clé du marchand`)

    const navigateur = await chromium.launch()
    const page = await navigateur.newPage()
    const erreursPage: string[] = []
    page.on('pageerror', (e) => erreursPage.push(e.message))
    await page.route('https://checkout.stripe.test/**', (route) => {
      paye = true
      return route.fulfill({ status: 302, headers: { location: `${base}/b/${marque}?session_id=cs_test_banc1#/merci` } })
    })
    await page.goto(`${base}/b/${marque}`)
    await page.waitForSelector('text=Lampe Nuage', { timeout: 10_000 })
    verifier(await page.locator('text=Tapis Dune').count(), 'accueil : les produits sont là')
    const produit = await prisma.product.findFirstOrThrow({ where: { userId: user.id, title: 'Lampe Nuage' } })
    await page.goto(`${base}/b/${marque}#/p/${produit.id}`)
    await page.locator(`[data-ajouter="${produit.id}"]`).first().click()
    await page.goto(`${base}/b/${marque}#/panier`)
    await page.waitForSelector('text=Lampe Nuage')
    verifier(await page.locator('text=/29,90/').count(), 'panier : la ligne et son prix')
    await page.goto(`${base}/b/${marque}#/commande`)
    await page.waitForSelector('form[data-commande]')
    await page.fill('[name=name]', 'Jeanne Client')
    await page.fill('[name=email]', 'jeanne@jetable.test')
    await page.fill('[name=street]', '1 rue du Test')
    await page.fill('[name=zip]', '34500')
    await page.fill('[name=city]', 'Béziers')
    montantTotal = 2990 // amount_total the fake session reports back
    await Promise.all([page.waitForURL(/session_id=cs_test_banc1/, { timeout: 15_000 }), page.locator('form[data-commande] [type=submit]').click()])
    const creation = appels.find((a) => a.chemin === '/v1/checkout/sessions')
    verifier(creation && /metadata\[boutique\]=1/.test(creation.corps) && !/userId|planId/.test(creation.corps), 'paiement : session Stripe plateforme ouverte, aiguillée « boutique », sans planId de recharge')
    verifier(creation && /Lampe Nuage/.test(creation.corps) && /unit_amount\]=2990/.test(creation.corps), 'paiement : la bonne ligne, au bon prix')
    await page.waitForFunction(() => !/attente|confirm/i.test(document.body.innerText) || /merci/i.test(document.body.innerText), null, { timeout: 10_000 })
    await page.waitForTimeout(1500)

    const commandes = await prisma.order.findMany({ where: { userId: user.id } })
    verifier(commandes.length === 1 && commandes[0].paidAt, 'retour : la commande est marquée payée (relue chez Stripe, pas crue du navigateur)')
    verifier(commandes[0]?.commission !== null && commandes[0]?.stripeSessionId === 'cs_test_banc1', 'commande : marquée « payée sur la plateforme », session rattachée')
    const panierVide = await page.evaluate(() => Object.keys(localStorage).filter((k) => /panier|cart/i.test(k)).map((k) => localStorage.getItem(k)).join(''))
    verifier(!/Lampe|productId/.test(panierVide), 'merci : le panier est vidé')
    verifier(!appels.some((a) => a.chemin === '/v1/transfers'), 'vendeur sans paiements activés : sa part est mise de côté, aucun virement')

    /* 3. Le vendeur active ses paiements : la part mise de côté lui est virée */
    await prisma.user.update({ where: { id: user.id }, data: { stripeConnectId: 'acct_banc', stripeConnectReady: true } })
    await verserPartsBoutiqueEnAttente(user.id)
    const virement = appels.find((a) => a.chemin === '/v1/transfers')
    verifier(virement && /amount=2930/.test(virement.corps) && /destination=acct_banc/.test(virement.corps), 'activation : 29,90 € − 0,60 € de frais Stripe = 29,30 € virés, aucune commission')
    const apres = await prisma.order.findFirstOrThrow({ where: { userId: user.id } })
    verifier(apres.stripeTransferId === 'tr_banc1' && apres.payoutStatus === 'RELEASED', 'commande : virement rattaché, part versée')
    await verserPartsBoutiqueEnAttente(user.id)
    verifier(appels.filter((a) => a.chemin === '/v1/transfers').length === 1, 'pas de second virement')
    verifier(!erreursPage.length, `aucune erreur JavaScript dans la page${erreursPage.length ? ' : ' + erreursPage.join(' | ') : ''}`)

    await navigateur.close()
    serveur.close()
  } finally {
    await prisma.order.deleteMany({ where: { userId: user.id } })
    await prisma.publication.deleteMany({ where: { product: { userId: user.id } } })
    await prisma.product.deleteMany({ where: { userId: user.id } })
    await prisma.shop.deleteMany({ where: { userId: user.id } })
    await prisma.user.delete({ where: { id: user.id } })
    await prisma.$disconnect()
    fauxStripe.close()
  }
  console.log(echecs ? `\n${echecs} échec(s).` : '\nBoutique de bout en bout : tout passe.')
  process.exit(echecs ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
