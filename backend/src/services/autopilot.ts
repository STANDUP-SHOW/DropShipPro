import type { Platform } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { scrapeProduct, ScrapeBlockedError } from './scraper.js'
import { enhanceListing } from './aiEnhancer.js'
import { watermarkImages } from './watermark.js'
import { publishToPlatform } from './publisher.js'
import { PLATFORMS } from './platforms.js'
import { reserveCredits, refundCredits } from './billing.js'
import { guessCategoryId } from './categoryCatalog.js'
import { watermarkOptionsFor } from './watermarkOptions.js'
import { apiBaseUrl } from '../lib/urls.js'
import { selectProductImages } from './imageSelect.js'
import { reviewImages, applyVerdict } from './controlAgent.js'
import { extractVariants } from './aiEnhancer.js'

/**
 * Le pilote automatique.
 *
 * Il fait pendant la nuit ce que le vendeur ferait le matin : reprendre les
 * produits conseillés par ses chefs de rayon, importer ceux qui passent ses
 * critères, et les publier.
 *
 * Deux limites sont posées dans le code et non dans les réglages, parce
 * qu'elles protègent le vendeur de lui-même :
 *
 * — il ne publie que sur les destinations qui ont une vraie API. Sur Vinted,
 *   Leboncoin et Facebook Marketplace, publier suppose de piloter un compte
 *   vendeur à sa place ; c'est contraire aux conditions de ces plateformes et
 *   c'est son compte qui serait suspendu, pas le nôtre ;
 *
 * — il s'arrête net au plafond quotidien. Un agent qui déposerait cinq cents
 *   trouvailles viderait sinon le porte-monnaie du vendeur en une nuit.
 */

/** Les destinations que le pilote peut réellement servir seul. */
export const AUTO_PLATFORMS = PLATFORMS.filter((p) => p.integration === 'live').map((p) => p.id)

export interface RunLine {
  titre: string
  action: 'importé' | 'publié' | 'écarté' | 'échec'
  raison: string
}

export interface RunResult {
  imported: number
  published: number
  skipped: number
  failed: number
  log: RunLine[]
}

/** Les sites dont la fiche ne se lit pas côté serveur : l'extension est requise. */
const EXTENSION_ONLY = ['temu.', 'aliexpress.', 'joybuy.', 'shein.']

function needsExtension(sourceUrl: string) {
  try {
    const host = new URL(sourceUrl).hostname
    return EXTENSION_ONLY.some((s) => host.includes(s))
  } catch {
    return true
  }
}

export async function runAutopilot(userId: string): Promise<RunResult> {
  const log: RunLine[] = []
  const result: RunResult = { imported: 0, published: 0, skipped: 0, failed: 0, log }

  const settings = await prisma.autopilot.findUnique({ where: { userId } })
  if (!settings || !settings.enabled) {
    log.push({ titre: '—', action: 'écarté', raison: 'Pilote automatique désactivé' })
    return result
  }

  const day = new Date().toISOString().slice(0, 10)

  // Ce qui a déjà été importé aujourd'hui compte dans le plafond : deux passages
  // dans la même journée ne doivent pas le doubler.
  const already = await prisma.autopilotRun.aggregate({
    where: { userId, day },
    _sum: { imported: true },
  })
  const budget = settings.dailyLimit - (already._sum.imported ?? 0)
  if (budget <= 0) {
    log.push({ titre: '—', action: 'écarté', raison: `Plafond du jour atteint (${settings.dailyLimit})` })
    return result
  }

  const candidates = await prisma.opportunity.findMany({
    where: { userId, status: 'NEW' },
    orderBy: { detectedAt: 'desc' },
    take: 200,
  })

  const destinations = (Array.isArray(settings.destinations) ? settings.destinations : [])
    .filter((d: unknown): d is string => typeof d === 'string')
    .filter((d: string) => AUTO_PLATFORMS.includes(d as Platform)) as Platform[]

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })

  for (const o of candidates) {
    if (result.imported >= budget) {
      log.push({ titre: o.title, action: 'écarté', raison: 'Plafond quotidien atteint' })
      result.skipped++
      continue
    }

    const source = Number(o.sourcePrice)
    const market = o.marketPrice === null ? null : Number(o.marketPrice)
    const margin = market !== null && source > 0 ? Math.round(((market - source) / source) * 100) : null

    if (margin === null) {
      log.push({ titre: o.title, action: 'écarté', raison: 'Marge inconnue : aucun prix marché relevé' })
      result.skipped++
      continue
    }
    if (margin < settings.minMargin) {
      log.push({ titre: o.title, action: 'écarté', raison: `Marge ${margin} % sous le seuil de ${settings.minMargin} %` })
      result.skipped++
      continue
    }
    if (settings.requireEuStock && o.euStock !== true) {
      log.push({
        titre: o.title,
        action: 'écarté',
        raison: o.euStock === null ? 'Stock européen non vérifié' : 'Pas de stock européen',
      })
      result.skipped++
      continue
    }
    if (needsExtension(o.sourceUrl)) {
      log.push({ titre: o.title, action: 'écarté', raison: "Fiche lisible seulement par l'extension" })
      result.skipped++
      continue
    }

    const credit = await reserveCredits(userId, 1)
    if (!credit.ok) {
      log.push({ titre: o.title, action: 'écarté', raison: credit.reason ?? 'Crédits épuisés' })
      result.skipped++
      // Sans crédit, la suite échouerait pareil : on arrête là.
      break
    }

    try {
      const scraped = await scrapeProduct(o.sourceUrl)
      const enhanced = await enhanceListing({
        title: scraped.title,
        description: scraped.description,
        category: scraped.sourceCategory,
      })
      // Cinq photos, choisies sans personne pour rattraper : le tri doit être
      // juste du premier coup, une bannière en photo principale fait refuser
      // l'annonce ou tuer la vente.
      // Douze candidats plutôt que cinq : l'agent de contrôle décide combien
      // valent la peine. Neuf s'il y a neuf bonnes photos, six s'il y en a six.
      const chosen = await selectProductImages(scraped.images, user.controlAgent ? 12 : 5)
      const announced = await extractVariants(scraped.pageText)

      const verdict = user.controlAgent
        ? await reviewImages({ images: chosen, title: enhanced.title, variants: announced })
        : null

      if (verdict?.checked && verdict.rejected.length) {
        log.push({
          titre: o.title,
          action: 'écarté',
          raison: `Contrôle : ${verdict.rejected.length} image(s) écartée(s) — ${verdict.rejected[0].reason}`,
        })
      }

      const retained = verdict?.checked ? verdict.keep : chosen
      const variants = verdict ? applyVerdict(announced, verdict) : announced
      const images = await watermarkImages(retained, watermarkOptionsFor(user), enhanced.title)

      const product = await prisma.product.create({
        data: {
          userId,
          sourceUrl: o.sourceUrl,
          sourceSite: scraped.sourceSite,
          sourceCategory: scraped.sourceCategory,
          categoryId: guessCategoryId(scraped.sourceCategory) ?? guessCategoryId(scraped.title),
          title: scraped.title,
          description: scraped.description,
          aiTitle: enhanced.title,
          aiDescription: enhanced.description,
          price: scraped.price,
          sellingPrice: market ?? scraped.price * 1.5,
          currency: scraped.currency,
          images: images.length ? images : retained,
          variants: variants ?? undefined,
          metaTitle: enhanced.metaTitle,
          metaDescription: enhanced.metaDescription,
          metaKeywords: enhanced.metaKeywords,
          bulletPoints: enhanced.bulletPoints,
          attributes: enhanced.attributes,
          aiEnhanced: enhanced.enhanced,
          status: 'READY',
        },
      })

      // Le crédit paie la réécriture. Modèle injoignable, texte source conservé,
      // crédit rendu — la même règle que pour un import manuel.
      if (!enhanced.enhanced) await refundCredits(userId, 1)

      await prisma.opportunity.update({
        where: { id: o.id },
        data: { status: 'IMPORTED', productId: product.id },
      })

      result.imported++
      log.push({ titre: o.title, action: 'importé', raison: `Marge estimée ${margin} %` })

      if (settings.autoPublish && destinations.length) {
        if (destinations.includes('OWN_SITE')) {
          // Une annonce sans boutique n'est servie par aucun flux. La boutique
          // naît ici comme elle naîtrait à la première publication manuelle.
          const shop =
            (await prisma.shop.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } })) ??
            (await prisma.shop.create({ data: { userId, name: 'Ma boutique' } }))
          await prisma.product.update({ where: { id: product.id }, data: { shopId: shop.id } })
        }

        for (const platform of destinations) {
          // L'adresse publique est indispensable à Shopify, qui télécharge les
          // photos lui-même : sans requête entrante, elle vient de l'environnement.
          const publications = await publishToPlatform(product.id, platform, apiBaseUrl())
          const ok = publications.status === 'PUBLISHED'
          if (ok) result.published++
          log.push({
            titre: o.title,
            action: ok ? 'publié' : 'échec',
            raison: ok ? `Publié sur ${platform}` : `${platform} : ${publications.error ?? 'refus'}`,
          })
          if (!ok) result.failed++
        }
      }
    } catch (err) {
      await refundCredits(userId, 1)
      result.failed++
      const reason =
        err instanceof ScrapeBlockedError ? err.message : "Import impossible depuis cette adresse"
      log.push({ titre: o.title, action: 'échec', raison: reason })
    }
  }

  await prisma.autopilotRun.create({
    data: {
      userId,
      autopilotId: settings.id,
      day,
      imported: result.imported,
      published: result.published,
      skipped: result.skipped,
      failed: result.failed,
      // Cent lignes suffisent à comprendre une nuit de travail.
      log: log.slice(0, 100) as never,
    },
  })

  return result
}
