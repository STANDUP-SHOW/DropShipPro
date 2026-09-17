import { Prisma, type Shop } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { absoluteUrl } from '../lib/urls.js'
import { reserveCredits, refundCredits } from './billing.js'
import { resoudre } from './themes.js'
import { BOUTIQUE_MODIFS_INCLUSES, DROPS } from './tarifs.js'
import {
  fabriquerSite,
  modifierSite,
  proposerDirections,
  SiteImpossible,
  appelAnthropic,
  verifierEnfant,
  type AppelModele,
  type CatalogueBoutique,
  type Direction,
  type Etape,
  type Verificateur,
} from './siteGenerator.js'
import { dossierDesignPour, dossierEnTexte } from './designLibrary.js'
import { couleursDuLogo, gammesDepuis, type CouleurLogo, type Gamme } from './logoCouleurs.js'

/** Ce que le vendeur a choisi à la création : la gamme tirée de son logo, les modes visiteur. */
export interface OptionsCreation {
  gamme?: { nom: string; mode: 'sombre' | 'clair'; jetons: Record<string, string> } | null
  modesVisiteur?: boolean
  /** La direction choisie parmi les trois proposées. */
  direction?: Direction | null
}

/** Trois directions artistiques pour cette boutique et ce brief. Gratuit, rien n'est écrit. */
export async function directionsPour(shop: Shop, brief: string, options: OptionsCreation = {}, outils: Outils = {}): Promise<Direction[]> {
  const catalogue = await catalogueDe(shop)
  catalogue.couleursLogo = (await couleursLogoDe(shop)).map((c) => ({ hex: c.hex, part: c.part }))
  catalogue.gamme = options.gamme ?? null
  catalogue.dossierDesign = dossierEnTexte(dossierDesignPour(brief, catalogue.categories.map((c) => c.nom)))
  return proposerDirections(brief, catalogue, outils.appeler ?? appelAnthropic)
}

/**
 * Les couleurs du logo de la boutique — celui de l'en-tête, sinon celui de
 * l'accueil, sinon celui du filigrane — lues par notre propre API (/storage ou
 * R2 : l'adresse absolue marche dans les deux cas). Rend [] sans logo.
 */
export async function couleursLogoDe(shop: Pick<Shop, 'vitrineLogoEntete' | 'vitrineLogoAccueil' | 'logo'>): Promise<CouleurLogo[]> {
  const chemin = shop.vitrineLogoEntete ?? shop.vitrineLogoAccueil ?? shop.logo
  if (!chemin) return []
  try {
    const res = await fetch(absoluteUrl(chemin))
    if (!res.ok) return []
    return await couleursDuLogo(Buffer.from(await res.arrayBuffer()))
  } catch (e) {
    console.error('[dropshop] couleurs du logo', e instanceof Error ? e.message : e)
    return []
  }
}

export async function gammesPour(shop: Shop): Promise<{ couleurs: CouleurLogo[]; gammes: Gamme[]; logo: boolean }> {
  const couleurs = await couleursLogoDe(shop)
  return { couleurs, gammes: gammesDepuis(couleurs), logo: Boolean(shop.vitrineLogoEntete ?? shop.vitrineLogoAccueil ?? shop.logo) }
}

/**
 * Les travaux DropShop : créer ou modifier la boutique d'un vendeur, avec le
 * paiement en drops et l'état visible depuis l'écran.
 *
 * **Un travail dure une à trois minutes** : trop long pour une requête HTTP
 * que le proxy de l'hébergeur ou le navigateur finirait par couper. La route
 * répond 202 tout de suite ; le travail continue ici ; l'écran relit l'état
 * toutes les quelques secondes dans `Shop.siteJob`.
 *
 * **Persisté, mais pas immortel.** L'état survit à un rechargement de la page
 * du vendeur ; pas à un redéploiement de l'API, qui tue le processus. Un
 * travail commencé il y a plus de quinze minutes sans fin est donc tenu pour
 * mort : le suivant peut démarrer, et les drops de celui-là sont rendus la
 * première fois qu'on le constate.
 *
 * **Le prix se prend avant, se rend après.** Création : 200 drops, tout ou
 * rien (`allowed === prix`, leçon de l'AUTO-SHIPPER). Modification : comprise
 * tant qu'il en reste (10 à la création), 10 drops ensuite. Tout échec —
 * modèle indisponible, page qui ne passe pas le contrôle, exception — rend ce
 * qui a été pris.
 */

export interface EtatTravail {
  type: 'creation' | 'modification'
  etape: Etape['etape'] | 'termine' | 'echec'
  tentative: number
  demande: string
  debut: string
  fin?: string
  erreur?: string
  echecs?: string[]
  resume?: string
  /** Drops pris pour ce travail, à rendre si ça tourne mal. */
  drops: number
  /** À la création : la gamme choisie et les modes visiteur. */
  options?: OptionsCreation
  /** Ce que le travail a coûté : jetons et dollars au tarif plein (admin seulement à l'écran). */
  jetons?: { entree: number; sortie: number }
  cout?: number
}

export const DELAI_TRAVAIL_MORT_MS = 15 * 60_000

const enCours = new Set<string>()

export class TravailRefuse extends Error {
  constructor(message: string, public readonly status: number) {
    super(message)
  }
}

function travailDe(shop: Pick<Shop, 'siteJob'>): EtatTravail | null {
  const j = shop.siteJob as EtatTravail | null
  return j && typeof j === 'object' && j.type ? j : null
}

/** Un travail encore ouvert, vivant ou mort. Rend les drops d'un mort au passage. */
export async function travailOuvert(shop: Pick<Shop, 'id' | 'userId' | 'siteJob'>): Promise<EtatTravail | null> {
  const j = travailDe(shop)
  if (!j || j.fin) return null
  const age = Date.now() - new Date(j.debut).getTime()
  if (age < DELAI_TRAVAIL_MORT_MS || enCours.has(shop.id)) return j
  // Mort avec le processus : on le clôt, on rend.
  const clos: EtatTravail = { ...j, etape: 'echec', fin: new Date().toISOString(), erreur: 'Le travail a été interrompu par un redémarrage du serveur. Vos drops ont été rendus.' }
  await prisma.shop.update({ where: { id: shop.id }, data: { siteJob: clos as unknown as Prisma.InputJsonValue } })
  if (j.drops > 0) await refundCredits(shop.userId, j.drops, 'Boutique DropShop : travail interrompu, drops rendus', shop.id)
  return null
}

async function poserEtat(shopId: string, etat: EtatTravail) {
  await prisma.shop.update({ where: { id: shopId }, data: { siteJob: etat as unknown as Prisma.InputJsonValue } })
}

/** Ce que le modèle reçoit du commerce. */
export async function catalogueDe(shop: Shop): Promise<CatalogueBoutique> {
  const produits = await prisma.product.findMany({
    where: { shopId: shop.id },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: { id: true, title: true, aiTitle: true, sellingPrice: true, images: true, categoryId: true },
  })
  const ids = [...new Set(produits.map((p) => p.categoryId).filter((x): x is string => Boolean(x)))]
  const categories = ids.length ? await prisma.category.findMany({ where: { id: { in: ids } }, select: { id: true, path: true } }) : []
  const chemin = new Map(categories.map((c) => [c.id, c.path]))
  const compte = new Map<string, number>()
  for (const p of produits) {
    const brut = chemin.get(p.categoryId ?? '') ?? ''
    const segments = brut.split('>').map((s) => s.trim()).filter(Boolean)
    const nom = segments.length ? segments[segments.length - 1] : 'Divers'
    compte.set(nom, (compte.get(nom) ?? 0) + 1)
  }
  const apparence = resoudre(shop)
  return {
    nom: shop.name,
    categories: [...compte].map(([nom, nombre]) => ({ nom, nombre })).sort((a, b) => b.nombre - a.nombre),
    echantillon: produits.slice(0, 8).map((p) => {
      const images = Array.isArray(p.images) ? (p.images as unknown[]).filter((i): i is string => typeof i === 'string') : []
      return {
        id: p.id,
        title: p.aiTitle || p.title,
        price: Number(p.sellingPrice ?? 0),
        image: images[0] ? absoluteUrl(images[0]) : null,
        category: chemin.get(p.categoryId ?? '') ?? null,
      }
    }),
    logoEntete: apparence.boutique.logoEntete,
    logoAccueil: apparence.boutique.logoAccueil,
    annonce: apparence.contenu.annonce,
  }
}

interface Outils {
  appeler?: AppelModele
  verifier?: Verificateur
}

/**
 * Lance la création. Rend l'état initial tout de suite ; le travail continue.
 * Lève `TravailRefuse` (402 sans drops, 409 si un travail tourne).
 */
export async function lancerCreation(shop: Shop, brief: string, outils: Outils = {}, options: OptionsCreation = {}): Promise<EtatTravail> {
  if (await travailOuvert(shop)) throw new TravailRefuse('Un travail est déjà en cours sur cette boutique.', 409)
  const prix = DROPS.boutiqueCreation
  const credit = await reserveCredits(shop.userId, prix, 'Création de boutique DropShop IA', shop.id)
  if (!credit.ok || credit.allowed !== prix) {
    if (credit.allowed > 0) await refundCredits(shop.userId, credit.allowed, 'Création de boutique : débit partiel rendu', shop.id)
    throw new TravailRefuse(credit.reason ?? `Il faut ${prix} drops pour créer une boutique.`, 402)
  }
  const etat: EtatTravail = { type: 'creation', etape: 'ecriture', tentative: 1, demande: brief, debut: new Date().toISOString(), drops: prix, options }
  await poserEtat(shop.id, etat)
  enCours.add(shop.id)
  executer(shop, etat, outils).catch((e) => console.error('[dropshop] création', e instanceof Error ? e.message : e))
  return etat
}

export async function lancerModification(shop: Shop, demande: string, outils: Outils = {}): Promise<EtatTravail> {
  if (!shop.siteHtml) throw new TravailRefuse("Cette boutique n'a pas encore été créée par l'IA.", 400)
  if (await travailOuvert(shop)) throw new TravailRefuse('Un travail est déjà en cours sur cette boutique.', 409)
  let drops = 0
  if (shop.siteModifsRestantes <= 0) {
    drops = DROPS.boutiqueModification
    const credit = await reserveCredits(shop.userId, drops, 'Modification de boutique DropShop IA', shop.id)
    if (!credit.ok || credit.allowed !== drops) {
      if (credit.allowed > 0) await refundCredits(shop.userId, credit.allowed, 'Modification de boutique : débit partiel rendu', shop.id)
      throw new TravailRefuse(credit.reason ?? `Il faut ${drops} drops pour cette modification.`, 402)
    }
  }
  const etat: EtatTravail = { type: 'modification', etape: 'ecriture', tentative: 1, demande, debut: new Date().toISOString(), drops }
  await poserEtat(shop.id, etat)
  enCours.add(shop.id)
  executer(shop, etat, outils).catch((e) => console.error('[dropshop] modification', e instanceof Error ? e.message : e))
  return etat
}

/** Le travail lui-même. Exporté pour que le banc l'attende au lieu de scruter. */
export async function executer(shop: Shop, etat: EtatTravail, outils: Outils): Promise<void> {
  const appeler = outils.appeler ?? appelAnthropic
  const verifier = outils.verifier ?? verifierEnfant
  const surEtape = (e: Etape) => {
    etat.etape = e.etape
    etat.tentative = e.tentative
    poserEtat(shop.id, etat).catch(() => undefined)
  }
  try {
    if (etat.type === 'creation') {
      const catalogue = await catalogueDe(shop)
      // Le dossier de design (bibliothèque), les couleurs du logo, la gamme
      // choisie et les modes : tout ce que le modèle doit savoir avant d'écrire.
      catalogue.couleursLogo = (await couleursLogoDe(shop)).map((c) => ({ hex: c.hex, part: c.part }))
      catalogue.gamme = etat.options?.gamme ?? null
      catalogue.modesVisiteur = Boolean(etat.options?.modesVisiteur)
      catalogue.direction = etat.options?.direction ?? null
      catalogue.dossierDesign = dossierEnTexte(dossierDesignPour(etat.demande, catalogue.categories.map((c) => c.nom)))
      const fait = await fabriquerSite(etat.demande, catalogue, appeler, verifier, surEtape)
      await publierVersion(shop.id, fait.html, etat.demande, fait.modele, { brief: etat.demande, modifsRestantes: BOUTIQUE_MODIFS_INCLUSES })
      console.log(`[dropshop] boutique ${shop.id} créée : ${fait.tentatives} passage(s), ${fait.jetons.entree}+${fait.jetons.sortie} jetons, ${fait.cout.toFixed(3)} $`)
      etat.resume = fait.avertissements.length ? `Boutique créée. À surveiller : ${fait.avertissements.join(' ')}` : 'Boutique créée.'
      etat.jetons = fait.jetons
      etat.cout = Math.round(fait.cout * 1000) / 1000
    } else {
      const actuel = await prisma.shop.findUnique({ where: { id: shop.id }, select: { siteHtml: true, siteModifsRestantes: true } })
      if (!actuel?.siteHtml) throw new SiteImpossible('La boutique a disparu pendant le travail.')
      // Ce que la page a déjà (modes visiteur, logo) doit survivre à la modification.
      const options = { modesVisiteur: /data-mode=/.test(actuel.siteHtml), logo: Boolean(shop.vitrineLogoEntete) }
      const fait = await modifierSite(actuel.siteHtml, etat.demande, appeler, verifier, surEtape, options)
      await publierVersion(shop.id, fait.html, etat.demande, fait.modele, etat.drops === 0 ? { modifsRestantes: Math.max(0, actuel.siteModifsRestantes - 1) } : {})
      console.log(`[dropshop] boutique ${shop.id} modifiée : ${fait.jetons.entree}+${fait.jetons.sortie} jetons, ${fait.cout.toFixed(3)} $`)
      etat.resume = fait.resume || 'Modification appliquée.'
      etat.jetons = fait.jetons
      etat.cout = Math.round(fait.cout * 1000) / 1000
    }
    etat.etape = 'termine'
    etat.fin = new Date().toISOString()
    await poserEtat(shop.id, etat)
  } catch (e) {
    etat.etape = 'echec'
    etat.fin = new Date().toISOString()
    etat.erreur = e instanceof SiteImpossible ? e.message : "Le service d'écriture n'a pas répondu. Vos drops ont été rendus."
    if (e instanceof SiteImpossible && e.echecs.length) etat.echecs = e.echecs.slice(0, 12)
    if (!(e instanceof SiteImpossible)) console.error('[dropshop] travail', e instanceof Error ? e.message : e)
    if (etat.drops > 0) {
      await refundCredits(shop.userId, etat.drops, etat.type === 'creation' ? 'Création de boutique échouée, drops rendus' : 'Modification de boutique échouée, drops rendus', shop.id)
      etat.erreur += etat.erreur.includes('rendus') ? '' : ' Vos drops ont été rendus.'
    }
    await poserEtat(shop.id, etat)
  } finally {
    enCours.delete(shop.id)
  }
}

async function publierVersion(
  shopId: string,
  html: string,
  demande: string,
  modeleUtilise: string,
  extra: { brief?: string; modifsRestantes?: number },
) {
  await prisma.$transaction(async (tx) => {
    const s = await tx.shop.findUniqueOrThrow({ where: { id: shopId }, select: { siteVersion: true } })
    const numero = s.siteVersion + 1
    await tx.siteVersion.create({ data: { shopId, numero, html, demande, modele: modeleUtilise } })
    await tx.shop.update({
      where: { id: shopId },
      data: {
        siteHtml: html,
        siteVersion: numero,
        ...(extra.brief !== undefined ? { siteBrief: extra.brief } : {}),
        ...(extra.modifsRestantes !== undefined ? { siteModifsRestantes: extra.modifsRestantes } : {}),
      },
    })
  })
}

/**
 * Reprend les travaux que le dernier redémarrage a tués.
 *
 * Railway redémarre l'API à chaque envoi de code, et un travail vit dans le
 * processus : le 17/09/2026, la création d'iagent.agency a démarré pendant
 * un redéploiement et est restée « en écriture » un quart d'heure, avant
 * d'être déclarée morte et rendue — pendant que Max regardait l'ancienne
 * vitrine à la place de sa boutique. Au démarrage, tout travail ouvert (sans
 * `fin`) repart donc du début : les drops ont déjà été pris, rien n'est
 * redébité, et le vendeur voit son avancement continuer.
 */
export async function reprendreTravauxOrphelins(outils: Outils = {}): Promise<number> {
  const shops = await prisma.shop.findMany({ where: { siteJob: { not: Prisma.DbNull } } })
  let repris = 0
  for (const shop of shops) {
    const etat = travailDe(shop)
    if (!etat || etat.fin || enCours.has(shop.id)) continue
    etat.etape = 'ecriture'
    etat.tentative = 1
    etat.debut = new Date().toISOString()
    etat.resume = 'Repris après un redémarrage du serveur.'
    await poserEtat(shop.id, etat)
    enCours.add(shop.id)
    repris++
    console.log(`[dropshop] reprise du travail ${etat.type} de la boutique ${shop.id} après redémarrage`)
    executer(shop, etat, outils).catch((e) => console.error('[dropshop] reprise', e instanceof Error ? e.message : e))
  }
  return repris
}

/** Remet en service une version passée, telle quelle. Gratuit : rien n'est écrit par le modèle. */
export async function restaurerVersion(shop: Shop, numero: number): Promise<number> {
  if (await travailOuvert(shop)) throw new TravailRefuse('Un travail est en cours sur cette boutique.', 409)
  const v = await prisma.siteVersion.findUnique({ where: { shopId_numero: { shopId: shop.id, numero } } })
  if (!v) throw new TravailRefuse('Cette version n\'existe pas.', 404)
  await publierVersion(shop.id, v.html, `Retour à la version ${numero}`, v.modele, {})
  return shop.siteVersion + 1
}
