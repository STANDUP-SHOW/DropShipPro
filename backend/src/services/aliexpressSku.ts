import type { Combinaison } from './variantMatrix.js'

/**
 * Lit la matrice des SKU d'une fiche AliExpress.
 *
 * **Relevé sur la page le 02/09/2026**, sur la version React « aer » du site.
 * Les données ne sont **pas** dans une balise `<script>` parsable au
 * chargement : elles vivent dans l'état du composant client, sous `props.data`,
 * réparti en modules. Il n'y a plus d'objet `skuModule` global comme sur
 * l'ancien AliExpress — c'est l'extension qui doit les lire dans la page rendue
 * et nous les envoyer.
 *
 * ## La jointure, en trois temps
 *
 * ```
 * SKU.skuPaths[i]                     → la combinaison, son stock, sa dispo
 *   .path         "14:175"            → idPropriété:idValeur
 *   .skuIdStr     "12000058975660912" → la clé
 *
 * PRICE.skuIdStrPriceInfoMap[skuIdStr] → le prix de cette combinaison
 *
 * SKU.skuProperties[n].skuPropertyValues[m] → le nom lisible et l'image
 *   .propertyValueIdLong  175
 *   .skuPropertyImagePath "https://…"
 * ```
 *
 * **Le piège, et il coûte une demi-journée à qui le découvre en débogage :**
 * `skuId` est identique sur toutes les entrées — champ constant ou défaut de la
 * source. C'est **`skuIdStr`** qui diffère par combinaison, et c'est donc lui la
 * vraie clé de jointure avec `PRICE`. Se fier à `skuId` donnerait le même prix
 * partout, c'est-à-dire exactement le défaut qu'on corrige.
 */

/** Ce que l'extension nous envoie : les deux modules, tels quels. */
export interface ModulesAliExpress {
  SKU?: {
    skuPaths?: Record<string, unknown> | unknown[]
    skuProperties?: Record<string, unknown> | unknown[]
  }
  PRICE?: {
    skuIdStrPriceInfoMap?: Record<string, unknown>
  }
}

/**
 * Les objets indexés d'AliExpress, rendus parcourables.
 *
 * `skuPaths` et `skuProperties` arrivent comme des objets `{ "0": …, "1": … }`
 * et non comme des tableaux — c'est ce que rend leur sérialisation. Les traiter
 * en tableau donnerait une liste vide, sans erreur.
 */
function enListe(valeur: unknown): unknown[] {
  if (Array.isArray(valeur)) return valeur
  if (valeur && typeof valeur === 'object') return Object.values(valeur as Record<string, unknown>)
  return []
}

/**
 * Un prix, lu d'où qu'il vienne.
 *
 * AliExpress rend tantôt un nombre, tantôt « 8,49€ », tantôt « €8.49 ». La
 * virgule décimale française est le piège : `Number('8,49')` vaut `NaN`, et une
 * combinaison sans prix retombe sur celui du produit — silencieusement.
 */
export function lirePrix(valeur: unknown): number | undefined {
  if (typeof valeur === 'number' && Number.isFinite(valeur) && valeur > 0) return valeur
  if (typeof valeur !== 'string') return undefined

  // On garde chiffres, points et virgules, puis on tranche le séparateur
  // décimal : le dernier des deux est celui qui compte (« 1.299,90 » comme
  // « 1,299.90 » existent selon la place de marché).
  const nettoye = valeur.replace(/[^\d.,]/g, '')
  if (!nettoye) return undefined

  const dernierPoint = nettoye.lastIndexOf('.')
  const derniereVirgule = nettoye.lastIndexOf(',')
  const coupe = Math.max(dernierPoint, derniereVirgule)

  const normalise =
    coupe < 0
      ? nettoye
      : `${nettoye.slice(0, coupe).replace(/[.,]/g, '')}.${nettoye.slice(coupe + 1)}`

  const n = Number(normalise)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/** Le prix d'un SKU, en préférant toujours un champ numérique à un libellé. */
function prixDuSku(info: Record<string, unknown> | undefined) {
  if (!info) return { prix: undefined, prixOriginal: undefined }

  const original = info.originalPrice as Record<string, unknown> | undefined
  return {
    prix:
      lirePrix(info.salePriceLocal) ??
      lirePrix(info.salePriceString) ??
      lirePrix(original?.value) ??
      lirePrix(original?.formatedAmount),
    prixOriginal: lirePrix(original?.value) ?? lirePrix(original?.formatedAmount),
  }
}

/**
 * Les valeurs de propriété, indexées par `idPropriété:idValeur`.
 *
 * C'est la table que `path` interroge. La construire une fois évite de reparcourir
 * toutes les propriétés pour chaque combinaison — une fiche à quarante SKU et
 * trois propriétés ferait cent vingt parcours pour rien.
 */
function indexerProprietes(skuProperties: unknown) {
  const parCle = new Map<string, { option: string; valeur: string; image?: string }>()

  for (const p of enListe(skuProperties)) {
    const prop = p as Record<string, unknown>
    const idProp = String(prop.skuPropertyId ?? '')
    const nomOption = String(prop.skuPropertyName ?? '').trim() || 'Option'

    for (const v of enListe(prop.skuPropertyValues)) {
      const val = v as Record<string, unknown>
      const idValeur = String(val.propertyValueIdLong ?? val.propertyValueId ?? '')
      if (!idProp || !idValeur) continue

      /*
       * Le nom affiché d'abord, le nom technique ensuite.
       *
       * `propertyValueDisplayName` est ce que l'acheteur lit — « Bleu marine » —
       * là où `propertyValueName` porte souvent le code fournisseur
       * (« 069-Blue »). Publier le second donnerait une boutique remplie de
       * références internes.
       */
      const lisible =
        String(val.propertyValueDisplayName ?? '').trim() ||
        String(val.propertyValueName ?? '').trim() ||
        String(val.skuColorValue ?? '').trim()

      const image = String(val.skuPropertyImagePath ?? '').trim()

      parCle.set(`${idProp}:${idValeur}`, {
        option: nomOption,
        valeur: lisible || idValeur,
        image: image.startsWith('http') ? image : undefined,
      })
    }
  }

  return parCle
}

/**
 * Rend la matrice des combinaisons, prête à être enregistrée.
 *
 * Une combinaison dont aucune option n'est reconnue est écartée : elle n'aurait
 * pas de clé, donc pas d'existence — mieux vaut onze lignes justes que douze
 * dont une anonyme.
 */
export function lireSkuAliExpress(modules: ModulesAliExpress): Combinaison[] {
  const proprietes = indexerProprietes(modules.SKU?.skuProperties)
  const prixParSku = (modules.PRICE?.skuIdStrPriceInfoMap ?? {}) as Record<string, Record<string, unknown>>

  const lignes: Combinaison[] = []

  for (const entree of enListe(modules.SKU?.skuPaths)) {
    const sku = entree as Record<string, unknown>

    // `skuIdStr` et non `skuId` : voir l'en-tête de ce fichier.
    const cle = String(sku.skuIdStr ?? '').trim()
    /*
     * `path`, et `skuAttr` s'il n'y a pas de `path`.
     *
     * Les deux décrivent la même combinaison, sous deux formes qui coexistent
     * selon la version de la page : « 14:193;5:361386 » d'un côté,
     * « 14:193#Noir;5:361386#M » de l'autre. Ne lire que `path` fait rendre
     * **zéro combinaison sans la moindre erreur** sur les fiches qui ne
     * portent que l'autre — le pire des échecs, celui qui ressemble à un
     * produit sans options.
     */
    const chemin = String(sku.path ?? sku.skuAttr ?? '').trim()
    if (!chemin) continue

    const combo: Record<string, string> = {}
    let image: string | undefined

    // Plusieurs propriétés se séparent par des points-virgules : « 14:175;5:100 ».
    for (const morceau of chemin.split(';')) {
      // Le nom lisible est parfois collé derrière un dièse — « 14:193#Noir ».
      // Il n'ajoute rien : le nom se lit dans `skuProperties`, et le garder
      // ferait manquer la clé.
      const trouve = proprietes.get(morceau.trim().split('#')[0].trim())
      if (!trouve) continue
      combo[trouve.option] = trouve.valeur
      // La première image rencontrée fait la photo de la combinaison : c'est
      // presque toujours la couleur qui en porte une, jamais la taille.
      if (!image && trouve.image) image = trouve.image
    }

    if (!Object.keys(combo).length) continue

    const { prix, prixOriginal } = prixDuSku(prixParSku[cle])
    const stock = Number(sku.skuStock)

    lignes.push({
      combo,
      prix,
      // Un prix barré égal au prix de vente n'est pas une remise : l'afficher
      // ferait une réduction de zéro pour cent sur la fiche.
      prixOriginal: prixOriginal && prix && prixOriginal > prix ? prixOriginal : undefined,
      image,
      sku: cle || undefined,
      stock: Number.isFinite(stock) && stock >= 0 ? stock : undefined,
      // `salable: false` ou stock nul : le fournisseur ne la vend pas.
      disponible: sku.salable !== false && (!Number.isFinite(stock) || stock > 0),
    })
  }

  return lignes
}
