import { Router, type Request, type Response, type NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { sendMail, appUrl } from '../services/mailer.js'
import {
  codeValide,
  enregistrerClic,
  hacherCode,
  ibanValide,
  masquerIban,
  normaliserIban,
  nouveauCodeAcces,
  nouveauCodeLien,
  rattacherFilleul,
  tableauDeBord,
  type Periode,
} from '../services/affiliation.js'

/**
 * L'espace affilié (07/10/2026) : inscription, code d'accès par mail,
 * connexion, tableau de bord. Voir services/affiliation.ts pour le modèle.
 *
 * Les jetons d'affilié portent `typ: 'affilie'` et `affilieId`, jamais
 * `userId` : un jeton d'affilié n'ouvre aucune route vendeur, et
 * réciproquement.
 */
export const affiliationRouter = Router()

const JWT_SECRET = process.env.JWT_SECRET!

interface AffilieRequest extends Request {
  affilieId?: string
}

async function requireAffilie(req: AffilieRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Non connecté' })
  try {
    const p = jwt.verify(token, JWT_SECRET) as { typ?: string; affilieId?: string }
    if (p.typ !== 'affilie' || !p.affilieId) throw new Error('jeton')
    const existe = await prisma.affilie.findUnique({ where: { id: p.affilieId }, select: { id: true } })
    if (!existe) throw new Error('compte')
    req.affilieId = p.affilieId
    next()
  } catch {
    res.status(401).json({ error: 'Session expirée, reconnectez-vous avec votre code' })
  }
}

/** Même réponse que l'adresse existe ou non : on ne dit pas qui est affilié. */
const ENVOYE = { ok: true, message: 'Si cette adresse est valide, un code d’accès vient de lui être envoyé.' }

async function envoyerCode(affilie: { id: string; email: string; nom: string; code: string }) {
  const code = nouveauCodeAcces()
  await prisma.affilie.update({ where: { id: affilie.id }, data: { cleHash: await hacherCode(code), cleEmiseLe: new Date() } })
  await sendMail({
    to: affilie.email,
    subject: 'Votre code d’accès affilié DropShipper IA',
    heading: `Bonjour ${affilie.nom}, voici votre code d’accès`,
    body:
      `<p style="margin:0">Votre code d’accès à l’espace affilié :</p>` +
      `<p style="margin:14px 0;font-size:26px;letter-spacing:4px;font-weight:700">${code}</p>` +
      `<p style="margin:0">Votre lien à partager : <b>${appUrl()}/?parrain=${affilie.code}</b><br>` +
      `Vous touchez 10 % de tout ce que vos filleuls dépensent en drops, à vie, en euros.</p>`,
    actionLabel: 'Ouvrir mon espace affilié',
    actionUrl: `${appUrl()}/affiliation/connexion?email=${encodeURIComponent(affilie.email)}`,
    footer: 'Ce code remplace le précédent. Si vous n’êtes pas à l’origine de cette demande, ignorez ce message.',
  })
}

const inscriptionSchema = z.object({
  nom: z.string().trim().min(2).max(60),
  email: z.string().trim().toLowerCase().email().max(200),
  accepte: z.literal(true),
})

affiliationRouter.post('/inscription', rateLimit({ name: 'affiliation-inscription', windowMs: 3600_000, max: 5 }), async (req, res) => {
  const parsed = inscriptionSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Nom, adresse email et acceptation des conditions sont requis.' })
  try {
    const { nom, email } = parsed.data
    const affilie =
      (await prisma.affilie.findUnique({ where: { email } })) ??
      (await prisma.affilie.create({ data: { nom, email, code: await nouveauCodeLien(nom) } }))
    await envoyerCode(affilie)
    res.json(ENVOYE)
  } catch (err) {
    console.error('inscription affilié', err)
    res.status(500).json({ error: 'Inscription impossible pour le moment, réessayez.' })
  }
})

affiliationRouter.post('/code', rateLimit({ name: 'affiliation-code', windowMs: 3600_000, max: 5 }), async (req, res) => {
  const email = z.string().trim().toLowerCase().email().safeParse(req.body?.email)
  if (!email.success) return res.status(400).json({ error: 'Adresse email invalide.' })
  try {
    const affilie = await prisma.affilie.findUnique({ where: { email: email.data } })
    if (affilie) await envoyerCode(affilie)
    res.json(ENVOYE)
  } catch (err) {
    console.error('renvoi du code affilié', err)
    res.status(500).json({ error: 'Envoi impossible pour le moment, réessayez.' })
  }
})

affiliationRouter.post('/connexion', rateLimit({ name: 'affiliation-connexion', windowMs: 900_000, max: 10 }), async (req, res) => {
  const parsed = z.object({ email: z.string().trim().toLowerCase().email(), code: z.string().trim().min(6).max(20) }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Adresse email et code requis.' })
  try {
    const affilie = await prisma.affilie.findUnique({ where: { email: parsed.data.email } })
    if (!affilie || !(await codeValide(parsed.data.code, affilie.cleHash))) {
      return res.status(401).json({ error: 'Adresse ou code incorrect.' })
    }
    const token = jwt.sign({ typ: 'affilie', affilieId: affilie.id }, JWT_SECRET, { expiresIn: '30d' })
    res.json({ token, affilie: { nom: affilie.nom, email: affilie.email, code: affilie.code } })
  } catch (err) {
    console.error('connexion affilié', err)
    res.status(500).json({ error: 'Connexion impossible pour le moment, réessayez.' })
  }
})

/** Un visiteur arrivé par ?parrain=CODE. Silencieux : un code inconnu ne renvoie pas d'erreur. */
affiliationRouter.post('/clic', rateLimit({ name: 'affiliation-clic', windowMs: 60_000, max: 20 }), async (req, res) => {
  const code = typeof req.body?.code === 'string' ? req.body.code.slice(0, 40) : ''
  const page = typeof req.body?.page === 'string' ? req.body.page : undefined
  try {
    const connu = code ? await enregistrerClic(code, page) : false
    res.json({ ok: true, connu })
  } catch (err) {
    console.error('clic affilié', err)
    res.json({ ok: true, connu: false })
  }
})

/** Le vendeur qui vient de créer son compte est rattaché à l'affilié de son lien. */
affiliationRouter.post('/rattacher', requireAuth, async (req: AuthedRequest, res) => {
  const code = typeof req.body?.code === 'string' ? req.body.code.slice(0, 40) : ''
  if (!code) return res.status(400).json({ error: 'Code manquant.' })
  try {
    res.json({ resultat: await rattacherFilleul(req.userId!, code) })
  } catch (err) {
    console.error('rattachement affilié', err)
    res.json({ resultat: 'refuse' })
  }
})

affiliationRouter.get('/tableau', requireAffilie, async (req: AffilieRequest, res) => {
  const p = String(req.query.periode ?? 'jour')
  const periode: Periode = p === 'semaine' || p === 'mois' || p === 'annee' ? p : 'jour'
  try {
    res.set('Cache-Control', 'no-store')
    res.json({ lien: `${appUrl()}/?parrain=`, ...(await tableauDeBord(req.affilieId!, periode)) })
  } catch (err) {
    console.error('tableau affilié', err)
    res.status(500).json({ error: 'Tableau de bord indisponible pour le moment.' })
  }
})

/** Les coordonnées du virement. L'IBAN entier n'est jamais renvoyé à l'affilié, seulement masqué. */
affiliationRouter.put('/iban', requireAffilie, async (req: AffilieRequest, res) => {
  const parsed = z
    .object({ titulaire: z.string().trim().min(2).max(100), iban: z.string().trim().max(50) })
    .safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Titulaire du compte et IBAN requis.' })
  if (!ibanValide(parsed.data.iban)) return res.status(400).json({ error: 'Cet IBAN n’est pas valide, vérifiez-le.' })
  try {
    const iban = normaliserIban(parsed.data.iban)
    const a = await prisma.affilie.update({
      where: { id: req.affilieId! },
      data: { titulaire: parsed.data.titulaire, iban, ibanMajLe: new Date() },
      select: { titulaire: true, ibanMajLe: true },
    })
    res.json({ titulaire: a.titulaire, ibanMasque: masquerIban(iban), ibanMajLe: a.ibanMajLe })
  } catch (err) {
    console.error('IBAN affilié', err)
    res.status(500).json({ error: 'Enregistrement impossible pour le moment, réessayez.' })
  }
})
