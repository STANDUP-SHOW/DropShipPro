/**
 * Banc : la remontée des ventes au-delà de Shopify — eBay, Mirakl (un canal
 * pour quarante et une enseignes) et l'import de fichier qui sert toutes les
 * autres plateformes. Compte JETABLE, faux serveurs dont le contrat est écrit
 * en dur (chemins, états, corps attendus), jamais recalculé avec le code jugé.
 *
 * Ce qu'il tient : une vente non payée ou non acceptée qui entre, une ligne
 * refusée comptée, le suivi Mirakl posé sans la mise « expédiée » (le délai
 * court toujours chez l'opérateur), un import qui double au second passage,
 * un prix unitaire pris pour un total de ligne, un statut « annulée » importé.
 */
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { prisma } from './src/lib/prisma.js'
import { canalEbay, canalMirakl, noterReleve, passage } from './src/services/ventesMarketplaces.js'
import { correspondance, importerCommandes, lireCsv, lireMontant } from './src/services/importCommandes.js'

let echecs = 0
function verifier(nom: string, condition: boolean, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

type Appel = { methode: string; chemin: string; corps: string; auth: string }

function serveur(repondre: (a: Appel) => { statut?: number; json?: unknown }) {
  const journal: Appel[] = []
  const s = http.createServer((req, res) => {
    let corps = ''
    req.on('data', (c) => (corps += c))
    req.on('end', () => {
      const a = { methode: req.method ?? '', chemin: req.url ?? '', corps, auth: String(req.headers.authorization ?? '') }
      journal.push(a)
      const r = repondre(a)
      res.writeHead(r.statut ?? 200, { 'Content-Type': 'application/json' })
      res.end(r.json === undefined ? '' : JSON.stringify(r.json))
    })
  })
  return new Promise<{ url: string; journal: Appel[]; fermer: () => void }>((ok) =>
    s.listen(0, '127.0.0.1', () => ok({ url: `http://127.0.0.1:${(s.address() as AddressInfo).port}`, journal, fermer: () => s.close() })),
  )
}

const maintenant = Date.now()
const iso = (msAvant: number) => new Date(maintenant - msAvant).toISOString()

async function main() {
  const marque = `banc-canaux-${maintenant}`
  const user = await prisma.user.create({ data: { email: `${marque}@exemple.test`, passwordHash: 'x', credits: 0 } })
  const fermer: Array<() => void> = []
  try {
    const base = { userId: user.id, sourceUrl: 'https://exemple.test/p', description: 'd', images: [], price: 10, sellingPrice: 30 }
    const lampe = await prisma.product.create({ data: { ...base, title: 'Lampe', supplierId: 'cj', supplierRef: '555' } })
    const tapis = await prisma.product.create({ data: { ...base, title: 'Tapis' } })

    // ------------------------------------------------------------ eBay
    console.log('eBay')
    const ebay = await serveur((a) => {
      if (a.methode === 'GET' && a.chemin.startsWith('/sell/fulfillment/v1/order?')) {
        if (!decodeURIComponent(a.chemin).includes('filter=creationdate:[')) return { statut: 400, json: { errors: [{ message: 'filtre attendu' }] } }
        const ligne = (id: string, sku: string, v: string) => ({ lineItemId: id, sku, title: 'Lampe', quantity: 1, total: { value: v, currency: 'EUR' } })
        const cmd = (id: string, extra: Record<string, unknown>, lignes: unknown[]) => ({
          orderId: id, legacyOrderId: `L-${id}`, creationDate: iso(7_200_000), orderPaymentStatus: 'PAID', cancelStatus: { cancelState: 'NONE_REQUESTED' },
          buyer: { username: 'bob33' },
          fulfillmentStartInstructions: [{ shippingStep: { shipTo: { fullName: 'Bob Durand', email: 'bob@exemple.test', primaryPhone: { phoneNumber: '0600' }, contactAddress: { addressLine1: '1 quai Ouest', city: 'Bordeaux', postalCode: '33000', countryCode: 'FR' } } } }],
          lineItems: lignes, ...extra,
        })
        return { json: { total: 3, orders: [
          cmd('E1', {}, [ligne('LI1', lampe.id, '42.50')]),
          cmd('E2', { orderPaymentStatus: 'PENDING' }, [ligne('LI2', lampe.id, '9')]),
          cmd('E3', { cancelStatus: { cancelState: 'CANCELED' } }, [ligne('LI3', lampe.id, '9')]),
        ] } }
      }
      if (a.methode === 'GET' && a.chemin === '/sell/fulfillment/v1/order/E1') return { json: { orderId: 'E1', lineItems: [{ lineItemId: 'LI1', quantity: 1 }] } }
      if (a.methode === 'POST' && a.chemin === '/sell/fulfillment/v1/order/E1/shipping_fulfillment') return { statut: 201, json: {} }
      return { statut: 404, json: { errors: [{ message: 'inconnu' }] } }
    })
    fermer.push(ebay.fermer)
    const cEbay = canalEbay({ accessToken: 'jeton-ebay', baseUrl: ebay.url })
    const p1 = await passage(user.id, cEbay)
    const oEbay = await prisma.order.findFirst({ where: { userId: user.id, platform: 'EBAY' } })
    verifier('payée seulement : une vente eBay, sur le bon produit, port compris', p1.bilan?.creees === 1 && oEbay?.productId === lampe.id && Number(oEbay.amount) === 42.5, JSON.stringify(p1))
    verifier('adresse et e-mail de livraison repris', oEbay?.buyerName === 'Bob Durand' && oEbay.buyerEmail === 'bob@exemple.test' && (oEbay.buyerAddress as Record<string, string>).zip === '33000')
    verifier('jeton en « Bearer »', ebay.journal[0]?.auth === 'Bearer jeton-ebay')
    await prisma.order.update({ where: { id: oEbay!.id }, data: { trackingNumber: 'CB123', carrier: 'Colissimo', status: 'SHIPPED' } })
    await passage(user.id, cEbay)
    const envoi = ebay.journal.find((a) => a.chemin.endsWith('/shipping_fulfillment'))
    const corpsEnvoi = envoi ? JSON.parse(envoi.corps) : null
    verifier('suivi eBay : lignes, numéro, transporteur', corpsEnvoi?.trackingNumber === 'CB123' && corpsEnvoi.shippingCarrierCode === 'Colissimo' && corpsEnvoi.lineItems?.[0]?.lineItemId === 'LI1')
    verifier('… et marqué transmis', !!(await prisma.order.findUnique({ where: { id: oEbay!.id } }))?.suiviTransmisAt)

    // ---------------------------------------------------------- Mirakl
    console.log('\nMirakl')
    const mirakl = await serveur((a) => {
      if (a.auth !== 'cle-mirakl') return { statut: 401 }
      if (a.methode === 'GET' && a.chemin.startsWith('/api/orders?') && a.chemin.includes('order_state_codes=WAITING_ACCEPTANCE')) return { json: { total_count: 2, orders: [] } }
      if (a.methode === 'GET' && a.chemin.startsWith('/api/orders?')) {
        if (!a.chemin.includes('order_state_codes=SHIPPING') || !a.chemin.includes('shop_id=77')) return { statut: 400 }
        return { json: { total_count: 1, orders: [{
          order_id: 'M-100-A', commercial_id: 'M-100', created_date: iso(86_400_000), currency_iso_code: 'EUR', customer_notification_email: 'x@operateur.test',
          customer: { firstname: 'Chloé', lastname: 'Petit', shipping_address: { firstname: 'Chloé', lastname: 'Petit', street_1: '8 av. Foch', zip_code: '75016', city: 'Paris', country: 'France', country_iso_code: 'FRA' } },
          order_lines: [
            { order_line_id: 'M-100-A-1', offer_sku: tapis.id, product_title: 'Tapis', quantity: 2, price: 50, total_price: 55.9, order_line_state: 'SHIPPING' },
            { order_line_id: 'M-100-A-2', offer_sku: lampe.id, product_title: 'Lampe', quantity: 1, price: 20, order_line_state: 'REFUSED' },
          ],
        }] } }
      }
      if (a.methode === 'PUT' && a.chemin === '/api/orders/M-100-A/tracking') return { statut: 204 }
      if (a.methode === 'PUT' && a.chemin === '/api/orders/M-100-A/ship') return { statut: 204 }
      return { statut: 404 }
    })
    fermer.push(mirakl.fermer)
    const cMirakl = canalMirakl('LECLERC', { baseUrl: mirakl.url, apiKey: 'cle-mirakl', shopId: '77' })
    const p2 = await passage(user.id, cMirakl)
    const oMirakl = await prisma.order.findMany({ where: { userId: user.id, platform: 'LECLERC' } })
    verifier('ligne refusée écartée : une vente Leclerc, total de ligne port compris', oMirakl.length === 1 && oMirakl[0].productId === tapis.id && Number(oMirakl[0].amount) === 55.9 && oMirakl[0].quantity === 2, JSON.stringify(p2.bilan))
    verifier('code pays à trois lettres non pris pour un code ISO-2', (oMirakl[0].buyerAddress as Record<string, string>).countryCode === undefined && (oMirakl[0].buyerAddress as Record<string, string>).country === 'France')
    verifier('les commandes à accepter sont signalées', /2 commandes attendent votre acceptation/.test(p2.signal ?? ''), p2.signal ?? '')
    await prisma.order.update({ where: { id: oMirakl[0].id }, data: { trackingNumber: '6A000', carrier: 'La Poste' } })
    await passage(user.id, cMirakl)
    const suivi = mirakl.journal.find((a) => a.chemin.endsWith('/tracking'))
    const iSuivi = mirakl.journal.findIndex((a) => a.chemin.endsWith('/tracking'))
    const iShip = mirakl.journal.findIndex((a) => a.chemin.endsWith('/ship'))
    verifier('suivi Mirakl posé PUIS commande expédiée', !!suivi && JSON.parse(suivi.corps).tracking_number === '6A000' && JSON.parse(suivi.corps).carrier_name === 'La Poste' && iShip > iSuivi)

    const refus = await passage(user.id, canalMirakl('LECLERC', { baseUrl: mirakl.url, apiKey: 'mauvaise' }))
    verifier('clé refusée : le geste est dit', /Régénérez-la/.test(refus.erreur ?? ''), refus.erreur ?? '')
    const lien = await prisma.platformCredential.create({ data: { userId: user.id, platform: 'LECLERC', data: {}, connected: true } })
    await noterReleve(lien.id, refus)
    const etat = await prisma.platformCredential.findUnique({ where: { id: lien.id } })
    verifier("l'erreur est écrite sur la liaison, pour l'écran", !!etat?.ventesReleveesAt && /Régénérez-la/.test(etat.ventesErreur ?? ''))

    // ----------------------------------------------------------- Import
    console.log('\nImport de fichier')
    verifier('montants : « 1 234,56 € », « 1,234.56 », « 12.5 »', lireMontant('1 234,56 €') === 1234.56 && lireMontant('1,234.56') === 1234.56 && lireMontant('12.5') === 12.5)
    verifier('guillemets et séparateur deviné', JSON.stringify(lireCsv('a;b\n"x;1";"dit ""oui"""\n')) === JSON.stringify([['a', 'b'], ['x;1', 'dit "oui"']]))
    const shopifyExport = correspondance(['Name', 'Email', 'Financial Status', 'Total', 'Lineitem quantity', 'Lineitem name', 'Lineitem price', 'Lineitem sku', 'Shipping Name', 'Shipping Address1', 'Shipping City', 'Shipping Zip', 'Id'])
    verifier('export Shopify : « Shipping Name » est l’acheteur, « Lineitem price » le montant, « Id » la commande', shopifyExport.index.nom === 8 && shopifyExport.index.montant === 6 && shopifyExport.index.commande === 12, JSON.stringify(shopifyExport.reconnu))

    const csv = [
      'Numéro de commande;Date de commande;Statut;Référence;Titre;Quantité;Prix unitaire;Nom;Adresse;Code postal;Ville;Pays',
      `V-1;29/09/2026 10:00;Payée;CJ-555;Lampe;2;19,90 €;Dana Roy;4 rue Haute;13001;Marseille;FR`,
      `V-1;29/09/2026 10:00;Payée;INCONNU;Bougie;1;5,00 €;Dana Roy;4 rue Haute;13001;Marseille;FR`,
      `V-2;29/09/2026 11:00;Annulée;CJ-555;Lampe;1;19,90 €;Eli Fox;1 rue Basse;13002;Marseille;FR`,
    ].join('\n')
    const imp = await importerCommandes(user.id, 'CDISCOUNT', csv)
    const oImp = await prisma.order.findFirst({ where: { userId: user.id, platform: 'CDISCOUNT' } })
    verifier('une vente importée, annulée écartée, inconnue dite', imp.creees === 1 && imp.ecartees === 1 && imp.sansProduit.length === 1, JSON.stringify(imp))
    verifier('prix unitaire × quantité, adresse, date française', Number(oImp?.amount) === 39.8 && oImp?.quantity === 2 && (oImp?.buyerAddress as Record<string, string>).countryCode === 'FR' && oImp?.createdAt.toISOString().startsWith('2026-09-29'))
    const imp2 = await importerCommandes(user.id, 'CDISCOUNT', csv)
    verifier('réimporter le même fichier ne double rien', imp2.creees === 0 && imp2.deja === 1)
    const sansSku = await importerCommandes(user.id, 'CDISCOUNT', 'Commande;Total\nA;10\n')
    verifier('colonne de référence absente : dite, rien importé', sansSku.manquantes.includes('référence produit (SKU)') && sansSku.creees === 0)
  } finally {
    fermer.forEach((f) => f())
    await prisma.order.deleteMany({ where: { userId: user.id } })
    await prisma.platformCredential.deleteMany({ where: { userId: user.id } })
    await prisma.product.deleteMany({ where: { userId: user.id } })
    await prisma.user.delete({ where: { id: user.id } })
    await prisma.$disconnect()
  }

  if (echecs) {
    console.error(`\n${echecs} attente(s) manquée(s).`)
    process.exit(1)
  }
  console.log('\nVentes multi-canal : tout passe.')
  process.exit(0)
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
