/**
 * Ce que le sélecteur de photos affiche, et ce qu'il coche.
 *
 * **Sorti du sélecteur pour pouvoir être vérifié.** La règle vivait au milieu de
 * six cents lignes de construction d'interface, enfermée dans une fonction
 * anonyme : aucun banc ne pouvait l'atteindre, et elle a régressé deux fois
 * sans que rien ne le signale. Le vendeur, lui, le voyait à chaque import — des
 * bannières et des produits recommandés cochés d'office, à la place de la
 * galerie.
 *
 * Les deux fautes, et elles sont de nature différente :
 *
 * 1. **Retrier par surface.** Les candidats arrivent déjà classés par ce que la
 *    page déclare elle-même comme photos de sa fiche (JSON-LD, og:image), puis
 *    par leur présence dans une vraie balise `<img>`, puis par le CDN dominant.
 *    Un `sort` par surface efface tout ça, et une bannière de 1600×900 repasse
 *    devant une photo de galerie de 800×800. Cette faute était déjà corrigée en
 *    amont, dans la mesure — et refaite ici, quarante lignes plus loin.
 *
 * 2. **Cocher le format le plus représenté.** Séduisant, et faux : sur une fiche
 *    entourée de vingt produits recommandés, les plus nombreux à partager un
 *    format sont les recommandations, pas les six photos du produit. Compter
 *    n'est pas lire.
 *
 * D'où une seule règle, tenue ici : **on garde l'ordre reçu, et on coche les
 * premières assez grandes.**
 */
;(() => {
  /**
   * @param {Array<{url:string,width:number,height:number}>} candidats
   *   Déjà classés par l'étape de mesure. L'ordre est le résultat du travail,
   *   pas un hasard dont on pourrait se passer.
   * @param {{max:number, coteMin:number}} bornes
   * @returns {{ordre: Array, coches: string[]}}
   */
  function preselectionner(candidats, bornes) {
    const liste = Array.isArray(candidats) ? candidats : []
    const max = Number.isFinite(bornes?.max) ? bornes.max : 15
    const coteMin = Number.isFinite(bornes?.coteMin) ? bornes.coteMin : 400

    /*
     * L'ordre reçu, sans retouche. Pas de copie triée, pas de `sort` : rien.
     *
     * Rendre la liste telle quelle plutôt que de la laisser à l'appelant est
     * délibéré — c'est ce qui permet au banc d'affirmer que l'ordre survit au
     * passage, et à quiconque relit de voir qu'aucun tri ne s'est glissé ici.
     */
    const ordre = liste

    /*
     * Cochées : les premières du classement qui font une vraie photo.
     *
     * Le seuil de côté écarte les vignettes de navigation, qui sont bien
     * classées quand elles viennent du même CDN que la galerie. Il ne dit rien
     * sur le contenu — c'est le classement qui s'en charge.
     */
    const coches = ordre
      .filter((i) => Math.min(i.width, i.height) >= coteMin)
      .slice(0, max)
      .map((i) => i.url)

    return { ordre, coches }
  }

  // Exposé aux autres scripts de contenu, qui tournent dans le même monde, et
  // au banc, qui charge ce fichier tel quel.
  window.__dspPreselectionnerPhotos = preselectionner
})()
