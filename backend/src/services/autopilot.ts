import type { Platform } from '@prisma/client'
import { reparerVariantes } from './variantRepair.js'
import { prisma } from '../lib/prisma.js'
import { scrapeProduct, ScrapeBlockedError } from './scraper.js'
import { enhanceListing } from './aiEnhancer.js'
import { rapatrierImages } from './watermark.js'
import { publishToPlatform } from './publisher.js'
import { PLATFORMS } from './platforms.js'
import { reserveCredits, refundCredits } from './billing.js'
import { resoudreCategorie } from './categories.js'
import { apiBaseUrl } from '../lib/urls.js'
import { selectProductImages, PHOTOS_PAR_ANNONCE } from './imageSelect.js'
import { reviewImages, applyVerdict } from './controlAgent.js'
import { extractVariants } from './aiEnhancer.js'
import { supplierFields } from './suppliers.js'

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
        pageText: scraped.pageText,
      })
      // Cinq photos, choisies sans personne pour rattraper : le tri doit être
      // juste du premier coup, une bannière en photo principale fait refuser
      // l'annonce ou tuer la vente.
      // Douze candidats plutôt que cinq : l'agent de contrôle décide combien
      // valent la peine. Neuf s'il y a neuf bonnes photos, six s'il y en a six.
      const chosen = await selectProductImages(
        scraped.images,
        PHOTOS_PAR_ANNONCE,
        scraped.declaredImages,
        scraped.domImages,
        scraped.chromeImages,
      )
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
      const variants = reparerVariantes(verdict ? applyVerdict(announced, verdict) : announced).variantes
      const images = await rapatrierImages(retained, enhanced.title)

      /**
       * Le compromis du mode automatique, sur les photos.
       *
       * Le tri se trompe encore, et il se trompe différemment d'un site à
       * l'autre : parfois la galerie entière, parfois l'en-tête du site. En
       * mode manuel le vendeur coche et ça lui coûte trois secondes ; ici
       * personne ne rattrape, et une bannière en photo principale part sur une
       * place de marché, où elle fait refuser l'annonce ou tuer la vente.
       *
       * On ne cherche donc pas à avoir toujours raison — on refuse de publier
       * quand on n'est pas sûr. Deux conditions suffisent à douter : le
       * contrôle visuel n'a pas pu se faire, ou il ne retient pas au moins deux
       * photos. L'annonce est alors importée quand même, en brouillon, avec la
       * raison écrite : le vendeur la corrige en trois secondes, ce qui vaut
       * infiniment mieux qu'une annonce publiée qu'il faudra retirer.
       */
      const photosSures = Boolean(verdict?.checked) && retained.length >= 2
      const raisonDoute = !verdict?.checked
        ? "photos non contrôlées : à vérifier avant publication"
        : retained.length < 2
          ? `photos douteuses : ${retained.length} image(s) retenue(s) sur ${chosen.length}`
          : null

      const rangement = await resoudreCategorie({
        sourceCategory: scraped.sourceCategory,
        supplierId: supplierFields(o.sourceUrl).supplierId,
        title: scraped.title,
        pageText: scraped.pageText,
      })

      const product = await prisma.product.create({
        data: {
          userId,
          sourceUrl: o.sourceUrl,
          sourceSite: scraped.sourceSite,
          ...supplierFields(o.sourceUrl),
          sourceCategory: scraped.sourceCategory,
          categoryId: rangement.categoryId,
          title: scraped.title,
          description: scraped.description,
          aiTitle: enhanced.title,
          aiDescription: enhanced.description,
          price: scraped.price,
          sellingPrice: market ?? scraped.price * 1.5,
          currency: scraped.currency,
          images: images.length ? images : retained,
          // La marque se pose a l export : ces fichiers sont les originaux.
          imagesWatermarked: false,
          variants: variants ?? undefined,
          metaTitle: enhanced.metaTitle,
          metaDescription: enhanced.metaDescription,
          metaKeywords: enhanced.metaKeywords,
          titleVariants: enhanced.titleVariants,
          bulletPoints: enhanced.bulletPoints,
          attributes: enhanced.attributes,
          aiEnhanced: enhanced.enhanced,
          // Brouillon quand le doute subsiste : le pilote importe, il ne publie
          // pas a l aveugle.
          status: photosSures ? 'READY' : 'DRAFT',
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
      log.push({
        titre: o.title,
        action: 'importé',
        raison: photosSures
          ? `Marge estimée ${margin} %`
          : `Marge estimée ${margin} % — gardé en brouillon, ${raisonDoute}`,
      })

      // Le doute n'arrête pas l'import, il arrête la publication : l'annonce
      // attend le vendeur au lieu de partir illustrée n'importe comment.
      if (settings.autoPublish && destinations.length && photosSures) {
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

/**
 * Le prix d'une tranche de 12 h de mode automatique : il couvre
 * l'orchestration — reprise des produits gagnants, sélection, publication,
 * archivage du passage. Chaque import continue de consommer son crédit
 * d'annonce, comme partout ailleurs : cinq crédits ne couvriront jamais
 * cinquante réécritures.
 */
export const CREDITS_TRANCHE_AUTO = 5

export type PassageAutopilot = (userId: string) => Promise<RunResult>

/**
 * La tournée AUTO-SHIPPER : chaque pilote activé, au plus une fois par
 * tranche de douze heures — « il récupère chaque matin la liste des produits
 * gagnants », et chaque soir. La garde vit en base (`lastAutoRunAt`), donc
 * un redéploiement Railway ne rejoue ni ne double aucun passage.
 */
export async function tourneeAutopilot(
  passage: PassageAutopilot = runAutopilot,
  pauseMs = 5_000,
  // Restricts the sweep to these accounts. Production never passes it; benches
  // MUST — an unscoped bench sweep would run its fake passage on any real
  // enabled autopilot outside its 11-hour window and debit 5 real credits.
  seulement?: string | string[],
): Promise<void> {
  const actifs = await prisma.autopilot.findMany({
    where: {
      enabled: true,
      OR: [{ lastAutoRunAt: null }, { lastAutoRunAt: { lt: new Date(Date.now() - 11 * 3600 * 1000) } }],
      ...(seulement ? { userId: { in: Array.isArray(seulement) ? seulement : [seulement] } } : {}),
    },
  })

  let dejaUnPassage = false
  for (const pilote of actifs) {
    try {
      if (dejaUnPassage && pauseMs > 0) await new Promise((r) => setTimeout(r, pauseMs))
      dejaUnPassage = true

      // La tranche se paie d'avance ; sans crédits, rien n'est marqué servi
      // et le prochain réveil retentera — le vendeur recharge, ça repart.
      // reserveCredits sait débiter PARTIELLEMENT (fait pour les lots) ; une
      // tranche a un prix fixe : moins que le plein tarif se rend aussitôt.
      const credit = await reserveCredits(pilote.userId, CREDITS_TRANCHE_AUTO)
      if (!credit.ok || credit.allowed < CREDITS_TRANCHE_AUTO) {
        if (credit.ok && credit.allowed > 0) await refundCredits(pilote.userId, credit.allowed)
        console.error(`auto-shipper : tranche refusée pour ${pilote.userId} — ${credit.reason ?? 'crédits insuffisants'}`)
        continue
      }

      // Marqué servi AVANT le passage : un passage qui plante à mi-course ne
      // doit pas être rejoué (et l'utilisateur re-débité) au réveil suivant.
      await prisma.autopilot.update({ where: { id: pilote.id }, data: { lastAutoRunAt: new Date() } })

      const fait = await passage(pilote.userId)
      console.log(
        `auto-shipper : ${pilote.userId} — ${fait.imported} import(s), ${fait.published} publication(s), ${fait.skipped} écarté(s), ${fait.failed} échec(s)`,
      )
    } catch (err) {
      // Le passage n'a rien produit : la tranche est rendue. La marque reste,
      // le pilote retentera à la tranche suivante plutôt qu'en boucle.
      await refundCredits(pilote.userId, CREDITS_TRANCHE_AUTO).catch(() => undefined)
      console.error(`auto-shipper en échec pour ${pilote.userId}`, err instanceof Error ? err.message : err)
    }
  }
}
