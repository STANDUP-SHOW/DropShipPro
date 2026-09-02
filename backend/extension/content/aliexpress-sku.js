/**
 * Relève les combinaisons d'une fiche AliExpress, dans la page affichée.
 *
 * **Ce fichier tourne dans le monde principal de la page (`world: 'MAIN'`), et
 * c'est la condition pour qu'il fonctionne.** Un script de contenu ordinaire
 * partage le DOM mais pas le tas JavaScript : les propriétés que React pose sur
 * les nœuds — `__reactInternalInstance$…` — lui sont **invisibles**. La première
 * version vivait dans le monde isolé, ne trouvait donc jamais rien, et rendait
 * `null` sans erreur. Vérifié le 02/09/2026 sur une vraie fiche : zéro
 * combinaison relevée, alors que la page en portait quatre avec leurs prix.
 *
 * **Ce qui a été relevé sur la page réelle**, et qui corrige trois suppositions :
 *
 * - La clé React est `__reactInternalInstance$…` (React 16), pas
 *   `__reactFiber$` ni `__reactProps$` (React 18). La racine `#root` porte
 *   `__reactContainere$…`, encore un autre nom.
 * - Les données ne sont pas atteignables depuis la racine : il faut partir d'un
 *   nœud du bloc des variantes (`[class*="sku"]`) et **remonter** onze niveaux
 *   de `return` jusqu'au composant qui porte `props.data`.
 * - `props.data.SKU.skuPaths` et `props.data.PRICE.skuIdStrPriceInfoMap`
 *   existent bien, et la jointure se fait par `skuIdStr` — `skuId` vaut ici
 *   `skuIdStr + 1`, donc s'y fier donnerait le même prix partout.
 *
 * Le résultat repart vers le script de capture par un évènement du DOM, en
 * **texte JSON** : c'est le seul passage sûr entre les deux mondes, un objet
 * franchissant mal la frontière.
 */
;(() => {
  /** Les préfixes que React a utilisés au fil de ses versions. Tous acceptés. */
  const PREFIXES_REACT = [
    '__reactInternalInstance$',
    '__reactFiber$',
    '__reactProps$',
    '__reactContainere$',
    '__reactEventHandlers$',
  ]

  /** Lecture qui a le droit d'échouer — une fenêtre d'une autre origine lève. */
  function lire(objet, cle) {
    try {
      return objet[cle]
    } catch {
      return undefined
    }
  }

  function cleReact(noeud) {
    return Object.keys(noeud).find((k) => PREFIXES_REACT.some((p) => k.startsWith(p)))
  }

  /**
   * Remonte depuis un nœud du DOM jusqu'au composant qui porte `props.data`.
   *
   * On remonte, on ne descend pas : les données vivent chez un ancêtre, et
   * descendre depuis la racine traverse des centaines de fibres sans jamais
   * croiser celle-là — c'est ce que faisait la version précédente.
   */
  function depuisNoeud(noeud) {
    const cle = cleReact(noeud)
    if (!cle) return null

    let fibre = lire(noeud, cle)
    // Quinze niveaux suffisent largement : le composant cherché est à onze sur
    // la fiche relevée. Une borne évite la boucle sur un graphe cyclique.
    for (let i = 0; i < 30 && fibre; i++) {
      for (const champ of ['memoizedProps', 'pendingProps', 'props']) {
        const data = lire(lire(fibre, champ) ?? {}, 'data')
        if (data && typeof data === 'object' && (data.SKU || data.PRICE)) return data
      }
      fibre = lire(fibre, 'return') ?? null
    }
    return null
  }

  /**
   * Les nœuds par lesquels commencer, du plus sûr au plus large.
   *
   * Le bloc des variantes d'abord : c'est lui qui reçoit `props.data` en
   * héritage direct. Les racines ensuite, au cas où la page changerait de
   * gabarit — mieux vaut une seconde chance qu'un relevé vide.
   */
  function noeudsDepart() {
    const bloc = [...document.querySelectorAll('[class*="sku--wrap"], [class*="sku-item--"], [class*="sku" i]')]
    const racines = [...document.querySelectorAll('#root, #ice-container, body > div')]
    return [...bloc.slice(0, 12), ...racines]
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
    for (const noeud of noeudsDepart()) {
      data = depuisNoeud(noeud)
      if (data) break
    }
    if (!data) return null

    const sku = data.SKU
    const prix = data.PRICE
    if (!sku?.skuPaths && !prix?.skuIdStrPriceInfoMap) return null

    /*
     * Seuls les deux modules partent, et allégés.
     *
     * `props.data` porte la page entière — avis, recommandations, vendeur,
     * livraison, vingt autres blocs. L'envoyer ferait des centaines de
     * kilo-octets par produit, et vingt-cinq produits d'un lot en feraient
     * plusieurs mégaoctets pour trois champs utiles.
     */
    return {
      SKU: sku ? { skuPaths: sku.skuPaths, skuProperties: sku.skuProperties } : undefined,
      PRICE: prix ? { skuIdStrPriceInfoMap: prix.skuIdStrPriceInfoMap } : undefined,
    }
  }

  /** Ne lève jamais : une fiche sans variantes reste une fiche importable. */
  function releverSansLever() {
    try {
      return relever()
    } catch (e) {
      console.warn('[DropShipper] relevé des variantes AliExpress abandonné :', e?.message || e)
      return null
    }
  }

  /*
   * Le pont entre les deux mondes.
   *
   * Le script de capture vit dans le monde isolé et ne peut pas appeler une
   * fonction d'ici. Il demande par un évènement, on répond par un autre, et la
   * charge voyage en **texte** : un objet passe mal la frontière des mondes,
   * silencieusement, en arrivant vide de l'autre côté.
   */
  window.addEventListener('dsp-sku-demande', () => {
    let charge = null
    try {
      charge = JSON.stringify(releverSansLever())
    } catch {
      // Structure circulaire ou trop grande : on répond « rien » plutôt que de
      // laisser l'attente expirer.
      charge = null
    }
    window.dispatchEvent(new CustomEvent('dsp-sku-reponse', { detail: charge }))
  })

  // Gardé pour les pages où ce fichier tourne déjà dans le monde principal.
  window.__dspReleverSkuAliExpress = releverSansLever
})()
