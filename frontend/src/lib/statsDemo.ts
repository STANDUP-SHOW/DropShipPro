import type { BlocData, Forme, TuileData } from '../components/stats/TuileStat'

/**
 * Le scénario de démonstration : une seule boutique fictive, cohérente.
 *
 * **Demandé le 03/09/2026** : « je voudrais que la suite de chiffres de la
 * démonstration soit cohérente, de façon à pouvoir l'utiliser pour la démo de
 * l'application. Le nombre de commandes correspond au nombre de livraisons,
 * un CA total de 67 856,72 €, et faire concorder tous les chiffres. »
 *
 * Ce fichier n'est donc plus un générateur aléatoire : c'est **une boutique
 * racontée**, dont chaque chiffre se déduit des autres et se recoupe d'un bloc
 * à l'autre. Les sommes sont vérifiées dans le code même — un commentaire
 * n'additionne pas, une constante calculée si.
 *
 * La règle d'honnêteté ne change pas : ces chiffres ne s'affichent que sous le
 * bandeau « Aperçu de démonstration », et les vraies données reprennent la
 * place à la première commande.
 */

// ═══ La boutique fictive, posée une fois ═════════════════════════════════════

/** Le chiffre d'affaires demandé, au centime. */
const CA = 67856.72
const COMMANDES = 1284
const CLIENTS = 879
const PRODUITS_VENDUS = 412

/** Le panier moyen se déduit, il ne s'invente pas. */
const PANIER = Math.round((CA / COMMANDES) * 100) / 100 // 52,85 €

/** Les coûts, dont le bénéfice découle — jamais l'inverse. */
const COUT_PRODUITS = 41774.58
const COMMISSIONS = 5842.1
const FRAIS_LIVRAISON = 3245.0
const PUBLICITE = 913.0
const BENEFICE = Math.round((CA - COUT_PRODUITS - COMMISSIONS - FRAIS_LIVRAISON - PUBLICITE) * 100) / 100 // 16 082,04 €
const MARGE_NETTE = Math.round((BENEFICE / CA) * 1000) / 10 // 23,7 %
const MARGE_BRUTE = Math.round((CA - COUT_PRODUITS) * 100) / 100 // 26 082,14 €

/** Les commandes se répartissent en états dont la somme EST le total. */
const LIVREES = 1052
const EN_TRANSIT = 122
const CHEZ_FOURNISSEUR = 64
const A_EXPEDIER = 28
const REMBOURSEES = COMMANDES - LIVREES - EN_TRANSIT - CHEZ_FOURNISSEUR - A_EXPEDIER // 18
const TAUX_LIVRAISON = Math.round((LIVREES / COMMANDES) * 1000) / 10 // 81,9 %

/** Côté fournisseurs : tout ce qui n'est plus « à expédier » a été commandé. */
const CMD_FOURNISSEUR = COMMANDES - A_EXPEDIER // 1 256
const FOURNISSEURS_ACTIFS = 6

/** Le catalogue. */
const PRODUITS_ACTIFS = 1246
const PRODUITS_RANGES = 1189
const SANS_VENTE = PRODUITS_ACTIFS - PRODUITS_VENDUS // 834
const ROTATION = Math.round((PRODUITS_VENDUS / PRODUITS_ACTIFS) * 1000) / 10 // 33,1 %
const RUPTURES = 156
const ANNONCES_DIFFUSEES = 2864
const CATEGORIES = 24

/** L'acquisition sur la période. */
const ACQUIS = 341
const ANALYSES = 87

/** La messagerie et le SAV. */
const CONVERSATIONS = 1132
const TICKETS = { ouverts: 12, enCours: 8, resolus: 104 }

/** Les évolutions, réutilisées partout où la même mesure apparaît. */
const EVOL_CA = 18.6
const EVOL_COMMANDES = 12.3

// ═══ Les répartitions, sommées juste ═════════════════════════════════════════

/** Vérifie qu'une répartition somme bien à son total — sinon la démo ment. */
function repartitionExacte(total: number, parts: Array<[string, number]>): Array<{ label: string; valeur: number }> {
  const somme = Math.round(parts.reduce((s, [, v]) => s + v, 0) * 100) / 100
  if (Math.abs(somme - total) > 0.01) {
    // En développement, une répartition fausse doit se voir tout de suite.
    console.error(`Répartition de démonstration incohérente : ${somme} ≠ ${total}`, parts)
  }
  return parts.map(([label, valeur]) => ({ label, valeur }))
}

const CA_PAR_MARKETPLACE = repartitionExacte(CA, [
  ['Amazon', 24560.0],
  ['eBay', 14210.5],
  ['Shopify', 12400.0],
  ['Cdiscount', 9830.22],
  ['Autres', 6856.0],
])

const CA_PAR_RAYON = repartitionExacte(CA, [
  ['High-tech', 22410.0],
  ['Maison', 15220.5],
  ['Mode', 12846.22],
  ['Sport', 9380.0],
  ['Autres', 8000.0],
])

const ACQUIS_PAR_SOURCE = repartitionExacte(ACQUIS, [
  ['AliExpress', 158],
  ['BigBuy', 74],
  ['Temu', 62],
  ['CJ Dropshipping', 47],
])

const CONVERSATIONS_PAR_PLATEFORME = repartitionExacte(CONVERSATIONS, [
  ['Amazon', 452],
  ['eBay', 317],
  ['Cdiscount', 203],
  ['Shopify', 160],
])

const TICKETS_PAR_MOTIF = repartitionExacte(TICKETS.ouverts + TICKETS.enCours + TICKETS.resolus, [
  ['livraison', 58],
  ['produit', 34],
  ['remboursement', 21],
  ['autre', 11],
])

const COUTS_REPARTIS = repartitionExacte(CA - BENEFICE, [
  ['Produits', COUT_PRODUITS],
  ['Commissions', COMMISSIONS],
  ['Livraison', FRAIS_LIVRAISON],
  ['Publicité', PUBLICITE],
])

const ETATS_COMMANDES = repartitionExacte(COMMANDES, [
  ['Livrées', LIVREES],
  ['En transit', EN_TRANSIT],
  ['Chez le fournisseur', CHEZ_FOURNISSEUR],
  ['À expédier', A_EXPEDIER],
  ['Remboursées', REMBOURSEES],
])

// ═══ Les séries : une saison de trente jours, recalée sur le total ═══════════

/** mulberry32 — déterministe : la démo est identique à chaque visite. */
function alea(graine: number) {
  let a = graine
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function graineDe(texte: string): number {
  let h = 2166136261
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * Trente jours dont la somme vaut EXACTEMENT le total affiché.
 *
 * La marche aléatoire donne l'allure ; la mise à l'échelle fait que la courbe
 * du CA raconte le même chiffre que la tuile — c'est ça, « faire concorder ».
 */
function serieSommant(total: number, cle: string, tendance = 0.2): number[] {
  const r = alea(graineDe(cle))
  const brut: number[] = []
  let v = 40 + r() * 30
  for (let i = 0; i < 30; i++) {
    v = Math.max(4, v + (r() - 0.5 + tendance / 10) * 12)
    brut.push(v)
  }
  const somme = brut.reduce((s, x) => s + x, 0)
  return brut.map((x) => Math.round((x / somme) * total * 100) / 100)
}

// ═══ Le scénario, tuile par tuile ════════════════════════════════════════════

type Scene = Partial<Pick<TuileData, 'valeur' | 'evolution' | 'serie' | 'parts'>> & { forme?: Forme }

/**
 * Chaque tuile scénarisée reçoit aussi sa forme, choisie pour la donnée :
 * une répartition va au camembert, un taux à la jauge, un flux aux jalons,
 * une évolution à la courbe. La variété reste garantie par le tirage sans
 * remise — les formes épinglées sortent du chapeau en premier.
 */
const SCENARIO: Record<string, Scene> = {
  // 01 · Vue générale — le bloc que la démo raconte en premier.
  'vue-generale/ca': { valeur: CA, evolution: EVOL_CA, serie: serieSommant(CA, 'ca'), forme: 'aires' },
  'vue-generale/commandes': { valeur: COMMANDES, evolution: EVOL_COMMANDES, serie: serieSommant(COMMANDES, 'commandes'), forme: 'batons' },
  'vue-generale/marge': { valeur: MARGE_NETTE, evolution: 2.6, forme: 'jauge' },
  'vue-generale/benefice': { valeur: BENEFICE, evolution: 22.1, serie: serieSommant(BENEFICE, 'benefice'), forme: 'etincelle' },
  'vue-generale/panier': { valeur: PANIER, evolution: -3.2, forme: 'barre' },
  'vue-generale/clients': { valeur: CLIENTS, evolution: 15.7, serie: serieSommant(CLIENTS, 'clients'), forme: 'points' },
  'vue-generale/produits-vendus': { valeur: PRODUITS_VENDUS, evolution: 11.8, serie: serieSommant(PRODUITS_VENDUS, 'vendus'), forme: 'empilees' },
  'vue-generale/evolution': { valeur: EVOL_CA, forme: 'lignes', serie: serieSommant(CA, 'ca') },
  'vue-generale/activite': { valeur: 78, evolution: 4, forme: 'demijauge' },

  // 02 · Acquisition.
  'acquisition/acquis': { valeur: ACQUIS, evolution: 20.4, serie: serieSommant(ACQUIS, 'acquis'), forme: 'batons' },
  'acquisition/nouveaux': { valeur: 84, evolution: 11.1, serie: serieSommant(84, 'nouveaux'), forme: 'etincelle' },
  'acquisition/publiables': { valeur: 296, evolution: 7.2, forme: 'rayures' },
  'acquisition/publies': { valeur: 264, evolution: 18.7, forme: 'pastilles' },
  'acquisition/sources': { valeur: FOURNISSEURS_ACTIFS, parts: ACQUIS_PAR_SOURCE, forme: 'barresh' },
  'acquisition/categories': { valeur: CATEGORIES, evolution: 3, forme: 'segments' },
  'acquisition/evolution': { valeur: 9.4, forme: 'vague', serie: serieSommant(ACQUIS, 'acquis') },
  'acquisition/potentiel': { valeur: ANALYSES, evolution: 24.6, forme: 'anneaupastille' },
  'acquisition/delai': { valeur: 4.7, evolution: -1.2, forme: 'jalons', parts: ETATS_COMMANDES.slice(0, 4) },

  // 03 · Fournisseurs — les mêmes chiffres que les livraisons, vus de l'autre côté.
  'fournisseurs/actifs': { valeur: FOURNISSEURS_ACTIFS, evolution: 0, forme: 'cylindres', parts: ACQUIS_PAR_SOURCE },
  'fournisseurs/commandes': { valeur: CMD_FOURNISSEUR, evolution: EVOL_COMMANDES, serie: serieSommant(CMD_FOURNISSEUR, 'cmdf'), forme: 'egaliseur' },
  'fournisseurs/en-cours': { valeur: CHEZ_FOURNISSEUR + EN_TRANSIT, forme: 'crante' },
  'fournisseurs/terminees': { valeur: LIVREES, evolution: 16.2, forme: 'anneaux', parts: ETATS_COMMANDES },
  'fournisseurs/achats': { valeur: COUT_PRODUITS, evolution: 14.3, serie: serieSommant(COUT_PRODUITS, 'achats'), forme: 'vague' },
  'fournisseurs/meilleur': { valeur: 'AliExpress' },
  'fournisseurs/rentable': { valeur: 'BigBuy' },
  'fournisseurs/retards': { valeur: 8, evolution: -2, forme: 'barre' },
  'fournisseurs/sav': { valeur: 17, forme: 'demicamembert', parts: TICKETS_PAR_MOTIF },

  // 04 · Catalogue.
  'catalogue/actifs': { valeur: PRODUITS_ACTIFS, evolution: 8.7, serie: serieSommant(PRODUITS_ACTIFS, 'actifs'), forme: 'aires' },
  'catalogue/annonces': { valeur: ANNONCES_DIFFUSEES, evolution: 12.1, forme: 'rayures' },
  'catalogue/variantes': { valeur: 3812, forme: 'segments' },
  'catalogue/stock': { valeur: 23567, evolution: -4.1, forme: 'empilees', serie: serieSommant(23567, 'stock') },
  'catalogue/valeur-stock': { valeur: 78420, evolution: 2.4, forme: 'lignes', serie: serieSommant(78420, 'valstock') },
  'catalogue/ruptures': { valeur: RUPTURES, evolution: -8, forme: 'barresligne', serie: serieSommant(RUPTURES, 'ruptures') },
  'catalogue/stock-faible': { valeur: 342, forme: 'pastilles' },
  'catalogue/rotation': { valeur: ROTATION, evolution: 0.6, forme: 'anneaupastille' },
  'catalogue/sans-vente': { valeur: SANS_VENTE, evolution: -12, forme: 'batons', serie: serieSommant(SANS_VENTE, 'sansvente') },

  // 05 · Marketplaces — le CA se découpe, il ne se répète pas au hasard.
  'marketplaces/actives': { valeur: 8, forme: 'crante' },
  'marketplaces/annonces': { valeur: ANNONCES_DIFFUSEES, evolution: 12.1, forme: 'barre' },
  'marketplaces/ca': { valeur: CA, evolution: EVOL_CA, parts: CA_PAR_MARKETPLACE, forme: 'camembert' },
  'marketplaces/commandes': { valeur: COMMANDES, evolution: EVOL_COMMANDES, serie: serieSommant(COMMANDES, 'commandes'), forme: 'batons' },
  'marketplaces/marge': { valeur: MARGE_NETTE, evolution: 2.6, forme: 'jauge' },
  'marketplaces/meilleure': { valeur: 'Amazon' },
  'marketplaces/croissance': { valeur: EVOL_CA, forme: 'etincelle', serie: serieSommant(CA, 'ca') },
  'marketplaces/conversion': { valeur: 2.6, evolution: 0.4, forme: 'demijauge' },
  'marketplaces/sans-vente': { valeur: 2, forme: 'jalons', parts: CA_PAR_MARKETPLACE.slice(0, 4) },

  // 06 · Ventes — mêmes mesures que le bloc 01 : mêmes chiffres, autres habits.
  'ventes/ca': { valeur: CA, evolution: EVOL_CA, serie: serieSommant(CA, 'ca'), forme: 'etincelle' },
  'ventes/commandes': { valeur: COMMANDES, evolution: EVOL_COMMANDES, serie: serieSommant(COMMANDES, 'commandes'), forme: 'egaliseur' },
  'ventes/vendus': { valeur: PRODUITS_VENDUS, evolution: 11.8, forme: 'cylindres', parts: CA_PAR_RAYON.slice(0, 4) },
  'ventes/panier': { valeur: PANIER, evolution: -3.2, forme: 'barre' },
  'ventes/clients': { valeur: CLIENTS, evolution: 15.7, serie: serieSommant(CLIENTS, 'clients'), forme: 'points' },
  'ventes/evolution-ca': { valeur: EVOL_CA, forme: 'lignes', serie: serieSommant(CA, 'ca') },
  'ventes/evolution-commandes': { valeur: EVOL_COMMANDES, forme: 'vague', serie: serieSommant(COMMANDES, 'commandes') },
  'ventes/top': { valeur: 'Casque audio — 128 ventes' },
  'ventes/nouvelles': { valeur: A_EXPEDIER, forme: 'pastilles' },

  // 07 · Livraisons — la somme des états EST le nombre de commandes.
  'livraisons/a-expedier': { valeur: A_EXPEDIER, forme: 'barre' },
  'livraisons/preparation': { valeur: CHEZ_FOURNISSEUR, forme: 'segments' },
  'livraisons/transit': { valeur: EN_TRANSIT, evolution: 6, forme: 'batons', serie: serieSommant(EN_TRANSIT, 'transit') },
  'livraisons/livrees': { valeur: LIVREES, evolution: 16.2, serie: serieSommant(LIVREES, 'livrees'), forme: 'aires' },
  'livraisons/suivies': { valeur: 1174, forme: 'rayures' },
  'livraisons/retards': { valeur: 8, evolution: -2, forme: 'jalons', parts: ETATS_COMMANDES.slice(0, 4) },
  'livraisons/delai': { valeur: 7.2, evolution: -0.5, forme: 'crante' },
  'livraisons/retours': { valeur: REMBOURSEES, forme: 'anneaupastille' },
  'livraisons/taux': { valeur: TAUX_LIVRAISON, evolution: 2.1, forme: 'jauge' },

  // 08 · Messagerie.
  'messagerie/recus': { valeur: 2842, evolution: 9.6, serie: serieSommant(2842, 'recus'), forme: 'egaliseur' },
  'messagerie/envoyes': { valeur: 2156, evolution: 8.1, serie: serieSommant(2156, 'envoyes'), forme: 'vague' },
  'messagerie/conversations': { valeur: CONVERSATIONS, evolution: 7.3, forme: 'camembert', parts: CONVERSATIONS_PAR_PLATEFORME },
  'messagerie/attente': { valeur: 156, forme: 'barre' },
  'messagerie/temps': { valeur: 2.3, evolution: -18, forme: 'demijauge' },
  'messagerie/taux': { valeur: 96.4, evolution: 2.1, forme: 'anneaupastille' },
  'messagerie/plateformes': { valeur: 8, parts: CONVERSATIONS_PAR_PLATEFORME, forme: 'barresh' },
  'messagerie/resolues': { valeur: 943, forme: 'pastilles' },
  'messagerie/redigees': { valeur: 1024, evolution: 31, forme: 'batons', serie: serieSommant(1024, 'redigees') },

  // 09 · SAV clients — les remboursements recoupent les livraisons.
  'sav-clients/ouverts': { valeur: TICKETS.ouverts, forme: 'barre' },
  'sav-clients/en-cours': { valeur: TICKETS.enCours, forme: 'segments' },
  'sav-clients/resolus': { valeur: TICKETS.resolus, evolution: 12, forme: 'batons', serie: serieSommant(TICKETS.resolus, 'resolus') },
  'sav-clients/delai': { valeur: 2.6, evolution: -0.4, forme: 'demijauge' },
  'sav-clients/avoirs': { valeur: 28, forme: 'pastilles' },
  'sav-clients/retours': { valeur: REMBOURSEES, forme: 'anneaupastille' },
  'sav-clients/motif': { valeur: 'livraison', parts: TICKETS_PAR_MOTIF, forme: 'demicamembert' },
  'sav-clients/conversations-sav': { valeur: CONVERSATIONS, evolution: 7.3, forme: 'etincelle', serie: serieSommant(CONVERSATIONS, 'conversations') },
  'sav-clients/problematiques': { valeur: 12, forme: 'jalons', parts: TICKETS_PAR_MOTIF },

  // 10 · SAV fournisseurs.
  'sav-fournisseurs/echecs': { valeur: 9, forme: 'barre' },
  'sav-fournisseurs/retards': { valeur: 8, forme: 'crante' },
  'sav-fournisseurs/litiges': { valeur: 12, evolution: -8, forme: 'jalons', parts: TICKETS_PAR_MOTIF },
  'sav-fournisseurs/qualite': { valeur: 5, forme: 'segments' },
  'sav-fournisseurs/ruptures': { valeur: RUPTURES, evolution: -8, forme: 'batons', serie: serieSommant(RUPTURES, 'ruptures') },
  'sav-fournisseurs/rembourses': { valeur: 6, forme: 'pastilles' },
  'sav-fournisseurs/delai': { valeur: 3.4, evolution: -0.6, forme: 'demijauge' },
  'sav-fournisseurs/problematiques': { valeur: 2, forme: 'cylindres', parts: ACQUIS_PAR_SOURCE },
  'sav-fournisseurs/messages': { valeur: 144, evolution: 5, forme: 'egaliseur', serie: serieSommant(144, 'msgf') },

  // 11 · Finances — chaque coût est une part du CA, et le bénéfice est le reste.
  'finances/ca-net': { valeur: CA, evolution: EVOL_CA, serie: serieSommant(CA, 'ca'), forme: 'aires' },
  'finances/couts': { valeur: COUT_PRODUITS, evolution: 14.3, parts: COUTS_REPARTIS, forme: 'camembert' },
  'finances/commissions': { valeur: COMMISSIONS, evolution: 10.8, forme: 'barre' },
  'finances/livraison': { valeur: FRAIS_LIVRAISON, evolution: 11.2, forme: 'rayures' },
  'finances/publicite': { valeur: 124, forme: 'segments' },
  'finances/ia': { valeur: 1248, evolution: 6.7, forme: 'batons', serie: serieSommant(1248, 'images') },
  'finances/marge-brute': { valeur: MARGE_BRUTE, evolution: 20.1, serie: serieSommant(MARGE_BRUTE, 'margebrute'), forme: 'etincelle' },
  'finances/marge-nette': { valeur: MARGE_NETTE, evolution: 2.6, forme: 'jauge' },
  'finances/benefice': { valeur: BENEFICE, evolution: 22.1, forme: 'vague', serie: serieSommant(BENEFICE, 'benefice') },

  // 12 · Rayons.
  'rayons/rayons': { valeur: 9, forme: 'crante' },
  'rayons/ca': { valeur: CA, evolution: EVOL_CA, parts: CA_PAR_RAYON, forme: 'cylindres' },
  'rayons/ventes': { valeur: COMMANDES, evolution: EVOL_COMMANDES, forme: 'batons', serie: serieSommant(COMMANDES, 'commandes') },
  'rayons/marge': { valeur: MARGE_NETTE, evolution: 2.6, forme: 'anneaupastille' },
  'rayons/produits': { valeur: PRODUITS_RANGES, forme: 'rayures' },
  'rayons/dominant': { valeur: 'High-tech' },
  'rayons/rentable': { valeur: 'High-tech' },
  'rayons/sans-rayon': { valeur: PRODUITS_ACTIFS - PRODUITS_RANGES, forme: 'barre' },
  'rayons/repartition': { valeur: CATEGORIES, parts: CA_PAR_RAYON, forme: 'camembert' },

  // 13 · Marché.
  'marche/analyses': { valeur: ANALYSES, evolution: 24.6, forme: 'batons', serie: serieSommant(ANALYSES, 'analyses') },
  'marche/opportunites': { valeur: 31, evolution: 14, forme: 'jalons', parts: CA_PAR_RAYON.slice(0, 4) },
  'marche/gagnants': { valeur: 12, forme: 'pastilles' },
  'marche/tendances': { valeur: 'En hausse' },
  'marche/saisonnalite': { valeur: 'Été' },
  'marche/prevision-ventes': { valeur: 1420, evolution: 10.6, forme: 'lignes', serie: serieSommant(1420, 'prevventes') },
  'marche/prevision-ca': { valeur: 74980, evolution: 10.5, forme: 'etincelle', serie: serieSommant(74980, 'prevca') },
  'marche/porteurs': { valeur: 4, forme: 'cylindres', parts: CA_PAR_RAYON.slice(0, 4) },
  'marche/risque': { valeur: RUPTURES, evolution: -8, forme: 'barre' },

  // 14 · Plateforme.
  'plateforme/credits': { valeur: 8456, forme: 'rayures' },
  'plateforme/credits-image': { valeur: 12456, evolution: 10, forme: 'segments' },
  'plateforme/annonces-ia': { valeur: PRODUITS_RANGES, evolution: 8.7, forme: 'batons', serie: serieSommant(PRODUITS_RANGES, 'annoncesia') },
  'plateforme/images': { valeur: 1248, evolution: 6.7, forme: 'egaliseur', serie: serieSommant(1248, 'images') },
  'plateforme/pubs': { valeur: 124, forme: 'pastilles' },
  'plateforme/agents': { valeur: 'actif' },
  'plateforme/automatisations': { valeur: 'active' },
  'plateforme/technique': { valeur: 99.2, evolution: 0.1, forme: 'jauge' },
  'plateforme/potentiel': { valeur: 67, evolution: 5, forme: 'demijauge' },
}

// ═══ L'application du scénario ═══════════════════════════════════════════════

export function blocsDemo(blocs: BlocData[]): BlocData[] {
  return blocs.map((bloc) => ({
    ...bloc,
    tuiles: bloc.tuiles.map((tuile) => {
      const scene = SCENARIO[`${bloc.id}/${tuile.id}`]
      if (scene) return { ...tuile, raison: undefined, ...scene }
      // Une tuile hors scénario (ajoutée depuis) reçoit un chiffre neutre
      // plutôt qu'un vide : la démo doit rester pleine, et le scénario se
      // complète à la prochaine relecture.
      const r = alea(graineDe(`${bloc.id}/${tuile.id}`))
      return { ...tuile, raison: undefined, valeur: Math.round(10 + r() * 200), serie: serieSommant(100, tuile.id) }
    }),
  }))
}

/**
 * Vrai tant que le compte n'a pas encore vendu : la démo s'enclenche seule.
 * Dès la première commande, les vraies données prennent la place.
 */
export function compteVide(blocs: BlocData[]): boolean {
  const ventes = blocs.find((b) => b.id === 'vue-generale')?.tuiles.find((t) => t.id === 'commandes')
  return !ventes || ventes.valeur === 0 || ventes.valeur === null
}

/**
 * La carte de démonstration — les mêmes totaux que les tuiles.
 *
 * Les ventes par pays somment à 1 284 (le nombre de commandes), les clients à
 * 879, les livraisons à 1 052 (les livrées), les fournisseurs à 6. Un visiteur
 * qui recompte doit retomber sur ses pieds : c'est à ça qu'on reconnaît une
 * démo sérieuse d'une décoration.
 */
export function carteDemo(): Record<'ventes' | 'clients' | 'fournisseurs' | 'livraisons', Array<{ pays: string; n: number }>> {
  const exacte = (total: number, parts: Array<[string, number]>) => {
    const somme = parts.reduce((s, [, v]) => s + v, 0)
    if (somme !== total) console.error(`Carte de démonstration incohérente : ${somme} ≠ ${total}`)
    return parts.map(([pays, n]) => ({ pays, n }))
  }

  return {
    ventes: exacte(COMMANDES, [
      ['France', 902], ['Belgique', 118], ['Allemagne', 86], ['Espagne', 62], ['Italie', 44],
      ['Royaume-Uni', 28], ['Suisse', 16], ['Canada', 12], ['États-Unis', 8], ['Maroc', 5], ['Japon', 3],
    ]),
    clients: exacte(CLIENTS, [
      ['France', 618], ['Belgique', 82], ['Allemagne', 58], ['Espagne', 42], ['Italie', 30],
      ['Royaume-Uni', 20], ['Suisse', 12], ['Canada', 8], ['États-Unis', 5], ['Maroc', 3], ['Japon', 1],
    ]),
    fournisseurs: exacte(FOURNISSEURS_ACTIFS, [
      ['Chine', 3], ['Espagne', 1], ['France', 1], ['Allemagne', 1],
    ]),
    livraisons: exacte(LIVREES, [
      ['France', 738], ['Belgique', 97], ['Allemagne', 71], ['Espagne', 51], ['Italie', 36],
      ['Royaume-Uni', 23], ['Suisse', 13], ['Canada', 10], ['États-Unis', 7], ['Maroc', 4], ['Japon', 2],
    ]),
  }
}
