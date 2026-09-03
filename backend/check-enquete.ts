import { createServer } from 'node:http'
import { createHmac } from 'node:crypto'

/**
 * L'enquête fournisseurs quotidienne, éprouvée contre un faux AliExpress et
 * la vraie base.
 *
 *   cd backend && npx tsx check-enquete.ts
 *
 * Ce qu'elle promet : pour un vendeur à rayon actif et clé AliExpress reliée,
 * le flux « meilleures ventes » est relevé une fois par jour et déposé en
 * opportunités — rattachées au bon rayon quand le lexique de titres tranche,
 * sans rayon sinon, jamais dans le mauvais.
 *
 * Le faux serveur recalcule la signature **en dur** (paramètres triés, collés
 * clé+valeur, HMAC-SHA256 du secret en hexadécimal majuscule) — la leçon de
 * check-kaufland : un faux qui vérifie avec la fonction du connecteur a la
 * faute des deux côtés et ne tombe jamais.
 */

let echecs = 0
function verifier(nom: string, condition: boolean, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

const APP_KEY = 'app-key-banc'
const APP_SECRET = 'app-secret-banc'
const JETON = 'jeton-acces-banc'

function fauxAliExpress() {
  let appels = 0
  const server = createServer((req, res) => {
    const morceaux: Buffer[] = []
    req.on('data', (m) => morceaux.push(m))
    req.on('end', () => {
      appels++
      const params = Object.fromEntries(new URLSearchParams(Buffer.concat(morceaux).toString('utf8')))
      const repondre = (corps: unknown) => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(corps))
      }

      // La signature, recalculée EN DUR d'après la doc : jamais via signer().
      const { sign, ...reste } = params
      const base = Object.keys(reste)
        .sort()
        .reduce((acc, cle) => acc + cle + reste[cle], '')
      const attendue = createHmac('sha256', APP_SECRET).update(base, 'utf8').digest('hex').toUpperCase()

      if (params.method !== 'aliexpress.ds.recommend.feed.get') {
        return repondre({ error_response: { msg: `méthode inattendue : ${params.method}` } })
      }
      if (params.app_key !== APP_KEY || params.access_token !== JETON) {
        return repondre({ error_response: { msg: 'clé ou jeton inconnus' } })
      }
      if (sign !== attendue) {
        return repondre({ error_response: { msg: 'signature invalide' } })
      }

      repondre({
        aliexpress_ds_recommend_feed_get_response: {
          result: {
            products: {
              traffic_product_d_t_o: [
                {
                  product_id: '1001',
                  product_title: 'Écouteurs sans fil Bluetooth réduction de bruit',
                  target_sale_price: '12.90',
                  target_sale_price_currency: 'EUR',
                  product_main_image_url: 'https://ae01.alicdn.com/ecouteurs.jpg',
                  product_detail_url: 'https://www.aliexpress.com/item/1001.html',
                },
                {
                  product_id: '1002',
                  product_title: 'Objet mystérieux sans famille connue zzz',
                  target_sale_price: '4.50',
                  product_detail_url: 'https://www.aliexpress.com/item/1002.html',
                },
                {
                  product_id: '1003',
                  product_title: 'Montre connectée bracelet sport',
                  target_sale_price: '19.90',
                  product_detail_url: 'https://www.aliexpress.com/item/1003.html',
                },
              ],
            },
          },
        },
      })
    })
  })

  return new Promise<{ base: string; compter: () => number; fermer: () => void }>((resoudre) => {
    server.listen(0, '127.0.0.1', () => {
      resoudre({
        base: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
        compter: () => appels,
        fermer: () => server.close(),
      })
    })
  })
}

async function main() {
  const faux = await fauxAliExpress()
  // La passerelle est lue à l'import du connecteur : posée AVANT, d'où les
  // imports dynamiques.
  process.env.ALIEXPRESS_TOP_URL = faux.base
  const { prisma } = await import('./src/lib/prisma.js')
  const { enqueteAliExpress } = await import('./src/services/enqueteFournisseurs.js')

  const user = await prisma.user.create({
    data: { email: `banc-enquete-${Date.now()}@example.com`, passwordHash: 'x' },
  })

  try {
    console.log('Les deux conditions du produit')
    const sansRayon = await enqueteAliExpress(user.id)
    verifier("sans rayon actif, l'enquête dit pourquoi elle ne tourne pas", /rayon actif/.test(sansRayon.raison ?? ''))

    // Le rayon des téléphones : c'est le secteur où le lexique range les
    // écouteurs Bluetooth, et c'est le rattachement qu'on veut voir.
    const rayon = await prisma.department.create({
      data: { userId: user.id, key: 'telephones-portables-et-accessoires', agentName: 'Malik', paidUntil: new Date(Date.now() + 86400000) },
    })
    const sansCle = await enqueteAliExpress(user.id)
    verifier('sans liaison AliExpress, le geste est rendu', /Sourcing › Fournisseurs/.test(sansCle.raison ?? ''))
    verifier('et aucun appel réseau ne part', faux.compter() === 0)

    console.log('\nLe relevé et le rattachement')
    await prisma.supplierConnection.create({
      data: {
        userId: user.id,
        supplier: 'aliexpress',
        connected: true,
        data: { appKey: APP_KEY, appSecret: APP_SECRET, accessToken: JETON },
      },
    })
    const releve = await enqueteAliExpress(user.id)
    verifier('les trois lignes du flux sont déposées', releve.deposees === 3 && releve.relevees === 3, JSON.stringify(releve))

    const deposees = await prisma.opportunity.findMany({ where: { userId: user.id }, orderBy: { title: 'asc' } })
    const ecouteurs = deposees.find((o) => /couteurs/.test(o.title))
    const mystere = deposees.find((o) => /mystérieux/.test(o.title))
    verifier('le titre que le lexique tranche rejoint son rayon', ecouteurs?.departmentId === rayon.id)
    verifier('le titre ambigu est déposé sans rayon, jamais dans le mauvais', mystere?.departmentId === null)
    verifier('le prix marché reste vide — le flux ne le dit pas', deposees.every((o) => o.marketPrice === null))
    verifier("l'entrepôt reste « non confirmé »", deposees.every((o) => o.euStock === null))

    console.log('\nLa garde des vingt heures')
    const appelsAvant = faux.compter()
    const rejoue = await enqueteAliExpress(user.id)
    verifier('une seconde tournée le même jour est sautée', rejoue.deposees === 0 && /déjà passée/.test(rejoue.raison ?? ''))
    verifier('sans le moindre appel réseau', faux.compter() === appelsAvant)

    console.log('\nLe dédoublonnage avec les dépôts externes')
    await prisma.opportunity.updateMany({
      where: { userId: user.id },
      data: { createdAt: new Date(Date.now() - 24 * 3600 * 1000) },
    })
    const lendemain = await enqueteAliExpress(user.id)
    verifier(
      'le lendemain, les produits déjà repérés ne font pas doublon',
      lendemain.deposees === 0 && lendemain.relevees === 3,
      JSON.stringify(lendemain),
    )
  } finally {
    await prisma.user.deleteMany({ where: { id: user.id } })
    await prisma.$disconnect()
    faux.fermer()
  }

  console.log(echecs ? `\n${echecs} échec(s).` : '\nTout passe.')
  process.exitCode = echecs ? 1 : 0
}

main().catch((err) => {
  console.log(`\nRATE  le banc s'est interrompu — ${err?.message ?? err}`)
  process.exitCode = 1
})
