import crypto from 'node:crypto'
import { prisma } from '../lib/prisma.js'
import { appUrl, sendRawMail } from './mailer.js'

/**
 * Newsletter composed in Kantix (12/11/2026): Max imports a finished HTML file,
 * the site adds to every copy a personal unsubscribe link and sends it.
 *
 * Rules that hold whatever the HTML says:
 * - an address in NewsletterDesinscription never receives anything;
 * - every copy carries its own unsubscribe link (visible + List-Unsubscribe header);
 * - nothing is counted as sent unless the mail provider accepted it.
 */

/** Placeholder Max can put in his HTML; without it the link goes in a footer we add. */
export const MARQUE_DESINSCRIPTION = '{{desinscription}}'
export const MAX_DESTINATAIRES = 2000
export const MAX_HTML = 1_800_000

function secret(): string {
  const s = process.env.JWT_SECRET
  if (!s) throw new Error('JWT_SECRET absent : impossible de signer les liens de désinscription.')
  return s
}

const normaliser = (email: string) => email.trim().toLowerCase()

/** HMAC of the address: the link cannot be forged to unsubscribe somebody else. */
export function jetonDesinscription(email: string): string {
  return crypto.createHmac('sha256', secret()).update(`newsletter:${normaliser(email)}`).digest('base64url').slice(0, 32)
}

export function jetonValide(email: string, jeton: string): boolean {
  const attendu = Buffer.from(jetonDesinscription(email))
  const recu = Buffer.from(String(jeton || ''))
  return attendu.length === recu.length && crypto.timingSafeEqual(attendu, recu)
}

export function lienDesinscription(email: string): string {
  const e = normaliser(email)
  return `${appUrl()}/api/public/newsletter/desinscription?e=${encodeURIComponent(e)}&t=${jetonDesinscription(e)}`
}

const echapper = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** The HTML of one copy: the placeholder replaced, or a small footer added before </body>. */
export function htmlPourDestinataire(html: string, email: string): string {
  const lien = echapper(lienDesinscription(email))
  if (html.includes(MARQUE_DESINSCRIPTION)) return html.split(MARQUE_DESINSCRIPTION).join(lien)
  const pied =
    `<div style="text-align:center;padding:24px 16px;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;font-size:12px;line-height:1.6;color:#8b85a8">` +
    `Vous recevez cet e-mail parce que vous êtes inscrit sur DropShipper IA ou à sa newsletter.<br>` +
    `<a href="${lien}" style="color:#e85290">Se désinscrire de la newsletter</a></div>`
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${pied}</body>`) : html + pied
}

/** Plain-text alternative: a mail without one lands in spam far more often. */
export function texteDe(html: string, email: string): string {
  const corps = html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n[ \n]*/g, '\n\n')
    .trim()
    .split(MARQUE_DESINSCRIPTION)
    .join(lienDesinscription(email))
  return `${corps}\n\nSe désinscrire : ${lienDesinscription(email)}`
}

/** What the HTML file is missing before it can go out (shown in Kantix before sending). */
export function avertissements(html: string): string[] {
  const out: string[] = []
  const locales = [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]).filter((s) => !/^(https?:|data:|cid:)/i.test(s))
  if (locales.length) out.push(`${locales.length} image(s) pointent vers un fichier local (${locales.slice(0, 2).join(', ')}) : les destinataires ne les verront pas. Hébergez-les et mettez leur adresse https.`)
  if (/<script/i.test(html)) out.push('Le fichier contient du JavaScript : les messageries le retirent, ne comptez pas dessus.')
  return out
}

export interface Destinataire { email: string; userId?: string }

/** Removes opted-out addresses and duplicates. */
export async function filtrerDesinscrits(liste: Destinataire[]): Promise<{ garder: Destinataire[]; exclus: string[] }> {
  const vus = new Set<string>()
  const uniques = liste
    .map((d) => ({ ...d, email: normaliser(d.email) }))
    .filter((d) => d.email.includes('@') && !vus.has(d.email) && vus.add(d.email))
  const refus = await prisma.newsletterDesinscription.findMany({ where: { email: { in: uniques.map((d) => d.email) } }, select: { email: true } })
  const exclus = new Set(refus.map((r) => r.email))
  return { garder: uniques.filter((d) => !exclus.has(d.email)), exclus: [...exclus] }
}

export interface Bilan { envoyes: number; echecs: { email: string; raison: string }[] }

/** Sends one copy per address, one after another (an SMTP box throttles bursts). */
export async function envoyer(sujet: string, html: string, liste: Destinataire[], pause = 120): Promise<Bilan> {
  const bilan: Bilan = { envoyes: 0, echecs: [] }
  for (const d of liste) {
    const lien = lienDesinscription(d.email)
    try {
      await sendRawMail({
        to: d.email,
        subject: sujet,
        html: htmlPourDestinataire(html, d.email),
        text: texteDe(html, d.email),
        headers: { 'List-Unsubscribe': `<${lien}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      })
      bilan.envoyes++
    } catch (err) {
      bilan.echecs.push({ email: d.email, raison: err instanceof Error ? err.message : String(err) })
      // the provider refuses everything (no key, quota): stop instead of failing 2,000 times
      if (bilan.envoyes === 0 && bilan.echecs.length >= 3) break
    }
    if (pause) await new Promise((r) => setTimeout(r, pause))
  }
  return bilan
}

/** The click on the link (or the one-click header): never sent again, subscription removed. */
export async function desinscrire(email: string, source: string): Promise<void> {
  const e = normaliser(email)
  await prisma.$transaction([
    prisma.newsletterDesinscription.upsert({ where: { email: e }, create: { email: e, source }, update: {} }),
    prisma.newsletterSubscriber.deleteMany({ where: { email: e } }),
  ])
}
