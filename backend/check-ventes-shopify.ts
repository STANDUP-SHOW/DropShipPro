/**
 * Banc : la capture des ventes Shopify et le renvoi du suivi
 * (services/ventesMarketplaces.ts), sur un compte JETABLE et un faux Shopify
 * dont le contrat est écrit en dur — requête `orders`, `fulfillmentOrders`,
 * mutation `fulfillmentCreate` — jamais recalculé avec le code jugé.
 *
 * Ce qu'il tient, parce que c'est là que l'auto-fulfillment coûte de l'argent :
 * une vente rattachée au mauvais produit (« CJ-123 » qui capte « CJ-1234 »),
 * une vente annulée ou impayée qui entre, une relecture qui double les
 * commandes, un suivi renvoyé à chaque tournée, une permission manquante
 * rendue en « erreur » muette.
 */
import { prisma } from './src/lib/prisma.js'
import { enregistrerVentes, passageShopify, produitDeLUgs, releverVentesShopify, tourneeVentes, type AppelGraphql } from './src/services/ventesMarketplaces.js'

let echecs = 0
function verifier(nom: string, condition: boolean, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

const maintenant = Date.now()
const iso = (msAvant: number) => new Date(maintenant - msAvant).toISOString()

/** Le faux Shopify : trois commandes (payée, annulée, en attente), et le jeu de l'expédition. */
function fauxShopify(opts: { refuse?: boolean; erreurExpedition?: boolean } = {}) {
  const journal: Array<{ query: string; variables: Record<string, unknown> }> = []
  const commande = (id: number, extra: Record<string, unknown>, lignes: Array<{ id: number; sku: string | null; montant: string; qte?: number }>) => ({
    node: {
      id: `gid://shopify/Order/${id}`,
      name: `#${1000 + id}`,
      createdAt: iso(3_600_000),
      cancelledAt: null,
      displayFinancialStatus: 'PAID',
      email: 'alice@exemple.test',
      currencyCode: 'EUR',
      shippingAddress: { name: 'Alice Martin', firstName: 'Alice', lastName: 'Martin', address1: '3 rue des Lilas', address2: null, city: 'Lyon', zip: '69003', province: null, countryCodeV2: 'FR', country: 'France', phone: '+33600000000' },
      lineItems: { edges: lignes.map((l) => ({ node: { id: `gid://shopify/LineItem/${l.id}`, sku: l.sku, title: `Article ${l.id}`, quantity: l.qte ?? 1, discountedTotalSet: { shopMoney: { amount: l.montant } } } })) },
      ...extra,
    },
  })
  const appel: AppelGraphql = async <T,>(query: string, variables: Record<string, unknown>) => {
    journal.push({ query, variables })
    if (opts.refuse) throw new Error('Jeton refusé par Shopify. Shopify dit : [API] This action requires merchant approval for read_orders scope.')
    if (query.includes('orders(first')) {
      if (!String(variables.q).startsWith("created_at:>='")) throw new Error('filtre de date attendu')
      return {
        orders: {
          edges: [
            commande(1, {}, [
              { id: 11, sku: 'CJ-1234-M-noir', montant: '39.90' },
              { id: 12, sku: 'INCONNU-9', montant: '5.00' },
            ]),
            commande(2, { cancelledAt: iso(1000) }, [{ id: 21, sku: 'CJ-123', montant: '10.00' }]),
            commande(3, { displayFinancialStatus: 'PENDING' }, [{ id: 31, sku: 'CJ-123', montant: '10.00' }]),
            commande(4, {}, [{ id: 41, sku: 'DSP-X', montant: '0' }]),
          ],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      } as T
    }
    if (query.includes('fulfillmentOrders')) {
      return { order: { fulfillmentOrders: { edges: [{ node: { id: 'gid://shopify/FulfillmentOrder/77', status: 'OPEN' } }, { node: { id: 'gid://shopify/FulfillmentOrder/78', status: 'CLOSED' } }] } } } as T
    }
    if (query.includes('fulfillmentCreate')) {
      return { fulfillmentCreate: { fulfillment: { id: 'f1', status: 'SUCCESS' }, userErrors: opts.erreurExpedition ? [{ message: 'Fulfillment order is closed' }] : [] } } as T
    }
    throw new Error('requête inattendue')
  }
  return { appel, journal }
}

async function main() {
  const marque = `banc-ventes-${maintenant}`
  const user = await prisma.user.create({ data: { email: `${marque}@exemple.test`, passwordHash: 'x', credits: 0 } })
  try {
    const base = { userId: user.id, sourceUrl: 'https://exemple.test/p', description: 'd', images: [], price: 10, sellingPrice: 30 }
    const court = await prisma.product.create({ data: { ...base, title: 'Court', supplierId: 'cj', supplierRef: '123' } })
    const long = await prisma.product.create({ data: { ...base, title: 'Long', supplierId: 'cj', supplierRef: '1234' } })
    const interne = await prisma.product.create({ data: { ...base, title: 'Sans référence fournisseur' } })

    console.log('La référence de vente → le produit')
    verifier('« CJ-1234-M-noir » va au produit 1234, pas au 123 (la plus longue gagne)', (await produitDeLUgs(user.id, 'CJ-1234-M-noir')) === long.id)
    verifier('« CJ-123 » va au produit 123', (await produitDeLUgs(user.id, 'CJ-123')) === court.id)
    verifier('« cj-123 » : le fournisseur en minuscules est reconnu', (await produitDeLUgs(user.id, 'cj-123')) === court.id)
    verifier('« DSP-<10 derniers> » (ugsDe sans référence) retrouve le produit', (await produitDeLUgs(user.id, `DSP-${interne.id.slice(-10).toUpperCase()}`)) === interne.id)
    verifier('« DSP-123 » (boutiques tierces) retrouve la référence fournisseur', (await produitDeLUgs(user.id, 'DSP-123')) === court.id)
    verifier('une référence inconnue ne se rattache à rien', (await produitDeLUgs(user.id, 'INCONNU-9')) === null && (await produitDeLUgs(user.id, null)) === null)

    console.log('\nRelevé Shopify')
    const faux = fauxShopify()
    const ventes = await releverVentesShopify(faux.appel, new Date(maintenant - 86_400_000))
    verifier('annulée et impayée écartées : deux commandes gardées', ventes.length === 2 && ventes.map((v) => v.numero).join(',') === '#1001,#1004')
    const v1 = ventes[0]
    verifier('adresse aux clés que lit la commande fournisseur', v1.acheteur.adresse.name === 'Alice Martin' && v1.acheteur.adresse.address1 === '3 rue des Lilas' && v1.acheteur.adresse.countryCode === 'FR' && v1.acheteur.adresse.zip === '69003')
    verifier('montant de ligne remises déduites, devise, date', v1.lignes[0].montant === 39.9 && v1.devise === 'EUR' && v1.creeLe.getTime() === maintenant - 3_600_000)

    console.log('\nEnregistrement')
    const bilan = await enregistrerVentes(user.id, ventes)
    verifier('une vente créée, les lignes sans produit sont dites', bilan.creees === 1 && bilan.sansProduit.length === 2 && bilan.sansProduit.some((s) => s.sku === 'INCONNU-9'), JSON.stringify(bilan))
    const cree = await prisma.order.findFirst({ where: { userId: user.id } })
    verifier('la commande porte produit, acheteur, e-mail, montant, payée, clé Shopify', cree?.productId === long.id && cree.buyerName === 'Alice Martin' && cree.buyerEmail === 'alice@exemple.test' && Number(cree.amount) === 39.9 && !!cree.paidAt && cree.externalOrderId === 'gid://shopify/Order/1')
    const rejoue = await enregistrerVentes(user.id, ventes)
    verifier('relire la même fenêtre ne double rien', rejoue.creees === 0 && rejoue.deja === 1 && (await prisma.order.count({ where: { userId: user.id } })) === 1)

    console.log('\nRenvoi du suivi')
    await prisma.order.update({ where: { id: cree!.id }, data: { trackingNumber: '8G0001', carrier: 'Colissimo', status: 'SHIPPED' } })
    const f2 = fauxShopify()
    const p1 = await passageShopify(user.id, f2.appel)
    const mutation = f2.journal.find((j) => j.query.includes('fulfillmentCreate'))
    const entree = mutation?.variables.f as { lineItemsByFulfillmentOrder: Array<{ fulfillmentOrderId: string }>; trackingInfo: { number: string; company: string }; notifyCustomer: boolean } | undefined
    verifier('le suivi part sur les lignes OUVERTES seulement, avec transporteur, client prévenu', p1.suivis === 1 && entree?.lineItemsByFulfillmentOrder.length === 1 && entree.lineItemsByFulfillmentOrder[0].fulfillmentOrderId === 'gid://shopify/FulfillmentOrder/77' && entree.trackingInfo.number === '8G0001' && entree.trackingInfo.company === 'Colissimo' && entree.notifyCustomer === true)
    verifier('la commande est marquée « suivi transmis »', !!(await prisma.order.findUnique({ where: { id: cree!.id } }))?.suiviTransmisAt)
    const f3 = fauxShopify()
    const p2 = await passageShopify(user.id, f3.appel)
    verifier('la tournée suivante ne renvoie pas le suivi', p2.suivis === 0 && !f3.journal.some((j) => j.query.includes('fulfillmentCreate')))

    await prisma.order.update({ where: { id: cree!.id }, data: { suiviTransmisAt: null } })
    const f4 = fauxShopify({ erreurExpedition: true })
    await passageShopify(user.id, f4.appel)
    const enErreur = await prisma.order.findUnique({ where: { id: cree!.id } })
    verifier('un refus d’expédition est écrit en clair et n’est pas rejoué', !enErreur?.suiviTransmisAt && /Fulfillment order is closed/.test(enErreur?.suiviTransmisErreur ?? ''))
    const f5 = fauxShopify()
    await passageShopify(user.id, f5.appel)
    verifier('… la tournée suivante ne le retente pas en boucle', !f5.journal.some((j) => j.query.includes('fulfillmentCreate')))

    console.log('\nPermissions')
    const p3 = await passageShopify(user.id, fauxShopify({ refuse: true }).appel)
    verifier('une permission manquante devient le geste à faire', !!p3.erreur && /read_orders/.test(p3.erreur) && /write_merchant_managed_fulfillment_orders/.test(p3.erreur), p3.erreur ?? '')

    console.log('\nTournée')
    await tourneeVentes([user.id])
    verifier('la tournée bornée à un compte sans Shopify relié ne fait rien et ne plante pas', true)
  } finally {
    await prisma.order.deleteMany({ where: { userId: user.id } })
    await prisma.user.delete({ where: { id: user.id } })
    await prisma.$disconnect()
  }

  if (echecs) {
    console.error(`\n${echecs} attente(s) manquée(s).`)
    process.exit(1)
  }
  console.log('\nVentes Shopify : tout passe.')
  process.exit(0)
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
