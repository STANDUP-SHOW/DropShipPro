/**
 * Ce que le sélecteur de photos affiche — et pourquoi il ne coche plus rien.
 *
 * **Décision du 02/09/2026 : aucune présélection.** Trois règles ont été
 * essayées en trois jours — le format le plus représenté, puis le classement
 * d'amont — et toutes trois cochaient des images qui n'étaient pas le produit :
 * des tondeuses sur une fiche de souris Bluetooth. Chacune se défendait en
 * théorie ; aucune ne tenait sur une vraie page.
 *
 * Le coût d'une mauvaise présélection est plus élevé qu'il n'y paraît. Ce n'est
 * pas seulement du décochage : c'est un import qui part avec les photos d'un
 * autre produit quand le vendeur ne relit pas, et c'est la parole de
 * l'application qui s'abîme — annoncer un tri intelligent puis proposer
 * n'importe quoi coûte plus que de ne rien annoncer.
 *
 * **Ce qui reste, et qui vaut :** l'ordre. Les candidats arrivent classés par ce
 * que la page déclare elle-même comme photos de sa fiche (JSON-LD, og:image),
 * puis par leur présence dans une vraie balise `<img>`, puis par le CDN
 * dominant. Cet ordre-là est conservé sans retouche — un `sort` par surface le
 * détruisait et remontait la bannière de soldes en tête. Proposer dans le bon
 * ordre est une aide honnête ; cocher à la place du vendeur ne l'était pas.
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
     * Rien de coché. C'est le vendeur qui choisit.
     *
     * `max` et `coteMin` restent dans la signature : ils servent au sélecteur
     * pour afficher le plafond et pour ranger les petites images à part. Les
     * retirer obligerait à retoucher l'appelant le jour où une présélection
     * fiable existera.
     */
    void max
    void coteMin
    const coches = []

    return { ordre, coches }
  }

  // Exposé aux autres scripts de contenu, qui tournent dans le même monde, et
  // au banc, qui charge ce fichier tel quel.
  window.__dspPreselectionnerPhotos = preselectionner
})()
