import { prisma } from '../lib/prisma.js'
import { renouvelerJetonAliexpress } from './supplierAliexpress.js'
import { SupplierError } from './supplierTypes.js'

/**
 * Keeps every authorised AliExpress link alive (16/11/2026, max: « catalogues reliés non reliés »).
 *
 * The access token lives one day, the refresh token two. The renewal only ran when a call met an
 * expired token: a seller without an active rayon makes no call for two days, the refresh token
 * dies, and the link still says « Reliée » while every search, sheet and completion fails with
 * « a expiré et n'a pas pu être renouvelé ». Renewed here every ~20 h, whether or not anything ran.
 *
 * A renewal AliExpress refuses (or answers without a token) means the authorisation is gone:
 * the link is set to not connected with the reason, so the screen asks for a new authorisation
 * instead of showing « Reliée ». A network failure changes nothing: next round.
 */
const AGE_MAX_MS = 20 * 3600 * 1000

export async function tourneeJetonsAliexpress(maintenant = Date.now()) {
  const liens = await prisma.supplierConnection.findMany({ where: { supplier: 'aliexpress', connected: true } })
  let renouveles = 0
  let perdus = 0
  for (const lien of liens) {
    const data = (lien.data ?? {}) as Record<string, string>
    if (!data.refreshToken || !data.appKey || !data.appSecret) continue
    const depuis = Date.parse(data.renouveleLe || data.autoriseLe || '') || 0
    if (maintenant - depuis < AGE_MAX_MS) continue
    try {
      const frais = await renouvelerJetonAliexpress(data.appKey.trim(), data.appSecret.trim(), data.refreshToken.trim())
      // Re-read: a call may have renewed it meanwhile; never write back stale credentials.
      const actuel = await prisma.supplierConnection.findUnique({ where: { id: lien.id } })
      const base = (actuel?.data ?? data) as Record<string, string>
      if (frais) {
        await prisma.supplierConnection.update({
          where: { id: lien.id },
          data: {
            data: {
              ...base,
              accessToken: frais.accessToken,
              ...(frais.refreshToken ? { refreshToken: frais.refreshToken } : {}),
              renouveleLe: new Date(maintenant).toISOString(),
            },
          },
        })
        renouveles++
      } else {
        await prisma.supplierConnection.update({
          where: { id: lien.id },
          data: { connected: false, data: { ...base, motifDeliaison: "AliExpress n'a pas renouvelé le jeton : réautorisez l'application." } },
        })
        perdus++
      }
    } catch (err) {
      if (err instanceof SupplierError && /token|jeton|expir|invalid/i.test(err.message)) {
        await prisma.supplierConnection.update({
          where: { id: lien.id },
          data: { connected: false, data: { ...data, motifDeliaison: `${err.message} — réautorisez l'application.` } },
        })
        perdus++
      } else {
        console.error('jeton AliExpress : renouvellement reporté', lien.userId, err instanceof Error ? err.message : err)
      }
    }
  }
  if (renouveles || perdus) console.log(`jetons AliExpress : ${renouveles} renouvelé(s), ${perdus} à réautoriser`)
  return { renouveles, perdus }
}
