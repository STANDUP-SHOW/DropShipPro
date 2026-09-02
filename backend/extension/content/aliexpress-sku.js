/**
 * Relève les combinaisons d'une fiche AliExpress, dans la page affichée.
 *
 * **Pourquoi ça ne peut pas se faire côté serveur.** Sur la version React du
 * site, les données ne sont dans aucune balise `<script>` parsable : elles
 * vivent dans l'état du composant client, sous `props.data`, réparti en modules
 * — `SKU`, `PRICE`, `HEADER_IMAGE_PC`. Il n'y a plus d'objet `skuModule` global
 * comme sur l'ancien AliExpress. Un serveur qui va lire la page ne reçoit qu'une
 * coquille.
 *
 * Ce que ça rapporte, et qui manquait entièrement : **le prix, la photo, le
 * stock et la référence de chaque combinaison**. Sans eux, publier une fiche à
 * douze couleurs envoie douze fois le même prix et aucune image — non par défaut
 * d'appel, mais faute d'avoir quoi que ce soit à transmettre.
 *
 * La jointure elle-même est faite par le serveur (`services/aliexpressSku.ts`) :
 * ici on se contente de **trouver et de rendre les deux modules**. C'est la
 * bonne répartition — trouver l'objet demande d'explorer le DOM, le joindre
 * demande des règles qu'on veut pouvoir corriger sans republier l'extension.
 */
;(() => {
  /** Les modules qui nous intéressent. Le reste de `props.data` est ignoré. */
  const MODULES = ['SKU', 'PRICE']

  /**
   * Cherche l'objet `data` dans l'arbre React de la page.
   *
   * React accroche son état à des propriétés dont le nom porte un suffixe
   * aléatoire — `__reactProps$abc123`. On ne peut donc pas les nommer : il faut
   * les reconnaître à leur préfixe, puis descendre.
   */
  function depuisReact(racine) {
    const cle = Object.keys(racine).find(
      (k) => k.startsWith('__reactProps$') || k.startsWith('__reactFiber$'),
    )
    if (!cle) return null

    let noeud = racine[cle]
    // Une centaine de niveaux : l'arbre d'une fiche produit en fait plusieurs
    // dizaines, et une boucle sans borne sur un graphe cyclique ne s'arrête pas.
    for (let i = 0; i < 100 && noeud; i++) {
      const data = noeud?.memoizedProps?.data ?? noeud?.props?.data ?? noeud?.data
      if (data && typeof data === 'object' && MODULES.some((m) => data[m])) return data
      noeud = noeud.return ?? noeud.child ?? null
    }
    return null
  }

  /**
   * Le même objet, cherché dans les variables globales de la page.
   *
   * Certaines versions le posent sur `window` — `window.runParams`,
   * `window._d_c_`… Les noms changent d'une refonte à l'autre, alors on ne les
   * énumère pas : on cherche ce qui **ressemble** aux modules attendus.
   */
  function depuisGlobales() {
    for (const cle of Object.keys(window)) {
      let valeur
      try {
        valeur = window[cle]
      } catch {
        // Certaines propriétés lèvent à la lecture : on passe.
        continue
      }
      if (!valeur || typeof valeur !== 'object') continue

      if (MODULES.some((m) => valeur[m]?.skuPaths || valeur[m]?.skuIdStrPriceInfoMap)) return valeur
      const data = valeur.data
      if (data && typeof data === 'object' && MODULES.some((m) => data[m])) return data
    }
    return null
  }

  /**
   * Les deux modules, ou `null`.
   *
   * Rend `null` plutôt qu'un objet vide : l'appelant doit pouvoir distinguer
   * « cette page n'est pas une fiche AliExpress » de « c'en est une et elle n'a
   * aucune option », qui n'appellent pas la même conduite.
   */
  function relever() {
    if (!/aliexpress\./i.test(location.hostname)) return null

    let data = null
    for (const noeud of document.querySelectorAll('#root, #ice-container, body > div')) {
      data = depuisReact(noeud)
      if (data) break
    }
    if (!data) data = depuisGlobales()
    if (!data) return null

    const sku = data.SKU
    const prix = data.PRICE
    if (!sku?.skuPaths && !prix?.skuIdStrPriceInfoMap) return null

    /*
     * Seuls les deux modules partent, et allégés.
     *
     * `props.data` porte la page entière — avis, recommandations, vendeur,
     * livraison. L'envoyer ferait des centaines de kilo-octets par produit, et
     * vingt-cinq produits d'un lot en feraient plusieurs mégaoctets pour trois
     * champs utiles.
     */
    return {
      SKU: sku ? { skuPaths: sku.skuPaths, skuProperties: sku.skuProperties } : undefined,
      PRICE: prix ? { skuIdStrPriceInfoMap: prix.skuIdStrPriceInfoMap } : undefined,
    }
  }

  // Exposé au reste des scripts de contenu, qui tournent dans le même monde.
  window.__dspReleverSkuAliExpress = relever
})()
