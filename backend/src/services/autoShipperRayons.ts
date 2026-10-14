import { prisma } from '../lib/prisma.js'
import { DEPARTMENTS } from './departments.js'
import { CATEGORIES_PAR_RAYON, type ProduitRapport } from './marketReports.js'
import { generationRapports, ReportQuery } from './reportsDb.js'

/**
 * La passerelle des rapports vers l'AUTO-SHIPPER (14/10/2026).
 *
 * Chaque jour, pour chaque rayon, les agents déposent une analyse de marché et
 * une analyse marketing, et vingt produits gagnants (rapports.db, plus la base
 * du Poste). Jusqu'ici ces gagnants ne nourrissaient que les écrans : le pilote
 * ne lisait que la table Opportunity, que seul l'AUTO-MODE des chefs remplissait.
 *
 * Un « rayon boost » est un rayon confié dont l'AUTO-MODE est levé. Avant chaque
 * passage, ses gagnants du dernier jour déposé deviennent des Opportunity : au
 * plus dix par rayon. Depuis le 14/10/2026, ceux que seul un navigateur lit
 * (Temu, AliExpress, Shein…) en font partie : le pilote les fait relever par
 * l'API AliExpress ou par l'application desktop (autoShipperFile.ts).
 */

/** Au plus dix gagnants d'un rayon repris par le pilote, sur les vingt du jour. */
export const IMPORTABLES_PAR_RAYON = 10

/** Les sites dont la fiche ne se lit pas côté serveur : l'extension est requise. */
// SUPER DELIVERY n'est pas en JavaScript, mais son prix de gros n'apparaît
// qu'une fois connecté : le serveur n'y lirait qu'une fiche sans prix.
// reichelt.com sert un mur « Security Check » (503 + captcha) à tout ce qui n'est pas
// un navigateur (sondé le 19/09/2026) : le serveur n'y lira jamais une fiche.
const EXTENSION_ONLY = ['temu.', 'aliexpress.', 'joybuy.', 'shein.', 'superdelivery.', 'reichelt.']

export function needsExtension(sourceUrl: string) {
  try {
    const host = new URL(sourceUrl).hostname
    return EXTENSION_ONLY.some((s) => host.includes(s))
  } catch {
    return true
  }
}

type ProduitLu = ProduitRapport & { estProduit: boolean }

/**
 * What the pilot can import with nobody watching: a real product (agent's flag),
 * an http link, both prices, a selling price above the buying one. Pages that only
 * a browser reads are included: the API or the desktop app reads them.
 */
export function estImportable(p: ProduitLu): boolean {
  return (
    p.estProduit &&
    /^https?:\/\//.test(p.url) &&
    p.prixAchat !== null &&
    p.prixAchat > 0 &&
    p.prixVente !== null &&
    p.prixVente > p.prixAchat
  )
}

let base: ReportQuery | null = null
let generation = -1

/** Opened on first use, reopened when a new rapports.db lands; null when it cannot be read. */
function baseRapports(): ReportQuery | null {
  try {
    if (base && generation !== generationRapports()) {
      base.close()
      base = null
    }
    if (!base) {
      base = new ReportQuery()
      generation = generationRapports()
    }
    return base
  } catch (err) {
    console.error('[auto-shipper] rapports illisibles :', err instanceof Error ? err.message : err)
    return null
  }
}

export interface GagnantsRayon {
  /** Le dernier jour déposé pour ce rayon, null s'il n'en a aucun. */
  jour: string | null
  /** Les produits gagnants de ce jour (lignes que l'agent marque comme produits). */
  produits: number
  /** Ceux que le pilote importe seul, dix au plus. */
  importables: ProduitRapport[]
}

export function gagnantsDuRayon(key: string, q: ReportQuery | null = baseRapports()): GagnantsRayon {
  if (!q) return { jour: null, produits: 0, importables: [] }
  const lots = (CATEGORIES_PAR_RAYON[key] ?? []).map((c) => q.getDernierJourProduits(c))
  const jours = lots.map((l) => l.jour).filter((j): j is string => Boolean(j)).sort()
  const tous = lots.flatMap((l) => l.produits)
  const vus = new Set<string>()
  const importables = tous.filter(estImportable).filter((p) => (vus.has(p.url) ? false : (vus.add(p.url), true)))
  return {
    jour: jours.at(-1) ?? null,
    produits: tous.filter((p) => p.estProduit).length,
    importables: importables.slice(0, IMPORTABLES_PAR_RAYON),
  }
}

/** Les 24 rayons du catalogue, avec ce que leurs analyses donnent à importer. */
export function rayonsAutoShipper(q: ReportQuery | null = baseRapports()) {
  return DEPARTMENTS.map((d) => {
    const g = gagnantsDuRayon(d.key, q)
    // Ceux que seul un navigateur lit : API AliExpress, application desktop ou extension selon le vendeur.
    const navigateur = g.importables.filter((p) => p.import === 'extension' || needsExtension(p.url))
    return {
      key: d.key,
      label: d.label,
      emoji: d.emoji,
      jour: g.jour,
      produits: g.produits,
      importables: g.importables.length,
      navigateur: navigateur.map((p) => p.url),
    }
  })
}

/**
 * Turns each boost department's importable winners into NEW opportunities.
 * The (userId, sourceUrl) unique key makes it idempotent: an already imported
 * product is never offered twice.
 */
export async function semerGagnants(userId: string, q: ReportQuery | null = baseRapports()): Promise<number> {
  const rayons = await prisma.department.findMany({ where: { userId, autoMode: true } })
  let semes = 0
  for (const dep of rayons) {
    const g = gagnantsDuRayon(dep.key, q)
    if (!g.importables.length) continue
    const { count } = await prisma.opportunity.createMany({
      data: g.importables.map((p) => ({
        userId,
        departmentId: dep.id,
        source: 'rapport',
        sourceUrl: p.url,
        title: p.titre,
        image: p.image ?? null,
        sourcePrice: p.prixAchat!,
        marketPrice: p.prixVente!,
        currency: 'EUR',
        isNew: true,
        notes: p.pourquoi ? p.pourquoi.slice(0, 1000) : null,
        raw: { rapportsAgents: true, jour: g.jour, fournisseur: p.fournisseur, score: p.score ?? null, import: p.import ?? null },
      })),
      skipDuplicates: true,
    })
    semes += count
  }
  return semes
}
