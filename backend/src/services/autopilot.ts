import { reparerVariantes } from './variantRepair.js'
import { prisma } from '../lib/prisma.js'
import { scrapeProduct, ScrapeBlockedError } from './scraper.js'
import { enhanceListing } from './aiEnhancer.js'
import { rapatrierImages } from './watermark.js'
import { reserveCredits, refundCredits } from './billing.js'
import { DROPS } from './tarifs.js'
import { resoudreCategorie } from './categories.js'
import { selectProductImages, PHOTOS_PAR_ANNONCE } from './imageSelect.js'
import { extractVariants } from './aiEnhancer.js'
import { supplierFields } from './suppliers.js'
import { keepaConfigure, keepaProduit } from './keepa.js'
import { semerGagnants } from './autoShipperRayons.js'
import { importerDepuisFournisseurs } from './supplierImport.js'
import {
  AUTO_PLATFORMS,
  contexteVoies,
  enFileDuJour,
  expirerFileAutoShipper,
  lectureNavigateur,
  mettreEnFileAutoShipper,
  publierAutoShipper,
  refAliExpress,
  suiteAutoShipper,
  voieDe,
  type LigneJournal,
} from './autoShipperFile.js'

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
 * — il ne publie LUI-MÊME que sur les destinations qui ont une vraie API. Sur
 *   Vinted, Leboncoin et Facebook Marketplace, il met les produits en file pour
 *   l'application desktop du vendeur (desktopFile.ts), qui publie depuis sa session
 *   quand il a activé l'agent ;
 *
 * — il s'arrête net au plafond quotidien. Un agent qui déposerait cinq cents
 *   trouvailles viderait sinon le porte-monnaie du vendeur en une nuit.
 */

export { AUTO_PLATFORMS }

export type RunLine = LigneJournal

export interface RunResult {
  imported: number
  published: number
  skipped: number
  failed: number
  /** Products handed to the desktop app or the extension; imported once they read the page. */
  enFile: number
  log: RunLine[]
}

export async function runAutopilot(userId: string): Promise<RunResult> {
  const log: RunLine[] = []
  const result: RunResult = { imported: 0, published: 0, skipped: 0, failed: 0, enFile: 0, log }

  const settings = await prisma.autopilot.findUnique({ where: { userId } })
  if (!settings || !settings.enabled) {
    log.push({ titre: '—', action: 'écarté', raison: 'Pilote automatique désactivé' })
    return result
  }

  const day = new Date().toISOString().slice(0, 10)

  // Ce que l'application desktop n'a pas relevé en 24 h est rendu avant de compter le plafond.
  await expirerFileAutoShipper(userId).catch((err) =>
    console.error('auto-shipper : file non purgée', err instanceof Error ? err.message : err),
  )

  // Ce qui a déjà été importé aujourd'hui compte dans le plafond : deux passages
  // dans la même journée ne doivent pas le doubler.
  const already = await prisma.autopilotRun.aggregate({
    where: { userId, day },
    _sum: { imported: true },
  })
  // Les produits du jour encore en file chez l'application desktop comptent aussi.
  const budget = settings.dailyLimit - (already._sum.imported ?? 0) - (await enFileDuJour(userId, day))
  if (budget <= 0) {
    log.push({ titre: '—', action: 'écarté', raison: `Plafond du jour atteint (${settings.dailyLimit})` })
    return result
  }

  // Les gagnants publics du jour des rayons sélectionnés (rapports des agents) rejoignent la liste.
  const semes = await semerGagnants(userId).catch((err) => {
    console.error('auto-shipper : gagnants des rapports non repris', err instanceof Error ? err.message : err)
    return 0
  })
  if (semes) log.push({ titre: '—', action: 'importé', raison: `${semes} produit(s) gagnant(s) des rayons sélectionnés ajouté(s) à la liste` })

  // Only the rayons the seller selected (Department.boost) feed the day (Max,
  // 23/10/2026): their public winners, plus the winners of their own chef
  // when the seller also boosts that rayon (paid AUTO-MODE or extraction).
  const selection = await prisma.department.findMany({ where: { userId, boost: true }, select: { id: true } })
  const candidates = await prisma.opportunity.findMany({
    where: { userId, status: 'NEW', departmentId: { in: selection.map((d) => d.id) } },
    orderBy: { detectedAt: 'desc' },
    // 23 rayons × 10 gagnants = 230 au plus par jour (16/10/2026) : lire au-delà, sans quoi
    // la liste tronquée plafonnerait la journée sous ce que le site annonce.
    take: 500,
  })

  // Plafond PAR RAYON : chaque chef génère dix gagnants ; le vendeur choisit
  // combien Auto-Shipper en reprend par rayon (les plus récents d'abord), avant
  // les autres filtres (marge, stock, plafond du jour).
  const parRayon = settings.produitsParRayon ?? 10
  // La facture du jour peut fixer un nombre par rayon (14/10/2026) : il prime sur le curseur.
  const detail = (settings.produitsRayons ?? {}) as Record<string, unknown>
  const cles = new Map(
    (await prisma.department.findMany({ where: { userId }, select: { id: true, key: true } })).map((d) => [d.id, d.key]),
  )
  const plafondDuRayon = (departmentId: string | null) => {
    const n = departmentId ? detail[cles.get(departmentId) ?? ''] : undefined
    return typeof n === 'number' && Number.isInteger(n) && n >= 0 ? n : parRayon
  }
  const prisParRayon = new Map<string, number>()
  const retenus = candidates.filter((o) => {
    const cle = o.departmentId ?? 'sans-rayon'
    const deja = prisParRayon.get(cle) ?? 0
    if (deja >= plafondDuRayon(o.departmentId)) return false
    prisParRayon.set(cle, deja + 1)
    return true
  })

  const voies = await contexteVoies(userId)

  // Combler un prix marché manquant avec Keepa (prix Amazon réel), quand la clé
  // est là — mais borné : un passage ne doit pas brûler tout le quota de tokens.
  const keepaActif = keepaConfigure()
  let keepaBudget = 20

  for (const o of retenus) {
    if (result.imported + result.enFile >= budget) {
      log.push({ titre: o.title, action: 'écarté', raison: 'Plafond quotidien atteint' })
      result.skipped++
      continue
    }

    const source = Number(o.sourcePrice)
    let market = o.marketPrice === null ? null : Number(o.marketPrice)

    // Pas de prix marché relevé : on tente Keepa (prix Amazon moyen 90 j) plutôt
    // que d'écarter tout de suite. On garde la valeur pour ne pas re-payer.
    if (market === null && keepaActif && keepaBudget > 0) {
      keepaBudget--
      const k = await keepaProduit(o.title)
      const ref = k?.prixMoyen90 ?? k?.prixActuel ?? null
      if (ref !== null) {
        market = ref
        await prisma.opportunity.update({ where: { id: o.id }, data: { marketPrice: ref } }).catch(() => undefined)
      }
    }

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
    /*
     * Une fiche que seul un navigateur lit (Temu, AliExpress, Shein…) n'est plus
     * écartée (14/10/2026) : API AliExpress si le vendeur l'a reliée, sinon file
     * relevée par l'application desktop, sinon file de l'extension.
     */
    const voie = voieDe(o.sourceUrl, voies, lectureNavigateur(o))
    if (voie === 'api') {
      const ref = refAliExpress(o.sourceUrl)!
      const avant = result.failed
      try {
        const r = await importerDepuisFournisseurs(userId, new Map([['aliexpress', new Map([[ref, o.sourceUrl]])]]), {
          drops: DROPS.autoShipperImport,
          motif: 'Import automatique (AUTO-SHIPPER)',
        })
        const produit = await prisma.product.findFirst({
          where: { userId, supplierId: 'aliexpress', supplierRef: ref },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        })
        if (r.importes && produit) {
          result.imported++
          const bilan = await suiteAutoShipper({ userId, productId: produit.id, opportunityId: o.id, titre: o.title, voie, jour: day, log, ecrireRun: false })
          result.published += bilan.published
          result.failed += bilan.failed
        } else if (r.deja && produit) {
          await prisma.opportunity.update({ where: { id: o.id }, data: { status: 'IMPORTED', productId: produit.id } })
          log.push({ titre: o.title, action: 'écarté', raison: 'Déjà dans vos annonces (catalogue AliExpress)' })
          result.skipped++
        } else {
          const raison = r.echecs[0]?.raison ?? 'Import AliExpress impossible'
          log.push({ titre: o.title, action: 'échec', raison: `API AliExpress : ${raison}` })
          result.failed++
          if (raison === 'Crédits épuisés.') break
        }
      } catch (err) {
        if (result.failed === avant) result.failed++
        log.push({ titre: o.title, action: 'échec', raison: `API AliExpress : ${err instanceof Error ? err.message : 'refus'}` })
      }
      continue
    }
    if (voie === 'desktop' || voie === 'extension') {
      const paye = await reserveCredits(userId, DROPS.autoShipperImport, 'Import automatique (AUTO-SHIPPER)')
      if (!paye.ok || paye.allowed !== DROPS.autoShipperImport) {
        if (paye.allowed > 0) await refundCredits(userId, paye.allowed, 'Import AUTO-SHIPPER non lancé')
        log.push({ titre: o.title, action: 'écarté', raison: paye.reason ?? 'Crédits épuisés' })
        result.skipped++
        break
      }
      try {
        await mettreEnFileAutoShipper(userId, o, voie)
        result.enFile++
        log.push({
          titre: o.title,
          action: 'en file',
          raison:
            voie === 'desktop'
              ? `Marge estimée ${margin} % — relevé par l'application desktop dès qu'elle tourne`
              : `Marge estimée ${margin} % — dans la file de l'extension Chrome (pas d'application desktop sur ce compte)`,
        })
      } catch (err) {
        await refundCredits(userId, DROPS.autoShipperImport, 'Import AUTO-SHIPPER non lancé')
        log.push({ titre: o.title, action: 'échec', raison: 'Mise en file impossible' })
        result.failed++
        console.error('auto-shipper : mise en file', err)
      }
      continue
    }

    const credit = await reserveCredits(userId, DROPS.autoShipperImport, 'Import automatique (AUTO-SHIPPER)')
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

      // L'agent de contrôle (15 drops) ne sert qu'aux fiches relevées par l'extension
      // (règle de max, 14/10/2026 : autoShipperFile.ts) ; une fiche lue ici par le
      // serveur garde le tri des photos ci-dessus, sans contrôle payé.
      const retained = chosen
      const variants = reparerVariantes(announced).variantes
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
       * quand on n'est pas sûr : moins de deux photos retenues suffit à douter
       * (le contrôle visuel payant est réservé depuis le 14/10/2026 aux fiches
       * relevées par l'extension, règle de max). L'annonce est alors importée quand même, en brouillon, avec la
       * raison écrite : le vendeur la corrige en trois secondes, ce qui vaut
       * infiniment mieux qu'une annonce publiée qu'il faudra retirer.
       */
      const photosSures = retained.length >= 2
      const raisonDoute = photosSures ? null : `photos douteuses : ${retained.length} image(s) retenue(s) sur ${chosen.length}`

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
      if (!enhanced.enhanced) await refundCredits(userId, DROPS.autoShipperImport)

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
      if (photosSures) {
        const bilan = await publierAutoShipper(userId, product.id, o.title, settings, log)
        result.published += bilan.published
        result.failed += bilan.failed
      }
    } catch (err) {
      await refundCredits(userId, DROPS.autoShipperImport)
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

export type PassageAutopilot = (userId: string) => Promise<RunResult>

/** Le même jour civil (UTC) : c'est la journée AUTO-SHIPPER qui se paie, pas la tranche. */
function memeJour(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10)
}

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
      // Une seule tournée par 24 h (17/09/2026) : relevé, acquisition,
      // publication, une fois par jour — la garde à 23 h absorbe la dérive du
      // réveil, comme les 11 h absorbaient celle de la demi-journée.
      OR: [{ lastAutoRunAt: null }, { lastAutoRunAt: { lt: new Date(Date.now() - 23 * 3600 * 1000) } }],
      ...(seulement ? { userId: { in: Array.isArray(seulement) ? seulement : [seulement] } } : {}),
    },
  })

  let dejaUnPassage = false
  for (const pilote of actifs) {
    try {
      if (dejaUnPassage && pauseMs > 0) await new Promise((r) => setTimeout(r, pauseMs))
      dejaUnPassage = true

      /*
       * La journée AUTO-SHIPPER se paie une fois par jour (17/09/2026 —
       * `DROPS.autoShipperJour`), à la première tournée du jour ; la seconde
       * tournée du même jour (douze heures plus tard) ne redemande rien. Chaque
       * produit importé et publié se paie en plus, dans `runAutopilot`.
       *
       * Le prix est fixe : `reserveCredits` sait débiter partiellement (fait pour
       * les lots), donc on vérifie `allowed === prix` et on rend un partiel —
       * piège attrapé par le banc dès la première version de la tranche.
       * Sans assez de drops, le pilote est sauté ET non marqué : il retentera à
       * la tournée suivante, quand le portefeuille aura été rechargé.
       */
      const journeeDejaPayee = pilote.lastAutoRunAt !== null && memeJour(pilote.lastAutoRunAt, new Date())
      if (!journeeDejaPayee) {
        const credit = await reserveCredits(pilote.userId, DROPS.autoShipperJour, 'Journée AUTO-SHIPPER')
        if (!credit.ok || credit.allowed !== DROPS.autoShipperJour) {
          if (credit.allowed > 0) await refundCredits(pilote.userId, credit.allowed, 'Journée AUTO-SHIPPER non lancée')
          console.error(`auto-shipper : journée non lancée pour ${pilote.userId} — ${credit.reason ?? 'drops insuffisants'}`)
          continue
        }
      }

      // Marqué servi AVANT le passage : un passage qui plante à mi-course ne
      // doit pas être rejoué (et l'utilisateur re-débité) au réveil suivant.
      await prisma.autopilot.update({ where: { id: pilote.id }, data: { lastAutoRunAt: new Date() } })

      try {
        const fait = await passage(pilote.userId)
        console.log(
          `auto-shipper : ${pilote.userId} — ${fait.imported} import(s), ${fait.published} publication(s), ${fait.skipped} écarté(s), ${fait.failed} échec(s)`,
        )
        // Une journée qui n'a rien fait n'est pas due — mais la marque reste.
        // Des produits partis vers l'application desktop : la journée attend leur issue
        // (autoShipperFile.ts la rend si aucun n'arrive).
        if (!journeeDejaPayee && fait.imported === 0 && fait.published === 0 && !fait.enFile) {
          await refundCredits(pilote.userId, DROPS.autoShipperJour, 'Journée AUTO-SHIPPER sans import')
        }
      } catch (err) {
        // En panne de passage, la journée est rendue mais la marque reste : pas de rejeu en boucle.
        if (!journeeDejaPayee) {
          await refundCredits(pilote.userId, DROPS.autoShipperJour, 'Journée AUTO-SHIPPER en panne').catch(() => undefined)
        }
        throw err
      }
    } catch (err) {
      console.error(`auto-shipper en échec pour ${pilote.userId}`, err instanceof Error ? err.message : err)
    }
  }
}
