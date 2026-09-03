import { prisma } from '../lib/prisma.js'
import { PLATFORMS } from './platforms.js'
import type { Order, Platform } from '@prisma/client'

/**
 * Le tableau de bord statistiques — quatorze blocs, neuf tuiles chacun.
 *
 * **Le plan vient du vendeur, le 03/09/2026**, avec sa maquette : l'accueil
 * devient un tableau de bord complet qui empile les statistiques de chaque
 * partie du menu, et chaque partie ouvre sur les siennes.
 *
 * **La règle qui prime sur toutes les autres ici : aucun chiffre inventé.**
 * Une maquette montre « conversion 2,6 % » ; nous ne mesurons pas le trafic,
 * donc aucune conversion n'est calculable. La tuile rend alors `valeur: null`
 * avec sa `raison` — l'écran l'affiche en retrait, et le vendeur sait pourquoi.
 * Un tableau de bord qui invente est pire qu'un tableau vide : c'est sur ces
 * chiffres qu'un vendeur décide où mettre son argent.
 *
 * Tout se calcule en mémoire à partir de quelques lectures : à l'échelle d'un
 * compte (quelques centaines de produits, quelques centaines de commandes),
 * charger puis compter coûte moins cher que quatorze fois neuf requêtes
 * d'agrégation — et le code se relit.
 */

export interface Tuile {
  id: string
  label: string
  /** `null` = pas calculable aujourd'hui ; la raison le dit. */
  valeur: number | string | null
  unite?: string
  /** Évolution contre la période précédente de même durée, en %. */
  evolution?: number | null
  /** La petite courbe : une valeur par jour de la période. */
  serie?: number[]
  raison?: string
}

export interface Bloc {
  id: string
  numero: string
  titre: string
  tuiles: Tuile[]
}

const arrondi = (n: number, d = 0) => {
  const p = 10 ** d
  return Math.round(n * p) / p
}

/** L'évolution en %, ou `null` quand la période précédente était vide. */
function evolution(actuel: number, precedent: number): number | null {
  if (!Number.isFinite(actuel) || !Number.isFinite(precedent) || precedent === 0) return null
  return arrondi(((actuel - precedent) / precedent) * 100, 1)
}

/** Une valeur par jour, pour la courbe des tuiles. */
function serieParJour(dates: Array<{ quand: Date; valeur: number }>, du: Date, au: Date): number[] {
  const jourMs = 24 * 60 * 60 * 1000
  const jours = Math.max(1, Math.min(90, Math.ceil((au.getTime() - du.getTime()) / jourMs)))
  const serie = new Array(jours).fill(0)
  for (const { quand, valeur } of dates) {
    const i = Math.floor((quand.getTime() - du.getTime()) / jourMs)
    if (i >= 0 && i < jours) serie[i] += valeur
  }
  return serie.map((v) => arrondi(v, 2))
}

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v))

/** Le libellé d'une plateforme, sans redéclarer la table. */
function libelle(p: Platform): string {
  return PLATFORMS.find((x) => x.id === p)?.label ?? p
}

/** Le coût fournisseur d'une commande : le réel s'il est connu, sinon l'estimé. */
function coutFournisseur(o: Order, produits: Map<string, { prix: number; port: number }>): number {
  if (o.supplierOrderCost !== null && o.supplierOrderCost !== undefined) return num(o.supplierOrderCost)
  const p = produits.get(o.productId)
  return p ? p.prix + p.port : 0
}

export async function tableauDeBord(userId: string, du: Date, au: Date): Promise<Bloc[]> {
  const duree = au.getTime() - du.getTime()
  const duPrecedent = new Date(du.getTime() - duree)

  /*
   * Tout est chargé d'un coup, borné à ce compte.
   *
   * Les commandes des deux périodes servent aux évolutions ; produits,
   * publications, tickets et conversations sont pris en entier parce que
   * plusieurs tuiles comptent des états (« sans vente », « en rupture ») qui
   * ne dépendent pas de la période.
   */
  const [commandes, commandesAvant, produits, publications, tickets, conversations, messages, images, user, opportunites, categories] =
    await Promise.all([
      prisma.order.findMany({ where: { userId, createdAt: { gte: du, lte: au } } }),
      prisma.order.findMany({ where: { userId, createdAt: { gte: duPrecedent, lt: du } } }),
      prisma.product.findMany({
        where: { userId },
        select: {
          id: true,
          createdAt: true,
          status: true,
          sourceSite: true,
          categoryId: true,
          aiEnhanced: true,
          supplierStock: true,
          variants: true,
          combinations: true,
          price: true,
          shippingCost: true,
          sellingPrice: true,
          marketAnalysedAt: true,
          videoUrl: true,
        },
      }),
      prisma.publication.findMany({
        where: { product: { userId } },
        select: { platform: true, status: true, productId: true, publishedAt: true },
      }),
      prisma.ticket.findMany({
        select: { userId: true, kind: true, status: true, createdAt: true, updatedAt: true, refundedCredits: true, creditKind: true },
        where: { userId },
      }),
      prisma.conversation.findMany({
        where: { userId },
        select: { id: true, platform: true, status: true, unread: true, subject: true, createdAt: true },
      }),
      prisma.customerMessage.findMany({
        where: { conversation: { userId } },
        select: { conversationId: true, direction: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.generatedImage.findMany({ where: { userId }, select: { kind: true, createdAt: true } }),
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { credits: true, imageCredits: true, plan: true, autoOrder: true, controlAgent: true },
      }),
      prisma.opportunity.count({ where: { userId } }),
      prisma.category.findMany({ select: { id: true, path: true } }),
    ])

  const coutDe = new Map(produits.map((p) => [p.id, { prix: num(p.price), port: num(p.shippingCost) }]))
  const rayonDe = new Map(categories.map((c) => [c.id, c.path.split('>')[0].trim()]))
  const produitParId = new Map(produits.map((p) => [p.id, p]))

  // --- Les agrégats que plusieurs blocs partagent ---------------------------
  const ca = commandes.reduce((s, o) => s + num(o.amount), 0)
  const caAvant = commandesAvant.reduce((s, o) => s + num(o.amount), 0)
  const couts = commandes.reduce((s, o) => s + coutFournisseur(o, coutDe), 0)
  const marge = ca - couts
  const clients = new Set(commandes.map((o) => o.buyerEmail || o.buyerName)).size
  const publiees = publications.filter((p) => p.status === 'PUBLISHED')
  const produitsVendus = new Set(commandes.map((o) => o.productId))
  const serieCa = serieParJour(commandes.map((o) => ({ quand: o.createdAt, valeur: num(o.amount) })), du, au)
  const serieCommandes = serieParJour(commandes.map((o) => ({ quand: o.createdAt, valeur: 1 })), du, au)

  const parPlateforme = new Map<Platform, { ca: number; commandes: number; marge: number }>()
  for (const o of commandes) {
    const ligne = parPlateforme.get(o.platform) ?? { ca: 0, commandes: 0, marge: 0 }
    ligne.ca += num(o.amount)
    ligne.commandes += 1
    ligne.marge += num(o.amount) - coutFournisseur(o, coutDe)
    parPlateforme.set(o.platform, ligne)
  }
  const meilleurePlateforme = [...parPlateforme.entries()].sort((a, b) => b[1].ca - a[1].ca)[0]

  const pasEncore = (raison: string): Pick<Tuile, 'valeur' | 'raison'> => ({ valeur: null, raison })

  const blocs: Bloc[] = []

  // --- 01 · Vue générale ----------------------------------------------------
  {
    /*
     * L'activité globale sur cent : un composite documenté, pas un mystère.
     * Un quart pour le catalogue publié, un quart pour les commandes traitées,
     * un quart pour le SAV à jour, un quart pour la fraîcheur des imports.
     */
    const partPubliee = produits.length ? new Set(publiees.map((p) => p.productId)).size / produits.length : 0
    const commandesTraitees = commandes.length
      ? commandes.filter((o) => o.status !== 'NEW').length / commandes.length
      : 1
    const savAJour = tickets.length ? tickets.filter((t) => t.status === 'RESOLU' || t.status === 'REFUSE').length / tickets.length : 1
    const importRecent = produits.some((p) => p.createdAt >= new Date(au.getTime() - 7 * 86400000)) ? 1 : 0
    const activite = Math.round((partPubliee + commandesTraitees + savAJour + importRecent) * 25)

    blocs.push({
      id: 'vue-generale',
      numero: '01',
      titre: 'Vue générale',
      tuiles: [
        { id: 'ca', label: 'CA total', valeur: arrondi(ca, 2), unite: '€', evolution: evolution(ca, caAvant), serie: serieCa },
        { id: 'commandes', label: 'Commandes', valeur: commandes.length, evolution: evolution(commandes.length, commandesAvant.length), serie: serieCommandes },
        { id: 'marge', label: 'Marge nette', valeur: ca ? arrondi((marge / ca) * 100, 1) : null, unite: '%', ...(ca ? {} : pasEncore('Aucune vente sur la période.')) },
        { id: 'benefice', label: 'Bénéfice net', valeur: arrondi(marge, 2), unite: '€' },
        { id: 'panier', label: 'Panier moyen', valeur: commandes.length ? arrondi(ca / commandes.length, 2) : null, unite: '€', ...(commandes.length ? {} : pasEncore('Aucune vente sur la période.')) },
        { id: 'clients', label: 'Clients', valeur: clients },
        { id: 'produits-vendus', label: 'Produits vendus', valeur: produitsVendus.size },
        { id: 'evolution', label: 'Évolution CA', valeur: evolution(ca, caAvant), unite: '%', ...(caAvant ? {} : pasEncore('Pas de période précédente à comparer.')) },
        { id: 'activite', label: 'Activité globale', valeur: activite, unite: '/100' },
      ],
    })
  }

  // --- 02 · Acquisition produits -------------------------------------------
  {
    const acquis = produits.filter((p) => p.createdAt >= du && p.createdAt <= au)
    const acquisAvant = produits.filter((p) => p.createdAt >= duPrecedent && p.createdAt < du)
    const idsPublies = new Set(publiees.map((p) => p.productId))
    const publiables = produits.filter((p) => p.status === 'READY' || (p.aiEnhanced && p.categoryId))

    // Du premier import à la première vente, en jours.
    const delais: number[] = []
    for (const id of produitsVendus) {
      const produit = produitParId.get(id)
      const premiere = commandes.filter((o) => o.productId === id).sort((a, b) => +a.createdAt - +b.createdAt)[0]
      if (produit && premiere) delais.push((+premiere.createdAt - +produit.createdAt) / 86400000)
    }

    blocs.push({
      id: 'acquisition',
      numero: '02',
      titre: 'Acquisition produits',
      tuiles: [
        { id: 'acquis', label: 'Produits acquis', valeur: acquis.length, evolution: evolution(acquis.length, acquisAvant.length), serie: serieParJour(acquis.map((p) => ({ quand: p.createdAt, valeur: 1 })), du, au) },
        { id: 'nouveaux', label: 'Nouveaux (7 jours)', valeur: produits.filter((p) => +p.createdAt >= au.getTime() - 7 * 86400000).length },
        { id: 'publiables', label: 'Produits publiables', valeur: publiables.length },
        { id: 'publies', label: 'Produits publiés', valeur: idsPublies.size },
        { id: 'sources', label: 'Fournisseurs sources', valeur: new Set(produits.map((p) => p.sourceSite).filter(Boolean)).size },
        { id: 'categories', label: 'Catégories', valeur: new Set(produits.map((p) => p.categoryId).filter(Boolean)).size },
        { id: 'evolution', label: 'Évolution acquisition', valeur: evolution(acquis.length, acquisAvant.length), unite: '%', ...(acquisAvant.length ? {} : pasEncore('Pas de période précédente à comparer.')) },
        { id: 'potentiel', label: 'Produits analysés', valeur: produits.filter((p) => p.marketAnalysedAt).length },
        { id: 'delai', label: 'Délai acquisition → vente', valeur: delais.length ? arrondi(delais.reduce((a, b) => a + b, 0) / delais.length, 1) : null, unite: 'j', ...(delais.length ? {} : pasEncore('Aucun produit importé puis vendu sur la période.')) },
      ],
    })
  }

  // --- 03 · Fournisseurs (sourcing) ----------------------------------------
  {
    const cmdFournisseur = commandes.filter((o) => o.supplierOrderedAt)
    const achats = cmdFournisseur.reduce((s, o) => s + num(o.supplierOrderCost), 0)
    const parSource = new Map<string, { produits: number; ca: number; marge: number }>()
    for (const p of produits) {
      if (!p.sourceSite) continue
      const l = parSource.get(p.sourceSite) ?? { produits: 0, ca: 0, marge: 0 }
      l.produits += 1
      parSource.set(p.sourceSite, l)
    }
    for (const o of commandes) {
      const site = produitParId.get(o.productId)?.sourceSite
      if (!site) continue
      const l = parSource.get(site) ?? { produits: 0, ca: 0, marge: 0 }
      l.ca += num(o.amount)
      l.marge += num(o.amount) - coutFournisseur(o, coutDe)
      parSource.set(site, l)
    }
    const meilleur = [...parSource.entries()].sort((a, b) => b[1].ca - a[1].ca)[0]
    const rentable = [...parSource.entries()].sort((a, b) => b[1].marge - a[1].marge)[0]
    const retards = commandes.filter(
      (o) => o.supplierOrderedAt && o.status !== 'DELIVERED' && o.status !== 'REFUNDED' && +o.supplierOrderedAt < Date.now() - 10 * 86400000,
    )

    blocs.push({
      id: 'fournisseurs',
      numero: '03',
      titre: 'Fournisseurs',
      tuiles: [
        { id: 'actifs', label: 'Fournisseurs actifs', valeur: parSource.size },
        { id: 'commandes', label: 'Commandes fournisseur', valeur: cmdFournisseur.length },
        { id: 'en-cours', label: 'En cours', valeur: cmdFournisseur.filter((o) => o.status === 'ORDERED_FROM_SUPPLIER' || o.status === 'SHIPPED').length },
        { id: 'terminees', label: 'Terminées', valeur: cmdFournisseur.filter((o) => o.status === 'DELIVERED').length },
        { id: 'achats', label: 'Montant achats', valeur: arrondi(achats, 2), unite: '€' },
        { id: 'meilleur', label: 'Meilleur fournisseur', valeur: meilleur?.[0] ?? null, ...(meilleur ? {} : pasEncore('Aucune vente reliée à un fournisseur.')) },
        { id: 'rentable', label: 'Le plus rentable', valeur: rentable?.[0] ?? null, ...(rentable ? {} : pasEncore('Aucune vente reliée à un fournisseur.')) },
        { id: 'retards', label: 'Retards (10 j+)', valeur: retards.length },
        { id: 'sav', label: 'SAV fournisseurs', valeur: tickets.filter((t) => t.kind === 'import').length },
      ],
    })
  }

  // --- 04 · Catalogue / produits / stocks ----------------------------------
  {
    const nbVariantes = produits.reduce((s, p) => {
      const combos = Array.isArray(p.combinations) ? p.combinations.length : 0
      if (combos) return s + combos
      const v = p.variants && typeof p.variants === 'object' && !Array.isArray(p.variants) ? Object.values(p.variants as Record<string, unknown>) : []
      return s + v.reduce((a: number, liste) => a + (Array.isArray(liste) ? liste.length : 0), 0)
    }, 0)
    const stockConnu = produits.filter((p) => p.supplierStock !== null)
    const sansVente = produits.filter((p) => !produitsVendus.has(p.id))

    blocs.push({
      id: 'catalogue',
      numero: '04',
      titre: 'Catalogue, produits et stocks',
      tuiles: [
        { id: 'actifs', label: 'Produits actifs', valeur: produits.filter((p) => p.status !== 'ARCHIVED').length },
        { id: 'annonces', label: 'Annonces diffusées', valeur: publiees.length },
        { id: 'variantes', label: 'Variantes', valeur: nbVariantes },
        { id: 'stock', label: 'Stock fournisseur connu', valeur: stockConnu.length ? stockConnu.reduce((s, p) => s + (p.supplierStock ?? 0), 0) : null, ...(stockConnu.length ? {} : pasEncore('Le stock ne se relève que sur les fournisseurs reliés par API.')) },
        { id: 'valeur-stock', label: 'Valeur du stock', ...pasEncore('Sans stock propre — c’est le principe du dropshipping — il n’y a rien à valoriser.') },
        { id: 'ruptures', label: 'Ruptures fournisseur', valeur: stockConnu.filter((p) => p.supplierStock === 0).length },
        { id: 'stock-faible', label: 'Stock faible (< 5)', valeur: stockConnu.filter((p) => (p.supplierStock ?? 0) > 0 && (p.supplierStock ?? 0) < 5).length },
        { id: 'rotation', label: 'Rotation (30 j)', valeur: produits.length ? arrondi((produitsVendus.size / produits.length) * 100, 1) : null, unite: '%', ...(produits.length ? {} : pasEncore('Catalogue vide.')) },
        { id: 'sans-vente', label: 'Produits sans vente', valeur: sansVente.length },
      ],
    })
  }

  // --- 05 · Marketplaces ----------------------------------------------------
  {
    const actives = new Set(publiees.map((p) => p.platform))
    const sansVenteMk = [...actives].filter((m) => !parPlateforme.has(m))
    blocs.push({
      id: 'marketplaces',
      numero: '05',
      titre: 'Marketplaces',
      tuiles: [
        { id: 'actives', label: 'Marketplaces actives', valeur: actives.size },
        { id: 'annonces', label: 'Annonces diffusées', valeur: publiees.length },
        { id: 'ca', label: 'CA marketplaces', valeur: arrondi(ca, 2), unite: '€', evolution: evolution(ca, caAvant) },
        { id: 'commandes', label: 'Commandes', valeur: commandes.length },
        { id: 'marge', label: 'Marge', valeur: ca ? arrondi((marge / ca) * 100, 1) : null, unite: '%', ...(ca ? {} : pasEncore('Aucune vente sur la période.')) },
        { id: 'meilleure', label: 'Meilleure marketplace', valeur: meilleurePlateforme ? libelle(meilleurePlateforme[0]) : null, ...(meilleurePlateforme ? {} : pasEncore('Aucune vente sur la période.')) },
        { id: 'croissance', label: 'Croissance', valeur: evolution(ca, caAvant), unite: '%', ...(caAvant ? {} : pasEncore('Pas de période précédente à comparer.')) },
        { id: 'conversion', label: 'Taux de conversion', ...pasEncore('Les marketplaces ne communiquent pas leur trafic : aucune conversion n’est mesurable.') },
        { id: 'sans-vente', label: 'Sans vente (période)', valeur: sansVenteMk.length },
      ],
    })
  }

  // --- 06 · Ventes et commandes --------------------------------------------
  {
    const topProduit = [...produitsVendus]
      .map((id) => ({ id, n: commandes.filter((o) => o.productId === id).length }))
      .sort((a, b) => b.n - a.n)[0]
    blocs.push({
      id: 'ventes',
      numero: '06',
      titre: 'Ventes et commandes',
      tuiles: [
        { id: 'ca', label: 'CA', valeur: arrondi(ca, 2), unite: '€', evolution: evolution(ca, caAvant), serie: serieCa },
        { id: 'commandes', label: 'Commandes', valeur: commandes.length, evolution: evolution(commandes.length, commandesAvant.length), serie: serieCommandes },
        { id: 'vendus', label: 'Produits vendus', valeur: produitsVendus.size },
        { id: 'panier', label: 'Panier moyen', valeur: commandes.length ? arrondi(ca / commandes.length, 2) : null, unite: '€', ...(commandes.length ? {} : pasEncore('Aucune vente sur la période.')) },
        { id: 'clients', label: 'Clients', valeur: clients },
        { id: 'evolution-ca', label: 'Évolution CA', valeur: evolution(ca, caAvant), unite: '%', ...(caAvant ? {} : pasEncore('Pas de période précédente à comparer.')) },
        { id: 'evolution-commandes', label: 'Évolution commandes', valeur: evolution(commandes.length, commandesAvant.length), unite: '%', ...(commandesAvant.length ? {} : pasEncore('Pas de période précédente à comparer.')) },
        { id: 'top', label: 'Top produit', valeur: topProduit ? `${topProduit.n} vente(s)` : null, ...(topProduit ? {} : pasEncore('Aucune vente sur la période.')) },
        { id: 'nouvelles', label: 'Nouvelles commandes', valeur: commandes.filter((o) => o.status === 'NEW').length },
      ],
    })
  }

  // --- 07 · Livraisons et logistique ---------------------------------------
  {
    const livrees = commandes.filter((o) => o.status === 'DELIVERED')
    const delaisLivraison = livrees.map((o) => (+o.updatedAt - +o.createdAt) / 86400000).filter((d) => d > 0 && d < 90)
    blocs.push({
      id: 'livraisons',
      numero: '07',
      titre: 'Livraisons et logistique',
      tuiles: [
        { id: 'a-expedier', label: 'À expédier', valeur: commandes.filter((o) => o.status === 'NEW').length },
        { id: 'preparation', label: 'Chez le fournisseur', valeur: commandes.filter((o) => o.status === 'ORDERED_FROM_SUPPLIER').length },
        { id: 'transit', label: 'En transit', valeur: commandes.filter((o) => o.status === 'SHIPPED').length },
        { id: 'livrees', label: 'Livrées', valeur: livrees.length },
        { id: 'suivies', label: 'Avec numéro de suivi', valeur: commandes.filter((o) => o.trackingNumber).length },
        { id: 'retards', label: 'Retards (10 j+)', valeur: commandes.filter((o) => o.status !== 'DELIVERED' && o.status !== 'REFUNDED' && +o.createdAt < Date.now() - 10 * 86400000).length },
        { id: 'delai', label: 'Délai moyen', valeur: delaisLivraison.length ? arrondi(delaisLivraison.reduce((a, b) => a + b, 0) / delaisLivraison.length, 1) : null, unite: 'j', ...(delaisLivraison.length ? {} : pasEncore('Aucune livraison terminée sur la période.')) },
        { id: 'retours', label: 'Remboursées', valeur: commandes.filter((o) => o.status === 'REFUNDED').length },
        { id: 'taux', label: 'Taux de livraison', valeur: commandes.length ? arrondi((livrees.length / commandes.length) * 100, 1) : null, unite: '%', ...(commandes.length ? {} : pasEncore('Aucune commande sur la période.')) },
      ],
    })
  }

  // --- 08 · Messagerie ------------------------------------------------------
  {
    const recus = messages.filter((m) => m.direction === 'IN')
    const envoyes = messages.filter((m) => m.direction === 'OUT')

    /*
     * Le temps de réponse : du premier message reçu à la première réponse de
     * la même conversation. Une conversation jamais répondue ne compte pas
     * dans la moyenne — elle compte dans le taux de réponse, où est sa place.
     */
    const parConversation = new Map<string, { premierIn?: Date; premierOutApres?: Date }>()
    for (const m of messages) {
      const l = parConversation.get(m.conversationId) ?? {}
      if (m.direction === 'IN' && !l.premierIn) l.premierIn = m.createdAt
      if (m.direction === 'OUT' && l.premierIn && !l.premierOutApres && m.createdAt > l.premierIn) l.premierOutApres = m.createdAt
      parConversation.set(m.conversationId, l)
    }
    const reponses = [...parConversation.values()].filter((l) => l.premierIn && l.premierOutApres)
    const attendues = [...parConversation.values()].filter((l) => l.premierIn)
    const tempsMoyenH = reponses.length
      ? reponses.reduce((s, l) => s + (+l.premierOutApres! - +l.premierIn!), 0) / reponses.length / 3600000
      : null

    blocs.push({
      id: 'messagerie',
      numero: '08',
      titre: 'Messagerie',
      tuiles: [
        { id: 'recus', label: 'Messages reçus', valeur: recus.length },
        { id: 'envoyes', label: 'Messages envoyés', valeur: envoyes.length },
        { id: 'conversations', label: 'Conversations', valeur: conversations.length },
        { id: 'attente', label: 'En attente', valeur: conversations.filter((c) => c.status === 'OPEN' && c.unread).length },
        { id: 'temps', label: 'Temps de réponse moyen', valeur: tempsMoyenH !== null ? arrondi(tempsMoyenH, 1) : null, unite: 'h', ...(tempsMoyenH !== null ? {} : pasEncore('Aucune conversation répondue.')) },
        { id: 'taux', label: 'Taux de réponse', valeur: attendues.length ? arrondi((reponses.length / attendues.length) * 100, 1) : null, unite: '%', ...(attendues.length ? {} : pasEncore('Aucun message reçu.')) },
        { id: 'plateformes', label: 'Plateformes en conversation', valeur: new Set(conversations.map((c) => c.platform)).size },
        { id: 'resolues', label: 'Fermées', valeur: conversations.filter((c) => c.status === 'CLOSED').length },
        { id: 'redigees', label: 'Réponses rédigées par l’agent', valeur: null, raison: 'Compté à partir des brouillons d’agent — bientôt.' },
      ],
    })
  }

  // --- 09 · SAV clients -----------------------------------------------------
  {
    const resolus = tickets.filter((t) => t.status === 'RESOLU')
    const delaiResolution = resolus.map((t) => (+t.updatedAt - +t.createdAt) / 86400000).filter((d) => d >= 0)
    const motifs = new Map<string, number>()
    for (const t of tickets) motifs.set(t.kind, (motifs.get(t.kind) ?? 0) + 1)
    const motifPrincipal = [...motifs.entries()].sort((a, b) => b[1] - a[1])[0]

    blocs.push({
      id: 'sav-clients',
      numero: '09',
      titre: 'SAV clients',
      tuiles: [
        { id: 'ouverts', label: 'Tickets ouverts', valeur: tickets.filter((t) => t.status === 'OUVERT').length },
        { id: 'en-cours', label: 'En cours', valeur: tickets.filter((t) => t.status === 'EN_COURS').length },
        { id: 'resolus', label: 'Résolus', valeur: resolus.length },
        { id: 'delai', label: 'Temps de résolution', valeur: delaiResolution.length ? arrondi(delaiResolution.reduce((a, b) => a + b, 0) / delaiResolution.length, 1) : null, unite: 'j', ...(delaiResolution.length ? {} : pasEncore('Aucun ticket résolu.')) },
        { id: 'avoirs', label: 'Crédits rendus', valeur: tickets.reduce((s, t) => s + (t.refundedCredits ?? 0), 0) },
        { id: 'retours', label: 'Commandes remboursées', valeur: commandes.filter((o) => o.status === 'REFUNDED').length },
        { id: 'motif', label: 'Motif principal', valeur: motifPrincipal?.[0] ?? null, ...(motifPrincipal ? {} : pasEncore('Aucun ticket.')) },
        { id: 'conversations-sav', label: 'Conversations acheteurs', valeur: conversations.length },
        { id: 'problematiques', label: 'Produits à tickets', valeur: null, raison: 'Rattachement ticket → produit encore trop rare pour compter.' },
      ],
    })
  }

  // --- 10 · SAV fournisseurs ------------------------------------------------
  {
    const cmdProbleme = commandes.filter((o) => o.supplierOrderError)
    blocs.push({
      id: 'sav-fournisseurs',
      numero: '10',
      titre: 'SAV fournisseurs',
      tuiles: [
        { id: 'echecs', label: 'Commandes en échec', valeur: cmdProbleme.length },
        { id: 'retards', label: 'Retards fournisseur', valeur: commandes.filter((o) => o.supplierOrderedAt && o.status === 'ORDERED_FROM_SUPPLIER' && +o.supplierOrderedAt < Date.now() - 10 * 86400000).length },
        { id: 'litiges', label: 'Litiges ouverts', ...pasEncore('Les litiges fournisseurs ne sont pas encore suivis ici.') },
        { id: 'qualite', label: 'Problèmes qualité', ...pasEncore('Se comptera depuis les motifs de remboursement.') },
        { id: 'ruptures', label: 'Ruptures constatées', valeur: produits.filter((p) => p.supplierStock === 0).length },
        { id: 'rembourses', label: 'Remboursements fournisseur', ...pasEncore('Non suivis : le remboursement se passe chez le fournisseur.') },
        { id: 'delai', label: 'Délai de résolution', ...pasEncore('Suivra les litiges quand ils seront suivis.') },
        { id: 'problematiques', label: 'Fournisseurs à problèmes', valeur: new Set(cmdProbleme.map((o) => produitParId.get(o.productId)?.sourceSite).filter(Boolean)).size },
        { id: 'messages', label: 'Messagerie fournisseurs', ...pasEncore('La messagerie fournisseur n’est pas encore reliée.') },
      ],
    })
  }

  // --- 11 · Finances / comptabilité ----------------------------------------
  {
    const pubs = images.filter((i) => i.kind === 'ad')
    const imagesSeules = images.filter((i) => i.kind !== 'ad')
    blocs.push({
      id: 'finances',
      numero: '11',
      titre: 'Finances et rentabilité',
      tuiles: [
        { id: 'ca-net', label: 'CA net', valeur: arrondi(ca, 2), unite: '€', evolution: evolution(ca, caAvant), serie: serieCa },
        { id: 'couts', label: 'Coûts produits', valeur: arrondi(couts, 2), unite: '€' },
        { id: 'commissions', label: 'Commissions marketplaces', ...pasEncore('Les relevés de commissions ne sont pas encore importés.') },
        { id: 'livraison', label: 'Frais de livraison', valeur: arrondi(commandes.reduce((s, o) => s + (coutDe.get(o.productId)?.port ?? 0), 0), 2), unite: '€' },
        { id: 'publicite', label: 'Publicités créées', valeur: pubs.length },
        { id: 'ia', label: 'Images générées', valeur: imagesSeules.length },
        { id: 'marge-brute', label: 'Marge brute', valeur: arrondi(marge, 2), unite: '€' },
        { id: 'marge-nette', label: 'Marge nette', valeur: ca ? arrondi((marge / ca) * 100, 1) : null, unite: '%', ...(ca ? {} : pasEncore('Aucune vente sur la période.')) },
        { id: 'benefice', label: 'Bénéfice', valeur: arrondi(marge, 2), unite: '€' },
      ],
    })
  }

  // --- 12 · Rayons / catégories --------------------------------------------
  {
    const parRayon = new Map<string, { ca: number; ventes: number; produits: number }>()
    for (const p of produits) {
      const rayon = p.categoryId ? (rayonDe.get(p.categoryId) ?? 'Sans rayon') : 'Sans rayon'
      const l = parRayon.get(rayon) ?? { ca: 0, ventes: 0, produits: 0 }
      l.produits += 1
      parRayon.set(rayon, l)
    }
    for (const o of commandes) {
      const p = produitParId.get(o.productId)
      const rayon = p?.categoryId ? (rayonDe.get(p.categoryId) ?? 'Sans rayon') : 'Sans rayon'
      const l = parRayon.get(rayon) ?? { ca: 0, ventes: 0, produits: 0 }
      l.ca += num(o.amount)
      l.ventes += 1
      parRayon.set(rayon, l)
    }
    const dominant = [...parRayon.entries()].filter(([r]) => r !== 'Sans rayon').sort((a, b) => b[1].produits - a[1].produits)[0]
    const rentable = [...parRayon.entries()].filter(([r]) => r !== 'Sans rayon').sort((a, b) => b[1].ca - a[1].ca)[0]

    blocs.push({
      id: 'rayons',
      numero: '12',
      titre: 'Rayons et catégories',
      tuiles: [
        { id: 'rayons', label: 'Rayons occupés', valeur: [...parRayon.keys()].filter((r) => r !== 'Sans rayon').length },
        { id: 'ca', label: 'CA (tous rayons)', valeur: arrondi(ca, 2), unite: '€' },
        { id: 'ventes', label: 'Ventes', valeur: commandes.length },
        { id: 'marge', label: 'Marge', valeur: ca ? arrondi((marge / ca) * 100, 1) : null, unite: '%', ...(ca ? {} : pasEncore('Aucune vente sur la période.')) },
        { id: 'produits', label: 'Produits rangés', valeur: produits.filter((p) => p.categoryId).length },
        { id: 'dominant', label: 'Rayon dominant', valeur: dominant?.[0] ?? null, ...(dominant ? {} : pasEncore('Aucun produit rangé.')) },
        { id: 'rentable', label: 'Rayon le plus vendeur', valeur: rentable && rentable[1].ca > 0 ? rentable[0] : null, ...(rentable && rentable[1].ca > 0 ? {} : pasEncore('Aucune vente rangée.')) },
        { id: 'sans-rayon', label: 'Produits sans rayon', valeur: produits.filter((p) => !p.categoryId).length },
        { id: 'repartition', label: 'Catégories distinctes', valeur: new Set(produits.map((p) => p.categoryId).filter(Boolean)).size },
      ],
    })
  }

  // --- 13 · Produits gagnants / marché --------------------------------------
  {
    blocs.push({
      id: 'marche',
      numero: '13',
      titre: 'Produits gagnants et marché',
      tuiles: [
        { id: 'analyses', label: 'Analyses de marché', valeur: produits.filter((p) => p.marketAnalysedAt).length },
        { id: 'opportunites', label: 'Opportunités relevées', valeur: opportunites },
        { id: 'gagnants', label: 'Produits gagnants', valeur: null, raison: 'Se compte sur les verdicts des analyses archivées — bientôt.' },
        { id: 'tendances', label: 'Tendances', ...pasEncore('Vient des enquêtes des agents extérieurs (POST /agent/*).') },
        { id: 'saisonnalite', label: 'Saisonnalité', ...pasEncore('Demande un an d’historique de ventes.') },
        { id: 'prevision-ventes', label: 'Prévision ventes', ...pasEncore('Demande plusieurs mois d’historique.') },
        { id: 'prevision-ca', label: 'Prévision CA', ...pasEncore('Demande plusieurs mois d’historique.') },
        { id: 'porteurs', label: 'Marchés porteurs', ...pasEncore('Vient des signaux des agents extérieurs.') },
        { id: 'risque', label: 'Produits à risque', valeur: produits.filter((p) => p.supplierStock === 0).length },
      ],
    })
  }

  // --- 14 · Plateforme DropShipper ------------------------------------------
  {
    const generees = produits.filter((p) => p.aiEnhanced).length
    const potentiel = [
      publiees.length > 0,
      images.length > 0,
      conversations.length > 0,
      user.autoOrder,
      user.controlAgent,
      produits.some((p) => p.videoUrl),
      opportunites > 0,
      commandes.length > 0,
    ]
    blocs.push({
      id: 'plateforme',
      numero: '14',
      titre: 'Plateforme DropShipper',
      tuiles: [
        { id: 'credits', label: 'Crédits annonces restants', valeur: user.credits },
        { id: 'credits-image', label: 'Crédits images restants', valeur: user.imageCredits },
        { id: 'annonces-ia', label: 'Annonces rédigées par l’IA', valeur: generees },
        { id: 'images', label: 'Images générées', valeur: images.filter((i) => i.kind !== 'ad').length },
        { id: 'pubs', label: 'Publicités créées', valeur: images.filter((i) => i.kind === 'ad').length },
        { id: 'agents', label: 'Agent de contrôle', valeur: user.controlAgent ? 'actif' : 'inactif' },
        { id: 'automatisations', label: 'Commande fournisseur auto', valeur: user.autoOrder ? 'active' : 'inactive' },
        { id: 'technique', label: 'Performance technique', ...pasEncore('Se lit dans Réglages › Diagnostic — la sonde coûte un appel réel.') },
        { id: 'potentiel', label: 'Potentiel utilisé', valeur: Math.round((potentiel.filter(Boolean).length / potentiel.length) * 100), unite: '%' },
      ],
    })
  }

  return blocs
}
