import crypto from 'node:crypto'
import { Router, type Request, type Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'
import { configEbayApp, echangerCodeEbay, urlAutorisationEbay } from '../services/ebay.js'

/**
 * « Connecter mon compte eBay » : l'autorisation OAuth, à la place du jeton
 * collé à la main (qui meurt au bout de deux heures sans le trio de
 * renouvellement).
 *
 * L'application eBay est la NÔTRE : `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` et
 * `EBAY_RUNAME` vivent dans l'environnement. Sans eux, `/start` répond
 * `configure: false` et l'écran garde le collage manuel.
 *
 * Le retour est public au sens strict (eBay y renvoie le navigateur du vendeur,
 * sans notre jeton de session) : tout y est vérifié par état signé.
 *
 * Handlers asynchrones enveloppés : sous Express 4, un `async` qui lève fait
 * PENDRE la requête, sans erreur ni journal.
 *
 * **Jamais confronté au vrai eBay** : le banc `check-ebay.ts` éprouve l'échange
 * contre un faux serveur.
 */
export const ebayAuthRouter = Router()

/** Préfixe de domaine : une signature d'ici ne peut pas passer pour un jeton de session, ni pour l'état AliExpress. */
const DOMAINE = 'ebay-oauth:'
const VIE_ETAT_MS = 15 * 60 * 1000

function secret(): string | null {
  return process.env.JWT_SECRET?.trim() || null
}

export function signerEtatEbay(cle: string, userId: string, expireA: number): string {
  const charge = Buffer.from(JSON.stringify({ u: userId, e: expireA })).toString('base64url')
  const signature = crypto.createHmac('sha256', cle).update(DOMAINE + charge).digest('base64url')
  return `${charge}.${signature}`
}

export function lireEtatEbay(cle: string, etat: string, maintenant = Date.now()): string | null {
  const [charge, signature] = etat.split('.')
  if (!charge || !signature) return null

  const attendue = crypto.createHmac('sha256', cle).update(DOMAINE + charge).digest('base64url')
  const a = Buffer.from(attendue)
  const b = Buffer.from(signature)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null

  try {
    const { u, e } = JSON.parse(Buffer.from(charge, 'base64url').toString('utf8'))
    if (typeof u !== 'string' || typeof e !== 'number' || maintenant > e) return null
    return u
  } catch {
    return null
  }
}

const echapper = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/** Une page de retour lisible : le vendeur atterrit ici, pas sur du JSON. */
function page(titre: string, message: string, ok: boolean): string {
  const site = (process.env.FRONTEND_URL || '').split(',')[0]?.trim() || 'https://www.drop-shipper.fr'
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${echapper(titre)}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#08070f;color:#fff;
font:16px/1.6 system-ui,sans-serif;padding:24px}main{max-width:32rem;text-align:center}
h1{font-size:1.4rem;margin:0 0 .5rem;color:${ok ? '#34d399' : '#f87171'}}
p{color:#b9b3d1;margin:0 0 1.5rem}a{display:inline-block;padding:.7rem 1.2rem;border-radius:.7rem;
background:linear-gradient(90deg,#f28a4b,#e85290);color:#fff;text-decoration:none;font-weight:600}</style>
</head><body><main><h1>${echapper(titre)}</h1><p>${echapper(message)}</p>
<a href="${site}/settings">Retour aux réglages</a></main></body></html>`
}

/** L'adresse d'autorisation, pour le vendeur connecté. `configure: false` tant que nos clés eBay ne sont pas posées. */
ebayAuthRouter.get('/oauth/start', requireAuth, (req: AuthedRequest, res: Response) => {
  const config = configEbayApp()
  const cle = secret()
  if (!config || !cle) return res.json({ configure: false })
  res.json({ configure: true, url: urlAutorisationEbay(config, signerEtatEbay(cle, req.userId!, Date.now() + VIE_ETAT_MS)) })
})

ebayAuthRouter.get('/callback', (req: Request, res: Response) => {
  ;(async () => {
    const config = configEbayApp()
    const cle = secret()
    if (!config || !cle) {
      res.status(503).send(page('Indisponible', "L'autorisation eBay n'est pas configurée.", false))
      return
    }

    const userId = lireEtatEbay(cle, String(req.query.state ?? ''))
    if (!userId) {
      res.status(401).send(page('Autorisation expirée', 'Relancez-la depuis la fiche eBay de vos réglages DropShipper IA.', false))
      return
    }

    const code = String(req.query.code ?? '')
    if (!code) {
      res.status(400).send(page('Autorisation refusée', String(req.query.error_description ?? req.query.error ?? 'eBay n’a pas donné son accord.'), false))
      return
    }

    const jetons = await echangerCodeEbay(config, code)
    // Ni Client ID ni Client Secret dans la ligne du vendeur : ce sont les nôtres, relus dans l'environnement au renouvellement.
    const data = { accessToken: jetons.accessToken, refreshToken: jetons.refreshToken, oauth: 'application', autoriseLe: new Date().toISOString() }
    await prisma.platformCredential.upsert({
      where: { userId_platform: { userId, platform: 'EBAY' } },
      create: { userId, platform: 'EBAY', data, connected: true },
      update: { data, connected: true },
    })

    res.send(page('eBay est relié', 'Votre compte eBay est connecté : le jeton se renouvellera tout seul. Vous pouvez fermer cette page.', true))
  })().catch((err) => {
    console.error('[ebay] callback', err)
    if (!res.headersSent) res.status(500).send(page('Échec', err instanceof Error ? err.message : "L'échange du jeton a échoué.", false))
  })
})
