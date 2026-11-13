import { prisma } from '../lib/prisma.js'
import { CONNECTEURS } from './supplierConnectors.js'
import { SupplierError, type SupplierConnector, type SupplierListing } from './supplierTypes.js'
import { enhanceListing } from './aiEnhancer.js'
import { rapatrierImages } from './watermark.js'
import { PHOTOS_PAR_ANNONCE } from './photoLimits.js'
import { resoudreCategorie } from './categories.js'
import { reparerVariantes } from './variantRepair.js'
import type { ProduitSynthese } from './synthesesQuotidiennes.js'

/**
 * Completing the winners imported from a daily synthesis (Max, 13/11/2026:
 * « 25 produits, dont uniquement le titre et le tarif sont présents. Aucune
 * image, aucune description »).
 *
 * The synthesis gives a product NAME and search pages, never a product page:
 * nothing in the file can fill a photo or a description. What can is the
 * account's own supplier API (AliExpress, CJ): search the name, keep a result
 * whose title really shares the name's words, and fill the bare draft in place
 * from that supplier sheet — photos rehosted, description rewritten, exactly
 * like a supplier import. Nothing is invented: no match, no fill, and the
 * listing stays « à compléter » with the reason recorded.
 *
 * Runs in the background: 25 searches + sheets + rewrites take minutes, longer
 * than the HTTP call from Kantix may wait.
 */

const MOTS_VIDES = new Set([
  'avec', 'pour', 'sans', 'dans', 'des', 'les', 'une', 'aux', 'and', 'with', 'for', 'the', 'pack', 'lot', 'set', 'mini', 'pro', 'max', 'plus', 'new',
])

function mots(t: string): string[] {
  return t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((m) => m.length > 2 && !MOTS_VIDES.has(m))
}

/**
 * A result is kept only when it shares enough of the winner's words: a
 * relevance search always returns twenty lines, and the first one is not
 * always the product (16/09: « mini pc » sorted by orders gave a weather
 * station). At least half of the name's significant words, and at least one.
 */
export function pertinent(nom: string, titre: string): boolean {
  const attendus = [...new Set(mots(nom))]
  if (!attendus.length) return false
  const trouves = new Set(mots(titre))
  // Plural / singular: « ecouteurs » matches « ecouteur ».
  const present = (m: string) => trouves.has(m) || trouves.has(m.replace(/s$/, '')) || trouves.has(`${m}s`)
  const communs = attendus.filter(present).length
  return communs >= 1 && communs >= Math.ceil(attendus.length / 2)
}

export function meilleurResultat(nom: string, lignes: SupplierListing[]): SupplierListing | null {
  return lignes.find((l) => l.ref && pertinent(nom, l.titre)) ?? null
}

/** The account's supplier links able to search AND read a sheet, AliExpress first. */
export async function fournisseursCherchables(userId: string) {
  const liaisons = await prisma.supplierConnection.findMany({ where: { userId, connected: true } })
  const ordre = ['aliexpress', 'cjdropshipping']
  const rang = (id: string) => (ordre.includes(id) ? ordre.indexOf(id) : 99)
  return liaisons
    .map((l) => ({ liaison: l, connecteur: CONNECTEURS.find((c) => c.id === l.supplier) as SupplierConnector | undefined }))
    .filter((x): x is { liaison: typeof x.liaison; connecteur: SupplierConnector } => !!x.connecteur?.searchProducts && !!x.connecteur?.fetchProduct)
    .sort((a, b) => rang(a.connecteur.id) - rang(b.connecteur.id))
}

export interface Tache {
  /** A bare draft left by the first version of this import (13/11), filled in place. Absent: the listing is created complete. */
  productId?: string
  produit: ProduitSynthese
}

export interface EtatCompletion {
  compte: string
  debut: string
  fin: string | null
  total: number
  completes: number
  sansResultat: number
  echecs: Array<{ titre: string; raison: string }>
}

/** Last run per account, read by Kantix (GET /syntheses-completion). Memory only: a redeploy forgets it, the listings stay. */
const etats = new Map<string, EtatCompletion>()
export const etatCompletion = (email: string) => etats.get(email) ?? null

async function completerUne(userId: string, t: Tache, fournisseurs: Awaited<ReturnType<typeof fournisseursCherchables>>): Promise<'complete' | 'sansResultat' | string> {
  let derniereErreur = ''
  for (const { liaison, connecteur } of fournisseurs) {
    const creds = (liaison.data ?? {}) as Record<string, string>
    const contexte = {
      async saveCredentials(patch: Record<string, string>) {
        await prisma.supplierConnection.update({ where: { id: liaison.id }, data: { data: { ...creds, ...patch } } })
      },
    }
    try {
      const lignes = await connecteur.searchProducts!(t.produit.nom, creds, contexte)
      const choix = meilleurResultat(t.produit.nom, lignes)
      if (!choix) continue
      const deja = await prisma.product.findFirst({ where: { userId, supplierId: connecteur.id, supplierRef: choix.ref }, select: { id: true } })
      if (deja) return 'déjà sur le compte (même fiche fournisseur)'
      const fiche = await connecteur.fetchProduct!(choix.ref, creds, contexte)
      if (!fiche.images.length && !fiche.description.trim()) continue

      const enrichi = await enhanceListing({ title: fiche.title, description: fiche.description, category: fiche.category, pageText: fiche.pageText })
      const photos = await rapatrierImages(fiche.images.slice(0, PHOTOS_PAR_ANNONCE), enrichi.title)
      const rangement = await resoudreCategorie({
        sourceCategory: fiche.category,
        supplierCategoryId: fiche.category,
        supplierId: connecteur.id,
        title: fiche.title,
        pageText: fiche.pageText,
      })
      // The synthesis' target price stays the selling price when it is above the real buying price.
      const vente = t.produit.prixVente && t.produit.prixVente > fiche.price ? t.produit.prixVente : fiche.price * 1.5

      const data = {
        sourceUrl: choix.url || t.produit.liens.aliexpress_import || t.produit.liens.aliexpress_fr || '',
        sourceSite: connecteur.id,
        supplierId: connecteur.id,
        supplierRef: choix.ref,
        supplierPrice: fiche.price || undefined,
        supplierCheckedAt: new Date(),
        sourceCategory: fiche.category ?? undefined,
        categoryId: rangement.categoryId,
        description: fiche.description,
        aiTitle: enrichi.title,
        aiDescription: enrichi.description,
        titleVariants: enrichi.titleVariants ?? undefined,
        price: fiche.price,
        sellingPrice: Math.round(vente * 100) / 100,
        currency: fiche.currency,
        images: photos.length ? photos : fiche.images,
        imagesWatermarked: false,
        variants: reparerVariantes(fiche.variants).variantes,
        metaTitle: enrichi.metaTitle,
        metaDescription: enrichi.metaDescription,
        metaKeywords: enrichi.metaKeywords,
        bulletPoints: enrichi.bulletPoints?.length ? enrichi.bulletPoints : undefined,
        attributes: Object.keys(enrichi.attributes ?? {}).length ? enrichi.attributes : undefined,
      }
      if (!t.productId) {
        // Never created before it is complete: no bare listing, ever (Max, 13/11).
        await prisma.product.create({ data: { userId, title: fiche.title, status: 'DRAFT', ...data } })
        return 'complete'
      }
      // Still a bare draft? The seller may have edited or deleted it meanwhile.
      const { count } = await prisma.product.updateMany({ where: { id: t.productId, userId, supplierRef: null }, data })
      return count ? 'complete' : 'annonce modifiée ou supprimée entre-temps'
    } catch (err) {
      derniereErreur = err instanceof SupplierError ? `${connecteur.label} : ${err.message}` : `${connecteur.label} : ${err instanceof Error ? err.message : String(err)}`
    }
  }
  return derniereErreur || 'sansResultat'
}

/** Fills the bare drafts one after the other, in the background. Free: an admin act, like the import. */
export function lancerCompletion(userId: string, email: string, taches: Tache[], fournisseurs: Awaited<ReturnType<typeof fournisseursCherchables>>) {
  const etat: EtatCompletion = { compte: email, debut: new Date().toISOString(), fin: null, total: taches.length, completes: 0, sansResultat: 0, echecs: [] }
  etats.set(email.toLowerCase(), etat)
  void (async () => {
    for (const t of taches) {
      try {
        const r = await completerUne(userId, t, fournisseurs)
        if (r === 'complete') etat.completes++
        else if (r === 'sansResultat') etat.sansResultat++
        else etat.echecs.push({ titre: t.produit.nom, raison: r })
      } catch (err) {
        etat.echecs.push({ titre: t.produit.nom, raison: err instanceof Error ? err.message : String(err) })
      }
    }
    etat.fin = new Date().toISOString()
    console.log(`complétion des gagnants de synthèse (${email}) : ${etat.completes}/${etat.total} complétés, ${etat.sansResultat} sans résultat, ${etat.echecs.length} échecs`)
  })()
  return etat
}
