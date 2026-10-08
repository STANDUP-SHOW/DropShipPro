import { Router } from 'express'
import { z } from 'zod'
import type { Platform } from '@prisma/client'
import { requireAuth, type AuthedRequest } from '../middleware/auth.js'
import { prisma } from '../lib/prisma.js'
import { frontendUrl } from '../lib/urls.js'
import { lireEtat, signerEtat } from '../services/oauthEtat.js'
import { connecteurMarche, connecteursMarche, retourMarche } from '../services/marches.js'

/**
 * Relier un compte vendeur TikTok Shop, Amazon, Allegro, Cdiscount, Etsy ou Wish.
 *
 * Le vendeur autorise DropShipper chez la plateforme, jamais par un mot de
 * passe confié : nous recevons des jetons qu'il révoque quand il veut. Et le
 * compte n'est marqué « connecté » qu'après un appel réel qui réussit
 * (`verifier`) — l'écran disait « connecté » sur la seule foi d'un formulaire
 * enregistré, c'est fini.
 */
export const marchesRouter = Router()
marchesRouter.use(requireAuth)

function plateformeDe(brut: string): Platform | null {
  const id = brut.toUpperCase() as Platform
  return connecteurMarche(id) ? id : null
}

/** Pour chaque place de marché à autorisation : l'app est-elle déclarée, le compte relié ? */
marchesRouter.get('/', async (req: AuthedRequest, res) => {
  const lignes = await prisma.platformCredential.findMany({
    where: { userId: req.userId!, platform: { in: connecteursMarche().map((c) => c.platform) } },
    select: { platform: true, label: true, connected: true },
  })
  res.json(
    connecteursMarche().map((c) => {
      const l = lignes.find((x) => x.platform === c.platform)
      return {
        platform: c.platform,
        label: c.label,
        appConfiguree: c.appConfiguree(),
        manque: c.appConfiguree() ? null : c.manque(),
        relie: Boolean(l?.connected),
        compte: l?.label ?? null,
        /** Vrai quand la liaison passe par une redirection chez la plateforme. */
        autorisation: Boolean(c.lienAutorisation),
        /** Les champs à coller, quand la liaison passe par une saisie (Cdiscount). */
        saisie: c.saisie?.() ?? null,
      }
    }),
  )
})

/** L'adresse où envoyer le vendeur pour autoriser DropShipper. */
marchesRouter.post('/:platform/connect', (req: AuthedRequest, res) => {
  const platform = plateformeDe(req.params.platform)
  if (!platform) return res.status(404).json({ error: 'Place de marché inconnue.' })
  const c = connecteurMarche(platform)!
  if (!c.appConfiguree()) return res.status(503).json({ error: c.manque() })
  if (!c.lienAutorisation) return res.status(400).json({ error: `${c.label} se relie en collant vos identifiants, pas par une redirection.` })
  res.json({ url: c.lienAutorisation(signerEtat(req.userId!, platform), retourMarche(platform)) })
})

/** Enregistre la liaison après l'avoir éprouvée par un appel réel. */
async function relier(userId: string, platform: Platform, params: Record<string, string>) {
  const c = connecteurMarche(platform)!
  const { data, label } = await c.finaliser(params, retourMarche(platform))
  const creds = c.lire(data)
  if (!creds) throw new Error(`${c.label} n'a pas rendu d'identifiants complets.`)
  const verif = await c.verifier(creds)
  const final = { ...data, ...(verif && verif.majCreds ? verif.majCreds : {}) }
  await prisma.platformCredential.upsert({
    where: { userId_platform: { userId, platform } },
    create: { userId, platform, label: label ?? c.label, data: final as never, connected: true },
    update: { label: label ?? c.label, data: final as never, connected: true },
  })
}

/**
 * Amazon, application privée : le vendeur colle le jeton de rafraîchissement
 * obtenu par « Autoriser l'application » dans Seller Central, et son Seller ID.
 * C'est la voie la plus courte pour son propre compte, sans redirection.
 */
const jetonAmazon = z.object({
  refreshToken: z.string().trim().min(10).max(2000),
  sellerId: z.string().trim().min(5).max(40),
})

marchesRouter.post('/amazon/jeton', async (req: AuthedRequest, res) => {
  const parsed = jetonAmazon.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Collez le jeton de rafraîchissement (Atzr|…) et votre Seller ID.' })
  try {
    await relier(req.userId!, 'AMAZON', parsed.data)
    res.json({ ok: true })
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Amazon a refusé ce jeton.' })
  }
})

/**
 * La liaison par saisie (Cdiscount) : les champs déclarés par le connecteur,
 * rien d'autre, puis le même `relier` qu'au retour d'une autorisation — donc
 * le même appel réel avant de dire « connecté ».
 */
marchesRouter.post('/:platform/saisie', async (req: AuthedRequest, res) => {
  const platform = plateformeDe(req.params.platform)
  const c = platform ? connecteurMarche(platform) : undefined
  if (!platform || !c?.saisie) return res.status(404).json({ error: 'Cette place de marché ne se relie pas par saisie.' })
  if (!c.appConfiguree()) return res.status(503).json({ error: c.manque() })
  const corps = (req.body ?? {}) as Record<string, unknown>
  const params: Record<string, string> = {}
  for (const champ of c.saisie()) {
    const v = typeof corps[champ.cle] === 'string' ? (corps[champ.cle] as string).trim() : ''
    if (!v || v.length > 2000) return res.status(400).json({ error: `Renseignez « ${champ.libelle} ».` })
    params[champ.cle] = v
  }
  try {
    await relier(req.userId!, platform, params)
    res.json({ ok: true })
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : `${c.label} a refusé ces identifiants.` })
  }
})

/** Délier : les jetons sont effacés, la plateforme garde l'autorisation jusqu'à ce que le vendeur la retire chez elle. */
marchesRouter.delete('/:platform', async (req: AuthedRequest, res) => {
  const platform = plateformeDe(req.params.platform)
  if (!platform) return res.status(404).json({ error: 'Place de marché inconnue.' })
  await prisma.platformCredential.updateMany({
    where: { userId: req.userId!, platform },
    data: { connected: false, data: {} },
  })
  res.json({ ok: true })
})

/*
 * Le retour d'autorisation, hors `requireAuth` : c'est la plateforme qui y
 * renvoie le navigateur. Le `state` signé dit quel vendeur l'a lancée.
 */
export const marchesPublicRouter = Router()

marchesPublicRouter.get('/:platform/callback', async (req, res) => {
  const retour = `${frontendUrl()}/plateformes-vente?retour=1`
  const platform = plateformeDe(req.params.platform)
  if (!platform) return res.redirect(`${retour}&marche=inconnu`)
  const q = Object.fromEntries(
    Object.entries(req.query).filter((e): e is [string, string] => typeof e[1] === 'string'),
  )
  const nom = encodeURIComponent(platform)

  if (q.error) return res.redirect(`${retour}&marche=refus&plateforme=${nom}`)
  let lu: ReturnType<typeof lireEtat> = null
  try {
    lu = lireEtat(q.state ?? '')
  } catch {
    lu = null
  }
  if (!lu || lu.plateforme !== platform) return res.redirect(`${retour}&marche=inconnu&plateforme=${nom}`)

  try {
    await relier(lu.userId, platform, q)
    res.redirect(`${retour}&marche=ok&plateforme=${nom}`)
  } catch (err) {
    console.error(`retour ${platform}`, err)
    const message = err instanceof Error ? err.message : 'Raccordement impossible.'
    res.redirect(`${retour}&marche=erreur&plateforme=${nom}&message=${encodeURIComponent(message)}`)
  }
})
