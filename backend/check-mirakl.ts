import { createServer } from 'node:http'
import type { Product } from '@prisma/client'
import {
  colonnesOffre,
  csvOffre,
  deposerOffreMirakl,
  estMirakl,
  identifiantCatalogue,
  normaliserBaseUrl,
  OPERATEURS_MIRAKL,
  readMiraklCredentials,
  suivreDepotMirakl,
} from './src/services/mirakl.js'
import { PLATFORMS } from './src/services/platforms.js'
import { REGLES_PAR_CANAL } from './src/services/channelRules.js'

/**
 * Le connecteur Mirakl, éprouvé contre un faux opérateur.
 *
 *   cd backend && npx tsx check-mirakl.ts
 *
 * **Un connecteur pour cinq destinations** : La Redoute, E.Leclerc, BHV Marais,
 * Kiabi et BrandAlley font tourner leur place de marché sur Mirakl. Même API,
 * mêmes chemins, mêmes en-têtes — seules l'adresse et la clé changent.
 *
 * Ce que ce banc couvre : ce que **nous** envoyons, et ce que nous faisons de
 * ce que l'opérateur répond. Ce qu'il ne couvre pas, et c'est écrit ici plutôt
 * que découvert plus tard : **aucun vrai Mirakl n'a jamais vu ce code.** Il
 * faut pour cela un compte vendeur validé chez l'un des cinq. Un faux serveur
 * prouve que nous respectons la spécification lue ; il ne prouve pas que
 * l'opérateur acceptera l'offre.
 *
 * Le piège que le faux serveur doit éviter — déjà rencontré sur `check-lot` :
 * **un faux qui ne respecte pas le contrat de ce qu'il remplace invente une
 * panne.** Celui-ci vérifie donc l'en-tête, la méthode et le multipart avant de
 * répondre, au lieu de dire oui à tout.
 */

let echecs = 0
function verifier(nom: string, condition: boolean, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

const CLE = 'cle-vendeur-mirakl-123'

/** Une annonce prête à partir, avec son EAN dans les attributs. */
function annonce(surcharge: Partial<Product> = {}): Product {
  return {
    id: 'prod-1',
    aiTitle: 'Bague chevalière acier inoxydable 316L',
    title: 'bague source',
    aiDescription: 'Acier 316L ; taille réglable ; livrée en écrin.',
    description: 'description source',
    sellingPrice: 14.9 as never,
    condition: 'neuf',
    supplierStock: null,
    attributes: { Matière: 'Acier 316L', EAN: '3701234567890' },
    ...surcharge,
  } as unknown as Product
}

/** Le faux opérateur : il vérifie ce qu'on lui envoie avant de répondre. */
function fauxOperateur() {
  const recu: { auth?: string; methode?: string; type?: string; corps?: string } = {}
  const serveur = createServer(async (req, res) => {
    recu.auth = req.headers.authorization
    recu.methode = req.method
    recu.type = req.headers['content-type']

    if (req.headers.authorization !== CLE) {
      res.writeHead(401).end('{"message":"Invalid API key"}')
      return
    }

    if (req.url === '/api/account') {
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"shop_name":"Ma boutique test"}')
      return
    }

    if (req.url?.startsWith('/api/offers/imports/')) {
      res
        .writeHead(200, { 'content-type': 'application/json' })
        .end('{"import_status":"COMPLETE","lines_in_error":0}')
      return
    }

    if (req.url === '/api/offers/imports' && req.method === 'POST') {
      const morceaux: Buffer[] = []
      for await (const c of req) morceaux.push(c as Buffer)
      recu.corps = Buffer.concat(morceaux).toString('utf8')
      res.writeHead(201, { 'content-type': 'application/json' }).end('{"import_id":98765}')
      return
    }

    res.writeHead(404).end('{}')
  })

  return new Promise<{ base: string; recu: typeof recu; fermer: () => void }>((resolve) => {
    serveur.listen(0, '127.0.0.1', () => {
      const port = (serveur.address() as { port: number }).port
      resolve({ base: `http://127.0.0.1:${port}`, recu, fermer: () => serveur.close() })
    })
  })
}

async function main() {
  // --- L'adresse de l'opérateur, lue et non devinée -------------------------
  console.log("\nL'adresse de l'opérateur")
  verifier('un domaine nu reçoit https', normaliserBaseUrl('marketplace.exemple.fr') === 'https://marketplace.exemple.fr')
  verifier('la barre finale est retirée', normaliserBaseUrl('https://x.fr/') === 'https://x.fr')
  verifier(
    "le suffixe /api n'est pas doublé",
    normaliserBaseUrl('https://x.fr/api') === 'https://x.fr',
    'les appels ajoutent /api eux-mêmes',
  )
  verifier('une adresse vide est refusée', normaliserBaseUrl('   ') === null)
  verifier('des identifiants incomplets sont refusés', readMiraklCredentials({ apiKey: 'x' }) === null)
  verifier(
    'des identifiants complets sont acceptés',
    readMiraklCredentials({ baseUrl: 'x.fr', apiKey: ' k ' })?.apiKey === 'k',
  )

  // --- Les cinq opérateurs -------------------------------------------------
  console.log('\nLes cinq destinations couvertes')
  verifier('cinq opérateurs, pas un de plus', OPERATEURS_MIRAKL.length === 5, OPERATEURS_MIRAKL.join(', '))
  verifier('Shopify n’en fait pas partie', !estMirakl('SHOPIFY'))
  verifier(
    'les cinq publient réellement depuis l’application',
    OPERATEURS_MIRAKL.every((id) => PLATFORMS.find((p) => p.id === id)?.integration === 'live'),
  )
  verifier(
    'et les cinq exigent un EAN avant de publier',
    OPERATEURS_MIRAKL.every((id) => (REGLES_PAR_CANAL[id] ?? []).some((r) => r.id === 'ean')),
    'même mur que Kaufland : une offre se greffe sur une fiche catalogue',
  )

  // --- L'identifiant catalogue ---------------------------------------------
  console.log("\nL'identifiant que Mirakl exige")
  verifier('un EAN-13 est reconnu', identifiantCatalogue(annonce())?.type === 'EAN')
  verifier(
    'un UPC à 12 chiffres est reconnu comme tel',
    identifiantCatalogue(annonce({ attributes: { EAN: '012345678905' } as never }))?.type === 'UPC',
  )
  verifier(
    'un numéro fantaisiste est refusé',
    identifiantCatalogue(annonce({ attributes: { EAN: 'ABC-123' } as never })) === null,
  )
  verifier(
    'une annonce sans attribut EAN est refusée',
    identifiantCatalogue(annonce({ attributes: { Matière: 'Acier' } as never })) === null,
  )

  // --- Le fichier d'offre ---------------------------------------------------
  console.log("\nLe fichier d'offre")
  {
    const csv = csvOffre(annonce(), { id: '3701234567890', type: 'EAN' })
    const [entete, ligne] = csv.trim().split('\n')
    verifier('les colonnes documentées sont toutes là', entete === colonnesOffre().join(';'), entete)
    verifier(
      'le séparateur est le point-virgule',
      entete.includes(';') && !entete.includes(','),
      'une virgule couperait chaque prix français en deux colonnes',
    )
    verifier('le prix part avec deux décimales', ligne.split(';')[3] === '14.90', ligne.split(';')[3])
    verifier("l'état neuf vaut 11", ligne.split(';')[5] === '11')

    /*
     * Le point-virgule dans une description doit être échappé, sinon il crée
     * une colonne et décale tout le reste de la ligne — l'offre partirait avec
     * un prix dans la case du stock.
     */
    const risque = csvOffre(
      annonce({ aiDescription: 'Acier 316L ; taille réglable ; "sertie"' }),
      { id: '3701234567890', type: 'EAN' },
    )
    /*
     * Compté selon la règle du CSV, pas avec un `split(';')`.
     *
     * Un découpage naïf compte aussi les point-virgules **à l'intérieur** des
     * guillemets : il annonçait « ligne décalée » sur une ligne parfaitement
     * échappée. Un banc qui crie au loup sur du code juste finit par être
     * ignoré — c'est la quatrième fois dans ce projet qu'un banc se trompe de
     * cible.
     */
    const compterChamps = (ligneCsv: string) => {
      let champs = 1
      let dansGuillemets = false
      for (let i = 0; i < ligneCsv.length; i++) {
        const c = ligneCsv[i]
        if (c === '"') {
          if (dansGuillemets && ligneCsv[i + 1] === '"') i++
          else dansGuillemets = !dansGuillemets
        } else if (c === ';' && !dansGuillemets) champs++
      }
      return champs
    }

    const ligneRisquee = risque.trim().split('\n')[1]
    verifier(
      'un point-virgule dans la description est échappé',
      risque.includes('"Acier 316L ; taille réglable ; ""sertie"""'),
    )
    verifier(
      'et la ligne garde son nombre de colonnes',
      compterChamps(ligneRisquee) === colonnesOffre().length,
      `${compterChamps(ligneRisquee)} champs pour ${colonnesOffre().length} colonnes`,
    )
  }

  // --- L'échange avec l'opérateur -------------------------------------------
  console.log("\nL'échange avec l'opérateur")
  const faux = await fauxOperateur()
  try {
    const creds = { baseUrl: faux.base, apiKey: CLE }

    const depot = await deposerOffreMirakl(creds, annonce())
    verifier("l'identifiant de suivi est rendu", depot.importId === '98765', depot.importId)
    verifier(
      'la clé part brute, sans « Bearer »',
      faux.recu.auth === CLE,
      `reçu : ${faux.recu.auth}`,
    )
    verifier('le dépôt est un POST', faux.recu.methode === 'POST')
    verifier(
      'le fichier part en multipart',
      (faux.recu.type ?? '').startsWith('multipart/form-data'),
      faux.recu.type ?? '',
    )
    verifier(
      'et le corps porte bien le CSV',
      (faux.recu.corps ?? '').includes('product-id-type') && (faux.recu.corps ?? '').includes('3701234567890'),
    )

    const etat = await suivreDepotMirakl(creds, depot.importId)
    verifier('le suivi lit le statut', etat.statut === 'COMPLETE' && !etat.enCours)

    // --- Ce qui est refusé avant même l'appel -------------------------------
    console.log("\nCe qui est refusé sans appeler l'opérateur")
    let refus: Error | null = null
    try {
      await deposerOffreMirakl(creds, annonce({ attributes: { Matière: 'Acier' } as never }))
    } catch (e) {
      refus = e as Error
    }
    verifier('une annonce sans EAN ne part pas', refus !== null)
    verifier(
      'et le refus dit quoi faire',
      /attribut « EAN »/.test(refus?.message ?? ''),
      refus?.message ?? '',
    )

    // --- Les refus de l'opérateur, traduits ---------------------------------
    console.log("\nCe que dit un refus")
    let mauvaiseCle: Error | null = null
    try {
      await deposerOffreMirakl({ baseUrl: faux.base, apiKey: 'mauvaise' }, annonce())
    } catch (e) {
      mauvaiseCle = e as Error
    }
    verifier('une clé refusée est reconnue', /Clé refusée/.test(mauvaiseCle?.message ?? ''))
    verifier(
      'et elle est signalée comme un problème de liaison',
      (mauvaiseCle as { liaison?: boolean })?.liaison === true,
      'une clé morte arrête tout ; un produit refusé n’arrête que lui',
    )

    let mauvaiseAdresse: Error | null = null
    try {
      await suivreDepotMirakl({ baseUrl: `${faux.base}/ailleurs`, apiKey: CLE }, '1')
    } catch (e) {
      mauvaiseAdresse = e as Error
    }
    verifier('une adresse fausse est reconnue', /introuvable/.test(mauvaiseAdresse?.message ?? ''))
  } finally {
    faux.fermer()
  }

  console.log(echecs ? `\n${echecs} échec(s).` : '\nTout passe.')
  /*
   * `process.exitCode`, jamais `process.exit()`.
   *
   * Sortir de force pendant que le faux serveur se ferme fait planter Node sur
   * Windows — « Assertion failed: !(handle->flags & UV_HANDLE_CLOSING) » — et
   * le lanceur lit alors un banc en échec là où tout est passé.
   */
  process.exitCode = echecs ? 1 : 0
}

main().catch((err) => {
  console.log(`\nRATE  le banc s'est interrompu — ${err?.message ?? err}`)
  process.exitCode = 1
})
