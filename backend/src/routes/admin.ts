import express, { Router, type Request, type Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { requireAdminPoste } from '../middleware/adminPoste.js'
import { RapportInvalide } from '../services/marketReports.js'
import { enregistrerRapportPoste } from '../services/rapportsPoste.js'
import { DepotRefuse, deposerRapports } from '../services/reportsDb.js'
import { listeVersementsAdmin, verser } from '../services/affiliation.js'
import { sendMail, appUrl } from '../services/mailer.js'
import * as newsletter from '../services/newsletter.js'
import { DriveErreur, importerDossierDrive, listerDossierDrive } from '../services/importDrive.js'
import { datesSyntheses, importerSynthese, lireJournal, lireSynthese, noterImports, produitACreer, synthesePrivee } from '../services/synthesesQuotidiennes.js'
import { GoogleAuthError, verifierIdTokenGoogle } from '../services/googleAuth.js'
import { lignesPubliques } from './analysesPubliques.js'
import { sitemapXml } from '../services/analysesPubliques.js'
import { annoncerAnalyses, enProduction } from '../services/annonceAnalyses.js'
import { LienRefuse, RESEAUX, ecrireReseaux, lireReseaux } from '../services/reseauxSociaux.js'
import { MotsClesErreur, ideesMotsCles, motsClesManquants, statutDe, volumesMotsCles } from '../services/motsClesGoogle.js'

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
    // Newsletter state of each listed seller, so Kantix can show who will get it (12/11/2026).
    const emails = utilisateurs.map((u) => u.email.toLowerCase())
    const [inscrits, refus] = await Promise.all([
      prisma.newsletterSubscriber.findMany({ where: { email: { in: emails } }, select: { email: true } }),
      prisma.newsletterDesinscription.findMany({ where: { email: { in: emails } }, select: { email: true } }),
    ])
    const abonne = new Set(inscrits.map((x) => x.email))
    const desinscrit = new Set(refus.map((x) => x.email))
    res.json({
      total, verifies, abonnesNewsletter: abonnes, limite: LIMITE_UTILISATEURS,
      utilisateurs: utilisateurs.map((u) => ({ ...u, newsletter: abonne.has(u.email.toLowerCase()), desinscrit: desinscrit.has(u.email.toLowerCase()) })),
    })
  } catch (err) {
    console.error('lecture des utilisateurs impossible', err)
    res.status(503).json({ error: 'Service momentanément indisponible' })
  }
})

/**
 * Supprime un compte vendeur (comptes de test, demande RGPD) — Kantix, 12/11/2026.
 *
 * Le corps doit redonner l'e-mail du compte : une erreur d'identifiant ne peut
 * pas effacer quelqu'un d'autre. Tout ce qui appartient au compte part avec lui
 * (relations en cascade du schéma) ; les commandes d'abord, parce que leur lien
 * vers le produit est en RESTRICT. L'abonnement newsletter de cette adresse est
 * retiré aussi. Irréversible : Kantix demande l'accord avant d'appeler.
 */
adminRouter.post('/utilisateurs/:id/supprimer', async (req, res) => {
  const email = String((req.body as { email?: unknown } | undefined)?.email ?? '').trim().toLowerCase()
  try {
    const u = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, email: true } })
    if (!u) return res.status(404).json({ error: 'Compte introuvable (déjà supprimé ?).' })
    if (!email || u.email.toLowerCase() !== email) return res.status(422).json({ error: 'L’e-mail ne correspond pas à ce compte : rien n’a été supprimé.' })
    await prisma.$transaction([
      prisma.order.deleteMany({ where: { userId: u.id } }),
      prisma.user.delete({ where: { id: u.id } }),
      prisma.newsletterSubscriber.deleteMany({ where: { email } }),
    ])
    console.log(`[admin] compte supprimé depuis Kantix : ${u.id}`)
    res.json({ ok: true, id: u.id, email: u.email })
  } catch (err) {
    console.error('suppression du compte impossible', err)
    res.status(500).json({ error: 'Suppression impossible sur le serveur : rien n’a été effacé.', motif: err instanceof Error ? err.message : String(err) })
  }
})

/** Un message personnel à un vendeur, mis en page aux couleurs du site. Pas une newsletter : pas de lien de désinscription. */
adminRouter.post('/utilisateurs/:id/ecrire', async (req, res) => {
  const b = (req.body ?? {}) as { sujet?: unknown; message?: unknown; repondreA?: unknown }
  const sujet = String(b.sujet ?? '').trim().slice(0, 200)
  const message = String(b.message ?? '').trim().slice(0, 20_000)
  const repondreA = String(b.repondreA ?? '').trim()
  if (!sujet || !message) return res.status(422).json({ error: 'Il faut un objet et un message.' })
  if (repondreA && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(repondreA)) return res.status(422).json({ error: 'L’adresse de réponse n’est pas une adresse e-mail.' })
  try {
    const u = await prisma.user.findUnique({ where: { id: req.params.id }, select: { email: true } })
    if (!u) return res.status(404).json({ error: 'Compte introuvable.' })
    const echapper = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const corps = message.split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${echapper(p).replace(/\n/g, '<br>')}</p>`).join('')
    await sendMail({
      to: u.email,
      subject: sujet,
      heading: echapper(sujet),
      body: corps,
      footer: 'Message envoyé par l’équipe DropShipper IA.',
      ...(repondreA ? { replyTo: repondreA } : {}),
    })
    res.json({ ok: true, email: u.email })
  } catch (err) {
    console.error('envoi du message impossible', err)
    res.status(502).json({ error: 'Envoi impossible.', motif: err instanceof Error ? err.message : String(err) })
  }
})

/**
 * Envoi d'une newsletter préparée dans Kantix : HTML complet importé par Max.
 * { sujet, html, cible: 'abonnes' | 'selection', ids?: [userId], essai?: email, lot?: n }
 * Envoyée par lots de 100 (liste triée par adresse) : Kantix appelle lot 0, 1, 2…
 * jusqu'à `lots`, ce qui garde chaque requête courte et montre l'avancement.
 * `essai` envoie un seul exemplaire à cette adresse (contrôle avant le vrai envoi).
 * Les adresses désinscrites sont toujours retirées ; chaque exemplaire porte son
 * lien de désinscription.
 */
const LOT_NEWSLETTER = 100
adminRouter.post('/newsletter/envoyer', async (req, res) => {
  const b = (req.body ?? {}) as { sujet?: unknown; html?: unknown; cible?: unknown; ids?: unknown; essai?: unknown; lot?: unknown }
  const sujet = String(b.sujet ?? '').trim().slice(0, 200)
  const html = String(b.html ?? '')
  const essai = String(b.essai ?? '').trim()
  if (!sujet) return res.status(422).json({ error: 'Il faut un objet.' })
  if (html.trim().length < 20) return res.status(422).json({ error: 'Le fichier HTML est vide.' })
  if (html.length > newsletter.MAX_HTML) return res.status(422).json({ error: 'Le fichier HTML est trop lourd (1,8 Mo au plus) : hébergez les images au lieu de les intégrer.' })
  try {
    let liste: newsletter.Destinataire[]
    if (essai) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(essai)) return res.status(422).json({ error: 'L’adresse d’essai n’est pas une adresse e-mail.' })
      liste = [{ email: essai }]
    } else if (b.cible === 'abonnes') {
      liste = (await prisma.newsletterSubscriber.findMany({ select: { email: true } })).map((x) => ({ email: x.email }))
    } else if (b.cible === 'selection') {
      const ids = Array.isArray(b.ids) ? b.ids.map(String).slice(0, newsletter.MAX_DESTINATAIRES) : []
      if (!ids.length) return res.status(422).json({ error: 'Aucun utilisateur sélectionné.' })
      liste = (await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true } })).map((u) => ({ email: u.email, userId: u.id }))
    } else return res.status(422).json({ error: 'Cible inconnue : « abonnes » ou « selection ».' })

    const { garder, exclus } = essai ? { garder: liste, exclus: [] as string[] } : await newsletter.filtrerDesinscrits(liste)
    if (garder.length > newsletter.MAX_DESTINATAIRES) return res.status(422).json({ error: `Plus de ${newsletter.MAX_DESTINATAIRES} destinataires : envoi refusé, découpez la liste.` })
    if (!garder.length) return res.status(422).json({ error: exclus.length ? 'Tous les destinataires se sont désinscrits.' : 'Aucun destinataire.' })
    garder.sort((x, y) => x.email.localeCompare(y.email))
    const lots = Math.ceil(garder.length / LOT_NEWSLETTER)
    const lot = Math.max(0, Math.floor(Number(b.lot) || 0))
    if (lot >= lots) return res.status(422).json({ error: `Lot ${lot + 1} inexistant (${lots} lot(s)).` })
    const tranche = garder.slice(lot * LOT_NEWSLETTER, (lot + 1) * LOT_NEWSLETTER)
    const bilan = await newsletter.envoyer(essai ? `[Essai] ${sujet}` : sujet, html, tranche)
    console.log(`[admin] newsletter « ${sujet} » lot ${lot + 1}/${lots} : ${bilan.envoyes} envoyé(s), ${bilan.echecs.length} échec(s), ${exclus.length} désinscrit(s) écarté(s)${essai ? ' (essai)' : ''}`)
    res.json({ ok: bilan.envoyes > 0, essai: Boolean(essai), destinataires: garder.length, lot, lots, envoyes: bilan.envoyes, echecs: bilan.echecs.slice(0, 50), nbEchecs: bilan.echecs.length, desinscritsEcartes: exclus.length })
  } catch (err) {
    console.error('envoi de la newsletter impossible', err)
    res.status(500).json({ error: 'Envoi de la newsletter impossible.', motif: err instanceof Error ? err.message : String(err) })
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

/**
 * Les comptes sociaux de DropShipper affichés en icônes dans le pied de page
 * public (Max, 12/10/2026). GET rend les six emplacements ; PUT fusionne ceux
 * envoyés : { facebook?: "https://…" | null, instagram?, whatsapp?, x?, linkedin?, snapchat? }.
 * Une valeur vide ou null retire l'icône.
 */
adminRouter.get('/reseaux-sociaux', async (_req, res) => {
  try {
    res.set('Cache-Control', 'no-store')
    res.json({ reseaux: await lireReseaux(), ordre: RESEAUX })
  } catch (err) {
    res.status(500).json({ error: 'Lecture impossible.', motif: err instanceof Error ? err.message : String(err) })
  }
})

adminRouter.put('/reseaux-sociaux', async (req, res) => {
  const corps = req.body as unknown
  if (!corps || typeof corps !== 'object' || Array.isArray(corps)) {
    return res.status(422).json({ error: 'Corps attendu : { facebook?, instagram?, whatsapp?, x?, linkedin?, snapchat? }.' })
  }
  try {
    res.json({ ok: true, reseaux: await ecrireReseaux(corps as Record<string, unknown>) })
  } catch (err) {
    if (err instanceof LienRefuse) return res.status(422).json({ error: err.message })
    console.error('[reseaux-sociaux] écriture impossible :', err)
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
 * Import structuré direct d'une synthèse quotidienne (04/11/2026) : le corps est
 * le JSON opportunites-import-dropshipper.json lui-même, ou { date, json }. Même
 * lecteur que l'import Drive ; même jour identique = doublon, contenu changé =
 * remplacé. `?essai=1` mesure sans rien écrire.
 */
/**
 * KANTIX › DropShipper › « Synthèses AIMARKET » (Max, 08/11/2026) : the
 * syntheses are read here only, never on the public site.
 */
adminRouter.get('/syntheses', (_req, res) => {
  res.set('Cache-Control', 'no-store')
  res.json({ dates: datesSyntheses(), imports: lireJournal() })
})

adminRouter.get('/syntheses/:date', (req: Request, res) => {
  res.set('Cache-Control', 'no-store')
  const date = String(req.params.date)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Date attendue : AAAA-MM-JJ.' })
  const s = lireSynthese(date)
  if (!s) return res.status(404).json({ error: 'Aucune synthèse importée pour ce jour.' })
  res.json(synthesePrivee(s))
})

/** The seller account named by its e-mail, or by a Google sign-in (ID token of the site's Google client). */
async function compteVise(corps: Record<string, unknown>): Promise<{ id: string; email: string; shopName: string | null } | { erreur: string; statut: number }> {
  let email = typeof corps.email === 'string' ? corps.email.trim().toLowerCase() : ''
  if (!email && typeof corps.idTokenGoogle === 'string') {
    try {
      email = (await verifierIdTokenGoogle(corps.idTokenGoogle)).email
    } catch (err) {
      return { erreur: err instanceof GoogleAuthError ? err.message : 'Connexion Google impossible.', statut: 401 }
    }
  }
  if (!email) return { erreur: 'Indiquez l’e-mail du compte, ou connectez-le avec Google.', statut: 400 }
  const u = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, shopName: true } })
  if (!u) return { erreur: `Aucun compte DropShipper pour ${email}.`, statut: 404 }
  return u
}

/** Which account the winners would go to, before importing. */
adminRouter.post('/syntheses-compte', async (req: Request, res) => {
  res.set('Cache-Control', 'no-store')
  try {
    const c = await compteVise(req.body ?? {})
    if ('erreur' in c) return res.status(c.statut).json({ error: c.erreur })
    const produits = await prisma.product.count({ where: { userId: c.id } })
    res.json({ compte: { email: c.email, boutique: c.shopName }, produits })
  } catch (err) {
    console.error('compte des synthèses', err)
    res.status(500).json({ error: 'Compte illisible, réessayez.' })
  }
})

/**
 * Max, 08/11/2026 : « importer les produits gagnants passés au crible sur mon
 * compte utilisateur au choix ». Body : { email | idTokenGoogle, ids: [id du
 * produit dans la synthèse], essai? }. Free (an admin act, no drop debited).
 * A product the account already holds (same title, same source) is skipped.
 */
adminRouter.post('/syntheses/:date/importer-compte', async (req: Request, res) => {
  res.set('Cache-Control', 'no-store')
  const date = String(req.params.date)
  const s = /^\d{4}-\d{2}-\d{2}$/.test(date) ? lireSynthese(date) : null
  if (!s) return res.status(404).json({ error: 'Aucune synthèse importée pour ce jour.' })
  const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.filter((x: unknown) => typeof x === 'string').slice(0, 500) : []
  if (!ids.length) return res.status(400).json({ error: 'Choisissez au moins un produit.' })
  try {
    const c = await compteVise(req.body ?? {})
    if ('erreur' in c) return res.status(c.statut).json({ error: c.erreur })
    const parId = new Map(s.produits.map((p) => [p.id, p]))
    const choisis = ids.map((id) => parId.get(id)).filter((p): p is NonNullable<typeof p> => !!p)
    const inconnus = ids.length - choisis.length
    const existants = await prisma.product.findMany({ where: { userId: c.id }, select: { title: true, sourceUrl: true } })
    const deja = new Set(existants.map((e) => `${e.title}|${e.sourceUrl}`))
    const aCreer = choisis.map(produitACreer).filter((p) => !deja.has(`${p.title}|${p.sourceUrl}`))
    const doublons = choisis.length - aCreer.length
    if (req.body?.essai === true) return res.json({ compte: c.email, essai: true, aImporter: aCreer.length, doublons, inconnus })
    for (const p of aCreer) {
      await prisma.product.create({
        data: { userId: c.id, ...p, images: [], imagesWatermarked: false },
      })
    }
    res.json({ compte: c.email, importes: aCreer.length, doublons, inconnus })
  } catch (err) {
    console.error('import des gagnants de synthèse', err)
    res.status(500).json({ error: `Import impossible : ${err instanceof Error ? err.message : String(err)}` })
  }
})

adminRouter.post('/syntheses', (req: Request, res) => {
  res.set('Cache-Control', 'no-store')
  const corps = req.body ?? {}
  const json = corps.json ?? corps
  const date = typeof corps.date === 'string' ? corps.date : undefined
  try {
    const essai = req.query.essai === '1' || corps.essai === true
    const bilan = importerSynthese({ date, origine: 'depot-admin', json }, essai)
    if (!essai) noterImports([bilan])
    res.status(bilan.statut === 'refuse' ? 422 : 200).json(bilan)
  } catch (err) {
    console.error('import de synthèse', err)
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

/**
 * Le Planificateur de mots-clés Google (services/motsClesGoogle.ts), pour les analyses
 * du Poste : volume de recherche en France, tendance sur 12 mois, concurrence.
 * Demandé par Max le 23/10/2026. Sans les variables Railway : 503 avec ce qui manque,
 * et le Poste continue sans ces chiffres.
 */
function repondreErreurMotsCles(res: Response, err: unknown, quoi: string) {
  if (err instanceof MotsClesErreur) return res.status(statutDe(err)).json({ error: err.message, motif: err.motif })
  console.error(quoi, err)
  res.status(500).json({ error: `${quoi} : ${err instanceof Error ? err.message : String(err)}`, motif: 'interne' })
}

/** État du branchement ; `?essai=1` fait un vrai appel (« connecté » = un appel réel réussi). */
adminRouter.get('/mots-cles/etat', async (req: Request, res) => {
  res.set('Cache-Control', 'no-store')
  const manque = motsClesManquants()
  if (manque.length || req.query.essai !== '1') return res.json({ configure: !manque.length, manque, verifie: false })
  try {
    const r = await volumesMotsCles(['coque iphone'])
    res.json({ configure: true, manque, verifie: true, exemple: r.motsCles[0] ?? null })
  } catch (err) {
    repondreErreurMotsCles(res, err, 'essai du Planificateur de mots-clés')
  }
})

/** { motsCles: string[] } → volumes, tendance et concurrence de ces mots-clés exacts. */
adminRouter.post('/mots-cles', async (req: Request, res) => {
  res.set('Cache-Control', 'no-store')
  const liste = req.body?.motsCles
  if (!Array.isArray(liste) || !liste.length) return res.status(400).json({ error: 'Envoyez { motsCles: ["…", …] }.' })
  try {
    res.json(await volumesMotsCles(liste))
  } catch (err) {
    repondreErreurMotsCles(res, err, 'volumes des mots-clés')
  }
})

/** { graines: string[], limite?: number } → idées de mots-clés, triées par volume. */
adminRouter.post('/mots-cles/idees', async (req: Request, res) => {
  res.set('Cache-Control', 'no-store')
  const graines = req.body?.graines
  if (!Array.isArray(graines) || !graines.length) return res.status(400).json({ error: 'Envoyez { graines: ["…", …], limite?: 50 }.' })
  try {
    res.json(await ideesMotsCles(graines, req.body?.limite))
  } catch (err) {
    repondreErreurMotsCles(res, err, 'idées de mots-clés')
  }
})
