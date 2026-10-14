import type { Opportunity, Platform } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { publishToPlatform } from './publisher.js'
import { aUneApplicationDesktop, mettreEnFileDesktop } from './desktopFile.js'
import { PLATFORMS } from './platforms.js'
import { reserveCredits, refundCredits } from './billing.js'
import { DROPS } from './tarifs.js'
import { reviewImages } from './controlAgent.js'
import { apiBaseUrl } from '../lib/urls.js'
import { needsExtension } from './autoShipperRayons.js'
import { importerAdresse } from './productImport.js'

/**
 * Les produits que le serveur ne lit pas, importés quand même (14/10/2026).
 *
 * Temu, AliExpress, Shein… construisent leur fiche en JavaScript : le serveur
 * n'en reçoit qu'une coquille. Jusqu'ici l'AUTO-SHIPPER les écartait. Max : « en
 * AUTO-SHIPPER, tout se fait tout seul, de l'acquisition à la vente ». Chaque
 * produit suit donc une VOIE, notée sur l'opportunité (`raw.voie`) et sur la
 * ligne de file (`ImportQueue.mode`) :
 *
 *  - `serveur`   : la fiche se lit côté serveur (le circuit d'origine) ;
 *  - `api`       : AliExpress relié comme catalogue connecté, import par son API ;
 *  - `desktop`   : l'application desktop du vendeur relève la fiche dans son
 *                  navigateur interne, seule, dès qu'elle tourne ;
 *  - `extension` : pas d'application desktop : la fiche attend dans la file de
 *                  l'extension Chrome, que le vendeur lance d'un clic.
 *
 * L'agent de contrôle (15 drops) ne sert qu'à la voie `extension` (règle de max,
 * 14/10/2026) : l'API et le navigateur interne rendent la vraie galerie.
 *
 * Le produit se paie à la mise en file (`DROPS.autoShipperImport`), comme un
 * import du pilote ; il est rendu si la fiche n'arrive pas (refus, ou 24 h sans
 * relevé). La journée est rendue si rien n'a été importé du tout.
 */

export type VoieImport = 'serveur' | 'api' | 'desktop' | 'extension'

/** L'origine d'une ligne de file posée par l'AUTO-SHIPPER : `autoshipper:<id d'opportunité>`. */
export const ORIGINE_AUTOSHIPPER = 'autoshipper:'

/** Une ligne non relevée en 24 h est rendue : le vendeur ne paie pas une fiche qui n'arrive pas. */
export const DELAI_FILE_MS = 24 * 3600_000

/** Les destinations que le pilote peut réellement servir seul. */
export const AUTO_PLATFORMS = PLATFORMS.filter((p) => p.integration === 'live').map((p) => p.id)

export interface ContexteVoies {
  aliexpressRelie: boolean
  aDesktop: boolean
}

export async function contexteVoies(userId: string): Promise<ContexteVoies> {
  const [ali, desktop] = await Promise.all([
    prisma.supplierConnection.findFirst({ where: { userId, supplier: 'aliexpress', connected: true }, select: { id: true } }),
    aUneApplicationDesktop(userId),
  ])
  return { aliexpressRelie: Boolean(ali), aDesktop: desktop }
}

/** The AliExpress product id of an item page (`/item/1005001234567890.html`), null otherwise. */
export function refAliExpress(url: string): string | null {
  try {
    const u = new URL(url)
    if (!u.hostname.includes('aliexpress.')) return null
    return u.pathname.match(/\/item\/(\d{6,})/)?.[1] ?? null
  } catch {
    return null
  }
}

/** `navigateur`: the page only reads in a browser (host list, or the agent's own `import: 'extension'`). */
export function voieDe(url: string, ctx: ContexteVoies, navigateur = needsExtension(url)): VoieImport {
  if (!navigateur) return 'serveur'
  if (ctx.aliexpressRelie && refAliExpress(url)) return 'api'
  return ctx.aDesktop ? 'desktop' : 'extension'
}

export const LIBELLES_VOIE: Record<VoieImport, string> = {
  serveur: 'lu par le serveur',
  api: 'importé par l’API AliExpress',
  desktop: "relevé par l'application desktop",
  extension: "en attente dans l'extension Chrome",
}

export function jourUtc(d = new Date()) {
  return d.toISOString().slice(0, 10)
}

/** Lines posted by the pilot and not yet settled, created on `day`: they count in that day's ceiling. */
export async function enFileDuJour(userId: string, day: string): Promise<number> {
  const debut = new Date(`${day}T00:00:00.000Z`)
  return prisma.importQueue.count({
    where: {
      userId,
      origine: { startsWith: ORIGINE_AUTOSHIPPER },
      status: { in: ['EN_ATTENTE', 'RELEVE'] },
      createdAt: { gte: debut, lt: new Date(debut.getTime() + 24 * 3600_000) },
    },
  })
}

/**
 * Puts one opportunity in the import queue for the desktop app (or the extension).
 * The product is paid now; the caller already reserved `DROPS.autoShipperImport`.
 */
export async function mettreEnFileAutoShipper(userId: string, o: Opportunity, voie: 'desktop' | 'extension') {
  let fournisseur: string | null = null
  try {
    fournisseur = new URL(o.sourceUrl).hostname.replace(/^www\./, '').slice(0, 80)
  } catch {
    // needsExtension already accepted it; an unreadable host keeps no supplier name.
  }
  await prisma.importQueue.create({
    data: {
      userId,
      url: o.sourceUrl,
      titre: o.title.slice(0, 200),
      fournisseur,
      mode: voie,
      origine: `${ORIGINE_AUTOSHIPPER}${o.id}`,
    },
  })
  await prisma.opportunity.update({
    where: { id: o.id },
    data: { status: 'KEPT', raw: { ...((o.raw ?? {}) as object), voie } },
  })
}

type Reglages = NonNullable<Awaited<ReturnType<typeof prisma.autopilot.findUnique>>>

export function destinationsAuto(settings: Reglages): Platform[] {
  return (Array.isArray(settings.destinations) ? settings.destinations : [])
    .filter((d: unknown): d is string => typeof d === 'string')
    .filter((d: string) => AUTO_PLATFORMS.includes(d as Platform)) as Platform[]
}

export interface LigneJournal {
  titre: string
  action: 'importé' | 'publié' | 'écarté' | 'échec' | 'en file'
  raison: string
}

/**
 * Publishes an imported product where the seller asked, exactly as the pilot does
 * (shop created on first OWN_SITE use, API destinations, then the desktop queue for
 * Vinted, Leboncoin, Facebook). Returns how many API publications succeeded / failed.
 */
export async function publierAutoShipper(
  userId: string,
  productId: string,
  titre: string,
  settings: Reglages,
  log: LigneJournal[],
): Promise<{ published: number; failed: number }> {
  const bilan = { published: 0, failed: 0 }
  const destinations = destinationsAuto(settings)
  if (!settings.autoPublish || !destinations.length) return bilan

  if (destinations.includes('OWN_SITE')) {
    // Une annonce sans boutique n'est servie par aucun flux. La boutique
    // naît ici comme elle naîtrait à la première publication manuelle.
    const shop =
      (await prisma.shop.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } })) ??
      (await prisma.shop.create({ data: { userId, name: 'Ma boutique' } }))
    await prisma.product.update({ where: { id: productId }, data: { shopId: shop.id } })
  }

  for (const platform of destinations) {
    // L'adresse publique est indispensable à Shopify, qui télécharge les
    // photos lui-même : sans requête entrante, elle vient de l'environnement.
    const publications = await publishToPlatform(productId, platform, apiBaseUrl())
    const ok = publications.status === 'PUBLISHED'
    if (ok) bilan.published++
    else bilan.failed++
    log.push({
      titre,
      action: ok ? 'publié' : 'échec',
      raison: ok ? `Publié sur ${platform}` : `${platform} : ${publications.error ?? 'refus'}`,
    })
  }

  // Vinted, Leboncoin, Facebook : pas d'API, donc en file pour l'application desktop du vendeur
  // (si elle existe). Elle publie là où le vendeur a activé l'agent ; ailleurs l'annonce l'attend.
  const enFile = await mettreEnFileDesktop(userId, productId)
  if (enFile.length) {
    log.push({ titre, action: 'publié', raison: `En file pour l'application desktop : ${enFile.join(', ')}` })
  }
  return bilan
}

/**
 * What follows an import that did not go through the pilot's own scraper (API,
 * desktop, extension): the opportunity is closed, the photos are checked when the
 * route needs it, the listing is published, and the day's journal gets its lines.
 */
export async function suiteAutoShipper(params: {
  userId: string
  productId: string
  opportunityId: string | null
  titre: string
  voie: VoieImport
  /** The pilot day the product was paid for (`AutopilotRun.day`). */
  jour: string
  /** Lines already written by the caller (the pilot loop writes its own run). */
  log?: LigneJournal[]
  /** false when the caller records the run itself. */
  ecrireRun?: boolean
}): Promise<{ published: number; failed: number; brouillon: boolean }> {
  const { userId, productId, titre, voie, jour } = params
  const log = params.log ?? []
  const settings = await prisma.autopilot.findUnique({ where: { userId } })
  if (params.opportunityId) {
    await prisma.opportunity
      .updateMany({ where: { id: params.opportunityId, userId }, data: { status: 'IMPORTED', productId } })
      .catch(() => undefined)
  }
  const produit = await prisma.product.findUnique({ where: { id: productId } })
  if (!settings || !produit) return { published: 0, failed: 0, brouillon: true }

  let images = (Array.isArray(produit.images) ? produit.images : []).filter((i): i is string => typeof i === 'string')
  let raisonDoute: string | null = null

  if (voie === 'extension') {
    // La seule voie où la galerie peut être fausse sans que personne ne la voie.
    if (!settings.controleAgent) {
      raisonDoute = 'agent de contrôle désactivé : photos à vérifier avant publication'
    } else {
      const paye = await reserveCredits(userId, DROPS.autoShipperControle, 'Agent de contrôle (AUTO-SHIPPER)')
      if (paye.ok && paye.allowed === DROPS.autoShipperControle) {
        const verdict = await reviewImages({ images, title: produit.aiTitle ?? produit.title, variants: null })
        if (!verdict.checked) {
          await refundCredits(userId, DROPS.autoShipperControle, 'Contrôle AUTO-SHIPPER non effectué')
          raisonDoute = 'photos non contrôlées : à vérifier avant publication'
        } else {
          if (verdict.rejected.length) {
            images = verdict.keep
            await prisma.product.update({ where: { id: productId }, data: { images } })
            log.push({ titre, action: 'écarté', raison: `Contrôle : ${verdict.rejected.length} image(s) écartée(s) — ${verdict.rejected[0].reason}` })
          }
        }
      } else {
        if (paye.allowed > 0) await refundCredits(userId, paye.allowed, 'Contrôle AUTO-SHIPPER non effectué')
        raisonDoute = 'photos non contrôlées (drops insuffisants) : à vérifier avant publication'
      }
    }
  }
  if (!raisonDoute && images.length < 2) raisonDoute = `photos douteuses : ${images.length} image(s) retenue(s)`

  const brouillon = Boolean(raisonDoute)
  await prisma.product.update({ where: { id: productId }, data: { status: brouillon ? 'DRAFT' : 'READY' } })
  log.push({
    titre,
    action: 'importé',
    raison: `${LIBELLES_VOIE[voie][0].toUpperCase()}${LIBELLES_VOIE[voie].slice(1)}${brouillon ? ` — gardé en brouillon, ${raisonDoute}` : ''}`,
  })

  const bilan = brouillon ? { published: 0, failed: 0 } : await publierAutoShipper(userId, productId, titre, settings, log)

  if (params.ecrireRun !== false) {
    await prisma.autopilotRun.create({
      data: { userId, autopilotId: settings.id, day: jour, imported: 1, published: bilan.published, skipped: 0, failed: bilan.failed, log: log as never },
    })
  }
  return { ...bilan, brouillon }
}

/** An opportunity whose page only reads in a browser. */
export function lectureNavigateur(o: { sourceUrl: string; raw: unknown }): boolean {
  const raw = (o.raw ?? {}) as { import?: unknown }
  return needsExtension(o.sourceUrl) || raw.import === 'extension'
}

/** The queue line of an AUTO-SHIPPER product, with its opportunity id; null if it is not one. */
export function opportuniteDeLigne(origine: string | null): string | null {
  return origine?.startsWith(ORIGINE_AUTOSHIPPER) ? origine.slice(ORIGINE_AUTOSHIPPER.length) || null : null
}

/**
 * A queued product that will not arrive: its drops come back, the opportunity is
 * closed (no daily re-queue), the day's journal says why, and the day itself is
 * refunded when nothing at all was imported on it.
 */
export async function echecLigneAutoShipper(userId: string, ligneId: string, motif: string): Promise<boolean> {
  const ligne = await prisma.importQueue.findFirst({ where: { id: ligneId, userId, origine: { startsWith: ORIGINE_AUTOSHIPPER } } })
  if (!ligne || ligne.status === 'IMPORTE' || ligne.status === 'ECHEC') return false
  // Conditional on the status so two callers never refund the same line twice.
  const { count } = await prisma.importQueue.updateMany({
    where: { id: ligne.id, status: { in: ['EN_ATTENTE', 'RELEVE'] } },
    data: { status: 'ECHEC', erreur: motif.slice(0, 300) },
  })
  if (!count) return false
  await refundCredits(userId, DROPS.autoShipperImport, `Remboursement : ${motif.slice(0, 80)}`)
  const oppId = opportuniteDeLigne(ligne.origine)
  if (oppId) await prisma.opportunity.updateMany({ where: { id: oppId, userId }, data: { status: 'REJECTED' } })

  const jour = jourUtc(ligne.createdAt)
  const settings = await prisma.autopilot.findUnique({ where: { userId } })
  if (settings) {
    await prisma.autopilotRun.create({
      data: {
        userId,
        autopilotId: settings.id,
        day: jour,
        imported: 0,
        published: 0,
        skipped: 0,
        failed: 1,
        log: [{ titre: ligne.titre ?? ligne.url, action: 'échec', raison: `${motif} — ${DROPS.autoShipperImport} drops rendus` }] as never,
      },
    })
    await rendreJourneeSansImport(userId, settings.id, jour)
  }
  return true
}

const MARQUE_JOURNEE_RENDUE = 'Journée AUTO-SHIPPER rendue : rien importé'

/**
 * The day was kept when the pilot put products in the queue; once the last of them
 * has failed and nothing was imported that day, the day is refunded, once.
 */
async function rendreJourneeSansImport(userId: string, autopilotId: string, jour: string) {
  const debut = new Date(`${jour}T00:00:00.000Z`)
  const fin = new Date(debut.getTime() + 24 * 3600_000)
  const lignes = await prisma.importQueue.groupBy({
    by: ['status'],
    where: { userId, origine: { startsWith: ORIGINE_AUTOSHIPPER }, createdAt: { gte: debut, lt: fin } },
    _count: true,
  })
  if (lignes.some((l) => l.status !== 'ECHEC')) return
  const runs = await prisma.autopilotRun.findMany({ where: { userId, day: jour }, select: { imported: true, published: true } })
  if (runs.some((r) => r.imported > 0 || r.published > 0)) return
  // Only a day really paid, not already refunded (by the tour itself or here), comes back.
  const ref = `autoshipper-journee:${jour}`
  const [payee, rendueParLaTournee, dejaRendue] = await Promise.all([
    prisma.dropTransaction.count({ where: { userId, delta: { lt: 0 }, motif: 'Journée AUTO-SHIPPER', createdAt: { gte: debut, lt: fin } } }),
    prisma.dropTransaction.count({ where: { userId, delta: { gt: 0 }, motif: { startsWith: 'Journée AUTO-SHIPPER' }, createdAt: { gte: debut, lt: fin } } }),
    prisma.dropTransaction.count({ where: { userId, ref } }),
  ])
  if (payee <= rendueParLaTournee || dejaRendue) return
  await refundCredits(userId, DROPS.autoShipperJour, MARQUE_JOURNEE_RENDUE, ref)
  await prisma.autopilotRun.create({
    data: { userId, autopilotId, day: jour, imported: 0, published: 0, skipped: 0, failed: 0, log: [{ titre: '—', action: 'écarté', raison: MARQUE_JOURNEE_RENDUE }] as never },
  })
}

/** Lines nobody read in 24 h are refunded: the desktop app was not running. */
export async function expirerFileAutoShipper(userId: string, maintenant = new Date()): Promise<number> {
  const vieilles = await prisma.importQueue.findMany({
    where: {
      userId,
      origine: { startsWith: ORIGINE_AUTOSHIPPER },
      status: { in: ['EN_ATTENTE', 'RELEVE'] },
      createdAt: { lt: new Date(maintenant.getTime() - DELAI_FILE_MS) },
    },
    select: { id: true, mode: true },
  })
  let n = 0
  for (const l of vieilles) {
    const motif =
      l.mode === 'extension'
        ? "Pas relevé en 24 h : lancez la file d'import de l'extension Chrome, ou installez l'application desktop"
        : "Pas relevé en 24 h : l'application desktop n'était pas ouverte"
    if (await echecLigneAutoShipper(userId, l.id, motif)) n++
  }
  return n
}

/** What the desktop app (or the extension) read on the page: the same fields as `/api/products/capture`. */
export interface ReleveNavigateur {
  sourceUrl: string
  title: string
  description: string
  price: number
  currency: string
  images: string[]
  sourceCategory: string | null
  variants?: unknown
  skuAliExpress?: unknown
  pageText?: string
  ean?: string | null
  reviews?: Array<{ stars?: number | string; author?: string; text?: string; photos?: string[]; date?: string }>
}

/** A pending AUTO-SHIPPER line of this seller, or null. */
export async function ligneAutoShipper(userId: string, ligneId: string | undefined | null) {
  if (!ligneId) return null
  return prisma.importQueue.findFirst({
    where: { id: ligneId, userId, origine: { startsWith: ORIGINE_AUTOSHIPPER }, status: { in: ['EN_ATTENTE', 'RELEVE'] } },
  })
}

/**
 * Imports a queued AUTO-SHIPPER product from what a browser read. Already paid at
 * queue time: nothing is debited here, the drops come back if it fails.
 */
export async function importerLigneAutoShipper(
  userId: string,
  ligneId: string,
  releve: ReleveNavigateur,
): Promise<{ ok: true; productId: string; brouillon: boolean } | { ok: false; erreur: string }> {
  const ligne = await ligneAutoShipper(userId, ligneId)
  if (!ligne) return { ok: false, erreur: 'Ligne absente, déjà importée ou rendue.' }
  // The page the browser read must be the queued one (a redirect keeps the same host).
  const hote = (u: string) => {
    try {
      return new URL(u).hostname.replace(/^www\./, '')
    } catch {
      return ''
    }
  }
  if (hote(releve.sourceUrl) !== hote(ligne.url)) {
    await echecLigneAutoShipper(userId, ligne.id, "La page relevée n'est pas celle du produit")
    return { ok: false, erreur: "La page relevée n'est pas celle du produit." }
  }
  const voie: VoieImport = ligne.mode === 'extension' ? 'extension' : 'desktop'
  try {
    const { produit, reecrit } = await importerAdresse(userId, ligne.url, {
      capture: {
        title: releve.title,
        description: releve.description,
        price: releve.price,
        currency: releve.currency,
        images: releve.images,
        sourceCategory: releve.sourceCategory,
        pageText: releve.pageText,
        ean: releve.ean ?? null,
        avis: releve.reviews as never,
      },
      releve: {
        images: releve.images,
        variantes: releve.variants as Record<string, string[]> | undefined,
        skuAliExpress: (releve.skuAliExpress ?? null) as never,
      },
    })
    // Same rule as the pilot's own imports: no rewrite, the product is not due.
    if (!reecrit) await refundCredits(userId, DROPS.autoShipperImport, 'AUTO-SHIPPER : réécriture non faite')
    await prisma.importQueue.update({ where: { id: ligne.id }, data: { status: 'IMPORTE', productId: produit.id, erreur: null } })
    const suite = await suiteAutoShipper({
      userId,
      productId: produit.id,
      opportunityId: opportuniteDeLigne(ligne.origine),
      titre: ligne.titre ?? releve.title,
      voie,
      jour: jourUtc(ligne.createdAt),
    })
    return { ok: true, productId: produit.id, brouillon: suite.brouillon }
  } catch (err) {
    console.error('auto-shipper : import relevé', err)
    await echecLigneAutoShipper(userId, ligne.id, "L'import de la fiche relevée a échoué")
    return { ok: false, erreur: "L'import de la fiche relevée a échoué." }
  }
}
