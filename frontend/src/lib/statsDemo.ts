import type { BlocData, TuileData } from '../components/stats/TuileStat'

/**
 * Les données de démonstration du tableau de bord.
 *
 * **Demandé le 03/09/2026, en toutes lettres** : « il n'y a aucun chiffre,
 * alors je ne peux voir aucun graphique — je veux des graphiques de démo mis
 * en place en attendant, afin de voir le graphisme de tout. » Un compte neuf
 * n'a ni vente ni message : chaque tuile montrait un zéro et le même trait
 * plein, et le tableau ne montrait rien de ce qu'il sait faire.
 *
 * La règle d'honnêteté ne plie pas, elle s'affiche : la démonstration est un
 * **mode**, enclenché de lui-même quand le compte n'a encore aucune activité,
 * coiffé d'un bandeau qui le dit, et débrayable d'un clic. Jamais un chiffre
 * de démonstration sans le bandeau — c'est sur ces nombres qu'un vendeur
 * jugera l'application, il doit savoir lesquels sont à lui.
 *
 * Tout est **déterministe** : le générateur est semé par l'identifiant de la
 * tuile, donc la démo est identique à chaque visite. Une démo qui bouge toute
 * seule ressemble à des données vivantes — c'est exactement l'illusion qu'on
 * ne veut pas.
 */

/** mulberry32 — petit, déterministe, largement suffisant pour de la démo. */
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

/** Une marche aléatoire douce : trente points qui ressemblent à une activité. */
function serieDemo(r: () => number, tendance: number): number[] {
  const points: number[] = []
  let v = 40 + r() * 30
  for (let i = 0; i < 30; i++) {
    v = Math.max(2, v + (r() - 0.5 + tendance / 200) * 14)
    points.push(Math.round(v * 10) / 10)
  }
  return points
}

/** Les tuiles qui portent un nom plutôt qu'un nombre, reconnues à leur id. */
const NOMS_DEMO: Record<string, string[]> = {
  meilleur: ['AliExpress', 'BigBuy', 'CJ Dropshipping'],
  rentable: ['Spocket', 'BigBuy', 'AliExpress'],
  meilleure: ['Amazon', 'eBay', 'Cdiscount'],
  dominant: ['High-tech', 'Maison', 'Mode'],
  top: ['Casque audio — 128 ventes', 'Montre connectée — 96 ventes'],
  motif: ['livraison', 'produit', 'remboursement'],
  agents: ['actif'],
  automatisations: ['active'],
}

function valeurDemo(tuile: TuileData, r: () => number): Pick<TuileData, 'valeur' | 'evolution' | 'serie'> {
  for (const [motif, choix] of Object.entries(NOMS_DEMO)) {
    if (tuile.id.includes(motif)) return { valeur: choix[Math.floor(r() * choix.length)] }
  }

  const evolution = Math.round((r() * 70 - 25) * 10) / 10

  /*
   * Toutes les tuiles numériques reçoivent une série : les vingt-six formes
   * doivent toutes pouvoir se montrer, c'est l'objet même de la démo. Une
   * tuile sans série cantonnait le tirage aux mêmes ornements — c'est ce qui
   * faisait revenir le même dessin deux ou trois fois par bloc.
   */
  if (tuile.unite === '/100') return { valeur: Math.round(55 + r() * 40), evolution, serie: serieDemo(r, evolution) }
  if (tuile.unite === '%') return { valeur: Math.round((8 + r() * 80) * 10) / 10, evolution, serie: serieDemo(r, evolution) }
  if (tuile.unite === 'j') return { valeur: Math.round((1.5 + r() * 6) * 10) / 10, evolution, serie: serieDemo(r, evolution) }
  if (tuile.unite === 'h') return { valeur: Math.round((1 + r() * 8) * 10) / 10, evolution, serie: serieDemo(r, evolution) }
  if (tuile.unite === '€') {
    const montant = Math.round((800 + r() * 60000) * 100) / 100
    return { valeur: montant, evolution, serie: serieDemo(r, evolution) }
  }

  const compte = Math.round(6 + r() * r() * 2800)
  return { valeur: compte, evolution, serie: serieDemo(r, evolution) }
}

/** Le tableau entier, rempli de chiffres de démonstration — étiquetés ailleurs. */
export function blocsDemo(blocs: BlocData[]): BlocData[] {
  return blocs.map((bloc) => ({
    ...bloc,
    tuiles: bloc.tuiles.map((tuile) => {
      const r = alea(graineDe(`${bloc.id}/${tuile.id}`))
      const rempli = { ...tuile, raison: undefined, ...valeurDemo(tuile, r) }
      // Chaque tuile reçoit aussi sa répartition : camemberts, cylindres,
      // jalons et radars doivent tous pouvoir être tirés — la variété du
      // tirage sans remise en dépend.
      if (!rempli.parts) rempli.parts = partsDemo(bloc.id, r)
      return rempli
    }),
  }))
}

/**
 * Vrai tant que le compte n'a pas encore vendu : la démo s'enclenche seule.
 *
 * Le critère est la vente, pas le catalogue : un vendeur qui a importé cent
 * produits mais rien vendu verrait encore un tableau aux trois quarts vide —
 * c'est précisément la situation signalée. Dès la première commande, les
 * vraies données prennent la place, et la bascule reste à portée de clic.
 */
export function compteVide(blocs: BlocData[]): boolean {
  const ventes = blocs.find((b) => b.id === 'vue-generale')?.tuiles.find((t) => t.id === 'commandes')
  return !ventes || ventes.valeur === 0 || ventes.valeur === null
}

/** Les libellés plausibles des répartitions de démonstration, par bloc. */
const PARTS_DEMO: Record<string, string[]> = {
  acquisition: ['AliExpress', 'BigBuy', 'Temu', 'CJ Dropshipping'],
  fournisseurs: ['AliExpress', 'BigBuy', 'Temu', 'CJ Dropshipping'],
  'sav-fournisseurs': ['AliExpress', 'BigBuy', 'Temu'],
  catalogue: ['High-tech', 'Maison', 'Mode', 'Sport', 'Beauté'],
  rayons: ['High-tech', 'Maison', 'Mode', 'Sport', 'Beauté'],
  marche: ['High-tech', 'Maison', 'Mode', 'Sport'],
  finances: ['Produits', 'Livraison', 'Commissions', 'Publicité'],
  plateforme: ['Annonces', 'Images', 'Pubs', 'Analyses'],
}
const PARTS_DEFAUT = ['Amazon', 'eBay', 'Cdiscount', 'Shopify']

/**
 * Une répartition de démonstration : décroissante, comme les vraies.
 *
 * Ajoutée quand la vraie manque : les camemberts, anneaux, radars et curseurs
 * des références ne se voient qu'avec plusieurs parts.
 */
function partsDemo(blocId: string, r: () => number): Array<{ label: string; valeur: number }> {
  const libelles = PARTS_DEMO[blocId] ?? PARTS_DEFAUT
  const n = Math.min(libelles.length, 3 + Math.floor(r() * 2))
  let restant = 100
  return libelles.slice(0, n).map((label, i) => {
    const part = i === n - 1 ? restant : Math.round(restant * (0.35 + r() * 0.3))
    restant -= part
    return { label, valeur: Math.max(3, part) }
  })
}

/**
 * La carte de démonstration : un vendeur français qui vend au monde entier.
 *
 * « Montrer des clients sur toute la planète, et fournisseurs également ; pour
 * livraisons, de grandes flèches qui partent de France vers les pays du
 * monde. » La démo couvre donc les cinq continents — l'Europe domine, comme
 * dans la vraie vie d'un vendeur français, mais le Japon, le Brésil et
 * l'Australie s'allument aussi.
 */
export function carteDemo(): Record<'ventes' | 'clients' | 'fournisseurs' | 'livraisons', Array<{ pays: string; n: number }>> {
  const r = alea(graineDe('carte-monde'))
  const monde = (base: number, parts: Array<[string, number]>) =>
    parts
      .map(([pays, poids]) => ({ pays, n: Math.max(1, Math.round(base * poids * (0.85 + r() * 0.3))) }))
      .sort((x, y) => y.n - x.n)

  const REPARTITION_CLIENTS: Array<[string, number]> = [
    ['France', 1], ['Belgique', 0.16], ['Allemagne', 0.13], ['Espagne', 0.1],
    ['Italie', 0.08], ['Royaume-Uni', 0.07], ['Suisse', 0.05], ['Canada', 0.05],
    ['États-Unis', 0.06], ['Maroc', 0.04], ['Japon', 0.025], ['Brésil', 0.02],
    ['Australie', 0.018], ['Sénégal', 0.015], ['Inde', 0.012],
  ]

  return {
    ventes: monde(690, REPARTITION_CLIENTS),
    clients: monde(486, REPARTITION_CLIENTS),
    fournisseurs: monde(60, [
      ['Chine', 1], ['Espagne', 0.2], ['France', 0.12], ['Allemagne', 0.08],
      ['Vietnam', 0.07], ['Turquie', 0.06], ['Inde', 0.05], ['États-Unis', 0.04],
    ]),
    livraisons: monde(640, REPARTITION_CLIENTS),
  }
}
