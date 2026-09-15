import crypto from 'node:crypto'
import { Router, type Request, type Response } from 'express'
import { prisma } from '../lib/prisma.js'
import { echangerCodeAliexpress, retourAliexpress } from '../services/supplierAliexpress.js'

/**
 * Le retour d'autorisation d'AliExpress.
 *
 * Publique au sens strict : AliExpress l'appelle, pas le navigateur d'un
 * vendeur authentifié. Tout y est donc vérifié par **signature**, jamais par
 * un jeton de session — l'appelant ne présentera jamais nos identifiants.
 *
 * Handler asynchrone enveloppé : sous Express 4, un `async` qui lève fait
 * PENDRE la requête, sans erreur ni journal. C'est la panne du 05/09/2026.
 */
export const aliexpressAuthRouter = Router()

/**
 * Le secret qui signe l'état.
 *
 * Le secret des jetons de session, **séparé par un préfixe de domaine** : une
 * signature produite ici ne doit jamais pouvoir se faire passer pour un jeton
 * d'authentification, ni l'inverse. Sans ce préfixe, deux usages du même
 * secret finissent toujours par se confondre.
 */
const DOMAINE = 'aliexpress-oauth:'

function secret(): string | null {
  return process.env.JWT_SECRET?.trim() || null
}

/** Quinze minutes : le temps d'approuver, pas celui d'oublier l'onglet. */
const VIE_ETAT_MS = 15 * 60 * 1000

export function signerEtatAli(cle: string, userId: string, expireA: number): string {
  const charge = Buffer.from(JSON.stringify({ u: userId, e: expireA })).toString('base64url')
  const signature = crypto.createHmac('sha256', cle).update(DOMAINE + charge).digest('base64url')
  return `${charge}.${signature}`
}

export function lireEtatAli(cle: string, etat: string, maintenant = Date.now()): string | null {
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

export const VIE_ETAT_ALI_MS = VIE_ETAT_MS

/** Une page de retour lisible : le vendeur atterrit ici, pas sur du JSON. */
function page(titre: string, message: string, ok: boolean): string {
  const site = (process.env.FRONTEND_URL || '').split(',')[0]?.trim() || 'https://www.drop-shipper.fr'
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${titre}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#08070f;color:#fff;
font:16px/1.6 system-ui,sans-serif;padding:24px}main{max-width:32rem;text-align:center}
h1{font-size:1.4rem;margin:0 0 .5rem;color:${ok ? '#34d399' : '#f87171'}}
p{color:#b9b3d1;margin:0 0 1.5rem}a{display:inline-block;padding:.7rem 1.2rem;border-radius:.7rem;
background:linear-gradient(90deg,#a855f7,#ec4899);color:#fff;text-decoration:none;font-weight:600}</style>
</head><body><main><h1>${titre}</h1><p>${message}</p>
<a href="${site}/fournisseurs">Retour aux fournisseurs</a></main></body></html>`
}

aliexpressAuthRouter.get('/callback', (req: Request, res: Response) => {
  ;(async () => {
    const cle = secret()
    if (!cle) {
      res.status(503).send(page('Indisponible', "L'autorisation AliExpress n'est pas configurée.", false))
      return
    }

    const etat = String(req.query.state ?? '')
    const userId = lireEtatAli(cle, etat)
    if (!userId) {
      res
        .status(401)
        .send(page('Autorisation expirée', 'Relancez-la depuis la fiche AliExpress de DropShipper IA.', false))
      return
    }

    const code = String(req.query.code ?? '')
    if (!code) {
      // AliExpress renvoie son refus dans l'adresse plutôt qu'en code HTTP.
      const refus = String(req.query.error_description ?? req.query.error ?? 'autorisation refusée')
      res.status(400).send(page('Autorisation refusée', refus, false))
      return
    }

    /*
     * L'App Key et l'App Secret sont ceux du VENDEUR, pas les nôtres : ils
     * vivent dans sa liaison. Sans eux, il n'y a rien à échanger — et c'est le
     * cas normal d'un vendeur qui aurait lancé l'autorisation avant de les
     * saisir, donc un message, pas une erreur.
     */
    const lien = await prisma.supplierConnection.findUnique({
      where: { userId_supplier: { userId, supplier: 'aliexpress' } },
    })
    const data = (lien?.data ?? {}) as Record<string, unknown>
    const appKey = typeof data.appKey === 'string' ? data.appKey.trim() : ''
    const appSecret = typeof data.appSecret === 'string' ? data.appSecret.trim() : ''
    if (!appKey || !appSecret) {
      res
        .status(400)
        .send(page('Clés manquantes', "Enregistrez d'abord votre App Key et votre App Secret AliExpress.", false))
      return
    }

    const jetons = await echangerCodeAliexpress(appKey, appSecret, code)

    await prisma.supplierConnection.update({
      where: { userId_supplier: { userId, supplier: 'aliexpress' } },
      data: {
        data: {
          ...data,
          accessToken: jetons.accessToken,
          // Sans lui, le renouvellement automatique n'a rien à renouveler et le
          // raccordement meurt au bout d'un jour — la panne qu'on répare ici.
          ...(jetons.refreshToken ? { refreshToken: jetons.refreshToken } : {}),
          autoriseLe: new Date().toISOString(),
        },
        connected: true,
      },
    })

    res.send(
      page(
        'AliExpress est relié',
        "Le jeton a été délivré et se renouvellera tout seul. Vous n'aurez plus à y revenir.",
        true,
      ),
    )
  })().catch((err) => {
    console.error('[aliexpress] callback', err)
    if (!res.headersSent) {
      res
        .status(500)
        .send(page('Échec', err instanceof Error ? err.message : "L'échange du jeton a échoué.", false))
    }
  })
})

/** Ce que l'écran doit savoir pour proposer le bouton. */
export function autorisationAliexpressPrete(): boolean {
  return Boolean(secret() && retourAliexpress().startsWith('http'))
}
