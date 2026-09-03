import { createServer } from 'node:http'
import type { Product } from '@prisma/client'
import { categorieEbay, EbayRefus, publierSurEbay, readEbayCredentials } from './src/services/ebay.js'

/**
 * Le connecteur eBay, éprouvé contre un faux serveur Sell API.
 *
 *   cd backend && npx tsx check-ebay.ts
 *
 * La publication est un triptyque — fiche d'inventaire, offre, mise en ligne —
 * précédé de deux préparatifs : la catégorie demandée à la taxonomie d'eBay,
 * et les politiques du compte relues telles quelles. Le banc vérifie chaque
 * appel **avant** de répondre : la leçon de `check-lot` reste valable, un faux
 * qui dit oui à tout invente des succès.
 *
 * Ce qu'il ne couvre pas, écrit ici plutôt que découvert plus tard : **aucun
 * vrai compte eBay n'a jamais vu ce code.** Le faux prouve que nous respectons
 * la spécification lue sur developer.ebay.com ; il ne prouve pas qu'eBay
 * acceptera l'annonce.
 */

let echecs = 0
function verifier(nom: string, condition: boolean, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

const JETON = 'jeton-ebay-valide'
const JETON_FRAIS = 'jeton-ebay-frais'
const REFRESH = 'refresh-abc'
const CLIENT_ID = 'app-id-1'
const CLIENT_SECRET = 'cert-id-1'

function annonce(surcharge: Partial<Product> = {}): Product {
  return {
    id: 'prod-ebay-1',
    aiTitle: 'Bague chevalière acier inoxydable 316L pour homme, taille réglable, livrée en écrin cadeau',
    title: 'bague source',
    aiDescription: 'Acier 316L ; taille réglable ; livrée en écrin.',
    description: 'description source',
    sellingPrice: 14.9 as never,
    supplierStock: null,
    attributes: { Matière: 'Acier 316L', Marque: 'Sans marque' },
    titleVariants: null,
    ...surcharge,
  } as unknown as Product
}

interface Appel {
  methode: string
  chemin: string
  auth: string
  langue: string
  corps: unknown
}

/**
 * Le faux eBay. Il refuse tout ce qui ne respecte pas le contrat lu dans la
 * documentation : jeton en `Bearer`, JSON, Content-Language sur la fiche.
 */
function fauxEbay() {
  const journal: Appel[] = []
  const etat = { sansPolitiques: false, sansEmplacement: false, refusOffre: false }

  const server = createServer((req, res) => {
    const morceaux: Buffer[] = []
    req.on('data', (m) => morceaux.push(m))
    req.on('end', () => {
      const brut = Buffer.concat(morceaux).toString('utf8')
      const chemin = req.url ?? ''
      const auth = String(req.headers.authorization ?? '')
      const repondre = (code: number, corps: unknown) => {
        res.writeHead(code, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(corps))
      }

      // L'échange de renouvellement : Basic, pas Bearer, et un formulaire.
      if (chemin === '/identity/v1/oauth2/token') {
        const attendu = `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`
        const params = new URLSearchParams(brut)
        if (auth !== attendu) return repondre(401, { error: 'invalid_client' })
        if (params.get('grant_type') !== 'refresh_token' || params.get('refresh_token') !== REFRESH) {
          return repondre(400, { error: 'invalid_grant' })
        }
        journal.push({ methode: req.method!, chemin, auth, langue: '', corps: brut })
        return repondre(200, { access_token: JETON_FRAIS, expires_in: 7200 })
      }

      // Tout le reste exige un Bearer valide — c'est la première chose que le
      // vrai eBay vérifie, donc la première que le faux vérifie.
      if (auth !== `Bearer ${JETON}` && auth !== `Bearer ${JETON_FRAIS}`) {
        return repondre(401, { errors: [{ message: 'Invalid access token' }] })
      }

      journal.push({
        methode: req.method!,
        chemin,
        auth,
        langue: String(req.headers['content-language'] ?? ''),
        corps: brut ? JSON.parse(brut) : null,
      })

      if (chemin.startsWith('/commerce/taxonomy/v1/get_default_category_tree_id')) {
        if (!chemin.includes('marketplace_id=EBAY_FR')) return repondre(400, { errors: [{ message: 'marketplace requis' }] })
        return repondre(200, { categoryTreeId: '71' })
      }
      if (chemin.startsWith('/commerce/taxonomy/v1/category_tree/71/get_category_suggestions')) {
        const q = decodeURIComponent(chemin.split('q=')[1] ?? '')
        if (!q) return repondre(400, { errors: [{ message: 'q requis' }] })
        if (q.includes('introuvable')) return repondre(200, { categorySuggestions: [] })
        return repondre(200, { categorySuggestions: [{ category: { categoryId: '260325', categoryName: 'Bagues' } }] })
      }
      if (chemin.startsWith('/sell/account/v1/fulfillment_policy')) {
        return repondre(200, { total: 1, fulfillmentPolicies: etat.sansPolitiques ? [] : [{ fulfillmentPolicyId: 'FP-1' }] })
      }
      if (chemin.startsWith('/sell/account/v1/payment_policy')) {
        return repondre(200, { total: 1, paymentPolicies: etat.sansPolitiques ? [] : [{ paymentPolicyId: 'PP-1' }] })
      }
      if (chemin.startsWith('/sell/account/v1/return_policy')) {
        return repondre(200, { total: 1, returnPolicies: etat.sansPolitiques ? [] : [{ returnPolicyId: 'RP-1' }] })
      }
      if (chemin.startsWith('/sell/inventory/v1/location')) {
        return repondre(200, { total: 1, locations: etat.sansEmplacement ? [] : [{ merchantLocationKey: 'LOC-1' }] })
      }
      if (chemin.startsWith('/sell/inventory/v1/inventory_item/') && req.method === 'PUT') {
        // La fiche pour eBay France doit annoncer sa langue.
        if (String(req.headers['content-language'] ?? '') !== 'fr-FR') {
          return repondre(400, { errors: [{ message: 'Content-Language manquant' }] })
        }
        return repondre(204, {})
      }
      if (chemin === '/sell/inventory/v1/offer' && req.method === 'POST') {
        if (etat.refusOffre) {
          return repondre(400, {
            errors: [{ message: 'Aspect Marque requis', longMessage: "La catégorie Bagues exige l'aspect « Marque »." }],
          })
        }
        return repondre(200, { offerId: 'OF-1' })
      }
      if (chemin === '/sell/inventory/v1/offer/OF-1/publish' && req.method === 'POST') {
        return repondre(200, { listingId: '405123456789' })
      }
      return repondre(404, { errors: [{ message: `chemin inconnu: ${chemin}` }] })
    })
  })

  return new Promise<{ base: string; journal: Appel[]; etat: typeof etat; fermer: () => void }>((resoudre) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port
      resoudre({ base: `http://127.0.0.1:${port}`, journal, etat, fermer: () => server.close() })
    })
  })
}

async function main() {
  console.log('Lecture des identifiants')
  verifier('rien sans jeton', readEbayCredentials({ clientId: 'x' }) === null)
  verifier('le jeton est nettoyé', readEbayCredentials({ accessToken: `  ${JETON}  ` })?.accessToken === JETON)
  verifier("l'ancien champ « token » est lu aussi", readEbayCredentials({ token: JETON })?.accessToken === JETON)

  const faux = await fauxEbay()
  const creds = { accessToken: JETON, baseUrl: faux.base }

  try {
    console.log('\nLa publication complète')
    const memorisations: string[] = []
    const resultat = await publierSurEbay(annonce(), creds, {
      images: ['https://api.example.com/storage/prod-ebay-1/photo-1.jpg', 'https://api.example.com/storage/prod-ebay-1/photo-2.jpg'],
      categorie: 'Bagues',
      memoriser: async (id) => void memorisations.push(id),
    })

    verifier('la mise en ligne rend le numéro d’annonce', resultat.listingId === '405123456789')
    verifier('et l’adresse publique eBay.fr', resultat.externalUrl === 'https://www.ebay.fr/itm/405123456789')
    verifier('la catégorie suggérée est mémorisée', memorisations.length === 1 && memorisations[0] === '260325')

    const fiche = faux.journal.find((a) => a.chemin.startsWith('/sell/inventory/v1/inventory_item/'))
    const corpsFiche = fiche?.corps as {
      product?: { title?: string; imageUrls?: string[]; aspects?: Record<string, string[]> }
      condition?: string
      availability?: { shipToLocationAvailability?: { quantity?: number } }
    }
    verifier('la fiche est adressée par la référence produit', /prod-ebay-1$/.test(fiche?.chemin ?? ''))
    verifier(
      'le titre tient dans les 80 caractères d’eBay',
      (corpsFiche?.product?.title?.length ?? 999) <= 80,
      `${corpsFiche?.product?.title?.length} caractères`,
    )
    verifier('les photos partent en adresses absolues', corpsFiche?.product?.imageUrls?.every((u) => u.startsWith('https://')) === true)
    verifier('les caractéristiques deviennent des aspects', corpsFiche?.product?.aspects?.['Matière']?.[0] === 'Acier 316L')
    verifier('sans stock fournisseur, dix — pas cent', corpsFiche?.availability?.shipToLocationAvailability?.quantity === 10)

    const offre = faux.journal.find((a) => a.chemin === '/sell/inventory/v1/offer')
    const corpsOffre = offre?.corps as {
      marketplaceId?: string
      categoryId?: string
      pricingSummary?: { price?: { value?: string; currency?: string } }
      listingPolicies?: Record<string, string>
      merchantLocationKey?: string
    }
    verifier('l’offre vise eBay France', corpsOffre?.marketplaceId === 'EBAY_FR')
    verifier('avec la catégorie que la taxonomie a suggérée', corpsOffre?.categoryId === '260325')
    verifier('le prix a deux décimales et une devise', corpsOffre?.pricingSummary?.price?.value === '14.90' && corpsOffre?.pricingSummary?.price?.currency === 'EUR')
    verifier(
      'les trois politiques du compte sont posées',
      corpsOffre?.listingPolicies?.fulfillmentPolicyId === 'FP-1' &&
        corpsOffre?.listingPolicies?.paymentPolicyId === 'PP-1' &&
        corpsOffre?.listingPolicies?.returnPolicyId === 'RP-1',
    )
    verifier('avec l’emplacement marchand', corpsOffre?.merchantLocationKey === 'LOC-1')

    console.log('\nLa mémoire de catégorie')
    const avant = faux.journal.filter((a) => a.chemin.includes('/commerce/taxonomy/')).length
    await publierSurEbay(annonce(), creds, { images: ['https://api.example.com/p.jpg'], categorie: 'Bagues', categorieMemorisee: '260325' })
    const apres = faux.journal.filter((a) => a.chemin.includes('/commerce/taxonomy/')).length
    verifier('une catégorie mémorisée ne repart pas à la taxonomie', apres === avant, 'mille produits d’un rayon coûtent une recherche')

    console.log('\nCe que dit un refus')
    let sansCategorie: EbayRefus | null = null
    const putsAvant = faux.journal.filter((a) => a.methode === 'PUT').length
    try {
      await publierSurEbay(annonce(), creds, { images: [], categorie: 'catégorie introuvable' })
    } catch (e) {
      sansCategorie = e as EbayRefus
    }
    verifier('sans catégorie trouvée, un refus qui dit le geste', /catégorie/.test(sansCategorie?.message ?? ''))
    verifier('posé avant tout envoi de fiche', faux.journal.filter((a) => a.methode === 'PUT').length === putsAvant)
    verifier('et qui ne porte que sur cette annonce', sansCategorie?.liaison === false)

    faux.etat.sansPolitiques = true
    let sansPolitiques: EbayRefus | null = null
    try {
      await publierSurEbay(annonce(), creds, { images: [], categorie: 'Bagues', categorieMemorisee: '260325' })
    } catch (e) {
      sansPolitiques = e as EbayRefus
    }
    faux.etat.sansPolitiques = false
    verifier('un compte sans politiques de vente reçoit le geste exact', /politiques de vente/.test(sansPolitiques?.message ?? ''))
    verifier('signalé comme un problème de compte', sansPolitiques?.liaison === true)

    faux.etat.sansEmplacement = true
    let sansEmplacement: EbayRefus | null = null
    try {
      await publierSurEbay(annonce(), creds, { images: [], categorie: 'Bagues', categorieMemorisee: '260325' })
    } catch (e) {
      sansEmplacement = e as EbayRefus
    }
    faux.etat.sansEmplacement = false
    verifier('un compte sans emplacement marchand aussi', /emplacement/.test(sansEmplacement?.message ?? ''))

    faux.etat.refusOffre = true
    let offreRefusee: EbayRefus | null = null
    try {
      await publierSurEbay(annonce(), creds, { images: [], categorie: 'Bagues', categorieMemorisee: '260325' })
    } catch (e) {
      offreRefusee = e as EbayRefus
    }
    faux.etat.refusOffre = false
    verifier('un refus d’offre porte le message d’eBay, pas un code', /Marque/.test(offreRefusee?.message ?? ''))
    verifier('et n’arrête que ce produit-là', offreRefusee?.liaison === false)

    console.log('\nLe jeton de deux heures')
    let perime: EbayRefus | null = null
    try {
      await publierSurEbay(annonce(), { accessToken: 'perime', baseUrl: faux.base }, { images: [], categorie: 'Bagues', categorieMemorisee: '260325' })
    } catch (e) {
      perime = e as EbayRefus
    }
    verifier('sans trio, un jeton mort explique quoi faire', /refresh token/.test(perime?.message ?? ''))

    const renouvele = await publierSurEbay(
      annonce(),
      { accessToken: 'perime', refreshToken: REFRESH, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, baseUrl: faux.base },
      { images: ['https://api.example.com/p.jpg'], categorie: 'Bagues', categorieMemorisee: '260325' },
    )
    verifier('avec le trio, le jeton est renouvelé et la publication passe', renouvele.listingId === '405123456789')
    const dernierePub = faux.journal.filter((a) => a.chemin.includes('/publish')).pop()
    verifier('les appels rejoués portent le jeton frais', dernierePub?.auth === `Bearer ${JETON_FRAIS}`)

    console.log('\nLa taxonomie seule')
    verifier('une suggestion vide rend null, jamais une invention', (await categorieEbay(creds, 'catégorie introuvable')) === null)
  } finally {
    faux.fermer()
  }

  console.log(echecs ? `\n${echecs} échec(s).` : '\nTout passe.')
  // `process.exitCode`, jamais `process.exit()` : sortir de force pendant que
  // le faux serveur se ferme fait planter Node sur Windows (UV_HANDLE_CLOSING).
  process.exitCode = echecs ? 1 : 0
}

main().catch((err) => {
  console.log(`\nRATE  le banc s'est interrompu — ${err?.message ?? err}`)
  process.exitCode = 1
})
