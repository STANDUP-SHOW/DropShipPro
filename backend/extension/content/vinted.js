/**
 * Dépôt d'article sur Vinted, étape par étape.
 *
 * Même correction que Leboncoin, et pour la même raison : l'annonce était
 * consommée au premier chargement, alors que le dépôt se fait en plusieurs
 * écrans. Le bouton reste, et remplit ce qui est présent à chaque étape.
 *
 * Vinted n'a pas d'API publique et brouille ses noms de classes : les sélecteurs
 * visent ce qui bouge le moins — `data-testid`, `name`, `id`. Quand ils ne
 * trouvent rien, le relevé des champs réellement présents part dans le message
 * plutôt qu'un « rien trouvé » qui n'apprend rien.
 */
;(async () => {
  const listing = await peekPendingListing('VINTED')
  if (!listing) return

  const dejaFait = new Set()

  async function remplirCettePage() {
    const rempli = []
    const manque = []

    const essayer = (nom, selecteurs, valeur) => {
      if (!valeur || dejaFait.has(nom)) return
      const el = selecteurs.map((s) => document.querySelector(s)).find(Boolean)
      if (!el) return manque.push(nom)
      setNativeValue(el, valeur)
      dejaFait.add(nom)
      rempli.push(nom)
    }

    essayer('titre', ['input[name="title"]', 'input#title', '[data-testid="title--input"]'], listing.title)
    essayer(
      'description',
      ['textarea[name="description"]', 'textarea#description', '[data-testid="description--input"]'],
      listing.description,
    )
    essayer('prix', ['input[name="price"]', 'input#price', '[data-testid="price-input--input"]'], listing.price)

    if (!dejaFait.has('photos') && listing.images?.length) {
      const fileInput = document.querySelector('input[type="file"]')
      if (fileInput) {
        const n = await attachImages(fileInput, listing.images)
        if (n) {
          dejaFait.add('photos')
          rempli.push(`${n} photo(s)`)
        } else manque.push('photos')
      } else manque.push('photos')
    }

    return { rempli, manque }
  }

  const widget = monterBoutonRemplissage({
    titre: 'Remplir cette étape',
    remplir: remplirCettePage,
    listing,
    onFermer: releasePendingListing,
  })

  // La catégorie de Vinted est une fenêtre à plusieurs niveaux, pas un menu
  // déroulant : elle ne se règle pas de façon fiable par script. Le vendeur la
  // choisit, et on le lui dit plutôt que de le laisser attendre.
  const categorie = listing.category ? ` Catégorie suggérée : ${listing.category}.` : ''
  widget.dire(
    `« ${listing.title?.slice(0, 60) ?? 'Votre article'} » est prêt.${categorie} ` +
      'Cliquez à chaque étape ; choisissez la catégorie vous-même. C\'est vous qui publiez.',
  )
})()
