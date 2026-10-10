import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth, requireAdmin, type AuthedRequest } from '../middleware/auth.js'
import { listeVersementsAdmin, verser } from '../services/affiliation.js'
import { sendMail, appUrl } from '../services/mailer.js'
import { DriveErreur, importerDossierDrive, listerDossierDrive } from '../services/importDrive.js'
import { lignesPubliques } from './analysesPubliques.js'
import { sitemapXml } from '../services/analysesPubliques.js'
import { annoncerAnalyses, enProduction } from '../services/annonceAnalyses.js'

/**
 * Les routes réservées à l'administrateur. Le portique est double et côté
 * serveur : `requireAuth` (jeton valide + compte existant) puis `requireAdmin`
 * (l'email est celui de l'admin). Rien ici ne fait confiance au navigateur.
 */
export const adminRouter = Router()

adminRouter.use(requireAuth, requireAdmin)

/** La liste des abonnés à la newsletter, du plus récent au plus ancien. */
adminRouter.get('/newsletter', async (_req: AuthedRequest, res) => {
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

/** Les affiliés, ce qui leur est dû et leur IBAN : de quoi faire les virements du mois. */
adminRouter.get('/affiliation', async (_req: AuthedRequest, res) => {
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
adminRouter.post('/affiliation/:id/verse', async (req: AuthedRequest, res) => {
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
function adresseDe(req: AuthedRequest): string | null {
  const a = req.body?.adresse
  return typeof a === 'string' && a.trim() ? a.trim().slice(0, 500) : null
}

adminRouter.post('/analyses-drive/lister', async (req: AuthedRequest, res) => {
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

adminRouter.post('/analyses-drive/importer', async (req: AuthedRequest, res) => {
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
