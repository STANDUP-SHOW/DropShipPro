import { Router, type Response } from 'express'
import { z } from 'zod'
import archiver from 'archiver'
import multer from 'multer'
import path from 'path'
import { dupliquerAnnonce } from '../services/listingDuplicate.js'
import { FORMATS_FLUX } from '../services/channelFeeds.js'
import { liaisonPour, resumeLiaisons } from '../services/liaisonsCanaux.js'
import { metaCsv } from '../services/productFeeds.js'
import { prisma } from '../lib/prisma.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'
import { sendMail } from '../services/mailer.js'
import { ScrapeBlockedError } from '../services/scraper.js'
import { watermarkUploads } from '../services/watermark.js'
import { enregistrerVideo, refusVideo, VIDEO_MAX_OCTETS } from '../services/productVideo.js'
import { publishToPlatform } from '../services/publisher.js'
import { mapCategory, mapCategories } from '../services/categoryMapping.js'
import {
  resoudreCategorie,
  arbreCategories,
  apprendreDuVendeur,
  avecGenre,
  CATEGORIE_A_RANGER,
  estARanger,
} from '../services/categories.js'
import { BATCH_PLATFORM_IDS, PLATFORMS, PLATFORM_IDS } from '../services/platforms.js'
import { SUPPLIERS, supplierFields } from '../services/suppliers.js'
import { lireClasseur, colonneAdresses, XlsxIllisible } from '../services/xlsx.js'
import { importerDepuisFournisseurs } from '../services/supplierImport.js'
import { verifierCanaux } from '../services/channelRules.js'
import { titlesByChannel, titleForChannel } from '../services/channelCopy.js'
import { CANAUX, TYPES_CANAL } from '../services/channelDirectory.js'
import { buildFillPlan } from '../services/formFiller.js'
import { apiBaseUrl } from '../lib/urls.js'
import { imagesPourExport, reglagesFiligrane } from '../services/exportImages.js'
import { ETATS, etatPour } from '../services/productCondition.js'
import { avisEncoreFrais, redigerAvisPublicitaire, COUT_EN_CREDITS as COUT_AVIS } from '../services/adAdvice.js'
import { brouillonPour } from '../services/socialDraft.js'
import { comptesDe } from '../services/socialGateway.js'
import { Saturated, importLimiter } from '../lib/concurrency.js'
import { refundCredits, reserveCredits } from '../services/billing.js'
import { DROPS } from '../services/tarifs.js'
import { analyseProduct } from '../services/marketAnalysis.js'
import { PHOTOS_PAR_ANNONCE } from '../services/imageSelect.js'
import { importerAdresse } from '../services/productImport.js'
import { scoreListing } from '../services/listingScore.js'
import { optimiserAnnonce } from '../services/listingOptimizer.js'
import { reecrireAnnonce } from '../services/listingRewrite.js'
import { avisDepuisCsv, enregistrerAvis, normaliser as normaliserAvis, synthese } from '../services/avisAcheteurs.js'
import { eanValide } from '../services/productFacts.js'
import { findConnector, fournisseursRelies } from '../services/supplierConnectors.js'
import { catalogueFaire } from '../services/faire.js'
import { JEUX_OPTIONS, trouverJeu, poserJeu } from '../services/variantPresets.js'

export const productsRouter = Router()
productsRouter.use(requireAuth)

/**
 * Runs a handler through the import queue.
 *
 * Wrapping the route rather than the work inside it means a saturated service
 * answers before reserving a credit or touching a supplier site — the caller
 * gets a clear refusal in milliseconds instead of a connection held open until
 * it times out.
 */
function queued(handler: (req: AuthedRequest, res: Response) => Promise<unknown>) {
  return async (req: AuthedRequest, res: Response) => {
    try {
      await importLimiter.run(() => handler(req, res))
    } catch (err) {
      if (err instanceof Saturated) {
        res.setHeader('Retry-After', '60')
        return res.status(429).json({ error: err.message })
      }
      console.error(err)
      if (!res.headersSent) res.status(500).json({ error: "Erreur inattendue" })
    }
  }
}

const importSchema = z.object({ url: z.string().url() })

// Paste any product URL: scrape it, remix the copy with AI, watermark the photos,
// and land it in the back office as a DRAFT the user reviews before publishing.
productsRouter.post(
  '/import',
  queued(async (req, res) => {
    const parsed = importSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'URL invalide' })

    // Reserve d avance, rendu plus bas si l import echoue : le vendeur paie une
    // annonce qu il a recue, jamais une tentative.
    const credit = await reserveCredits(req.userId!, DROPS.import, "Import d'une annonce")
    if (!credit.ok) return res.status(402).json({ error: credit.reason, needsCredits: true })

    try {
      const { produit, reecrit, notes } = await importerAdresse(req.userId!, parsed.data.url)

      // La reecriture est ce que le credit paie. Modele injoignable : l annonce
      // est gardee -- les photos et le prix valent d etre pris -- mais elle est
      // rendue gratuite et signalee comme non reecrite.
      if (!reecrit) await refundCredits(req.userId!, DROPS.import)

      res.status(201).json({ ...produit, notes })
    } catch (err) {
      // Rien livre, rien facture.
      await refundCredits(req.userId!, DROPS.import)
      console.error(err)
      if (err instanceof ScrapeBlockedError) {
        return res.status(422).json({ error: err.message })
      }
      /*
       * Le message dit la suite, pas seulement l'échec.
       *
       * « Impossible d'importer ce produit depuis l'URL fournie » est vrai et
       * sans usage : le vendeur ne sait ni pourquoi ni quoi faire. La cause
       * réelle est presque toujours la même — une page bâtie en JavaScript —
       * et il existe un chemin qui marche.
       */
      res.status(502).json({
        error:
          "Cette page n'a pas pu être lue depuis notre serveur. Si le produit s'affiche bien " +
          'dans votre navigateur, ouvrez-le dans Chrome et utilisez le bouton de ' +
          "l'extension : elle lit la page déjà affichée, avec le prix, les photos et les variantes.",
      })
    }
  }),
)

const captureSchema = z.object({
  sourceUrl: z.string().url(),
  title: z.string().min(1),
  description: z.string().default(''),
  price: z.number().default(0),
  currency: z.string().default('EUR'),
  images: z.array(z.string().url()).default([]),
  sourceCategory: z.string().nullable().default(null),
  variants: z.any().optional(),
  /**
   * Les modules SKU et PRICE d une fiche AliExpress, tels que la page les porte.
   *
   * \`z.any()\` parce que leur forme appartient a AliExpress et change a chaque
   * refonte : la valider ici ferait refuser un releve valide le jour ou ils
   * ajoutent un champ. La lecture, elle, ne prend que ce qu elle reconnait.
   */
  skuAliExpress: z.any().optional(),
  pageText: z.string().max(20000).optional(),
  /** Le code-barres déclaré par la page ; sa clé GS1 est revérifiée côté serveur. */
  ean: z.string().max(20).nullable().optional(),
  /** Les avis d'acheteurs affichés sur la fiche. Normalisés et bornés côté serveur. */
  reviews: z
    .array(
      z.object({
        stars: z.union([z.number(), z.string()]).optional(),
        author: z.string().max(200).optional(),
        text: z.string().max(8000).optional(),
        photos: z.array(z.string()).max(12).optional(),
        date: z.string().max(40).optional(),
      }),
    )
    .max(60)
    .optional(),
  /**
   * Import en LOT : différer la réécriture vers un batch Anthropic (moitié
   * prix). Posé par le panneau latéral ; absent sur un import à l'unité, qui
   * reste instantané.
   */
  differer: z.boolean().optional(),
})

// Import from the Chrome extension: the page is already rendered in the user's
// browser, so price, gallery and variants arrive filled in — the things the
// server-side scraper can't reach on Temu/JoyBuy. Everything after that (AI
// remix, watermark, category guess) is the same pipeline as /import.
/**
 * L import depuis l extension.
 *
 * La page est deja lue : le navigateur du vendeur a rendu la fiche, l extension
 * en a tire le titre, le prix, la galerie et les options. Sur Temu, AliExpress
 * ou Shein, c est la seule voie -- un serveur qui va lire la page n en recoit
 * qu une coquille.
 *
 * **C etait une troisieme copie de la meme chaine**, apres l import par adresse
 * et l import en lot, et elle avait ses propres oublis : pas de
 * \`imagesWatermarked: false\`, donc des annonces reputees deja marquees dont le
 * filigrane n a jamais ete pose. Le meme defaut que le lot, decouvert le meme
 * jour, dans un troisieme bloc recopie. Les trois entrees appellent desormais
 * \`importerAdresse\`.
 */
productsRouter.post(
  '/capture',
  queued(async (req, res) => {
    const parsed = captureSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Données de produit invalides' })

    const data = parsed.data

    // Un lot passe par le panneau latéral avec `differer` : sa réécriture part
    // en batch (−50 %), donc l'annonce coûte moins qu'une capture à l'unité.
    const cout = data.differer ? DROPS.importLot : DROPS.import
    const credit = await reserveCredits(req.userId!, cout, data.differer ? 'Import en lot' : "Import d'une annonce")
    if (!credit.ok) return res.status(402).json({ error: credit.reason, needsCredits: true })

    try {
      const { produit, reecrit, notes } = await importerAdresse(req.userId!, data.sourceUrl, {
        capture: {
          title: data.title,
          description: data.description,
          price: data.price,
          currency: data.currency,
          images: data.images,
          sourceCategory: data.sourceCategory,
          pageText: data.pageText,
          ean: data.ean ?? null,
          avis: data.reviews,
        },
        releve: {
          images: data.images,
          variantes: data.variants as Record<string, string[]> | undefined,
          skuAliExpress: data.skuAliExpress ?? null,
        },
        // Import en lot : la réécriture part en batch. `reecrit` vaut alors vrai
        // (en file), donc le crédit n'est pas rendu ici — le planificateur le
        // rendra si le batch échoue.
        differerReecriture: data.differer,
      })

      if (!reecrit) await refundCredits(req.userId!, cout)
      res.status(201).json({ ...produit, notes })
    } catch (err) {
      await refundCredits(req.userId!, cout)
      console.error(err)
      res.status(500).json({ error: "Impossible d'enregistrer ce produit" })
    }
  }),
)


const batchImportSchema = z.object({
  urls: z.array(z.string().url()).min(1).max(25),
  /** La boutique de destination, quand le vendeur en a designe une. */
  shopId: z.string().optional(),
})

// Same pipeline as /import but for up to 25 URLs at once. Processed sequentially
// and each URL succeeds/fails independently so one bad link doesn't drop the batch.
/**
 * L import en lot.
 *
 * Il faisait le meme travail que l import simple **dans un bloc recopie**, et il
 * avait pris du retard : ni tri des photos, ni variantes, ni agent de controle,
 * et `imagesWatermarked` laisse a sa valeur par defaut -- donc des annonces
 * reputees deja marquees, dont le filigrane n a jamais ete pose. Aucun de ces
 * quatre defauts ne se voyait en lisant ce bloc : ils ne se voyaient qu en le
 * comparant a l autre. Les deux passent desormais par `importerAdresse`.
 */
productsRouter.post('/import-batch', async (req: AuthedRequest, res) => {
  const parsed = batchImportSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Envoyez entre 1 et 25 URLs valides' })

  // Réservé annonce par annonce : le débit d'une action est tout ou rien (voir
  // billing.ts), donc dès que le solde ne couvre plus un import, l'adresse en
  // cours et les suivantes sont signalées non couvertes plutôt que débitées à
  // moitié.
  const results: Array<{ url: string; ok: boolean; product?: unknown; error?: string; notes?: string[] }> = []

  for (const url of parsed.data.urls) {
    const credit = await reserveCredits(req.userId!, DROPS.import, "Import d'une annonce")
    if (!credit.ok) {
      results.push({ url, ok: false, error: 'Solde de drops insuffisant pour cette annonce.' })
      continue
    }

    // Une place par adresse, tenue le temps du travail. Une seule place pour
    // tout le lot affamerait les autres vingt minutes ; aucune place laisserait
    // un lot passer devant la file.
    let release: () => void
    try {
      release = await importLimiter.acquire()
    } catch {
      results.push({ url, ok: false, error: 'Service saturé, réessayez dans une minute.' })
      await refundCredits(req.userId!, DROPS.import)
      continue
    }

    try {
      const { produit, reecrit, notes } = await importerAdresse(req.userId!, url, {
        shopId: parsed.data.shopId,
      })
      if (!reecrit) await refundCredits(req.userId!, DROPS.import)
      results.push({ url, ok: true, product: produit, notes })
    } catch (err) {
      // Chaque adresse en echec rend son credit, individuellement.
      await refundCredits(req.userId!, DROPS.import)
      console.error(`import-batch failed for ${url}`, err)
      results.push({
        url,
        ok: false,
        error:
          err instanceof Saturated
            ? err.message
            : err instanceof ScrapeBlockedError
              ? err.message
              : "Échec de l'import (URL inaccessible ou page non reconnue)",
      })
    } finally {
      release()
    }
  }

  res.status(207).json({
    results,
    imported: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
  })
})

productsRouter.get('/', async (req: AuthedRequest, res) => {
  const products = await prisma.product.findMany({
    where: { userId: req.userId! },
    orderBy: { createdAt: 'desc' },
    include: { publications: true },
  })

  // La note est calculée à la volée : ce sont des règles arithmétiques sur des
  // champs déjà chargés. La stocker obligerait à la recalculer à chaque édition,
  // et une note périmée vaut moins que pas de note.
  res.json(
    products.map((p) => {
      const { score, level } = scoreListing(p)
      return { ...p, score, scoreLevel: level }
    }),
  )
})

/**
 * Le détail de la note, critère par critère.
 *
 * Séparé de la fiche : un vendeur ouvre ce détail quand il veut corriger, pas à
 * chaque affichage.
 */

/**
 * Les actions sur un lot d annonces cochees.
 *
 * **Une seule route pour quatre gestes**, et non quatre routes : elles partagent
 * la meme selection, la meme verification de propriete et le meme compte-rendu.
 * Quatre routes auraient donne quatre facons de dire « trois annonces sur cinq
 * ont ete traitees », et quatre endroits ou oublier le filtre `userId`.
 *
 * Chaque annonce est traitee independamment : une qui echoue n arrete pas les
 * autres, et le vendeur recoit la liste de ce qui n a pas marche. Sur un lot de
 * vingt-cinq, tout perdre pour une seule serait le pire des comportements.
 */
const lotSchema = z.object({
  ids: z.array(z.string()).min(1).max(200),
  action: z.enum(['categorie', 'supprimer', 'options', 'boutique', 'reecrire']),
  /** Pour « categorie » : la categorie de destination. */
  categoryId: z.string().optional(),
  /** Pour « options » : le jeu a poser -- pointure, taille, couleur. */
  jeu: z.string().optional(),
  /** Pour « boutique » : ou ranger les annonces. */
  shopId: z.string().nullable().optional(),
})

productsRouter.post('/lot', async (req: AuthedRequest, res) => {
  const parsed = lotSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Demande invalide' })
  const { ids, action } = parsed.data

  /*
   * Les annonces sont relues avec le filtre du compte, jamais prises sur parole.
   *
   * Les identifiants viennent du navigateur : sans ce filtre, un identifiant
   * devine suffirait a supprimer l annonce d un autre vendeur.
   */
  const annonces = await prisma.product.findMany({
    where: { id: { in: ids }, userId: req.userId! },
    select: { id: true, title: true, aiTitle: true, variants: true },
  })
  if (!annonces.length) return res.status(404).json({ error: 'Aucune de ces annonces ne vous appartient.' })

  const echecs: Array<{ id: string; titre: string; raison: string }> = []
  let faites = 0

  /*
   * Refaire la réécriture d'un lot d'annonces ratées.
   *
   * Après une panne d'IA, ce sont des dizaines d'annonces qui portent le texte
   * brut du fournisseur — trente le 02/09/2026. Les reprendre une par une,
   * c'est trente allers-retours, donc en pratique aucune.
   *
   * Un crédit par annonce, rendu à chaque échec individuellement : une annonce
   * qui n'a pas été réécrite ne se facture pas, même si les autres du lot le
   * sont.
   */
  if (action === 'reecrire') {
    for (const resume of annonces) {
      const credit = await reserveCredits(req.userId!, DROPS.reecriture, "Réécriture d'une annonce")
      if (!credit.ok) {
        echecs.push({
          id: resume.id,
          titre: resume.aiTitle || resume.title,
          raison: credit.reason ?? 'Crédits épuisés.',
        })
        // Le solde ne se rechargera pas au milieu du lot : inutile de tenter
        // les suivantes pour leur donner le même refus.
        break
      }

      try {
        const produit = await prisma.product.findUniqueOrThrow({ where: { id: resume.id } })
        const { reecrit, champs } = await reecrireAnnonce(produit)
        if (!reecrit || !champs) {
          await refundCredits(req.userId!, DROPS.reecriture)
          echecs.push({
            id: resume.id,
            titre: resume.aiTitle || resume.title,
            raison: "L'IA n'a pas répondu.",
          })
          continue
        }
        await prisma.product.update({ where: { id: resume.id }, data: champs })
        faites++
      } catch (e) {
        await refundCredits(req.userId!, DROPS.reecriture)
        echecs.push({
          id: resume.id,
          titre: resume.aiTitle || resume.title,
          raison: e instanceof Error ? e.message : 'Réécriture impossible',
        })
      }
    }

    return res.json({
      demandees: ids.length,
      faites,
      inchangees: 0,
      echecs,
      message: `${faites} annonce(s) réécrite(s) par l'IA.`,
    })
  }

  if (action === 'supprimer') {
    const { count } = await prisma.product.deleteMany({
      where: { id: { in: annonces.map((a) => a.id) }, userId: req.userId! },
    })
    return res.json({ demandees: ids.length, faites: count, inchangees: 0, echecs: [] })
  }

  if (action === 'categorie') {
    if (!parsed.data.categoryId) return res.status(400).json({ error: 'Choisissez une catégorie.' })
    // La categorie doit exister : un identifiant invente rangerait les annonces
    // nulle part, et le referentiel est la seule liste qui fasse foi.
    const categorie = await prisma.category.findUnique({
      where: { id: parsed.data.categoryId },
      select: { id: true, path: true },
    })
    if (!categorie) return res.status(400).json({ error: 'Cette catégorie n existe pas.' })

    const { count } = await prisma.product.updateMany({
      where: { id: { in: annonces.map((a) => a.id) }, userId: req.userId! },
      data: { categoryId: categorie.id },
    })
    return res.json({
      demandees: ids.length,
      faites: count,
      inchangees: 0,
      echecs: [],
      message: `Rangées dans « ${categorie.path} ».`,
    })
  }

  if (action === 'boutique') {
    if (parsed.data.shopId) {
      const sienne = await prisma.shop.findFirst({
        where: { id: parsed.data.shopId, userId: req.userId! },
        select: { id: true },
      })
      if (!sienne) return res.status(400).json({ error: 'Cette boutique ne vous appartient pas.' })
    }
    const { count } = await prisma.product.updateMany({
      where: { id: { in: annonces.map((a) => a.id) }, userId: req.userId! },
      data: { shopId: parsed.data.shopId ?? null },
    })
    return res.json({ demandees: ids.length, faites: count, inchangees: 0, echecs: [] })
  }

  // --- Les options tout pretes ----------------------------------------------

  const jeu = trouverJeu(parsed.data.jeu ?? '')
  if (!jeu) return res.status(400).json({ error: 'Jeu d options inconnu.' })

  let inchangees = 0
  for (const annonce of annonces) {
    const suivantes = poserJeu(annonce.variants as Record<string, string[]> | null, jeu)
    // `null` veut dire « elle avait deja cette option » : ce n est pas un echec,
    // et le compter comme tel ferait croire a une panne sur un lot deja rangé.
    if (!suivantes) {
      inchangees++
      continue
    }
    try {
      await prisma.product.update({
        where: { id: annonce.id },
        data: { variants: suivantes as object },
      })
      faites++
    } catch (e) {
      echecs.push({
        id: annonce.id,
        titre: annonce.aiTitle || annonce.title,
        raison: e instanceof Error ? e.message : 'Enregistrement impossible',
      })
    }
  }

  res.json({
    demandees: ids.length,
    faites,
    inchangees,
    echecs,
    message: jeu.valeurs.length
      ? `Option « ${jeu.nom} » ajoutée avec ${jeu.valeurs.length} valeurs.`
      : `Option « ${jeu.nom} » ajoutée, vide : les valeurs restent à renseigner sur chaque annonce.`,
  })
})

/** Les jeux d options tout prets, pour l ecran de lot. */
productsRouter.get('/meta/jeux-options', (_req: AuthedRequest, res) => {
  res.json(JEUX_OPTIONS)
})

productsRouter.get('/:id/score', async (req: AuthedRequest, res) => {
  const product = await prisma.product.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  })
  if (!product) return res.status(404).json({ error: 'Produit introuvable' })
  res.json(scoreListing(product))
})

/**
 * Reprendre une annonce sur ce qui lui manque.
 *
 * La note disait déjà quoi corriger, critère par critère, et personne ne le
 * faisait : le vendeur lisait un bulletin sans bouton pour le suivre. Sur trois
 * cents annonces, un diagnostic qu'il faut exécuter à la main n'existe pas.
 *
 * **Un crédit, et seulement si le modèle a répondu.** La réécriture est ce que
 * le crédit paie ; une reprise qui ne change rien parce que tout allait déjà
 * bien ne se facture pas non plus.
 */
/**
 * Refaire la réécriture d'une annonce ratée.
 *
 * **Le remède à une panne d'IA.** Quand le modèle ne répond pas,
 * `enhanceListing` rend le texte du fournisseur plutôt que d'échouer — sans
 * quoi un import perdrait aussi ses photos et son prix. L'annonce arrive donc
 * complète et inutilisable, et le crédit est rendu. Il fallait ensuite tout
 * réimporter à la main.
 *
 * Ne retourne pas sur la page source : le titre et la description d'origine
 * sont conservés, et c'est exactement ce que le premier import avait envoyé au
 * modèle. Une fiche AliExpress se reprend donc aussi bien qu'une autre.
 */
productsRouter.post('/:id/reecrire', async (req: AuthedRequest, res) => {
  const produit = await prisma.product.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  })
  if (!produit) return res.status(404).json({ error: 'Produit introuvable' })

  const credit = await reserveCredits(req.userId!, DROPS.reecriture, "Réécriture d'une annonce")
  if (!credit.ok) return res.status(402).json({ error: credit.reason, needsCredits: true })

  try {
    const { reecrit, champs, changements } = await reecrireAnnonce(produit)
    if (!reecrit || !champs) {
      await refundCredits(req.userId!, DROPS.reecriture)
      return res.status(503).json({
        error: "L'IA ne répond pas pour le moment. Rien n'a été modifié, aucun crédit n'a été pris.",
      })
    }

    await prisma.product.update({ where: { id: produit.id }, data: champs })
    res.json({ ok: true, changements })
  } catch (err) {
    await refundCredits(req.userId!, DROPS.reecriture)
    console.error('réécriture impossible', err)
    res.status(502).json({ error: "La réécriture n'a pas abouti. Réessayez dans un instant." })
  }
})

productsRouter.post('/:id/optimiser', async (req: AuthedRequest, res) => {
  const product = await prisma.product.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  })
  if (!product) return res.status(404).json({ error: 'Produit introuvable' })

  const credit = await reserveCredits(req.userId!, DROPS.reecriture, "Optimisation d'une annonce")
  if (!credit.ok) return res.status(402).json({ error: credit.reason, needsCredits: true })

  try {
    const { optimisation, champs } = await optimiserAnnonce(product)

    // Rien réécrit — modèle injoignable, ou rien à reprendre : le crédit est rendu.
    if (!optimisation.reecrit || !champs) {
      await refundCredits(req.userId!, DROPS.reecriture)
      return res.json(optimisation)
    }

    await prisma.product.update({ where: { id: product.id }, data: champs })
    res.json(optimisation)
  } catch (err) {
    await refundCredits(req.userId!, DROPS.reecriture)
    console.error('optimisation impossible', err)
    res.status(502).json({ error: "La reprise de l'annonce n'a pas abouti. Réessayez dans un instant." })
  }
})

/**
 * L'état du catalogue, en quelques chiffres.
 *
 * « Mes annonces » est une liste ; ceci en fait un tableau de bord. Un vendeur
 * qui tient trois cents annonces ne les relit pas une par une : il veut savoir
 * combien sont faibles et lesquelles reprendre en premier.
 */
productsRouter.get('/meta/catalogue', async (req: AuthedRequest, res) => {
  const products = await prisma.product.findMany({
    where: { userId: req.userId! },
    include: { publications: true },
  })

  if (!products.length) {
    return res.json({ count: 0, average: null, distribution: {}, worst: [], best: [], margin: null, published: 0 })
  }

  const scored = products.map((p) => ({ product: p, ...scoreListing(p) }))
  const average = Math.round(scored.reduce((n, s) => n + s.score, 0) / scored.length)

  const distribution = { bon: 0, moyen: 0, faible: 0 }
  for (const s of scored) distribution[s.level]++

  const margins = products
    .map((p) => {
      const cost = Number(p.price) + Number(p.shippingCost)
      const selling = Number(p.sellingPrice)
      return cost > 0 && selling > 0 ? Math.round(((selling - cost) / cost) * 100) : null
    })
    .filter((m): m is number => m !== null)

  const brief = (s: (typeof scored)[number]) => ({
    id: s.product.id,
    title: s.product.aiTitle || s.product.title,
    score: s.score,
    level: s.level,
    priorities: s.priorities,
  })

  res.json({
    count: products.length,
    average,
    distribution,
    // Les plus faibles d'abord : ce sont celles qui rapportent le plus à corriger.
    worst: [...scored].sort((a, b) => a.score - b.score).slice(0, 8).map(brief),
    best: [...scored].sort((a, b) => b.score - a.score).slice(0, 5).map(brief),
    margin: margins.length
      ? Math.round(margins.reduce((n, m) => n + m, 0) / margins.length)
      : null,
    published: products.filter((p) => p.publications.some((x) => x.status === 'PUBLISHED')).length,
  })
})

productsRouter.get('/:id', async (req: AuthedRequest, res) => {
  const product = await prisma.product.findFirst({
    where: { id: req.params.id, userId: req.userId! },
    include: {
      publications: true,
      // Le nom de la boutique et le chemin de categorie servent a l apercu
      // Google : sans eux, il montrerait un fil d Ariane invente.
      shop: { select: { name: true } },
    },
  })
  if (!product) return res.status(404).json({ error: 'Produit introuvable' })

  // `categoryId` n est pas une cle etrangere -- il a porte des identifiants de
  // l ancien catalogue avant le referentiel en base. La lecture est donc
  // separee, et un identifiant orphelin rend simplement `null`.
  const categorie = product.categoryId
    ? await prisma.category.findUnique({ where: { id: product.categoryId }, select: { path: true } })
    : null

  const { shop, ...reste } = product
  res.json({ ...reste, shopName: shop?.name ?? null, categoryPath: categorie?.path ?? null })
})

const updateSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  aiTitle: z.string().optional(),
  aiDescription: z.string().optional(),
  price: z.number().optional(),
  shippingCost: z.number().optional(),
  sellingPrice: z.number().optional(),
  markupPercent: z.number().optional(),
  images: z.array(z.string()).optional(),
  variants: z.any().optional(),
  metaTitle: z.string().optional(),
  metaDescription: z.string().optional(),
  metaKeywords: z.string().optional(),
  bulletPoints: z.array(z.string()).optional(),
  attributes: z.record(z.string()).optional(),
  categoryId: z.string().nullable().optional(),
  shopId: z.string().nullable().optional(),
  // A closed list, not free text : the value is recopied word for word into the
  // marketplaces' own dropdowns, which reject anything they don't know.
  condition: z.enum(['neuf', 'reconditionne', 'occasion']).optional(),
  /** Le code-barres ; vide ou null pour l'effacer. Sa clé GS1 est vérifiée avant d'écrire. */
  ean: z.string().max(20).nullable().optional(),
})

productsRouter.patch('/:id', async (req: AuthedRequest, res) => {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Champs invalides' })

  const owned = await prisma.product.findFirst({ where: { id: req.params.id, userId: req.userId! } })
  if (!owned) return res.status(404).json({ error: 'Produit introuvable' })

  const data = { ...parsed.data }
  if (typeof data.ean === 'string') {
    const saisi = data.ean.trim()
    if (!saisi) data.ean = null
    else {
      const code = eanValide(saisi)
      // Un EAN faux greffe l'offre sur la fiche d'un autre produit (Mirakl, Kaufland) : refusé ici.
      if (!code) {
        return res.status(400).json({
          error: "Ce code-barres n'est pas valide : 8, 12, 13 ou 14 chiffres, avec une clé de contrôle juste. Vérifiez un chiffre transposé.",
        })
      }
      data.ean = code
    }
  }

  const product = await prisma.product.update({ where: { id: req.params.id }, data })
  res.json(product)
})

// --- Les avis d'acheteurs ----------------------------------------------------
//
// Une note de 1 à 5, un nom, un texte. Relevés par l'extension à l'import, ou
// déposés ici : fichier CSV à trois colonnes (stars, User, Avis), ou un avis à
// la main. Aucun appel au modèle, donc aucun drop. Voir services/avisAcheteurs.ts.

const uploadAvis = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } })

async function produitDe(req: AuthedRequest) {
  return prisma.product.findFirst({ where: { id: req.params.id, userId: req.userId! }, select: { id: true, userId: true } })
}

productsRouter.get('/:id/avis', async (req: AuthedRequest, res) => {
  const produit = await produitDe(req)
  if (!produit) return res.status(404).json({ error: 'Produit introuvable' })
  const avis = await prisma.buyerReview.findMany({
    where: { productId: produit.id },
    orderBy: [{ reviewedAt: 'desc' }, { createdAt: 'desc' }],
  })
  res.json({ avis, synthese: synthese(avis.filter((a) => a.published).map((a) => a.stars)) })
})

/** Le fichier CSV (champ `fichier`), ou son texte collé (`csv`). */
productsRouter.post('/:id/avis/import', uploadAvis.single('fichier'), async (req: AuthedRequest, res) => {
  const produit = await produitDe(req)
  if (!produit) return res.status(404).json({ error: 'Produit introuvable' })

  const contenu = req.file ? req.file.buffer.toString('utf8') : typeof req.body?.csv === 'string' ? req.body.csv : ''
  if (!contenu.trim()) return res.status(400).json({ error: 'Déposez un fichier CSV à trois colonnes : stars, User, Avis.' })

  const { avis, refus } = avisDepuisCsv(contenu)
  if (!avis.length) return res.status(400).json({ error: refus[0] ?? 'Aucun avis lisible dans ce fichier.', refus })

  res.status(201).json(await enregistrerAvis(produit, avis, { source: 'csv' }, refus))
})

productsRouter.post('/:id/avis', async (req: AuthedRequest, res) => {
  const produit = await produitDe(req)
  if (!produit) return res.status(404).json({ error: 'Produit introuvable' })
  const propre = normaliserAvis({ stars: req.body?.stars, author: req.body?.author, text: req.body?.text })
  if ('refus' in propre) return res.status(400).json({ error: `Avis refusé : ${propre.refus}.` })
  res.status(201).json(await enregistrerAvis(produit, [propre], { source: 'manuel' }))
})

productsRouter.patch('/:id/avis/:avisId', async (req: AuthedRequest, res) => {
  const produit = await produitDe(req)
  if (!produit) return res.status(404).json({ error: 'Produit introuvable' })
  if (typeof req.body?.published !== 'boolean') return res.status(400).json({ error: 'Champs invalides' })
  const maj = await prisma.buyerReview.updateMany({
    where: { id: req.params.avisId, productId: produit.id },
    data: { published: req.body.published },
  })
  if (!maj.count) return res.status(404).json({ error: 'Avis introuvable' })
  res.json({ ok: true })
})

/** Un avis, ou tous (`/avis/tous`) — pour repartir d'un fichier corrigé. */
productsRouter.delete('/:id/avis/:avisId', async (req: AuthedRequest, res) => {
  const produit = await produitDe(req)
  if (!produit) return res.status(404).json({ error: 'Produit introuvable' })
  const where = req.params.avisId === 'tous' ? { productId: produit.id } : { id: req.params.avisId, productId: produit.id }
  const retire = await prisma.buyerReview.deleteMany({ where })
  res.json({ retires: retire.count })
})

productsRouter.delete('/:id', async (req: AuthedRequest, res) => {
  const owned = await prisma.product.findFirst({ where: { id: req.params.id, userId: req.userId! } })
  if (!owned) return res.status(404).json({ error: 'Produit introuvable' })
  await prisma.product.delete({ where: { id: req.params.id } })
  res.status(204).send()
})

/**
 * Une copie de l'annonce, à soi.
 *
 * La règle vit dans `services/listingDuplicate.ts` : une route ne s'éprouve
 * qu'avec un serveur debout, et ce qui décide de ce qui est recopié — ou pas —
 * mérite un banc.
 *
 * Aucun appel au modèle, donc **aucun crédit** : tout est déjà écrit.
 */
productsRouter.post('/:id/dupliquer', async (req: AuthedRequest, res) => {
  const copie = await dupliquerAnnonce(req.userId!, req.params.id)
  if (!copie) return res.status(404).json({ error: 'Produit introuvable' })
  res.status(201).json(copie)
})

/**
 * The shop a listing goes to when the seller did not pick one.
 *
 * Publishing to "Mon site" without a destination would file the listing nowhere,
 * and it would then be served by no feed at all — invisible, with nothing saying
 * why. The oldest shop is the account's default one.
 */
async function resolveShopId(userId: string, chosen: string | undefined) {
  if (chosen) {
    const shop = await prisma.shop.findFirst({ where: { id: chosen, userId } })
    return shop ? shop.id : null
  }
  const fallback = await prisma.shop.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } })
  if (fallback) return fallback.id

  // First publication to "Mon site" from an account that has no site yet: the
  // shop is created here rather than imposed at sign-up, so sellers who only
  // work through marketplaces never see one.
  const created = await prisma.shop.create({ data: { userId, name: 'Ma boutique' } })
  return created.id
}

const publishSchema = z.object({
  platforms: z.array(z.enum(PLATFORM_IDS)).min(1),
  /** Which of the seller's sites this listing belongs to, when publishing to their own. */
  shopId: z.string().optional(),
})

productsRouter.post('/:id/publish', async (req: AuthedRequest, res) => {
  const parsed = publishSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Sélectionnez au moins une plateforme' })

  const owned = await prisma.product.findFirst({ where: { id: req.params.id, userId: req.userId! } })
  if (!owned) return res.status(404).json({ error: 'Produit introuvable' })

  /*
   * Une boutique choisie à la main range l'annonce, quelle que soit la
   * destination.
   *
   * Le rangement n'était fait que pour « Mon site ». Un marchand qui désignait
   * sa boutique de mode et publiait sur Shopify laissait donc l'annonce sans
   * boutique — et `reglagesFiligrane` retombait sur le compte : il avait réglé
   * le filigrane de cette boutique-là et voyait partir celui du compte.
   * Ranger n'expose rien : le flux d'une vitrine ne sert que les annonces
   * PUBLIÉES sur « Mon site ».
   */
  if (parsed.data.shopId && !parsed.data.platforms.includes('OWN_SITE')) {
    const shop = await prisma.shop.findFirst({ where: { id: parsed.data.shopId, userId: req.userId! } })
    if (!shop) return res.status(400).json({ error: 'Boutique inconnue' })
    await prisma.product.update({ where: { id: owned.id }, data: { shopId: shop.id } })
  }

  // Choosing the destination site is part of publishing, not a setting buried
  // elsewhere: one catalogue feeds a menswear store and a tech store, and only
  // the listings assigned to a shop appear in its feed.
  if (parsed.data.platforms.includes('OWN_SITE')) {
    const shopId = await resolveShopId(req.userId!, parsed.data.shopId)
    if (parsed.data.shopId && !shopId) return res.status(400).json({ error: 'Boutique inconnue' })
    // Only overwrite when a choice was made: a listing already filed in a shop
    // must not silently move back to the default one on a re-publication.
    if (shopId && (parsed.data.shopId || !owned.shopId)) {
      await prisma.product.update({ where: { id: owned.id }, data: { shopId } })
    }
  }

  /**
   * Le contrôle de conformité, avant l'envoi.
   *
   * Sans lui, l'annonce partait, la place de marché la refusait, et le vendeur
   * découvrait le rejet dans le back-office de la plateforme — sans savoir quel
   * champ corriger. Un titre de 210 caractères sur Amazon est un rejet certain :
   * autant le dire ici, où l'on sait quoi faire.
   *
   * Seuls les écarts bloquants arrêtent la publication ; les avertissements
   * partent avec elle et remontent dans la réponse. Tout bloquer ferait
   * contourner le contrôle.
   */
  const verdicts = verifierCanaux(owned, parsed.data.platforms)
  const refusees = verdicts.filter((v) => !v.publiable)
  const retenues = parsed.data.platforms.filter((p) => !refusees.some((r) => r.platform === p))

  if (!retenues.length) {
    return res.status(422).json({
      error: "Aucune destination ne peut recevoir cette annonce en l'état.",
      conformite: verdicts,
    })
  }

  const base = apiBaseUrl(req)
  const publications = await Promise.all(retenues.map((p) => publishToPlatform(owned.id, p, base)))
  // A product whose every destination failed (a refused Shopify token, say) must
  // not be shown as published.
  if (publications.some((p) => p.status !== 'FAILED')) {
    await prisma.product.update({ where: { id: owned.id }, data: { status: 'PUBLISHED' } })
  }
  /*
   * Les destinations refusees sortent comme des publications en echec, avec la
   * raison : elles doivent apparaitre dans la liste des resultats, sinon le
   * vendeur croit avoir publie partout ou il avait coche.
   */
  const echecs = refusees.map((v) => ({
    platform: v.platform,
    status: 'FAILED' as const,
    error: v.ecarts.find((e) => e.severite === 'bloquant')?.message ?? 'Annonce non conforme',
    externalUrl: null,
  }))

  res.json([...publications, ...echecs])
})

const publishBatchSchema = z.object({
  productIds: z.array(z.string()).min(1).max(200),
  shopId: z.string().optional(),
  // Only API destinations: the extension publishes one browser tab at a time and
  // waits for the seller to press « Publier » himself, which cannot be batched.
  platforms: z.array(z.enum(BATCH_PLATFORM_IDS)).min(1),
})

/**
 * Publishes many listings at once — the "sélectionner puis publier en lot" flow.
 *
 * Runs sequentially on purpose: a hundred selected products would otherwise fire a
 * hundred simultaneous Shopify calls and hit their rate limit. Each result is
 * returned individually so the seller sees exactly what went through.
 */
productsRouter.post('/publish-batch', async (req: AuthedRequest, res) => {
  const parsed = publishBatchSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      error: "Sélectionnez au moins une annonce et une plateforme connectable par API.",
    })
  }

  const { productIds, platforms } = parsed.data
  const owned = await prisma.product.findMany({
    where: { id: { in: productIds }, userId: req.userId! },
    select: { id: true, title: true, aiTitle: true },
  })
  if (!owned.length) return res.status(404).json({ error: 'Aucune de ces annonces ne vous appartient' })

  if (parsed.data.platforms.includes('OWN_SITE')) {
    const shopId = await resolveShopId(req.userId!, parsed.data.shopId)
    if (parsed.data.shopId && !shopId) return res.status(400).json({ error: 'Boutique inconnue' })
    if (shopId) {
      await prisma.product.updateMany({
        // Without an explicit choice, only the listings that belong nowhere yet.
        where: {
          id: { in: owned.map((p) => p.id) },
          userId: req.userId!,
          ...(parsed.data.shopId ? {} : { shopId: null }),
        },
        data: { shopId },
      })
    }
  }

  const base = apiBaseUrl(req)
  const results: Array<{
    productId: string
    title: string
    platform: string
    status: string
    error: string | null
    externalUrl: string | null
  }> = []

  for (const product of owned) {
    let anyOk = false
    for (const platform of platforms) {
      try {
        const publication = await publishToPlatform(product.id, platform, base)
        if (publication.status !== 'FAILED') anyOk = true
        results.push({
          productId: product.id,
          title: product.aiTitle || product.title,
          platform,
          status: publication.status,
          error: publication.error,
          externalUrl: publication.externalUrl,
        })
      } catch (e) {
        // One unexpected failure must not abort the rest of the batch.
        console.error('publication en lot', product.id, platform, e)
        results.push({
          productId: product.id,
          title: product.aiTitle || product.title,
          platform,
          status: 'FAILED',
          error: e instanceof Error ? e.message : 'Publication impossible',
          externalUrl: null,
        })
      }
    }
    if (anyOk) await prisma.product.update({ where: { id: product.id }, data: { status: 'PUBLISHED' } })
  }

  res.json({
    results,
    published: results.filter((r) => r.status === 'PUBLISHED').length,
    pending: results.filter((r) => r.status === 'PENDING').length,
    failed: results.filter((r) => r.status === 'FAILED').length,
    missing: productIds.filter((id) => !owned.some((p) => p.id === id)).length,
  })
})

/*
 * Cinq produits par clic au maximum (07/09/2026).
 *
 * Chaque produit = un appel modèle séparé + jusqu'à cinq recherches web. À 25,
 * un seul clic pouvait lancer 25 analyses d'affilée — ~0,80 € de coût réel à 5,
 * ~3,75 € à 25, pour 1 crédit débité par produit. Le plafond borne le coût d'un
 * geste ; le prix par produit, lui, est couvert depuis le passage à Sonnet.
 */
const analysisSchema = z.object({ productIds: z.array(z.string()).min(1).max(5) })

/**
 * Market analysis for the selected listings.
 *
 * One credit per product, like an import: each analysis runs web searches and a
 * long reasoning pass, so it costs real money — three to four times an import.
 * A stored analysis is returned as is rather than paid for twice, unless the
 * caller asks for a refresh.
 *
 * Sequential on purpose: five concurrent agents each running five web searches is
 * how a rate limit is hit, and the seller would rather wait than get errors.
 */
productsRouter.post('/market-analysis', async (req: AuthedRequest, res) => {
  const parsed = analysisSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Sélectionnez entre 1 et 5 annonces à analyser' })

  const owned = await prisma.product.findMany({
    where: { id: { in: parsed.data.productIds }, userId: req.userId! },
  })
  if (!owned.length) return res.status(404).json({ error: 'Aucune de ces annonces ne vous appartient' })

  const results: Array<{ productId: string; title: string; analysis: unknown; error?: string }> = []

  for (const product of owned) {
    // Already analysed: hand back what was paid for rather than charging again.
    if (product.marketAnalysis && product.marketAnalysedAt) {
      results.push({
        productId: product.id,
        title: product.aiTitle || product.title,
        analysis: product.marketAnalysis,
      })
      continue
    }

    const credit = await reserveCredits(req.userId!, DROPS.analyse, 'Analyse de marché')
    if (!credit.ok) {
      results.push({
        productId: product.id,
        title: product.aiTitle || product.title,
        analysis: null,
        error: credit.reason,
      })
      continue
    }

    try {
      const analysis = await analyseProduct(product)
      await prisma.product.update({
        where: { id: product.id },
        data: { marketAnalysis: analysis as object, marketAnalysedAt: new Date() },
      })
      results.push({ productId: product.id, title: product.aiTitle || product.title, analysis })
    } catch (err) {
      // Nothing produced, nothing charged.
      await refundCredits(req.userId!, DROPS.analyse)
      console.error('analyse de marché', product.id, err)
      results.push({
        productId: product.id,
        title: product.aiTitle || product.title,
        analysis: null,
        error: err instanceof Error ? err.message : 'Analyse impossible',
      })
    }
  }

  /*
   * The analyses the seller just paid for also land on the Analyses de marché
   * page, as one report named after the batch: produits-<date>-<utilisateur>.
   * Same table as the auto-mode reports, so both vitrines read one list.
   * A failed consignation never fails the analyses themselves.
   */
  const reussies = results.filter((r) => r.analysis)
  if (reussies.length) {
    try {
      const moi = await prisma.user.findUnique({ where: { id: req.userId! }, select: { email: true } })
      const utilisateur = (moi?.email ?? 'vendeur').split('@')[0]
      const jour = new Date().toISOString().slice(0, 10)

      /*
       * Le rayon des annonces analysées, écrit sur le rapport.
       *
       * « Mes analyses » se trie et se filtre par catégorie, et seules les
       * lignes de l'AUTO-MODE en portaient une : une analyse payée par le
       * vendeur tombait toujours dans « Sans catégorie ». La sélection se fait
       * désormais par catégorie, donc un lot en a une — mais un lot mélangé
       * reste possible (arrivée depuis « Mes annonces »), et il est dit tel
       * quel plutôt que rangé sous le rayon du premier produit.
       */
      const analyses = new Set(reussies.map((r) => r.productId))
      const rayons = [
        ...new Set(
          owned.filter((p) => analyses.has(p.id) && p.categoryId).map((p) => p.categoryId as string),
        ),
      ]
      const libelles = rayons.length
        ? await prisma.category.findMany({ where: { id: { in: rayons } }, select: { label: true } })
        : []
      const rayon =
        libelles.length === 1 ? libelles[0].label : libelles.length > 1 ? 'Plusieurs catégories' : null
      const corps = reussies
        .map((r) => {
          const a = r.analysis as { verdict?: string; suggestedPrice?: number | null; reasoning?: string }
          const prix = typeof a.suggestedPrice === 'number' ? ` — prix conseillé ${a.suggestedPrice.toFixed(2)} €` : ''
          return `## ${r.title}${prix}\n\n${a.verdict ?? ''}\n\n${a.reasoning ?? ''}`.trim()
        })
        .join('\n\n')
      await prisma.report.create({
        data: {
          userId: req.userId!,
          section: 'MARKET',
          day: jour,
          title: `produits-${jour}-${utilisateur}`,
          body: corps,
          summary: { redacteur: utilisateur, produits: reussies.length, ...(rayon ? { rayon } : {}) },
        },
      })
    } catch (err) {
      console.error('consignation des analyses produits', err)
    }
  }

  res.json({ results })
})

// Bundles the watermarked photos into a zip for the manual Leboncoin/Vinted flow
// (no API on those platforms, so the user drags these into the native upload widget).
/**
 * Le catalogue au format de Faire, en CSV.
 *
 * **Faire n'a pas d'API d'annonces**, et n'en propose pas : son portail marque
 * accepte un dépôt de feuille de calcul, et c'est la seule voie qui passe à
 * l'échelle. Le vendeur télécharge ce fichier et le dépose chez eux — même
 * geste que les opérateurs Mirakl, à ceci près que Faire fait la mise en forme
 * de son côté.
 *
 * Les réglages passent en paramètres parce qu'ils sont des **décisions
 * commerciales**, pas des propriétés du produit : la remise de gros, le
 * conditionnement, la quantité minimale. Leurs défauts sont dans le service, et
 * l'écran doit les montrer plutôt que les appliquer en silence.
 *
 * Ce qui est écarté n'est pas caché : le compte et les raisons partent dans un
 * en-tête, et l'écran les affiche. Un catalogue de deux cents fiches dont
 * quarante manquent de photo doit le dire ici, pas se faire refuser chez Faire
 * trois heures plus tard.
 */
productsRouter.get('/meta/faire.csv', async (req: AuthedRequest, res) => {
  try {
    const nombre = (valeur: unknown, defaut: number) => {
      const n = Number(valeur)
      return Number.isFinite(n) && n > 0 ? n : defaut
    }

    const produits = await prisma.product.findMany({
      where: {
        userId: req.userId!,
        ...(req.query.shop ? { shopId: String(req.query.shop) } : {}),
      },
      orderBy: { createdAt: 'desc' },
    })

    const { csv, retenus, ecartes } = catalogueFaire(produits, {
      remiseGros: nombre(req.query.remiseGros, 0.5),
      unitesParCarton: nombre(req.query.unitesParCarton, 1),
      quantiteMinimale: nombre(req.query.quantiteMinimale, 1),
      methodeVente: String(req.query.methodeVente ?? '') || undefined,
      paysFabrication: String(req.query.paysFabrication ?? '') || undefined,
    })

    res.setHeader('X-Faire-Retenus', String(retenus))
    res.setHeader('X-Faire-Ecartes', String(ecartes.length))
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.attachment(`faire-${new Date().toISOString().slice(0, 10)}.csv`)
    res.send(csv)
  } catch (e) {
    console.error('export Faire', e)
    res.status(500).json({ error: "L'export Faire a échoué" })
  }
})

/** Ce que l'export donnerait, sans le produire : de quoi afficher un aperçu. */
productsRouter.get('/meta/faire-apercu', async (req: AuthedRequest, res) => {
  try {
    const produits = await prisma.product.findMany({
      where: { userId: req.userId!, ...(req.query.shop ? { shopId: String(req.query.shop) } : {}) },
      orderBy: { createdAt: 'desc' },
    })
    const { retenus, ecartes } = catalogueFaire(produits, {
      remiseGros: Number(req.query.remiseGros) || 0.5,
    })
    res.json({ total: produits.length, retenus, ecartes: ecartes.slice(0, 50) })
  } catch (e) {
    console.error('aperçu Faire', e)
    res.status(500).json({ error: "L'aperçu Faire a échoué" })
  }
})

productsRouter.get('/:id/photos.zip', async (req: AuthedRequest, res) => {
  const product = await prisma.product.findFirst({ where: { id: req.params.id, userId: req.userId! } })
  if (!product) return res.status(404).json({ error: 'Produit introuvable' })

  res.attachment(`droppost-${product.id}.zip`)
  const archive = archiver('zip')
  archive.pipe(res)

  const images = (product.images as string[]) || []

  // Photos may sit on the container's disk or in object storage, depending on
  // the deployment. Reading only local paths would have silently produced an
  // empty zip the day storage moved — and this zip is what the seller drags
  // into the Vinted and Leboncoin upload widgets.
  for (const [i, img] of images.entries()) {
    const name = `photo-${i + 1}.jpg`
    try {
      if (img.startsWith('http://') || img.startsWith('https://')) {
        const remote = await fetch(img)
        if (!remote.ok) continue
        archive.append(Buffer.from(await remote.arrayBuffer()), { name })
      } else if (img.startsWith('/storage/')) {
        archive.file(path.resolve(img.slice(1)), { name })
      }
    } catch (err) {
      // One unreachable photo must not empty the whole archive.
      console.error('photo absente du zip', img, err)
    }
  }

  await archive.finalize()
})

productsRouter.get('/:id/category-preview', async (req: AuthedRequest, res) => {
  const product = await prisma.product.findFirst({ where: { id: req.params.id, userId: req.userId! } })
  if (!product) return res.status(404).json({ error: 'Produit introuvable' })
  const platforms = PLATFORM_IDS
  res.json(
    await mapCategories(
      { sourceCategory: product.sourceCategory, categoryId: product.categoryId },
      platforms,
    ),
  )
})

/** The category taxonomy that powers the dropdown in the back office. */
productsRouter.get('/meta/categories', async (req: AuthedRequest, res) => {
  // Filtrées par rayon, ou par les rayons de la boutique visée.
  //
  // Un vendeur de high-tech ne doit pas dérouler quarante catégories de mode
  // pour trouver « casque audio ». Sans filtre, tout est proposé : c'est le cas
  // d'un vendeur qui n'a pas encore dit ce qu'il vend, et lui cacher des
  // catégories serait pire que de lui en montrer trop.
  let sectors: string[] | null = null

  if (typeof req.query.sector === 'string' && req.query.sector) {
    sectors = [req.query.sector]
  } else if (typeof req.query.shop === 'string' && req.query.shop) {
    const shop = await prisma.shop.findFirst({
      where: { id: req.query.shop, userId: req.userId! },
      select: { sectors: true },
    })
    const declared = Array.isArray(shop?.sectors) ? shop!.sectors : []
    const clean = declared.filter((s): s is string => typeof s === 'string')
    if (clean.length) sectors = clean
  }

  /*
   * Le référentiel en base, pas l'ancien tableau.
   *
   * Ce menu servait encore `CATEGORY_CATALOG` : vingt-neuf entrées dont
   * vingt-huit de mode homme, celui que le référentiel en base a remplacé.
   * Une souris gamer n'avait aucune place où aller, et surtout : une annonce
   * rangée depuis ce menu recevait un identifiant de l'ancien catalogue, que
   * la table `Category` ne connaît pas. La publication Shopify cherchait alors
   * la ligne correspondante, ne la trouvait pas, et partait sans catégorie ni
   * collection — sans que rien ne le signale.
   */
  const arbre = await arbreCategories()

  /*
   * Une boutique déclare ses rayons, et l'ancien réglage déclarait des secteurs.
   *
   * Les deux doivent répondre : le vendeur qui a coché « high-tech » avant le
   * référentiel ne doit pas se retrouver devant une liste vide. Un identifiant
   * de rayon est plus précis — c'est celui que l'écran « Mes sites » propose
   * maintenant — mais rien n'oblige à convertir l'existant pour ça.
   */
  const categories = arbre
    .filter((rayon) => !sectors || sectors.includes(rayon.id) || sectors.includes(rayon.sector))
    .flatMap((rayon) =>
      rayon.enfants.map((enfant) => ({
        id: enfant.id,
        group: rayon.label,
        label: enfant.label,
        sector: rayon.sector,
      })),
    )

  res.json({
    categories,
    // Les rayons réels, avec leur libellé : ce sont eux que « Mes sites »
    // propose de cocher. `categorySectors()` rendait les secteurs de l'ancien
    // catalogue, que le référentiel ne connaît plus.
    sectors: arbre.map((r) => ({ id: r.id, label: r.label, count: r.enfants.length })),
  })
})

// Photos the seller adds by hand: their own shots, or a rescue when the
// extension fails to find the gallery on a hostile supplier page.
const uploadPhotos = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: PHOTOS_PAR_ANNONCE },
  fileFilter: (_req, file, cb) => cb(null, /^image\/(jpe?g|png|webp|avif)$/.test(file.mimetype)),
}).array('photos', PHOTOS_PAR_ANNONCE)

productsRouter.post('/:id/images', (req: AuthedRequest, res) => {
  uploadPhotos(req, res, async (err) => {
    if (err) {
      const tooBig = (err as { code?: string }).code === 'LIMIT_FILE_SIZE'
      return res.status(400).json({ error: tooBig ? 'Photo trop lourde (8 Mo maximum)' : 'Envoi impossible' })
    }
    const files = (req.files as Express.Multer.File[]) ?? []
    if (!files.length) return res.status(400).json({ error: 'Sélectionnez au moins une image (JPEG, PNG ou WebP)' })

    const product = await prisma.product.findFirst({ where: { id: req.params.id, userId: req.userId! } })
    if (!product) return res.status(404).json({ error: 'Produit introuvable' })

    try {
      const existing = (product.images as string[]) ?? []
      const room = Math.max(0, PHOTOS_PAR_ANNONCE - existing.length)
      if (!room) return res.status(400).json({ error: `Cette annonce a déjà ${PHOTOS_PAR_ANNONCE} photos` })

      /*
       * La photo du vendeur suit le régime de l'annonce, et la marque est celle
       * de SA BOUTIQUE.
       *
       * Elle était marquée ici, au téléversement, avec les réglages du COMPTE :
       * `watermarkOptionsFor(user)` ne connaît pas la boutique. Deux
       * conséquences, toutes deux constatées par le marchand qui règle le
       * filigrane d'une de ses boutiques et ne voit rien changer — sa photo
       * portait la marque du compte et jamais celle de la boutique, et sur une
       * annonce moderne (remarquée à l'export) elle en portait **deux**, l'une
       * par-dessus l'autre.
       *
       * Depuis que la marque se pose à l'export, une annonce moderne range ses
       * photos NUES : l'original reste intact, la boutique décide, et changer de
       * logo ne demande aucun réenvoi. Les annonces antérieures gardent leurs
       * fichiers déjà marqués, qu'on ne peut pas démarquer : la photo ajoutée y
       * est marquée tout de suite, sinon elle serait la seule sans marque.
       */
      const [user, shop] = await Promise.all([
        prisma.user.findUniqueOrThrow({ where: { id: req.userId! } }),
        product.shopId ? prisma.shop.findUnique({ where: { id: product.shopId } }) : Promise.resolve(null),
      ])
      const reglages = product.imagesWatermarked
        ? reglagesFiligrane(user, shop)
        : ({ text: '', enabled: false } as const)

      const saved = await watermarkUploads(
        files.slice(0, room).map((f) => f.buffer),
        reglages,
        product.aiTitle || product.title,
        existing.length,
      )

      const images = [...existing, ...saved]
      await prisma.product.update({
        where: { id: product.id },
        data: {
          images,
          // Le cache d'export porte la liste d'avant : sans ça, la photo qu'on
          // vient d'ajouter n'apparaîtrait nulle part à la publication.
          exportSignature: null,
        },
      })
      // Le plafond est rendu avec la reponse : l ecran l affichait en dur, et
      // les deux valeurs ont diverge des que le serveur a change.
      res.json({ images, added: saved.length, max: PHOTOS_PAR_ANNONCE })
    } catch (e) {
      console.error('ajout de photos impossible', e)
      res.status(500).json({ error: "Ces images n'ont pas pu être traitées" })
    }
  })
})

/*
 * La video du vendeur, televersee a la main.
 *
 * Le filtre laisse passer large et le refus est rendu ensuite par
 * `refusVideo()` : `fileFilter` de multer ne sait dire que oui ou non, et un
 * fichier ecarte la disparait sans que personne puisse dire pourquoi. Le
 * vendeur doit lire « format non accepte (video/avi) », pas « envoi
 * impossible ».
 */
const uploadVideo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: VIDEO_MAX_OCTETS, files: 1 },
}).single('video')

productsRouter.post('/:id/video', (req: AuthedRequest, res) => {
  uploadVideo(req, res, async (err) => {
    if (err) {
      const tropLourde = (err as { code?: string }).code === 'LIMIT_FILE_SIZE'
      return res.status(400).json({
        error: tropLourde
          ? `Vidéo trop lourde — ${Math.round(VIDEO_MAX_OCTETS / (1024 * 1024))} Mo au maximum.`
          : 'Envoi impossible',
      })
    }

    const fichier = req.file
    if (!fichier) return res.status(400).json({ error: 'Sélectionnez une vidéo (MP4, WebM ou MOV)' })

    const refus = refusVideo(fichier.mimetype, fichier.size)
    if (refus) return res.status(400).json({ error: refus })

    const produit = await prisma.product.findFirst({ where: { id: req.params.id, userId: req.userId! } })
    if (!produit) return res.status(404).json({ error: 'Produit introuvable' })

    try {
      const videoUrl = await enregistrerVideo(fichier.buffer, fichier.mimetype, produit.aiTitle || produit.title)
      await prisma.product.update({ where: { id: produit.id }, data: { videoUrl } })
      // Les destinations sont rendues avec la reponse : le vendeur vient de
      // televerser, c est le moment ou il veut savoir ou elle servira.
      res.json({ videoUrl, destinations: PLATFORMS.filter((p) => p.video).map((p) => p.label) })
    } catch (e) {
      console.error('enregistrement de la video impossible', e)
      res.status(500).json({ error: "Cette vidéo n'a pas pu être enregistrée" })
    }
  })
})

/**
 * Retire la vidéo de l'annonce.
 *
 * Le fichier reste sur le stockage, comme les photos d'une annonce supprimée :
 * une autre annonce peut le désigner — une duplication partage l'adresse — et
 * l'effacer casserait la copie sans que rien ne le dise.
 */
productsRouter.delete('/:id/video', async (req: AuthedRequest, res) => {
  const produit = await prisma.product.findFirst({ where: { id: req.params.id, userId: req.userId! } })
  if (!produit) return res.status(404).json({ error: 'Produit introuvable' })
  await prisma.product.update({ where: { id: produit.id }, data: { videoUrl: null } })
  res.json({ ok: true })
})

const fillPlanSchema = z.object({
  platform: z.enum(PLATFORM_IDS),
  fields: z
    .array(
      z.object({
        ref: z.string(),
        label: z.string(),
        type: z.string(),
        placeholder: z.string().optional(),
        required: z.boolean().optional(),
        maxLength: z.number().optional(),
        options: z.array(z.string()).optional(),
      }),
    )
    .min(1)
    .max(120),
})

/**
 * The extension describes the marketplace form it found; Claude maps the product
 * onto it and returns what to type where. This is what lets one extension fill
 * any marketplace without a hand-written selector map per site.
 */
productsRouter.post('/:id/fill-plan', async (req: AuthedRequest, res) => {
  const parsed = fillPlanSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Description du formulaire invalide' })

  const product = await prisma.product.findFirst({ where: { id: req.params.id, userId: req.userId! } })
  if (!product) return res.status(404).json({ error: 'Produit introuvable' })

  try {
    const targetCategory = await mapCategory(
      { sourceCategory: product.sourceCategory, categoryId: product.categoryId },
      parsed.data.platform,
    )
    const plan = await buildFillPlan(product, parsed.data.platform, targetCategory, parsed.data.fields)
    res.json(plan)
  } catch (err) {
    console.error('fill-plan failed', err)
    res.status(502).json({ error: "L'IA n'a pas pu analyser ce formulaire" })
  }
})

/**
 * Les trois états d'un produit, et l'aide qui va avec.
 *
 * Servis plutôt que recopiés dans le front : la liste est la même que celle qui
 * se traduit à la publication, et deux listes qui doivent rester identiques
 * finissent toujours par diverger.
 */
productsRouter.get('/meta/conditions', (_req, res) => {
  res.json(ETATS)
})

/** Destination marketplaces, so the back office and extension share one list. */
productsRouter.get('/meta/platforms', (_req, res) => {
  res.json(PLATFORMS)
})

/**
 * Les plateformes d'acquisition, où le vendeur va chercher ses produits.
 *
 * Séparées des destinations : ce ne sont ni les mêmes comptes, ni les mêmes
 * gestes, et une même marque peut être les deux — on achète sur AliExpress, on
 * vend sur eBay, et Etsy est les deux à la fois.
 */
/**
 * L'annuaire des fournisseurs, avec l'état RÉEL de chaque raccordement.
 *
 * **La supercherie qu'on retire (15/09/2026).** L'écran affichait, sur TOUS les
 * fournisseurs sans distinction : « Ce raccordement sera conservé, rien de
 * plus. Le connecteur qui lira le catalogue, passera les commandes et
 * remontera le suivi n'est pas encore écrit. » C'était faux pour AliExpress,
 * BigBuy et CJ, dont les connecteurs tournent, sont couverts par des bancs et
 * lisent réellement le catalogue. Un vendeur qui venait de brancher AliExpress
 * lisait donc, juste sous les quatre capacités cochées en vert, qu'il ne
 * servait à rien. Signalé mot pour mot : « quelle est donc cette supercherie ? »
 *
 * `connecteurEcrit` est **déduit du registre**, jamais écrit à la main : le
 * jour où un connecteur est ajouté à `CONNECTEURS`, sa fiche cesse d'afficher
 * l'avertissement toute seule. Une liste recopiée, elle, aurait menti dans
 * l'autre sens au premier oubli.
 */
productsRouter.get('/meta/suppliers', (_req, res) => {
  res.json(SUPPLIERS.map((s) => ({ ...s, connecteurEcrit: Boolean(findConnector(s.id)) })))
})

/**
 * Ce qui bloque, destination par destination, avant même de cliquer.
 *
 * Le contrôle existe aussi à la publication, mais découvrir le refus au moment
 * de diffuser est trop tard : le vendeur a déjà coché, déjà attendu. Ici il
 * voit l'écart pendant qu'il rédige, et sait quoi corriger.
 */
productsRouter.get('/:id/conformite', async (req: AuthedRequest, res) => {
  const product = await prisma.product.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  })
  if (!product) return res.status(404).json({ error: 'Produit introuvable' })

  const cibles = PLATFORMS.filter((p) => !p.unavailable).map((p) => p.id)
  const verdicts = verifierCanaux(product, cibles)

  res.json({
    verdicts,
    // Le titre que chaque destination recevra vraiment : le vendeur voit d un
    // coup d oeil que son titre de cent trente caracteres devient autre chose
    // sur Leboncoin, au lieu de le decouvrir en comparant deux annonces en
    // ligne.
    titres: titlesByChannel(product),
    publiables: verdicts.filter((v) => v.publiable).length,
    total: verdicts.length,
  })
})

/**
 * L'annuaire complet des canaux connus.
 *
 * Séparé des destinations réellement intégrées : être dans l'annuaire ne veut
 * pas dire qu'on y publie. C'est assumé — le vendeur doit voir le paysage
 * entier et nous dire ce qu'il veut, plutôt que de repartir parce que sa
 * plateforme n'apparaît nulle part.
 */
productsRouter.get('/meta/channels', async (req: AuthedRequest, res) => {
  const integrees = new Set(PLATFORMS.filter((p) => !p.unavailable).map((p) => p.label.toLowerCase()))

  /*
   * Les adresses de flux du vendeur, avec l'annuaire.
   *
   * Sans elles, dire « ce comparateur se nourrit d'un flux » n'avance à rien :
   * le vendeur devrait aller chercher l'adresse ailleurs, dans un autre écran,
   * et revenir. Les clés de boutique partent donc ici — elles sont publiques
   * par construction, c'est tout leur objet.
   */
  const boutiques = await prisma.shop.findMany({
    where: { userId: req.userId! },
    select: { id: true, name: true, shopKey: true },
    orderBy: { createdAt: 'asc' },
  })
  const base = `${apiBaseUrl(req)}/api/public/shops`

  /*
   * Les demandes, comptees par canal et rappelees au demandeur.
   *
   * C est le client qui choisit ce qu on code ensuite : le compte s affiche
   * sur la carte du canal, et le vendeur voit que son clic a compte.
   */
  const [demandes, miennes] = await Promise.all([
    prisma.channelRequest.groupBy({ by: ['canalId'], _count: { canalId: true } }),
    prisma.channelRequest.findMany({ where: { userId: req.userId! }, select: { canalId: true } }),
  ])
  const compteDemandes = new Map(demandes.map((d) => [d.canalId, d._count.canalId]))
  const demandesAMoi = new Set(miennes.map((m) => m.canalId))

  void integrees
  const canaux = CANAUX.map((c) => {
    /*
     * La voie de liaison de CHAQUE canal (services/liaisonsCanaux.ts) : API
     * branchée ou à compte, flux à coller, fichier, extension, ou « pas un
     * canal de vente ». Avant le 23/09/2026, seuls 45 canaux avaient un état
     * et le reste disait « pas encore reliée » — faux pour la plupart.
     */
    const liaison = liaisonPour(c)
    return {
      ...c,
      integre: liaison.voie === 'api' && liaison.etat === 'branche',
      liaison,
      /** Le format de flux qui suffit à le nourrir, quand c'est sa voie. */
      flux: liaison.voie === 'flux' ? liaison.flux ?? null : null,
      /** Combien de vendeurs la veulent, et si celui-ci l a deja demandee. */
      demandes: compteDemandes.get(c.id) ?? 0,
      demandee: demandesAMoi.has(c.id),
    }
  })

  res.json({
    types: TYPES_CANAL,
    canaux,
    total: CANAUX.length,
    /** Combien de canaux un simple flux suffirait à servir. */
    aFlux: canaux.filter((c) => c.flux).length,
    /** Les 314, comptés par voie et par état : ce qu'on peut affirmer. */
    liaisons: resumeLiaisons(),
    /** Le catalogue en fichier CSV (colonnes Google / Meta), à déposer dans un back-office vendeur. */
    exportCsv: '/api/products/meta/catalogue.csv',
    formats: FORMATS_FLUX,
    boutiques: boutiques.map((b) => ({
      id: b.id,
      name: b.name,
      adresses: Object.fromEntries(FORMATS_FLUX.map((f) => [f.id, `${base}/${b.shopKey}/${f.fichier}`])),
    })),
  })
})

/**
 * Le catalogue en fichier, pour les canaux qui n'acceptent pas d'adresse.
 *
 * Mêmes colonnes que le flux Meta (id, title, description, price, link,
 * image_link, brand, gtin…), le dénominateur commun des imports de places de
 * marché. Toutes les annonces prêtes du vendeur, ou celles d'une boutique
 * (`?shop=`). Le vendeur le dépose dans son back-office ; le canal fait le
 * rapprochement par EAN quand il en exige un.
 */
productsRouter.get('/meta/catalogue.csv', async (req: AuthedRequest, res) => {
  const shopId = typeof req.query.shop === 'string' ? req.query.shop : undefined
  const shop = shopId ? await prisma.shop.findFirst({ where: { id: shopId, userId: req.userId! } }) : null
  if (shopId && !shop) return res.status(404).json({ error: 'Boutique introuvable.' })

  const produits = await prisma.product.findMany({
    where: { userId: req.userId!, status: 'READY', ...(shop ? { shopId: shop.id } : {}) },
    orderBy: { updatedAt: 'desc' },
    take: 5000,
  })
  const compte = await prisma.user.findUnique({ where: { id: req.userId! }, select: { shopKey: true, email: true } })
  const cle = shop?.shopKey ?? compte?.shopKey ?? 'catalogue'
  res.type('text/csv; charset=utf-8')
  res.set('Content-Disposition', `attachment; filename="catalogue-${(shop?.name ?? 'dropshipper').replace(/[^a-z0-9-]+/gi, '-').toLowerCase()}.csv"`)
  res.send(metaCsv(produits.map((product) => ({ product, category: product.sourceCategory })), cle, shop?.name ?? 'DropShipper'))
})

/**
 * « Je veux celle-la » : la demande d un canal, comptee.
 *
 * Idempotente par construction -- l unicite (userId, canalId) est dans le
 * schema, pas dans une verification qui laisserait passer deux clics
 * simultanes. Redemander rend le meme etat, sans erreur : marteler le bouton
 * ne fait ni monter la file ni afficher un echec.
 */
productsRouter.post('/meta/channels/:canalId/demande', async (req: AuthedRequest, res) => {
  const canal = CANAUX.find((c) => c.id === req.params.canalId)
  if (!canal) return res.status(404).json({ error: 'Canal inconnu.' })

  await prisma.channelRequest.upsert({
    where: { userId_canalId: { userId: req.userId!, canalId: canal.id } },
    create: { userId: req.userId!, canalId: canal.id },
    update: {},
  })
  const demandes = await prisma.channelRequest.count({ where: { canalId: canal.id } })
  res.json({ ok: true, canal: canal.label, demandes })
})

/**
 * « Votre fournisseur n'est pas dans la liste ? » — la demande d'ajout.
 *
 * On ne crée rien en base : un email part à l'équipe pour qu'elle ajoute le
 * fournisseur à l'annuaire et le relie si une API existe. Le vendeur ne donne
 * qu'un nom ou une adresse ; son email vient de son compte.
 */
productsRouter.post('/meta/suppliers/demande', async (req: AuthedRequest, res) => {
  const parsed = z.object({ fournisseur: z.string().trim().min(2).max(300) }).safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Indiquez le nom ou l’adresse du fournisseur.' })
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.userId! },
    select: { email: true },
  })

  // Le corps de l'email est inséré tel quel dans du HTML : on échappe l'entrée
  // du vendeur pour qu'un nom ou une URL biscornue ne casse pas le message.
  const echapper = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const contact =
    process.env.CONTACT_EMAIL?.trim() || process.env.SMTP_USER?.trim() || 'contact@drop-shipper.fr'

  try {
    await sendMail({
      to: contact,
      subject: `Demande d'ajout de fournisseur — ${parsed.data.fournisseur}`.slice(0, 180),
      heading: 'Nouvelle demande de fournisseur',
      body: `L'utilisateur <b>${echapper(user.email)}</b> souhaite ajouter le fournisseur : <b>${echapper(
        parsed.data.fournisseur,
      )}</b>.<br><br>À ajouter à l'annuaire, et à relier si une API est disponible.`,
      footer: 'Demande envoyée depuis la page Fournisseurs de DropShipper IA.',
    })
  } catch (err) {
    console.error('demande de fournisseur : email non envoyé', err)
    return res.status(502).json({ error: "La demande n'a pas pu être envoyée, réessayez plus tard." })
  }

  res.json({ ok: true })
})

/**
 * Créer une annonce vide, à remplir à la main — gratuit.
 *
 * Pour le vendeur qui veut saisir un produit lui-même, sans import : une fiche
 * vierge où titre, description, prix et photos sont à remplir, et où les agents
 * IA de la fiche proposent leur aide comme sur n'importe quelle annonce. Aucun
 * drop débité : la saisie manuelle ne coûte rien. Les valeurs par défaut du
 * schéma font le reste (statut brouillon, prix à 0, état neuf…).
 */
productsRouter.post('/manuel', async (req: AuthedRequest, res) => {
  const produit = await prisma.product.create({
    data: {
      userId: req.userId!,
      // Pas de source : la fiche ne vient d'aucune page. L'écran masque le lien
      // « Source » quand sourceUrl est vide.
      sourceUrl: '',
      title: 'Nouvelle annonce',
      description: '',
      images: [],
      /*
       * `imagesWatermarked: false` — la quatrième fois que cet oubli coûte un
       * filigrane.
       *
       * La colonne vaut `true` par défaut (elle décrit l'existant, marqué dans
       * le fichier avant que la marque passe à l'export). Un bloc de création
       * qui l'oublie produit donc des annonces **réputées déjà marquées** :
       * `imagesPourExport` rend leurs photos telles quelles et aucun filigrane
       * n'est jamais posé. L'import par adresse, l'import en lot et l'extension
       * sont tombés dedans ; la saisie manuelle aussi, et c'est ce que voyait le
       * marchand qui réglait le filigrane de sa boutique sans rien voir changer.
       */
      imagesWatermarked: false,
    },
  })
  res.status(201).json({ id: produit.id })
})

/**
 * Importer une liste de produits depuis un export fournisseur.
 *
 * AliExpress Business permet de cocher des produits et d'exporter la sélection.
 * Le fichier obtenu ne contient que trois colonnes : identifiant, titre,
 * adresse. **Aucune image, aucun prix, aucune description** — c'est une liste de
 * courses, pas un catalogue.
 *
 * C'est pourtant tout ce qu'il faut, à une condition : que le fournisseur soit
 * relié par son API. L'identifiant suffit alors à demander la fiche complète,
 * photos comprises. Sans API, ces adresses ne mènent nulle part : AliExpress
 * construit ses pages en JavaScript et un client HTTP ordinaire reçoit une
 * coquille vide — c'est écrit dans le mémo depuis le début, et c'est pour ça que
 * l'extension existe.
 */
const listeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
}).single('fichier')

productsRouter.post('/import-list', (req: AuthedRequest, res) => {
  listeUpload(req, res, async (err) => {
    if (err) {
      const trop = (err as { code?: string }).code === 'LIMIT_FILE_SIZE'
      return res.status(400).json({ error: trop ? 'Fichier trop lourd (5 Mo maximum)' : 'Envoi impossible' })
    }
    if (!req.file) return res.status(400).json({ error: 'Joignez le fichier exporté par votre fournisseur.' })

    let classeur
    try {
      classeur = lireClasseur(req.file.buffer)
    } catch (e) {
      return res.status(400).json({
        error: e instanceof XlsxIllisible ? e.message : "Ce fichier n'a pas pu être lu.",
      })
    }

    const colonne = colonneAdresses(classeur)
    if (!colonne) {
      return res.status(400).json({
        error: `Aucune colonne d'adresses trouvée. Colonnes lues : ${classeur.entetes.join(', ')}.`,
      })
    }

    /*
     * Les références, dédoublonnées et rangées par fournisseur.
     *
     * Un même produit peut figurer deux fois dans un export — le vendeur l'a
     * coché puis recoché. L'importer deux fois coûterait deux crédits pour deux
     * annonces identiques.
     */
    const parFournisseur = new Map<string, Map<string, string>>()
    const ignorees: string[] = []

    for (const ligne of classeur.lignes) {
      const url = ligne[colonne]
      if (!url) continue
      const champs = supplierFields(url)
      if (!champs.supplierId || !champs.supplierRef) {
        ignorees.push(url)
        continue
      }
      const lot = parFournisseur.get(champs.supplierId) ?? new Map()
      lot.set(champs.supplierRef, url)
      parFournisseur.set(champs.supplierId, lot)
    }

    const total = [...parFournisseur.values()].reduce((n, m) => n + m.size, 0)
    if (!total) {
      return res.status(400).json({
        error: "Aucune adresse produit reconnue dans ce fichier.",
        ignorees: ignorees.slice(0, 5),
      })
    }

    const resultats = await importerDepuisFournisseurs(req.userId!, parFournisseur, {
      apiBaseUrl: apiBaseUrl(req),
    })

    res.json({ ...resultats, lues: classeur.lignes.length, ignorees: ignorees.length })
  })
})

/**
 * Les catalogues des fournisseurs reliés, cherchés depuis l'écran.
 *
 * **Le trou que ça bouche.** La capacité existait dans les connecteurs depuis
 * des semaines — `searchProducts`, `winningProducts` — et n'était atteignable
 * que de deux façons : en demandant à un chef de rayon dans le chat, ou par
 * l'enquête automatique qui dépose des opportunités. Aucun écran. Un vendeur
 * qui venait de relier CJ ne pouvait pas parcourir son catalogue, c'est-à-dire
 * exactement ce pour quoi il l'avait relié.
 *
 * **Ce qui ne sait pas chercher ne prétend pas chercher.** La réponse dit,
 * fournisseur par fournisseur, ce qu'il sait faire — déduit du connecteur, pas
 * d'une liste recopiée. BigBuy est relié et ne sait ni chercher par mots-clés
 * ni proposer ses meilleures ventes : l'écran doit le dire, pas l'interroger
 * dans le vide et rendre « aucun résultat », ce qui ferait croire à un
 * catalogue vide.
 */
productsRouter.get('/meta/supplier-catalog', async (req: AuthedRequest, res) => {
  try {
    const motsCles = String(req.query.q ?? '').trim()
    const demande = String(req.query.supplier ?? '').trim()

    // La jointure « liaison reliée + connecteur écrit » vit dans le registre :
    // le studio d'analyses en a besoin aussi, et deux copies divergeraient —
    // celle qui filtre les liaisons éteintes et celle qui oublie de le faire.
    const fournisseurs = (await fournisseursRelies(prisma, req.userId!)).map((f) => ({
      ...f,
      cherche: Boolean(f.connecteur.searchProducts),
      gagnants: Boolean(f.connecteur.winningProducts),
      rayons: Boolean(f.connecteur.listerRayons),
    }))

    /*
     * **Tous les fournisseurs à la fois, pas l'un après l'autre.**
     *
     * Demandé le 16/09/2026 : « quand je clique sur écouteurs sans fil, je veux
     * voir les offres AliExpress, les offres CJ et les offres BigBuy ». C'est le
     * geste du sourcing : on ne cherche pas chez un fournisseur, on cherche un
     * produit et on compare ce que chacun en demande. Un écran qui impose de
     * choisir d'abord fait refaire la même recherche trois fois et ne permet
     * jamais la comparaison, qui est justement la décision à prendre.
     *
     * En parallèle, et **chaque fournisseur porte son propre sort** : une clé
     * refusée chez l'un ne doit pas priver le vendeur des deux autres. C'est la
     * règle déjà posée pour le relevé des prix — un refus qui porte sur la
     * liaison arrête ce fournisseur-là, pas la tournée entière.
     */
    const aInterroger = demande ? fournisseurs.filter((f) => f.id === demande) : fournisseurs

    const resultats = await Promise.all(
      aInterroger.map(async (f) => {
        const vitrine = { id: f.id, label: f.label, cherche: f.cherche, gagnants: f.gagnants, rayons: f.rayons }
        try {
          if (motsCles && f.cherche) {
            const produits = await f.connecteur.searchProducts!(motsCles, f.creds)
            return {
              ...vitrine,
              produits,
              note: produits.length ? null : `Aucun résultat pour « ${motsCles} ».`,
            }
          }
          if (!motsCles && f.gagnants) {
            const produits = await f.connecteur.winningProducts!(f.creds)
            return {
              ...vitrine,
              produits,
              note: produits.length ? null : 'Aucune sélection en ce moment — cherchez par mots-clés.',
            }
          }
          /*
           * Il ne sait pas chercher : alors on lui demande ses RAYONS.
           *
           * BigBuy n'a pas un seul point d'entrée de recherche sur les 61 de sa
           * spec. Répondre « pas de recherche » et s'arrêter là laisserait le
           * vendeur devant une section vide alors que son catalogue entier est
           * lisible — simplement par l'arbre, pas par des mots.
           */
          if (f.connecteur.listerRayons) {
            const rayonDemande = String(req.query.rayon ?? '').trim()
            if (rayonDemande && f.connecteur.produitsDuRayon) {
              const produits = await f.connecteur.produitsDuRayon(rayonDemande, f.creds)
              return {
                ...vitrine,
                produits,
                rayonsDisponibles: await f.connecteur.listerRayons(f.creds),
                rayonChoisi: rayonDemande,
                note: produits.length ? null : 'Ce rayon est vide chez lui.',
              }
            }
            return {
              ...vitrine,
              produits: [],
              rayonsDisponibles: await f.connecteur.listerRayons(f.creds),
              rayonChoisi: null,
              note: 'Son catalogue ne se cherche pas par mots-clés — choisissez un rayon.',
            }
          }

          return {
            ...vitrine,
            produits: [],
            note: motsCles
              ? 'Pas de recherche par mots-clés dans son API.'
              : "Pas de sélection à proposer d'office — tapez ce que vous cherchez.",
          }
        } catch (e) {
          // Le refus du fournisseur est transmis tel quel : « Invalid Token »
          // dit quoi corriger, « erreur » ne dit rien.
          return { ...vitrine, produits: [], note: e instanceof Error ? e.message : 'Recherche refusée.' }
        }
      }),
    )

    res.json({ fournisseurs: resultats })
  } catch (e) {
    console.error('catalogue fournisseur', e)
    res.status(500).json({ error: 'Impossible de lire le catalogue fournisseur' })
  }
})

/**
 * Importe des fiches repérées dans un catalogue fournisseur.
 *
 * Passe par `importerDepuisFournisseurs`, le même chemin que l'import d'un
 * export de références : réécriture, photos réhébergées, catégorie, crédits
 * décomptés une fois. Écrire un second chemin d'import ferait deux
 * comportements pour un même geste, et c'est toujours le second qu'on oublie
 * de corriger.
 */
productsRouter.post('/import-catalogue', async (req: AuthedRequest, res) => {
  try {
    const { supplier, refs } = req.body as { supplier?: string; refs?: unknown }
    const liste = Array.isArray(refs) ? refs.filter((r): r is string => typeof r === 'string' && Boolean(r)) : []
    if (!supplier || !liste.length) {
      return res.status(400).json({ error: 'Choisissez un fournisseur et au moins un produit.' })
    }
    if (liste.length > 50) {
      return res.status(400).json({ error: 'Cinquante produits au maximum par import.' })
    }

    const parFournisseur = new Map<string, Map<string, string>>([
      [supplier, new Map(liste.map((ref) => [ref, '']))],
    ])
    const resultats = await importerDepuisFournisseurs(req.userId!, parFournisseur, {
      apiBaseUrl: apiBaseUrl(req),
    })
    res.json(resultats)
  } catch (e) {
    console.error('import catalogue', e)
    res.status(500).json({ error: "L'import depuis le catalogue a échoué" })
  }
})

/**
 * L'arbre du référentiel : rayons à gros blocs, sous-catégories dessous.
 *
 * Public au sens du compte — tous les vendeurs partagent le même référentiel —
 * mais servi derrière l'authentification comme le reste de cette route. Le
 * référentiel s'enrichit de ce que tout le monde importe : c'est ce qui le rend
 * meilleur pour chacun.
 */
/**
 * Reprend les annonces qui ne sont rangées nulle part.
 *
 * Deux populations, et aucune ne se voyait : celles importées avant que le
 * référentiel existe, et celles rangées à la main depuis un menu qui servait
 * encore l'ancien catalogue — leur `categoryId` (`ht-laptop`, `acc-watch`) n'a
 * jamais désigné une ligne de `Category`. Relevé le 31/08/2026 : 151 annonces
 * sur 154.
 *
 * Le rangement passe par `resoudreCategorie`, du moins cher au plus cher :
 * mémoire des alias d'abord, modèle en dernier. Deux cents annonces d'une même
 * boutique coûtent donc quelques appels, pas deux cents — et ce qui est appris
 * ici sert aux imports suivants.
 *
 * Rien ne tombe dans « Divers » : ce qui résiste est rendu en clair, à ranger
 * à la main depuis la fiche.
 */
/**
 * Le lot repris en un appel.
 *
 * **La reprise se faisait d un seul tenant, et elle etait coupee en route.**
 * Quatre-vingt-onze annonces, chacune pouvant demander un appel au modele : la
 * requete depassait le delai du proxy bien avant la fin, et le navigateur
 * rendait « failed to fetch » -- une panne reseau, sans rien dire de ce qui
 * avait ete range. Signale le 02/09/2026.
 *
 * Vingt-cinq est un compromis : assez pour que la reprise avance vite, assez
 * court pour tenir largement sous le delai meme si chaque annonce appelle le
 * modele. L ecran rappelle jusqu a ce qu il n y ait plus de suite.
 */
const REPRISE_PAR_LOT = 25

const repriseSchema = z.object({
  /** L identifiant apres lequel reprendre. Absent : on repart du debut. */
  apres: z.string().optional(),
})

productsRouter.post('/meta/recategoriser', async (req: AuthedRequest, res) => {
  const parsed = repriseSchema.safeParse(req.body ?? {})
  if (!parsed.success) return res.status(400).json({ error: 'Demande invalide' })

  /*
   * Ordonnees par identifiant, et non par date.
   *
   * Le curseur doit porter sur un champ stable et unique : trier par date de
   * creation laisserait deux annonces creees dans la meme seconde se depasser
   * d un appel a l autre, donc sauter l une et reprendre l autre deux fois.
   */
  const produits = await prisma.product.findMany({
    where: { userId: req.userId! },
    orderBy: { id: 'asc' },
    cursor: parsed.data.apres ? { id: parsed.data.apres } : undefined,
    skip: parsed.data.apres ? 1 : 0,
    take: REPRISE_PAR_LOT,
    select: { id: true, categoryId: true, sourceCategory: true, title: true, aiTitle: true, supplierId: true, attributes: true },
  })

  /*
   * Toutes les annonces sont reprises, pas seulement les orphelines.
   *
   * Une annonce peut porter une catégorie qui existe et qui est fausse : seize
   * l'étaient, rangées dans « Figurines et jouets d'action » par un alias
   * empoisonné. Ne reprendre que celles sans catégorie les aurait laissées
   * telles quelles, et le vendeur aurait vu « 3 rangées » en croyant que le
   * reste allait bien.
   *
   * Le geste du vendeur, lui, n'est pas touché : `resoudreCategorie` ne
   * contredit jamais un alias posé à la main.
   */
  const aRanger = produits

  let ranges = 0
  let inchanges = 0
  const restants: Array<{ id: string; titre: string }> = []

  for (const produit of aRanger) {
    const titre = produit.aiTitle || produit.title
    try {
      const resolution = await resoudreCategorie({
        sourceCategory: produit.sourceCategory,
        supplierId: produit.supplierId,
        title: titre,
      })
      if (!resolution.categoryId) {
        restants.push({ id: produit.id, titre })
        continue
      }
      if (resolution.categoryId === produit.categoryId && !resolution.genre) {
        inchanges++
        continue
      }
      await prisma.product.update({
        where: { id: produit.id },
        data: {
          categoryId: resolution.categoryId,
          // Le genre lu dans le titre : Vinted et Leboncoin le demandent, la
          // taxonomie de Google ne le porte pas.
          attributes: avecGenre(produit.attributes, resolution.genre),
        },
      })
      if (resolution.categoryId !== produit.categoryId) ranges++
      else inchanges++
    } catch {
      restants.push({ id: produit.id, titre })
    }
  }

  res.json({
    examinees: aRanger.length,
    dejaRangees: inchanges,
    rangees: ranges,
    // Rendus pour être cliqués : une liste de titres sans lien ne se traite pas.
    restants: restants.slice(0, 50),
    /*
     * L identifiant a partir duquel continuer, ou  quand tout est vu.
     *
     * Un lot plein ne veut pas dire qu il reste quelque chose -- il peut tomber
     * pile sur la fin. Le prochain appel rendra zero examinee et s arretera : un
     * aller-retour de trop vaut mieux qu une reprise qui s arrete avant la fin.
     */
    suivant: produits.length === REPRISE_PAR_LOT ? produits[produits.length - 1].id : null,
  })
})

productsRouter.get('/meta/category-tree', async (req: AuthedRequest, res) => {
  const arbre = await arbreCategories()

  /*
   * Ce qui attend d'être rangé, compté pour être dit.
   *
   * Une annonce en salle d'attente ne s'affiche dans aucun rayon et ne part
   * bien nulle part : sans ce chiffre, elle y dort sans que rien ne le signale,
   * et le vendeur conclut que son import a échoué. Compté chez lui seulement —
   * c'est son catalogue, pas le référentiel, qui est en cause.
   */
  const enSalleDAttente = await prisma.product.count({
    where: {
      userId: req.userId!,
      OR: [{ categoryId: CATEGORIE_A_RANGER }, { categoryId: { startsWith: `${CATEGORIE_A_RANGER}-` } }],
    },
  })

  res.json({
    rayons: arbre.length,
    sousCategories: arbre.reduce((n, r) => n + r.enfants.length, 0),
    // Les catégories apprises se comptent à part : c'est la mesure de ce que le
    // référentiel a gagné depuis sa livraison.
    apprises: arbre.reduce((n, r) => n + r.enfants.filter((e) => e.origin === 'learned').length, 0),
    aRanger: { categoryId: CATEGORIE_A_RANGER, annonces: enSalleDAttente },
    arbre,
  })
})

/**
 * Range une annonce à la main, et l'apprend pour de bon.
 *
 * Le geste du vendeur vaut mieux que n'importe quelle heuristique : il voit le
 * produit. C'est aussi la seule sortie de la salle d'attente — une annonce qui
 * y reste ne s'affiche dans aucun rayon — et c'est ce qui apprend au
 * référentiel une catégorie qu'il ne savait pas reconnaître.
 *
 * Encore faut-il que la leçon serve : voir `apprendreDuVendeur`, qui grave la
 * correction sur toutes les clés que la lecture essaiera, la marque « manuel »
 * pour qu'aucune heuristique ne l'efface, et **remplace** l'alias fautif au
 * lieu de le laisser en place.
 */
productsRouter.put('/:id/category', async (req: AuthedRequest, res) => {
  const categoryId = typeof req.body?.categoryId === 'string' ? req.body.categoryId.trim() : ''
  if (!categoryId) return res.status(400).json({ error: 'Catégorie manquante' })

  const [produit, categorie] = await Promise.all([
    prisma.product.findFirst({ where: { id: req.params.id, userId: req.userId! } }),
    prisma.category.findUnique({ where: { id: categoryId } }),
  ])
  if (!produit) return res.status(404).json({ error: 'Annonce introuvable' })
  if (!categorie) return res.status(400).json({ error: 'Catégorie inconnue' })

  await prisma.product.update({ where: { id: produit.id }, data: { categoryId } })

  const { cles } = await apprendreDuVendeur(
    {
      title: produit.aiTitle || produit.title,
      sourceCategory: produit.sourceCategory,
      supplierId: produit.supplierId,
    },
    categoryId,
  )

  res.json({
    ok: true,
    categoryId,
    path: categorie.path,
    // Ce que la correction a appris : l'écran le dit, parce qu'un
    // apprentissage silencieux est indiscernable d'un apprentissage absent.
    appris: cles.length,
    sortiDeLaSalleDAttente: estARanger(produit.categoryId) && !estARanger(categoryId),
  })
})

/**
 * Ce qu'une place de marché doit recevoir pour cette annonce.
 *
 * L'extension assemblait sa charge utile elle-même, à partir des champs bruts
 * du produit. C'est devenu faux le jour où le filigrane est passé à l'export :
 * `product.images` rend désormais les originaux, et l'extension serait allée
 * poser des photos **sans marque** sur Leboncoin, Vinted et Facebook.
 *
 * La marque se pose donc ici, comme pour Shopify et pour le flux. Une seule
 * route rend tout ce qu'il faut, plutôt que deux appels et un assemblage côté
 * navigateur — l'endroit où l'on oublie le plus facilement une règle.
 */
productsRouter.get('/:id/publish-payload', async (req: AuthedRequest, res) => {
  const produit = await prisma.product.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  })
  if (!produit) return res.status(404).json({ error: 'Annonce introuvable' })

  const [images, categorie] = await Promise.all([
    imagesPourExport(produit),
    produit.categoryId
      ? prisma.category.findUnique({ where: { id: produit.categoryId }, select: { path: true } })
      : Promise.resolve(null),
  ])

  const base = apiBaseUrl(req)

  /*
   * Le titre est raccourci pour la destination, ici et pas ailleurs.
   *
   * **Il partait brut.** L'écran de conformité affichait « Leboncoin refuse un
   * titre de plus de 50 caractères » pendant que l'extension en déposait 200 —
   * et `titleForChannel()`, qui sait choisir la bonne longueur parmi les trois
   * variantes écrites à l'import, n'était appelé que pour Google Shopping et
   * Shopify. Un titre de 130 caractères, la longueur normale que l'IA produit,
   * arrivait donc entier dans le champ de Leboncoin, qui le refuse ou le coupe
   * au milieu d'un mot. Même trou pour Vinted (70) et Facebook (100).
   *
   * La plateforme arrive en paramètre : sans elle on ne peut pas savoir quelle
   * longueur viser, et le titre brut reste rendu tel quel — c'est le
   * comportement des appelants qui ne la passent pas encore.
   */
  const plateforme = String(req.query.platform ?? '').toUpperCase()
  const titre =
    plateforme && PLATFORM_IDS.includes(plateforme as never)
      ? titleForChannel(produit, plateforme as never)
      : produit.aiTitle || produit.title

  res.json({
    title: titre,
    description: produit.aiDescription || produit.description,
    price: Number(produit.sellingPrice).toFixed(2),
    currency: produit.currency,
    category: categorie?.path ?? produit.sourceCategory ?? null,
    // Absolues : une adresse relative ne veut rien dire dans un onglet Leboncoin.
    images: images.map((i: string) => (i.startsWith('/') ? `${base}${i}` : i)),
    variants: produit.variants ?? null,
    // Deux formes : la nôtre, pour décider ; celle de Leboncoin, à recopier
    // telle quelle dans sa liste déroulante — « Très bon état » n'est pas
    // « Très bon », et un libellé approché ne sélectionne rien.
    condition: produit.condition,
    conditionLabel: etatPour(produit.condition, 'LEBONCOIN'),
  })
})

/**
 * Le brouillon de publication sociale pour cette annonce.
 *
 * Composé à partir de ce qui est déjà écrit — titre réécrit, arguments de
 * vente, prix, mots-clés — et **sans appeler le modèle** : ouvrir la fenêtre
 * coûterait sinon un appel payant à chaque clic, y compris quand le vendeur la
 * referme sans rien envoyer.
 *
 * Un message par réseau : le même texte partout se voit tout de suite, et
 * Instagram ne rend aucun lien cliquable là où Facebook les accepte.
 *
 * Les photos sont **celles de l'export**, marquées. C'est le même piège que
 * pour l'extension : depuis que le filigrane se pose au départ, `product.images`
 * rend les originaux, et publier ces fichiers-là enverrait des photos sans
 * marque sur la page du vendeur.
 */
productsRouter.get('/:id/social-draft', async (req: AuthedRequest, res) => {
  const produit = await prisma.product.findFirst({
    where: { id: req.params.id, userId: req.userId! },
    include: { shop: { select: { shopKey: true, name: true } } },
  })
  if (!produit) return res.status(404).json({ error: 'Annonce introuvable' })

  const [images, comptes] = await Promise.all([
    imagesPourExport(produit),
    comptesDe(req.userId!, { publicitaires: false }),
  ])

  const base = apiBaseUrl(req)
  /*
   * Le lien n'existe que si l'annonce est publiée sur un site.
   *
   * Inviter à cliquer vers une adresse qui n'existe pas est pire que ne pas
   * inviter : le vendeur ne s'en aperçoit qu'en voyant les premiers messages
   * d'acheteurs perdus.
   */
  const publiee = await prisma.publication.findFirst({
    where: { productId: produit.id, status: 'PUBLISHED' },
    select: { externalUrl: true },
    orderBy: { publishedAt: 'desc' },
  })

  const reseaux = [...new Set(comptes.map((c) => c.platform))]
  res.json({
    // Sans compte raccordé, l'écran doit le dire plutôt que de proposer une
    // fenêtre vide avec un bouton qui ne peut rien faire.
    comptes: comptes.map((c) => ({
      externalId: c.externalId,
      platform: c.platform,
      label: c.label,
      connected: c.connected,
    })),
    // Absolues : Meta télécharge les photos lui-même.
    medias: images.map((i: string) => (i.startsWith('/') ? `${base}${i}` : i)),
    lien: publiee?.externalUrl ?? null,
    brouillons: reseaux.map((r) => brouillonPour(produit, r, publiee?.externalUrl ?? null)),
  })
})

/**
 * L'avis de Laurence sur l'opportunité publicitaire d'une annonce.
 *
 * Gardé sur l'annonce, et resservi tant qu'il est frais. Le vendeur cliquait,
 * lisait, fermait — et l'avis disparaissait ; le lendemain il repayait la même
 * réponse sur le même produit, sans s'en apercevoir autrement qu'au relevé.
 *
 * Le crédit est pris avant l'appel et rendu si le modèle ne répond pas :
 * facturer un avis qu'on n'a pas rendu est la seule chose à ne jamais faire.
 */
productsRouter.post('/:id/ad-advice', async (req: AuthedRequest, res) => {
  const produit = await prisma.product.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  })
  if (!produit) return res.status(404).json({ error: 'Annonce introuvable' })

  // `refaire` est le geste du vendeur qui a changé son prix : lui seul peut
  // décider qu'un avis frais est périmé.
  if (!req.body?.refaire && avisEncoreFrais(produit)) {
    return res.json({ avis: produit.adAdvice, at: produit.adAdvisedAt, facture: false })
  }

  const credit = await reserveCredits(req.userId!, COUT_AVIS, 'Avis publicitaire')
  if (!credit.ok) return res.status(402).json({ error: credit.reason, needsCredits: true })

  const categorie = produit.categoryId
    ? await prisma.category.findUnique({ where: { id: produit.categoryId }, select: { path: true } })
    : null

  const avis = await redigerAvisPublicitaire({
    titre: produit.aiTitle || produit.title,
    description: produit.aiDescription || produit.description,
    prixAchat: Number(produit.price),
    port: Number(produit.shippingCost),
    prixVente: Number(produit.sellingPrice),
    devise: produit.currency,
    categorie: categorie?.path ?? produit.sourceCategory,
    arguments: (Array.isArray(produit.bulletPoints) ? produit.bulletPoints : []).filter(
      (b): b is string => typeof b === 'string',
    ),
  })

  if (!avis) {
    await refundCredits(req.userId!, COUT_AVIS)
    return res.status(502).json({ error: "Laurence n'a pas pu répondre. Votre crédit est rendu." })
  }

  const at = new Date()
  await prisma.product.update({
    where: { id: produit.id },
    data: { adAdvice: avis, adAdvisedAt: at },
  })

  res.json({ avis, at, facture: true })
})
