import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import type { Request, Response } from 'express'
import type { MarketClient } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { sendMail } from './mailer.js'
import { marketUrl } from './market.js'

/**
 * Les comptes clients de DropShop Market : inscription, confirmation de
 * l'adresse email, connexion, mot de passe oublié.
 *
 * Un client du Market n'est pas un utilisateur DropShipper (User = vendeur) :
 * table à part, session à part, dans un cookie posé sur le domaine du Market.
 * Les pages étant rendues côté serveur, le cookie est `HttpOnly` et
 * `SameSite=Lax` : un formulaire posté depuis un autre site ne le porte pas,
 * ce qui suffit contre la falsification de requête pour ces formulaires.
 */

const COOKIE_SESSION = 'dsm_session'

/** Le nom saisi par le client finit dans le HTML d'un email : jamais tel quel. */
const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const DUREE_SESSION_JOURS = 30
const DUREE_REINIT_MS = 60 * 60 * 1000

function secret(): string {
  const s = process.env.JWT_SECRET
  if (!s) throw new Error('JWT_SECRET manquant')
  return s
}

/** Les cookies de la requête, sans dépendance (l'API n'utilise pas cookie-parser). */
export function cookies(req: Request): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i < 1) continue
    const k = part.slice(0, i).trim()
    try {
      out[k] = decodeURIComponent(part.slice(i + 1).trim())
    } catch {
      out[k] = part.slice(i + 1).trim()
    }
  }
  return out
}

/** Secure dès que l'acheteur est en https (Railway le dit par x-forwarded-proto). */
export function enHttps(req: Request): boolean {
  return String(req.headers['x-forwarded-proto'] ?? req.protocol).split(',')[0].trim() === 'https'
}

export function poserCookie(req: Request, res: Response, nom: string, valeur: string, opts: { maxAgeS: number; httpOnly: boolean }) {
  const chemin = req.baseUrl || '/'
  const attributs = [
    `${nom}=${encodeURIComponent(valeur)}`,
    `Path=${chemin}`,
    `Max-Age=${opts.maxAgeS}`,
    'SameSite=Lax',
    ...(opts.httpOnly ? ['HttpOnly'] : []),
    ...(enHttps(req) ? ['Secure'] : []),
  ]
  res.append('Set-Cookie', attributs.join('; '))
}

export function hacher(jeton: string): string {
  return crypto.createHash('sha256').update(jeton).digest('hex')
}

function nouveauJeton(): string {
  return crypto.randomBytes(32).toString('base64url')
}

export function normaliserEmail(v: unknown): string {
  return String(v ?? '').trim().toLowerCase().slice(0, 200)
}

export function emailValide(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)
}

/** Le client connecté, ou null. Une session dont la version a changé (mot de passe modifié) tombe. */
export async function clientConnecte(req: Request): Promise<MarketClient | null> {
  const brut = cookies(req)[COOKIE_SESSION]
  if (!brut) return null
  try {
    const p = jwt.verify(brut, secret()) as { mc?: string; v?: number }
    if (!p.mc) return null
    const c = await prisma.marketClient.findUnique({ where: { id: p.mc } })
    if (!c || c.versionSession !== (p.v ?? 0)) return null
    return c
  } catch {
    return null
  }
}

export function ouvrirSession(req: Request, res: Response, c: Pick<MarketClient, 'id' | 'versionSession'>) {
  const jeton = jwt.sign({ mc: c.id, v: c.versionSession }, secret(), { expiresIn: `${DUREE_SESSION_JOURS}d` })
  poserCookie(req, res, COOKIE_SESSION, jeton, { maxAgeS: DUREE_SESSION_JOURS * 86400, httpOnly: true })
}

export function fermerSession(req: Request, res: Response) {
  poserCookie(req, res, COOKIE_SESSION, '', { maxAgeS: 0, httpOnly: true })
}

export class ErreurCompte extends Error {}

async function envoyerConfirmation(c: { email: string; nom: string }, jeton: string, baseAbsolue: string) {
  await sendMail({
    to: c.email,
    subject: 'Bienvenue sur DropShop Market — confirmez votre adresse email',
    heading: `Bienvenue ${esc(c.nom)} !`,
    body: 'Votre compte DropShop Market est créé. Confirmez votre adresse email pour sécuriser votre compte et recevoir le suivi de vos commandes.',
    actionLabel: 'Confirmer mon adresse email',
    actionUrl: `${baseAbsolue}/compte/confirmer?jeton=${jeton}`,
    footer: `Vous recevez ce message parce qu'un compte a été créé avec cette adresse sur ${marketUrl().replace(/^https?:\/\//, '')}. Si ce n'est pas vous, ignorez-le : le compte restera inactif.`,
    brand: 'DropShop Market',
  })
}

export async function inscrire(args: { nom: string; email: string; motDePasse: string; baseAbsolue: string }): Promise<MarketClient> {
  const email = normaliserEmail(args.email)
  const nom = args.nom.trim().slice(0, 80)
  if (!nom) throw new ErreurCompte('Indiquez votre nom.')
  if (!emailValide(email)) throw new ErreurCompte('Adresse email invalide.')
  if (args.motDePasse.length < 8) throw new ErreurCompte('Le mot de passe doit faire au moins 8 caractères.')
  if (await prisma.marketClient.findUnique({ where: { email }, select: { id: true } })) {
    throw new ErreurCompte('Un compte existe déjà avec cette adresse. Connectez-vous, ou utilisez « Mot de passe oublié ».')
  }
  const jeton = nouveauJeton()
  const c = await prisma.marketClient.create({
    data: { email, nom, passwordHash: await bcrypt.hash(args.motDePasse, 10), jetonConfirmation: hacher(jeton) },
  })
  try {
    await envoyerConfirmation(c, jeton, args.baseAbsolue)
  } catch (e) {
    // Le compte existe : l'email pourra être renvoyé depuis l'espace client.
    console.error('[market] email de confirmation non envoyé', e instanceof Error ? e.message : e)
  }
  return c
}

export async function renvoyerConfirmation(c: MarketClient, baseAbsolue: string) {
  if (c.emailConfirmeAt) return
  const jeton = nouveauJeton()
  await prisma.marketClient.update({ where: { id: c.id }, data: { jetonConfirmation: hacher(jeton) } })
  await envoyerConfirmation(c, jeton, baseAbsolue)
}

export async function confirmerEmail(jeton: string): Promise<MarketClient | null> {
  if (!jeton) return null
  const c = await prisma.marketClient.findUnique({ where: { jetonConfirmation: hacher(jeton) } })
  if (!c) return null
  return prisma.marketClient.update({ where: { id: c.id }, data: { emailConfirmeAt: c.emailConfirmeAt ?? new Date(), jetonConfirmation: null } })
}

export async function connecter(emailBrut: string, motDePasse: string): Promise<MarketClient> {
  const email = normaliserEmail(emailBrut)
  const c = await prisma.marketClient.findUnique({ where: { email } })
  if (!c || !(await bcrypt.compare(motDePasse, c.passwordHash))) throw new ErreurCompte('Email ou mot de passe incorrect.')
  return c
}

/** Mot de passe oublié : même réponse que l'adresse existe ou non (on ne dévoile pas qui est client). */
export async function demanderReinitialisation(emailBrut: string, baseAbsolue: string) {
  const email = normaliserEmail(emailBrut)
  const c = await prisma.marketClient.findUnique({ where: { email } })
  if (!c) return
  const jeton = nouveauJeton()
  await prisma.marketClient.update({ where: { id: c.id }, data: { jetonReinit: hacher(jeton), jetonReinitExpire: new Date(Date.now() + DUREE_REINIT_MS) } })
  await sendMail({
    to: c.email,
    subject: 'DropShop Market — réinitialiser votre mot de passe',
    heading: 'Choisissez un nouveau mot de passe',
    body: `Bonjour ${esc(c.nom)},\n\nVous avez demandé à réinitialiser le mot de passe de votre compte DropShop Market. Ce lien est valable une heure.`,
    actionLabel: 'Choisir un nouveau mot de passe',
    actionUrl: `${baseAbsolue}/compte/reinitialiser?jeton=${jeton}`,
    footer: "Si vous n'avez rien demandé, ignorez ce message : votre mot de passe ne change pas.",
    brand: 'DropShop Market',
  })
}

export async function reinitialiser(jeton: string, motDePasse: string): Promise<MarketClient> {
  if (motDePasse.length < 8) throw new ErreurCompte('Le mot de passe doit faire au moins 8 caractères.')
  const c = jeton ? await prisma.marketClient.findUnique({ where: { jetonReinit: hacher(jeton) } }) : null
  if (!c || !c.jetonReinitExpire || c.jetonReinitExpire < new Date()) throw new ErreurCompte('Ce lien a expiré. Refaites une demande.')
  return prisma.marketClient.update({
    where: { id: c.id },
    data: {
      passwordHash: await bcrypt.hash(motDePasse, 10),
      jetonReinit: null,
      jetonReinitExpire: null,
      versionSession: { increment: 1 },
      // Le lien reçu par email prouve l'adresse.
      emailConfirmeAt: c.emailConfirmeAt ?? new Date(),
    },
  })
}

export async function changerMotDePasse(c: MarketClient, actuel: string, nouveau: string): Promise<MarketClient> {
  if (!(await bcrypt.compare(actuel, c.passwordHash))) throw new ErreurCompte('Mot de passe actuel incorrect.')
  if (nouveau.length < 8) throw new ErreurCompte('Le nouveau mot de passe doit faire au moins 8 caractères.')
  return prisma.marketClient.update({ where: { id: c.id }, data: { passwordHash: await bcrypt.hash(nouveau, 10), versionSession: { increment: 1 } } })
}

/**
 * Supprimer son compte (RGPD). Les commandes restent chez les vendeurs (obligation
 * comptable, garantie) mais ne sont plus rattachées à un compte.
 */
export async function supprimerCompte(c: MarketClient, motDePasse: string) {
  if (!(await bcrypt.compare(motDePasse, c.passwordHash))) throw new ErreurCompte('Mot de passe incorrect.')
  await prisma.marketClient.delete({ where: { id: c.id } })
}
