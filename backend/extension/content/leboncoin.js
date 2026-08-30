/**
 * Dépôt d'annonce sur Leboncoin, étape par étape.
 *
 * **Ce qui ne marchait pas, et pourquoi.** Le remplissage partait une seule
 * fois, au chargement de la page, et consommait l'annonce au passage. Or
 * Leboncoin dépose en plusieurs étapes : la première est le choix de la
 * catégorie, où il n'y a rien à remplir. Le script tournait donc là, ne trouvait
 * aucun champ — et l'annonce était déjà effacée quand le vendeur arrivait au
 * formulaire. D'où « rien ne fonctionne ».
 *
 * Deux corrections, et la seconde est la vraie.
 *
 * **L'annonce reste en réserve** tant que le vendeur ne l'a pas relâchée : elle
 * traverse toutes les étapes.
 *
 * **Un bouton reste affiché** et remplit ce qui est présent à l'écran, à chaque
 * étape, autant de fois qu'il le faut. Les étapes suivantes ne rechargent pas la
 * page — le script du navigateur ne repart pas tout seul — et il n'existe aucun
 * moyen fiable de deviner qu'une étape a changé sur un formulaire qui se
 * reconstruit. Le vendeur, lui, le voit.
 *
 * **L'agent ne clique jamais sur « Publier ».** Il remplit, le vendeur relit et
 * valide. C'est la règle de la maison, et elle protège son compte.
 */
;(async () => {
  const listing = await peekPendingListing('LEBONCOIN')
  if (!listing) return

  /** Ce qui a déjà été rempli, pour ne pas le réannoncer à chaque clic. */
  const dejaFait = new Set()

  /**
   * Remplit ce qui est présent maintenant.
   *
   * Aucune attente : le bouton agit sur ce que le vendeur a sous les yeux. Un
   * `waitFor` de quinze secondes sur un champ absent ferait croire à un blocage
   * alors que l'étape est simplement une autre.
   */
  async function remplirCettePage() {
    const rempli = []
    const manque = []

    const essayer = async (nom, selecteurs, valeur) => {
      if (!valeur) return
      if (dejaFait.has(nom)) return
      const el = selecteurs.map((s) => document.querySelector(s)).find(Boolean)
      if (!el) {
        manque.push(nom)
        return
      }
      setNativeValue(el, valeur)
      dejaFait.add(nom)
      rempli.push(nom)
    }

    await essayer(
      'titre',
      ['input[name="subject"]', 'input[name="title"]', 'input#subject', 'input[data-qa-id="adtitle"]'],
      listing.title,
    )

    await essayer(
      'description',
      ['textarea[name="body"]', 'textarea[name="description"]', 'textarea#body', 'textarea[data-qa-id="addescription"]'],
      listing.description,
    )

    await essayer(
      'prix',
      ['input[name="price"]', 'input#price', 'input[data-qa-id="adprice"]'],
      listing.price,
    )

    // Les photos ont leur propre étape : le champ n'existe nulle part ailleurs.
    if (!dejaFait.has('photos') && listing.images?.length) {
      const fileInput = document.querySelector('input[type="file"]')
      if (fileInput) {
        const n = await attachImages(fileInput, listing.images)
        if (n) {
          dejaFait.add('photos')
          rempli.push(`${n} photo(s)`)
        } else {
          manque.push('photos')
        }
      } else {
        manque.push('photos')
      }
    }

    return { rempli, manque }
  }

  const widget = monterBoutonRemplissage({
    titre: 'Remplir cette étape',
    remplir: remplirCettePage,
    // De quoi montrer l annonce au survol.
    listing,
    // Relâcher l'annonce à la fermeture : sans ça, le bouton reviendrait au
    // prochain dépôt avec les données du précédent.
    onFermer: releasePendingListing,
  })

  const categorie = listing.category ? ` Catégorie suggérée : ${listing.category}.` : ''
  widget.dire(
    `« ${listing.title?.slice(0, 60) ?? 'Votre annonce'} » est prête.${categorie} ` +
      "Cliquez à chaque étape du dépôt : le bouton reste jusqu'à ce que vous le fermiez. C'est vous qui publiez.",
  )
})()
