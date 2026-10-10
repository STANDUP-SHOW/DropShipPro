import express, { Router, type Request } from 'express'
import { prisma } from '../lib/prisma.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { requireAdminPoste } from '../middleware/adminPoste.js'
import { RapportInvalide } from '../services/marketReports.js'
import { enregistrerRapportPoste } from '../services/rapportsPoste.js'
import { DepotRefuse, deposerRapports } from '../services/reportsDb.js'
import { listeVersementsAdmin, verser } from '../services/affiliation.js'
import { sendMail, appUrl } from '../services/mailer.js'
import { DriveErreur, importerDossierDrive, listerDossierDrive } from '../services/importDrive.js'
import { lignesPubliques } from './analysesPubliques.js'
import { sitemapXml } from '../services/analysesPubliques.js'
import { annoncerAnalyses, enProduction } from '../services/annonceAnalyses.js'

/**
 * L'administration générale du site, tenue par le Poste d'analyses seul (voir
 * `middleware/adminPoste.ts`). Le portique est côté serveur : rien ici ne fait
 * confiance à un navigateur ni à un compte (décision de Max, 04/10 puis 10/10/2026 :
 * clé du Poste seule, plus d'accès par e-mail). La liste des vendeurs, les IBAN
 * des affiliés et les rapports sont des données sensibles : elles ne sortent que
 * vers la clé du Poste.
 */
export const adminRouter = Router()

adminRouter.use(rateLimit({ name: 'admin', windowMs: 60_000, max: 120 }))
adminRouter.use(requireAdminPoste)

/** De quoi vérifier la clé fraîchement posée, sans rien écrire : « connecté » = un appel réel réussi. */
adminRouter.get('/moi', (_req, res) => {
  res.json({ ok: true, administrateur: 'poste-analyses' })
})

/** La liste des abonnés à la newsletter, du plus récent au plus ancien. */
adminRouter.get('/newsletter', async (_req: Request, res) => {
  // try/catch obligatoire : sous Express 4, un async qui lève fait PENDRE la
  // requête (panne du 05/09). Une base momentanément injoignable doit rendre un
  // 503 lisible, pas un chargement infini.
  try {
    const subscribers = await prisma.newsletterSubscriber.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, source: true, createdAt: true },
    })
    res.json({ total: subscribers.length, subscribers })
  } catch (err) {
    console.error('lecture des abonnés newsletter impossible', err)
    res.status(503).json({ error: 'Service momentanément indisponible' })
  }
})

const LIMITE_UTILISATEURS = 500

/**
 * Tous les vendeurs, du plus récent au plus ancien (500 au plus) avec les totaux.
 * Jamais de hachage de mot de passe ni de jeton : seulement ce qu'il faut pour
 * connaître et suivre ses utilisateurs.
 */
adminRouter.get('/utilisateurs', async (_req, res) => {
  try {
    const [total, verifies, utilisateurs, abonnes] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { emailVerifiedAt: { not: null } } }),
      prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        take: LIMITE_UTILISATEURS,
        select: { id: true, email: true, shopName: true, plan: true, credits: true, emailVerifiedAt: true, createdAt: true },
      }),
      prisma.newsletterSubscriber.count(),
    ])
    res.json({ total, verifies, abonnesNewsletter: abonnes, limite: LIMITE_UTILISATEURS, utilisateurs })
  } catch (err) {
    console.error('lecture des utilisateurs impossible', err)
    res.status(503).json({ error: 'Service momentanément indisponible' })
  }
})

/**
 * Dépôt d'un rapport MarketSpy complet par le Poste d'analyses (analyses/).
 *
 * C'est CE chemin qui met un rapport en ligne : le site lit rapports.db et la
 * base du Poste (voir services/rapportsPoste.ts). Un seul envoi range le rapport
 * RAYON (analyse + produits) et le rapport MARKETING (prompts, tendances) chacun
 * à sa place. Ces rapports sont lus par tous les vendeurs : clé d'administration
 * seulement.
 */
adminRouter.post('/rapports-poste', (req, res) => {
  const rapport = (req.body as { rapport?: unknown } | undefined)?.rapport
  try {
    const rangé = enregistrerRapportPoste(rapport)
    res.status(201).json({ ok: true, ...rangé })
  } catch (err) {
    if (err instanceof RapportInvalide) return res.status(422).json({ error: err.message })
    console.error('[rapports-poste] écriture impossible :', err)
    res.status(500).json({ error: 'Écriture impossible sur le serveur.', motif: err instanceof Error ? err.message : String(err) })
  }
})

/** Les affiliés, ce qui leur est dû et leur IBAN : de quoi faire les virements du mois. */
adminRouter.get('/affiliation', async (_req: Request, res) => {
  try {
    res.set('Cache-Control', 'no-store')
    res.json(await listeVersementsAdmin())
  } catch (err) {
    console.error('liste des versements affiliés', err)
    res.status(503).json({ error: 'Service momentanément indisponible' })
  }
})

/**
 * Max a fait le virement : on solde toutes les commissions dues de l'affilié
 * et on le prévient par mail. Le virement lui-même se fait à la banque, pas ici.
 */
adminRouter.post('/affiliation/:id/verse', async (req: Request, res) => {
  const reference = typeof req.body?.reference === 'string' ? req.body.reference.trim().slice(0, 120) : null
  try {
    const versement = await verser(req.params.id, reference)
    if (!versement) return res.status(409).json({ error: 'Rien à verser pour cet affilié.' })
    const affilie = await prisma.affilie.findUnique({ where: { id: req.params.id }, select: { email: true, nom: true } })
    if (affilie) {
      const montant = (versement.montantCentimes / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
      sendMail({
        to: affilie.email,
        subject: `Votre commission de ${montant} est en route`,
        heading: `Bonjour ${affilie.nom}, nous venons de vous virer ${montant}`,
        body: `<p style="margin:0">Le virement de vos commissions d’affiliation DropShipper IA vient d’être envoyé sur votre compte. Comptez un à trois jours ouvrés selon votre banque.</p>`,
        actionLabel: 'Voir mon espace affilié',
        actionUrl: `${appUrl()}/affiliation/espace`,
        footer: 'Vous recevez ce message parce que vous êtes affilié DropShipper IA.',
      }).catch((err) => console.error('mail de versement affilié', err))
    }
    res.json({ versement })
  } catch (err) {
    if (err instanceof Error && err.message.includes('déjà versées')) return res.status(409).json({ error: 'Ce versement vient déjà d’être enregistré.' })
    console.error('versement affilié', err)
    res.status(500).json({ error: 'Versement non enregistré, réessayez.' })
  }
})

/**
 * Import d'analyses rangées par d'autres agents dans un dossier Google Drive
 * public (demandé par Max le 10/10/2026). D'abord la liste, par date ; puis
 * l'import des dates choisies, ou leur aperçu (`essai`) sans rien écrire.
 */
function adresseDe(req: Request): string | null {
  const a = req.body?.adresse
  return typeof a === 'string' && a.trim() ? a.trim().slice(0, 500) : null
}

adminRouter.post('/analyses-drive/lister', async (req: Request, res) => {
  res.set('Cache-Control', 'no-store')
  const adresse = adresseDe(req)
  if (!adresse) return res.status(400).json({ error: 'Collez l’adresse d’un dossier Google Drive public.' })
  try {
    res.json(await listerDossierDrive(adresse))
  } catch (err) {
    if (err instanceof DriveErreur) return res.status(422).json({ error: err.message })
    console.error('liste du dossier Drive', err)
    res.status(500).json({ error: `Liste impossible : ${err instanceof Error ? err.message : String(err)}` })
  }
})

adminRouter.post('/analyses-drive/importer', async (req: Request, res) => {
  res.set('Cache-Control', 'no-store')
  const adresse = adresseDe(req)
  const dates = Array.isArray(req.body?.dates) ? req.body.dates.filter((d: unknown) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) : []
  if (!adresse) return res.status(400).json({ error: 'Collez l’adresse d’un dossier Google Drive public.' })
  if (!dates.length) return res.status(400).json({ error: 'Choisissez au moins une date.' })
  try {
    const rapport = await importerDossierDrive(adresse, dates, req.body?.essai === true)
    if (rapport.importees && enProduction()) {
      annoncerAnalyses(sitemapXml(lignesPubliques())).catch((e) => console.error('[indexnow] annonce impossible', e instanceof Error ? e.message : e))
    }
    res.json(rapport)
  } catch (err) {
    if (err instanceof DriveErreur) return res.status(422).json({ error: err.message })
    console.error('import du dossier Drive', err)
    res.status(500).json({ error: `Import impossible : ${err instanceof Error ? err.message : String(err)}` })
  }
})

/**
 * Dépôt de rapports.db par l'importateur local (`importer-aimarket.cjs --envoyer`,
 * via `envoyer-rapports.cjs`).
 *
 * Demandé le 04/10/2026 : les nouveaux rapports doivent paraître dans
 * l'application et sur les pages publiques /analyses sans push ni
 * redéploiement. Le fichier part sur le volume (storage/), remplace la base
 * lue par les routes dès la requête suivante, et les nouvelles adresses sont
 * annoncées aux moteurs (IndexNow). Clé d'administration seulement : ces
 * rapports sont lus par tout le monde.
 */
adminRouter.post(
  '/rapports-db',
  express.raw({ type: 'application/octet-stream', limit: '80mb' }),
  (req: Request, res) => {
    if (!Buffer.isBuffer(req.body)) return res.status(400).json({ error: 'Envoyez le fichier rapports.db en application/octet-stream.' })
    let depot
    try {
      depot = deposerRapports(req.body)
    } catch (err) {
      if (err instanceof DepotRefuse) return res.status(422).json({ error: err.message })
      throw err
    }
    let adresses = 0
    try {
      adresses = (sitemapXml(lignesPubliques()).match(/<loc>/g) ?? []).length
    } catch (err) {
      return res.status(500).json({ error: `Base reçue mais illisible par les pages publiques : ${err instanceof Error ? err.message : String(err)}` })
    }
    if (enProduction()) {
      annoncerAnalyses(sitemapXml(lignesPubliques())).catch((e) => console.error('[indexnow] annonce impossible', e instanceof Error ? e.message : e))
    }
    res.status(201).json({ ...depot, adressesPubliques: adresses })
  },
)
