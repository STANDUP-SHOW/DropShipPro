/**
 * Les combinaisons d'achat, avec ce qui les distingue vraiment.
 *
 * **Ce qui manquait.** `Product.variants` ne porte que des noms d'options et
 * des listes de valeurs — « Couleur : Noir, Blanc ». C'est ce qui s'affiche, et
 * ça ne suffit pas : chez AliExpress, chaque combinaison a **son prix, sa photo,
 * son stock et sa référence**. La publication Shopify envoyait donc le même prix
 * pour toutes les variantes et aucune image — non pas parce que l'appel était
 * mal écrit, mais parce qu'on n'avait rien à transmettre.
 *
 * Une combinaison est identifiée par son `combo` : `{ Couleur: 'Noir',
 * Taille: 'M' }`. C'est la clé, et elle est stable — un identifiant de
 * fournisseur ne l'est pas d'un relevé à l'autre.
 */

export interface Combinaison {
  /** Les valeurs choisies, par nom d'option. C'est la clé de la ligne. */
  combo: Record<string, string>
  /** Le prix d'achat de cette combinaison, dans la devise du produit. */
  prix?: number
  /** Le prix barré affiché par le fournisseur, quand il y en a un. */
  prixOriginal?: number
  /** La photo propre à cette combinaison. */
  image?: string
  /** La référence du fournisseur, qui sert à commander. */
  sku?: string
  stock?: number
  /** Faux quand le fournisseur la déclare indisponible. */
  disponible: boolean
}

export class MatriceInvalide extends Error {}

/**
 * Les options telles que l'affichage les attend, dérivées des combinaisons.
 *
 * `variants` reste la source de l'écran, des places de marché et de l'export :
 * le dériver plutôt que de le saisir deux fois évite qu'ils se contredisent —
 * une valeur présente dans la liste mais dans aucune combinaison serait un choix
 * qui ne mène à aucun prix.
 *
 * L'ordre de première apparition est conservé : c'est celui du fournisseur, et
 * il est presque toujours le bon — les tailles vont du plus petit au plus grand,
 * pas dans l'ordre alphabétique.
 */
export function optionsDepuisCombinaisons(combos: Combinaison[]): Record<string, string[]> {
  const options = new Map<string, string[]>()

  for (const c of combos) {
    for (const [nom, valeur] of Object.entries(c.combo ?? {})) {
      if (!valeur) continue
      const liste = options.get(nom) ?? []
      if (!liste.includes(valeur)) liste.push(valeur)
      options.set(nom, liste)
    }
  }

  return Object.fromEntries(options)
}

/** La clé d'une combinaison, insensible à l'ordre des options. */
export function cleCombo(combo: Record<string, string>): string {
  return Object.keys(combo)
    .sort()
    .map((k) => `${k}=${combo[k]}`)
    .join('|')
}

/**
 * Vérifie et normalise une matrice reçue de l'extérieur.
 *
 * Elle arrive d'un relevé de page, donc rien n'est supposé. Une ligne à moitié
 * valide est pire qu'une ligne refusée : elle se rangerait en base et ne se
 * verrait qu'au moment où un acheteur choisit cette couleur-là.
 */
export function validerMatrice(brut: unknown): Combinaison[] {
  if (!Array.isArray(brut)) throw new MatriceInvalide('La matrice doit être une liste de combinaisons.')

  const vues = new Set<string>()
  const lignes: Combinaison[] = []

  for (const [i, ligne] of brut.entries()) {
    const l = ligne as Partial<Combinaison>
    if (!l?.combo || typeof l.combo !== 'object' || !Object.keys(l.combo).length) {
      throw new MatriceInvalide(`Combinaison ${i + 1} : aucune option identifiée.`)
    }

    const combo: Record<string, string> = {}
    for (const [nom, valeur] of Object.entries(l.combo)) {
      if (typeof valeur !== 'string' || !valeur.trim()) {
        throw new MatriceInvalide(`Combinaison ${i + 1} : la valeur de « ${nom} » est illisible.`)
      }
      combo[String(nom).trim()] = valeur.trim()
    }

    /*
     * Les doublons sont écartés, pas refusés.
     *
     * Un relevé rend parfois deux fois la même combinaison — deux SKU du
     * fournisseur qui portent les mêmes options. Refuser le relevé entier pour
     * ça ferait perdre trente lignes valides à cause d'une répétition, et
     * garder les deux donnerait deux prix pour un même choix.
     */
    const cle = cleCombo(combo)
    if (vues.has(cle)) continue
    vues.add(cle)

    const nombre = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : undefined)

    lignes.push({
      combo,
      prix: nombre(l.prix),
      prixOriginal: nombre(l.prixOriginal),
      image: typeof l.image === 'string' && l.image.startsWith('http') ? l.image : undefined,
      sku: typeof l.sku === 'string' && l.sku.trim() ? l.sku.trim() : undefined,
      stock: nombre(l.stock),
      // Le silence vaut « disponible » : un fournisseur qui ne dit rien vend.
      disponible: l.disponible !== false,
    })
  }

  if (!lignes.length) throw new MatriceInvalide('Aucune combinaison exploitable.')
  return lignes
}

/**
 * Ce que la matrice contient, en une ligne.
 *
 * Sert l'écran de l'annonce et les journaux d'import : « 12 combinaisons, de
 * 8,49 € à 12,90 €, 12 avec photo » dit d'un coup d'œil si le relevé a réussi.
 * Une matrice à deux lignes sur un produit qui en affiche douze est un relevé
 * qui s'est arrêté en route, et sans ce résumé ça ne se voit pas.
 */
export function resumeMatrice(combos: Combinaison[]) {
  const prix = combos.map((c) => c.prix).filter((p): p is number => typeof p === 'number' && p > 0)
  return {
    combinaisons: combos.length,
    avecPrix: prix.length,
    avecPhoto: combos.filter((c) => c.image).length,
    indisponibles: combos.filter((c) => !c.disponible).length,
    prixMin: prix.length ? Math.min(...prix) : null,
    prixMax: prix.length ? Math.max(...prix) : null,
    options: Object.keys(optionsDepuisCombinaisons(combos)),
  }
}

/**
 * Le prix d'achat d'une combinaison, ou celui du produit.
 *
 * Le repli n'est pas un détail : toutes les combinaisons n'ont pas leur prix, et
 * en rendre aucun ferait une variante à zéro euro chez Shopify — une commande
 * gratuite, immédiatement exploitée.
 */
export function prixDe(c: Combinaison, prixProduit: number): number {
  return typeof c.prix === 'number' && c.prix > 0 ? c.prix : prixProduit
}

/**
 * Applique la marge du produit à chaque combinaison.
 *
 * La marge est celle que le vendeur a posée sur l'annonce — rapport entre son
 * prix de vente et son prix d'achat — et elle se reporte proportionnellement.
 * Une combinaison plus chère à l'achat doit l'être à la vente : un prix de vente
 * unique sur une matrice qui va de 8 € à 40 € vend la plus chère à perte.
 */
export function prixDeVenteDe(c: Combinaison, prixAchat: number, prixVente: number): number {
  const achat = prixDe(c, prixAchat)
  // Sans prix d'achat de référence, le rapport n'a pas de sens : on rend le prix
  // de vente du produit plutôt qu'une division par zéro.
  if (!prixAchat || prixAchat <= 0) return Math.round(prixVente * 100) / 100
  return Math.round(achat * (prixVente / prixAchat) * 100) / 100
}
