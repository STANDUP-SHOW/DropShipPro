import { prisma } from '../lib/prisma.js'
import { aUneApplicationDesktop } from './desktopFile.js'
import { reserveCredits, refundCredits } from './billing.js'
import { DROPS } from './tarifs.js'
import { importerAdresse } from './productImport.js'
import { ORIGINE_AUTOSHIPPER, type ReleveNavigateur } from './autoShipperFile.js'
import { pertinent } from './synthesesCompletion.js'
import { substanceSource } from './sourceQuality.js'

/**
 * La file d'import du site, relevée par le NAVIGATEUR INTERNE du desktop quand
 * le compte en a un (max, 13/11/2026 : « il me semblait que via l'application
 * desktop, c'était le navigateur interne qui était utilisé »).
 *
 * Jusqu'ici, toute fiche que le serveur ne lit pas (Temu, AliExpress, Shein…)
 * envoyée depuis une liste de gagnants, un rapport ou un catalogue partait dans
 * la file de l'EXTENSION, même pour un vendeur qui a l'application desktop :
 * seule la file de l'AUTO-SHIPPER était relevée par le desktop. Désormais :
 *
 *  - une ligne posée pour un compte qui a une application desktop vivante est
 *    en mode `desktop` ; sans desktop, `extension` (inchangé) ;
 *  - le desktop relève toute ligne de la file qui n'est pas de l'AUTO-SHIPPER,
 *    en mode `desktop` ou `extension` (sa présence prouve qu'il tourne) ;
 *  - l'extension voit toujours toute la file et peut la relever elle-même.
 *
 * Les gagnants des synthèses (origine `synthese:<date>`, posés depuis KANTIX)
 * n'ont qu'un lien de RECHERCHE : le navigateur prend le premier résultat qui
 * porte le nom (`titre`), voir backend/extension/content/recherche.js. Ils sont
 * gratuits (acte d'administration, comme l'import par API).
 */

/**
 * A supplier SEARCH page, not a product sheet. Same rule as the browsers'
 * (backend/extension/content/recherche.js, `estRecherche`): keep both in step.
 */
export function estPageRecherche(url: string): boolean {
  try {
    const u = new URL(url)
    const h = u.hostname
    const p = u.pathname
    if (h.includes('aliexpress.')) return /wholesale/.test(p) || u.searchParams.has('SearchText')
    if (h.includes('temu.')) return /search_result/.test(p) || u.searchParams.has('search_key')
    if (h.includes('shein.')) return /^\/pdsearch\//.test(p)
    return false
  } catch {
    return false
  }
}

/** A product sheet of AliExpress, Temu or Shein, by its address (recherche.js, `estFicheAdresse`). */
export function estFicheConnue(url: string): boolean {
  try {
    const u = new URL(url)
    const h = u.hostname
    const p = u.pathname
    if (h.includes('aliexpress.')) return /\/item\/\d{6,}/.test(p)
    if (h.includes('temu.')) return /-g-\d{6,}\.html/.test(p) || /goods\.html/.test(p) || u.searchParams.has('goods_id')
    if (h.includes('shein.')) return /-p-\d{5,}/.test(p)
    return false
  } catch {
    return false
  }
}

const MOTS_VIDES = new Set([
  'avec', 'pour', 'sans', 'dans', 'des', 'les', 'une', 'aux', 'and', 'with', 'for', 'the', 'pack', 'lot', 'set', 'mini', 'pro', 'max', 'plus', 'new',
])
const motsDe = (t: string) =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((m) => m.length > 2 && !MOTS_VIDES.has(m))

/**
 * A link of AliExpress, Temu or Shein that is neither a sheet nor a search
 * (a category page, an address that leads nowhere) becomes that site's SEARCH
 * for the product's name (max, 13/11/2026: 50 refusals out of 57). Opened as
 * is, such a page shows other products and the browser rightly refuses it;
 * the search lets the browser take the first result carrying the name. Null
 * when the link is fine or no name is known. Same rule as the browsers'
 * (backend/extension/content/recherche.js, `versRecherche`): keep both in step.
 */
export function versRecherche(url: string, nom: string | null | undefined): string | null {
  const termes = motsDe(String(nom ?? ''))
  if (!termes.length) return null
  let h: string
  try {
    h = new URL(url).hostname
  } catch {
    return null
  }
  if (estPageRecherche(url) || estFicheConnue(url)) return null
  const texte = String(nom).replace(/\s+/g, ' ').trim().slice(0, 120)
  if (h.includes('aliexpress.')) return `https://fr.aliexpress.com/w/wholesale-${encodeURIComponent(termes.join('-'))}.html`
  if (h.includes('temu.')) return `https://www.temu.com/search_result.html?search_key=${encodeURIComponent(texte)}`
  if (h.includes('shein.')) return `https://fr.shein.com/pdsearch/${encodeURIComponent(texte)}/`
  return null
}

/** Origine des gagnants de synthèse posés depuis KANTIX : import gratuit. */
export const ORIGINE_SYNTHESE = 'synthese:'

export type ModeFile = 'desktop' | 'extension'

export async function modeFileNavigateur(userId: string): Promise<ModeFile> {
  return (await aUneApplicationDesktop(userId)) ? 'desktop' : 'extension'
}

export interface LigneAPoser {
  url: string
  titre?: string | null
  fournisseur?: string | null
}

/**
 * Pose des fiches à lire au navigateur dans la file du vendeur : mode `desktop`
 * s'il a l'application, sinon `extension`. Une adresse déjà en attente n'est pas
 * doublée. Pour un lien de recherche, `titre` doit être le nom exact du produit.
 */
export async function mettreEnFileImport(userId: string, produits: LigneAPoser[], origine: string | null) {
  const mode = await modeFileNavigateur(userId)
  const enAttente = await prisma.importQueue.findMany({
    where: { userId, status: { in: ['EN_ATTENTE', 'RELEVE'] } },
    select: { url: true },
  })
  const deja = new Set(enAttente.map((e) => e.url))
  const neufs: LigneAPoser[] = []
  for (const brut of produits) {
    // Une page de catégorie ou une adresse sans fiche : la recherche du nom chez le même fournisseur.
    const p = { ...brut, url: versRecherche(brut.url, brut.titre) ?? brut.url }
    if (deja.has(p.url)) continue
    deja.add(p.url)
    neufs.push(p)
  }
  if (neufs.length) {
    await prisma.importQueue.createMany({
      data: neufs.map((p) => ({
        userId,
        url: p.url,
        titre: p.titre ? p.titre.slice(0, 200) : null,
        fournisseur: p.fournisseur ? p.fournisseur.slice(0, 80) : null,
        mode,
        origine: origine ? origine.slice(0, 60) : null,
      })),
    })
  }
  return { ajoutes: neufs.length, dejaEnFile: produits.length - neufs.length, mode }
}

/** Registrable part of a host: `fr.aliexpress.com` and `www.aliexpress.com` are the same supplier. */
export function domaineDe(url: string): string {
  try {
    const parties = new URL(url).hostname.toLowerCase().split('.')
    // aliexpress.com, temu.com, shein.com… ; `co.uk` style suffixes keep three labels.
    const n = parties.length >= 3 && parties[parties.length - 2].length <= 3 && parties[parties.length - 1].length === 2 ? 3 : 2
    return parties.slice(-n).join('.')
  } catch {
    return ''
  }
}

/**
 * The page a browser read may stand for the queued line: same supplier, and for
 * a search line, a result that carries the product's name.
 */
export function releveConforme(
  ligne: { url: string; titre: string | null },
  releve: { sourceUrl: string; title: string; description?: string | null; pageText?: string | null },
): string | null {
  if (domaineDe(releve.sourceUrl) !== domaineDe(ligne.url)) return "La page relevée n'est pas chez le fournisseur de la ligne."
  if (estPageRecherche(ligne.url)) {
    if (estPageRecherche(releve.sourceUrl)) return "C'est la page de recherche qui a été relevée, pas une fiche."
    if (ligne.titre && !pertinent(ligne.titre, releve.title)) return `La fiche relevée ne porte pas le nom « ${ligne.titre.slice(0, 80)} ».`
  }
  /*
   * A sheet read before it finished loading (max, 13/11/2026: five of seven
   * listings came out un-rewritten). The rewrite would be refused for lack of
   * text anyway, yet the listing was created, its options and category read by
   * the model: API spent on an import that failed. Refused here, BEFORE any
   * drop or model call; the line can simply be run again.
   */
  if (releve.description !== undefined || releve.pageText !== undefined) {
    const substance = substanceSource({ title: releve.title, description: releve.description ?? '', pageText: releve.pageText ?? '' })
    if (!substance.assezPourEcrire) {
      return "La fiche n'avait pas fini de charger : presque aucun texte relevé. Rien n'a été importé ni facturé, aucun appel IA ; relancez la ligne."
    }
  }
  return null
}

/** A queue line of this seller that is not the AUTO-SHIPPER's (those are paid at queue time). */
export async function ligneFileSite(userId: string, ligneId: string) {
  return prisma.importQueue.findFirst({
    where: {
      id: ligneId,
      userId,
      OR: [{ origine: null }, { NOT: { origine: { startsWith: ORIGINE_AUTOSHIPPER } } }],
    },
  })
}

/** Cost of importing a line of the site's queue: free for a synthesis winner. */
export function coutLigne(origine: string | null, enLot = false): number {
  if (origine?.startsWith(ORIGINE_SYNTHESE)) return 0
  return enLot ? DROPS.importLot : DROPS.import
}

/**
 * Imports a line of the site's queue from what the desktop browser read. Same
 * pipeline and price as the extension's capture (`/api/products/capture` with a
 * `fileId`), debited now; refunded when the rewrite or the import fails.
 */
export async function importerLigneFile(
  userId: string,
  ligneId: string,
  releve: ReleveNavigateur,
): Promise<{ ok: true; productId: string } | { ok: false; erreur: string; statut: number }> {
  const ligne = await ligneFileSite(userId, ligneId)
  if (!ligne || ligne.status === 'IMPORTE') return { ok: false, erreur: 'Ligne absente ou déjà importée.', statut: 404 }
  const ecart = releveConforme(ligne, releve)
  if (ecart) {
    await prisma.importQueue.update({ where: { id: ligne.id }, data: { status: 'ECHEC', erreur: ecart.slice(0, 300) } })
    return { ok: false, erreur: ecart, statut: 422 }
  }
  const cout = coutLigne(ligne.origine)
  if (cout > 0) {
    const credit = await reserveCredits(userId, cout, "Import d'une annonce (application desktop)")
    if (!credit.ok) {
      const erreur = credit.reason ?? 'Solde de drops insuffisant.'
      await prisma.importQueue.update({ where: { id: ligne.id }, data: { status: 'ECHEC', erreur: erreur.slice(0, 300) } })
      return { ok: false, erreur, statut: 402 }
    }
  }
  try {
    const { produit, reecrit } = await importerAdresse(userId, releve.sourceUrl, {
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
    if (!reecrit && cout > 0) await refundCredits(userId, cout)
    await prisma.importQueue.update({ where: { id: ligne.id }, data: { status: 'IMPORTE', productId: produit.id, erreur: null } })
    return { ok: true, productId: produit.id }
  } catch (err) {
    console.error('file import desktop', err)
    if (cout > 0) await refundCredits(userId, cout)
    await prisma.importQueue.update({ where: { id: ligne.id }, data: { status: 'ECHEC', erreur: "Impossible d'enregistrer ce produit." } })
    return { ok: false, erreur: "Impossible d'enregistrer ce produit.", statut: 500 }
  }
}
