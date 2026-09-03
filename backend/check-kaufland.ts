import { createServer } from 'node:http'
import { createHmac } from 'node:crypto'
import type { Product } from '@prisma/client'
import {
  cleControleValide,
  deposerOffreKaufland,
  KauflandRefus,
  readKauflandCredentials,
  verifierCompteKaufland,
} from './src/services/kaufland.js'

/**
 * Le connecteur Kaufland, éprouvé contre un faux serveur qui recalcule la
 * signature de son côté.
 *
 *   cd backend && npx tsx check-kaufland.ts
 *
 * La leçon d'AliExpress vaut ici mot pour mot : un faux qui dit oui à tout
 * validerait une signature fausse, et la vraie panne n'apparaîtrait qu'en
 * production, déguisée en refus incompréhensible. Le faux recalcule donc le
 * HMAC (méthode, URI, corps, timestamp) avec la Secret Key attendue et
 * refuse tout ce qui ne correspond pas — y compris un timestamp trop vieux.
 *
 * Ce qu'il ne prouve pas, écrit ici : **aucun vrai Kaufland n'a jamais vu ce
 * code.** Il faut un compte vendeur validé pour le constater.
 */

let echecs = 0
function verifier(nom: string, condition: boolean, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

const CLIENT_KEY = 'ck'.repeat(16) // 32 caractères
const SECRET_KEY = 'sk'.repeat(32) // 64 caractères
const EAN_VALIDE = '4006381333931' // clé de contrôle juste

function annonce(surcharge: Partial<Product> = {}): Product {
  return {
    id: 'prod-kl-1',
    aiTitle: 'Bague chevalière acier inoxydable 316L',
    title: 'bague source',
    sellingPrice: 14.9 as never,
    supplierStock: null,
    attributes: { Matière: 'Acier 316L', EAN: EAN_VALIDE },
    ...surcharge,
  } as unknown as Product
}

interface Appel {
  methode: string
  chemin: string
  corps: unknown
  signatureRecue: string
  signatureAttendue: string
}

function fauxKaufland() {
  const journal: Appel[] = []
  let base = ''

  const server = createServer((req, res) => {
    const morceaux: Buffer[] = []
    req.on('data', (m) => morceaux.push(m))
    req.on('end', () => {
      const brut = Buffer.concat(morceaux).toString('utf8')
      const chemin = req.url ?? ''
      const repondre = (code: number, corps: unknown, entetes: Record<string, string> = {}) => {
        res.writeHead(code, { 'Content-Type': 'application/json', ...entetes })
        res.end(JSON.stringify(corps))
      }

      const clientKey = String(req.headers['shop-client-key'] ?? '')
      const timestamp = Number(req.headers['shop-timestamp'] ?? 0)
      const signatureRecue = String(req.headers['shop-signature'] ?? '')

      // Le vrai Kaufland vérifie la clé, l'horloge, puis la signature — dans
      // cet ordre, et le faux fait pareil au lieu de dire oui.
      if (clientKey !== CLIENT_KEY) return repondre(401, { message: 'unknown client key' })
      if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 300) {
        return repondre(401, { message: 'timestamp out of tolerance' })
      }
      /*
       * Le contrat, écrit EN DUR et pas via la fonction du connecteur : si le
       * faux recalculait avec `signatureKaufland`, une faute dans la fonction
       * serait des deux côtés du banc et rien ne tomberait jamais — c'est
       * arrivé à la première contre-épreuve de ce banc.
       */
      const signatureAttendue = createHmac('sha256', SECRET_KEY)
        .update(`${req.method}\n${base}${chemin}\n${brut}\n${timestamp}`)
        .digest('hex')
      journal.push({ methode: req.method!, chemin, corps: brut ? JSON.parse(brut) : null, signatureRecue, signatureAttendue })
      if (signatureRecue !== signatureAttendue) return repondre(401, { message: 'invalid signature' })

      if (chemin.startsWith('/units/?') && req.method === 'GET') {
        return repondre(200, { data: [] })
      }
      if (chemin.startsWith('/units/') && req.method === 'POST') {
        const corps = JSON.parse(brut) as { ean?: string; listing_price?: number }
        if (!corps.ean) return repondre(400, { message: 'ean required' })
        if (!Number.isInteger(corps.listing_price)) return repondre(400, { message: 'listing_price must be integer cents' })
        // 201, corps vide, identifiant dans Location — le contrat de la doc.
        res.writeHead(201, { Location: '/units/151177892008/' })
        return res.end()
      }
      return repondre(404, { message: `unknown path ${chemin}` })
    })
  })

  return new Promise<{ base: string; journal: Appel[]; fermer: () => void }>((resoudre) => {
    server.listen(0, '127.0.0.1', () => {
      base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
      resoudre({ base, journal, fermer: () => server.close() })
    })
  })
}

async function main() {
  console.log('Lecture des identifiants')
  verifier('rien sans les deux clés', readKauflandCredentials({ clientKey: 'x' }) === null)
  const lus = readKauflandCredentials({ clientKey: CLIENT_KEY, secretKey: SECRET_KEY })
  verifier('la France est le pays par défaut', lus?.storefront === 'fr')

  console.log('\nLa clé de contrôle GS1')
  verifier('un EAN-13 juste passe', cleControleValide(EAN_VALIDE))
  verifier('un chiffre changé le fait tomber', !cleControleValide('4006381333932'))
  verifier('un EAN-8 juste passe', cleControleValide('96385074'))
  verifier('du texte ne passe jamais', !cleControleValide('pas-un-ean'))

  const faux = await fauxKaufland()
  const creds = { clientKey: CLIENT_KEY, secretKey: SECRET_KEY, storefront: 'fr', baseUrl: faux.base }

  try {
    console.log('\nLe dépôt complet')
    const depot = await deposerOffreKaufland(creds, annonce())
    verifier("l'unité est lue dans l'en-tête Location", depot.uniteId === '151177892008')
    verifier('la remarque explique la greffe par EAN', /greffe/.test(depot.note))

    const envoi = faux.journal.find((a) => a.methode === 'POST')
    const corps = envoi?.corps as { ean?: string; listing_price?: number; amount?: number; condition?: string }
    verifier('la signature envoyée est celle que le serveur recalcule', envoi?.signatureRecue === envoi?.signatureAttendue)
    verifier("l'EAN part tel quel", corps?.ean === EAN_VALIDE)
    verifier('le prix part en centimes entiers', corps?.listing_price === 1490, `${corps?.listing_price}`)
    verifier('sans stock fournisseur, dix — pas cent', corps?.amount === 10)
    verifier('le pays de vente est dans la requête', /storefront=fr/.test(envoi?.chemin ?? ''))

    console.log('\nCe que dit un refus')
    let sansEan: KauflandRefus | null = null
    const postsAvant = faux.journal.filter((a) => a.methode === 'POST').length
    try {
      await deposerOffreKaufland(creds, annonce({ attributes: { Matière: 'Acier' } } as never))
    } catch (e) {
      sansEan = e as KauflandRefus
    }
    verifier('sans EAN, un refus qui dit le geste — avant tout appel', /EAN/.test(sansEan?.message ?? ''))
    verifier('aucune requête ne part', faux.journal.filter((a) => a.methode === 'POST').length === postsAvant)
    verifier('et le refus ne porte que sur cette annonce', sansEan?.liaison === false)

    let eanFaux: KauflandRefus | null = null
    try {
      await deposerOffreKaufland(creds, annonce({ attributes: { EAN: '4006381333932' } } as never))
    } catch (e) {
      eanFaux = e as KauflandRefus
    }
    verifier('un EAN à clé de contrôle fausse est refusé chez nous', /clé de contrôle/.test(eanFaux?.message ?? ''))

    let mauvaiseCle: KauflandRefus | null = null
    try {
      await deposerOffreKaufland({ ...creds, secretKey: 'x'.repeat(64) }, annonce())
    } catch (e) {
      mauvaiseCle = e as KauflandRefus
    }
    verifier('une signature fausse revient en refus de liaison lisible', /Clés Kaufland refusées/.test(mauvaiseCle?.message ?? ''))
    verifier('signalé comme un problème de compte', mauvaiseCle?.liaison === true)

    console.log('\nLa vérification de compte')
    await verifierCompteKaufland(creds)
    verifier('elle lit une unité, signée pareil', faux.journal.some((a) => a.methode === 'GET' && /limit=1/.test(a.chemin)))
  } finally {
    faux.fermer()
  }

  console.log(echecs ? `\n${echecs} échec(s).` : '\nTout passe.')
  // `process.exitCode`, jamais `process.exit()` : la fermeture du faux serveur
  // plante sinon sur Windows (UV_HANDLE_CLOSING).
  process.exitCode = echecs ? 1 : 0
}

main().catch((err) => {
  console.log(`\nRATE  le banc s'est interrompu — ${err?.message ?? err}`)
  process.exitCode = 1
})
