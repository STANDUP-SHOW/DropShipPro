/**
 * Banc des vitrines (21/11/2026, tournée en ligne) :
 *   - bouton « ">AJOUTER AU PANIER » réparé au rendu,
 *   - liens morts du pied de page menés aux pages légales, pages mentions / CGV /
 *     livraison-retours / contact servies et formulaire de contact transmis,
 *   - jamais de commande sans encaissement (sans Stripe : refus, zéro commande),
 *   - vitrine à thèmes : paiement par carte au lieu de la commande non payée,
 *   - portefeuille vendeur : ventes et soldes.
 * Vrai Chromium, vraies routes ; Stripe = faux serveur local (contrat écrit en dur).
 *
 * Base : UNIQUEMENT une Postgres locale jetable.
 *   DATABASE_URL=postgresql://postgres@localhost:5544/dsp npx tsx check-vitrine-legal.ts
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

const fauxStripe = http.createServer((req, res) => {
  let corps = ''
  req.on('data', (d) => (corps += d))
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json')
    if (req.method === 'POST' && req.url === '/v1/checkout/sessions') {
      return res.end(JSON.stringify({ id: 'cs_test_vitrine', object: 'checkout.session', url: 'https://checkout.stripe.test/pay/cs_test_vitrine' }))
    }
    if (req.method === 'GET' && req.url?.startsWith('/v1/balance')) {
      return res.end(JSON.stringify({ object: 'balance', available: [{ amount: 1234, currency: 'eur' }], pending: [{ amount: 500, currency: 'eur' }] }))
    }
    if (req.method === 'GET' && req.url?.startsWith('/v1/accounts/acct_banc')) {
      return res.end(JSON.stringify({ id: 'acct_banc', object: 'account', charges_enabled: true, details_submitted: true, payouts_enabled: true, requirements: { currently_due: [] } }))
    }
    res.statusCode = 404
    res.end(JSON.stringify({ error: { message: `faux Stripe : ${req.method} ${req.url}` } }))
  })
})

// Une page « écrite par le modèle » avec les deux défauts vus en ligne.
const PAGE_FAUTIVE = readFileSync('dropshop/exemple.html', 'utf8')
  .replace(
    /'<button class="btn" data-ajouter="' \+ c\.html\(p\.id\) \+ '">Ajouter au panier<\/button>/,
    `'<button class="btn" data-ajouter="' + c.html(p.id) + '"><span>">Ajouter au panier</span></button>`,
  )
  .replace("'<footer class=\"wrap\"><p>© '", "'<footer class=\"wrap\"><a href=\"#/boutique\">Nous contacter</a> <a href=\"#/boutique\">Retours sous 14 jours</a> <a href=\"#/boutique\">Boutique</a><p>© '")

async function main() {
  await new Promise<void>((r) => fauxStripe.listen(0, '127.0.0.1', r))
  delete process.env.STRIPE_SECRET_KEY
  process.env.SMTP_HOST = ''
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'banc-vitrine'

  const { prisma } = await import('./src/lib/prisma.js')
  const express = (await import('express')).default
  const jwt = (await import('jsonwebtoken')).default
  const { publicRouter } = await import('./src/routes/public.js')
  const { vitrineRouter } = await import('./src/routes/vitrine.js')
  const { portefeuilleRouter } = await import('./src/routes/portefeuille.js')
  const { remplirSiVide } = await import('./src/services/boutiqueProduits.js')
  const { chromium } = createRequire(import.meta.url)('playwright') as typeof import('playwright')

  const marque = `vitrine-${Date.now()}`
  const user = await prisma.user.create({ data: { email: `${marque}@jetable.test` } })
  try {
    const shopIA = await prisma.shop.create({ data: { userId: user.id, name: 'Robots Banc', slug: `${marque}-ia`, siteHtml: PAGE_FAUTIVE } })
    const shopTheme = await prisma.shop.create({ data: { userId: user.id, name: 'Thème Banc', slug: `${marque}-theme` } })
    await prisma.product.create({
      data: { userId: user.id, sourceUrl: 'https://exemple.test/p', title: 'Robot Pliant', description: 'Robot du banc.', images: [], sellingPrice: 39, imagesWatermarked: false },
    })
    await remplirSiVide(user.id, shopIA.id)
    await remplirSiVide(user.id, shopTheme.id)
    const produit = await prisma.product.findFirstOrThrow({ where: { userId: user.id } })
    // La vitrine à thèmes lit les publications OWN_SITE de SA boutique : on rattache le produit.
    const produit2 = await prisma.product.create({
      data: { userId: user.id, shopId: shopTheme.id, sourceUrl: 'https://exemple.test/q', title: 'Drone Banc', description: 'Drone du banc.', images: [], sellingPrice: 59, imagesWatermarked: false },
    })
    await prisma.publication.create({ data: { productId: produit2.id, platform: 'OWN_SITE', status: 'PUBLISHED' } })

    const app = express()
    app.use(express.json())
    app.use('/api/public', publicRouter)
    app.use('/api/portefeuille', portefeuilleRouter)
    app.use('/b', vitrineRouter)
    const serveur = app.listen(0, '127.0.0.1')
    await new Promise((r) => serveur.once('listening', r))
    const base = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`
    const api = `${base}/api/public/shops`

    /* 1. Sans Stripe : aucune commande sans encaissement */
    const sans = await fetch(`${api}/${shopIA.shopKey}/checkout`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buyer: { name: 'Jeanne', street: '1 rue Test', zip: '34500', city: 'Béziers' }, lignes: [{ productId: produit.id, quantity: 1 }] }),
    })
    verifier(sans.status === 503 && (await prisma.order.count({ where: { userId: user.id } })) === 0, `sans Stripe : commande refusée (${sans.status}), aucune commande écrite`)
    const ancienne = await fetch(`${api}/${shopIA.shopKey}/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    verifier(ancienne.status === 410, `ancienne commande sans paiement : refusée (${ancienne.status})`)

    /* 2. Infos et contact */
    const infos = await (await fetch(`${api}/${shopIA.shopKey}/infos`)).json()
    verifier(infos.pages?.['mentions-legales'] && infos.pages?.cgv && infos.pages?.['livraison-retours'] && infos.pages?.contact, 'infos : quatre pages légales')
    verifier(/pas encore renseigné son identité/.test(infos.pages['mentions-legales'].html) && infos.vendeur === null, 'mentions : identité absente dite telle quelle, rien d’inventé')
    verifier(infos.paiement === 'indisponible' && /indisponible/.test(infos.pages.cgv.html), 'CGV : le paiement indisponible est dit')
    await prisma.user.update({ where: { id: user.id }, data: { factureIdentite: { raisonSociale: 'Jean Vendeur EI', adresse: '3 place du Banc, 34500 Béziers', siret: '12345678901234', regime: 'franchise' } } })
    const infos2 = await (await fetch(`${api}/${shopIA.shopKey}/infos`)).json()
    verifier(/Jean Vendeur EI/.test(infos2.pages['mentions-legales'].html) && /12345678901234/.test(infos2.pages['mentions-legales'].html) && /293 B/.test(infos2.pages['mentions-legales'].html), 'mentions : identité du vendeur, SIRET, franchise de TVA')
    const contact = await fetch(`${api}/${shopIA.shopKey}/contact`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nom: 'Jeanne', email: 'jeanne@jetable.test', message: 'Où en est mon colis ?' }) })
    verifier(contact.ok, `contact : message accepté (${contact.status})`)

    /* 3. La boutique écrite par l'IA, dans Chromium (Stripe désormais branché) */
    process.env.STRIPE_SECRET_KEY = 'sk_test_banc'
    process.env.STRIPE_BANC_PORT = String((fauxStripe.address() as AddressInfo).port)
    const navigateur = await chromium.launch()
    const page = await navigateur.newPage()
    const erreursPage: string[] = []
    page.on('pageerror', (e) => erreursPage.push(e.message))
    await page.goto(`${base}/b/${shopIA.slug}`)
    await page.waitForSelector('text=Robot Pliant', { timeout: 10_000 })
    await page.goto(`${base}/b/${shopIA.slug}#/p/${produit.id}`)
    await page.waitForSelector('[data-ajouter]', { timeout: 5_000 })
    verifier(PAGE_FAUTIVE.includes('"><span>">Ajouter'), 'la page de banc porte bien la fuite vue en ligne')
    const boutons = await page.locator('[data-ajouter]').allInnerTexts()
    verifier(boutons.length && boutons.every((t) => !/^\s*["']\s*>/.test(t) && /ajouter au panier/i.test(t)), `bouton panier sans fuite : « ${boutons[0]} »`)
    await page.locator('[data-ajouter]').first().click()
    await page.waitForTimeout(1400)
    const apresClic = await page.locator('[data-ajouter]').first().innerText()
    verifier(!/^\s*["']\s*>/.test(apresClic), `après « Ajouté ✓ », le libellé revient sans fuite : « ${apresClic} »`)
    verifier(await page.locator('footer a[href="#/infos/contact"]', { hasText: 'Nous contacter' }).count() && await page.locator('footer a[href="#/infos/livraison-retours"]', { hasText: 'Retours' }).count() && await page.locator('footer a[href="#/boutique"]', { hasText: 'Boutique' }).count(), 'faux liens du pied menés aux bonnes pages, le vrai lien Boutique gardé')
    const liensLegaux = await page.locator('a[href^="#/infos/"]').count()
    verifier(liensLegaux >= 4, `pied de page : ${liensLegaux} liens vers les pages légales`)
    await page.goto(`${base}/b/${shopIA.slug}#/infos/mentions-legales`)
    await page.waitForSelector('text=Jean Vendeur EI', { timeout: 5_000 })
    verifier(await page.locator('h1', { hasText: 'Mentions légales' }).count(), 'page Mentions légales rendue dans la boutique')
    await page.goto(`${base}/b/${shopIA.slug}#/infos/contact`)
    await page.waitForSelector('form[data-contact]')
    await page.fill('form[data-contact] [name=nom]', 'Paul')
    await page.fill('form[data-contact] [name=email]', 'paul@jetable.test')
    await page.fill('form[data-contact] [name=message]', 'Une question sur le robot.')
    await page.locator('form[data-contact] [type=submit]').click()
    await page.waitForSelector('text=Message envoyé', { timeout: 5_000 }).catch(() => null)
    verifier(await page.locator('text=Message envoyé').count(), 'contact : envoyé depuis la page')

    /* 4. La vitrine à thèmes : pied de page réel et paiement par carte */
    await page.goto(`${base}/b/${shopTheme.slug}`)
    await page.waitForSelector('#pied a[href="#/infos/cgv"]', { timeout: 10_000 })
    verifier(true, 'vitrine à thèmes : liens Contact, Livraison et retours, CGV, Mentions légales')
    await page.route('https://checkout.stripe.test/**', (route) => route.fulfill({ status: 200, body: 'stripe' }))
    await page.evaluate((id) => localStorage.setItem('panier-' + (window as unknown as { BOUTIQUE: { shopKey: string } }).BOUTIQUE.shopKey, JSON.stringify([{ productId: id, quantity: 1 }])), produit2.id)
    const cle = await page.evaluate(() => Object.keys(localStorage))
    await page.goto(`${base}/b/${shopTheme.slug}#/p/${produit2.id}`)
    await page.waitForSelector('#ajouter', { timeout: 10_000 })
    await page.locator('#ajouter').click()
    await page.goto(`${base}/b/${shopTheme.slug}#/panier`)
    await page.waitForSelector('#form-commande')
    await page.fill('#form-commande [name=name]', 'Jeanne Client')
    await page.fill('#form-commande [name=street]', '1 rue du Test')
    await page.fill('#form-commande [name=zip]', '34500')
    await page.fill('#form-commande [name=city]', 'Béziers')
    await Promise.all([page.waitForURL(/checkout\.stripe\.test/, { timeout: 10_000 }).catch(() => null), page.locator('#commander').click()])
    verifier(/checkout\.stripe\.test/.test(page.url()), `vitrine à thèmes : « Payer par carte » mène au paiement (${page.url().slice(0, 60)}) [clés ${cle.length}]`)
    const cmd = await prisma.order.findMany({ where: { userId: user.id } })
    verifier(cmd.length === 1 && cmd[0].stripeSessionId === 'cs_test_vitrine' && cmd[0].commission !== null, 'commande rattachée à une session de paiement, jamais « à encaisser »')
    verifier(!erreursPage.length, `aucune erreur JavaScript${erreursPage.length ? ' : ' + erreursPage.join(' | ') : ''}`)
    await navigateur.close()

    /* 5. Portefeuille */
    await prisma.order.update({ where: { id: cmd[0].id }, data: { paidAt: new Date() } })
    const jeton = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!)
    const pf = await (await fetch(`${base}/api/portefeuille`, { headers: { Authorization: `Bearer ${jeton}` } })).json()
    verifier(pf.mode === 'test' && pf.ventes?.length === 1 && pf.solde?.enAttente === 59 && pf.ventes[0].statut === 'en-attente', `portefeuille : 1 vente, 59 € en attente, mode test (${JSON.stringify(pf.solde)})`)
    await prisma.user.update({ where: { id: user.id }, data: { stripeConnectId: 'acct_banc', stripeConnectReady: true } })
    const pf2 = await (await fetch(`${base}/api/portefeuille`, { headers: { Authorization: `Bearer ${jeton}` } })).json()
    verifier(pf2.compte?.actif && pf2.solde?.surCompte?.disponible === 12.34 && pf2.solde.surCompte.enCours === 5, `portefeuille : solde Stripe lu chez Stripe (${JSON.stringify(pf2.solde?.surCompte)})`)
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
  console.log(echecs ? `\n${echecs} échec(s).` : '\nVitrines : tout passe.')
  process.exit(echecs ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
