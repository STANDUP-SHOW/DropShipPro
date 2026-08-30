/**
 * Dépôt d'annonce sur Leboncoin, étape par étape.
 *
 * Les champs viennent d'un parcours réel relevé le 30/08/2026, plus de
 * suppositions. Deux des sélecteurs précédents étaient faux, et c'est pour ça
 * que « rien ne fonctionnait » même une fois l'annonce conservée : le prix
 * s'appelle `price_cents` et non `price`, et les photos passent par
 * `input#fileInput`.
 *
 * **Le formulaire est une application React en quatre écrans.** Passer d'un
 * écran au suivant ne recharge pas la page : un script lancé une seule fois au
 * chargement ne peut atteindre qu'un seul écran, et pas le bon. D'où le bouton
 * qui reste et qu'on reclique à chaque étape.
 *
 * Trois pièges relevés sur place, chacun invisible dans le code :
 *
 * - **Le titre ne suffit pas à lui seul** : les suggestions de catégorie
 *   n'apparaissent qu'une fois le champ quitté. Rempli sans `blur`, le titre est
 *   bien là et l'étape reste bloquée sans que rien ne l'explique.
 * - **Une photo au moins est obligatoire** pour passer l'étape 2. Ce n'est pas
 *   un confort, c'est un verrou.
 * - **Les comboboxes refusent la saisie libre.** Produit, Matière, Couleur et
 *   surtout l'adresse : le texte reste affiché, la valeur n'est pas retenue, et
 *   le formulaire refuse en désignant un champ qui a l'air rempli.
 *
 * L'identifiant des comboboxes est régénéré à chaque chargement — `:form-field-_r_12_`
 * ne vaut rien d'une session à l'autre. Elles se trouvent donc par leur libellé.
 *
 * **L'agent ne clique jamais sur « Déposer mon annonce ».** C'est ce clic qui
 * publie, et il est irréversible sans suppression manuelle. Il appartient au
 * vendeur.
 */
;(async () => {
  const listing = await peekPendingListing('LEBONCOIN')
  if (!listing) return

  /** Ce qui est déjà posé : le vendeur reclique sans tout réécrire. */
  const dejaFait = new Set()

  /** Trouve un champ par le libellé visible au-dessus de lui. */
  function parLibelle(mots) {
    const champs = [...document.querySelectorAll('input, textarea, select')]
    for (const el of champs) {
      if (el.type === 'hidden') continue
      const contexte = [
        el.getAttribute('aria-label'),
        el.getAttribute('placeholder'),
        el.closest('label')?.textContent,
        el.closest('div')?.previousElementSibling?.textContent?.slice(0, 80),
        el.parentElement?.parentElement?.textContent?.slice(0, 80),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (mots.some((m) => contexte.includes(m))) return el
    }
    return null
  }

  async function remplirCettePage() {
    const rempli = []
    const manque = []

    // --- Étape 1 et 3 : le titre --------------------------------------------
    // Présent sur les deux écrans, sous le même nom. Le `blur` déclenche les
    // suggestions de catégorie ; sans lui, l'étape ne s'ouvre pas.
    if (!dejaFait.has('titre') && listing.title) {
      const el = document.querySelector('input[name="subject"], input#subject')
      if (el) {
        setNativeValueAndBlur(el, listing.title.slice(0, 200))
        dejaFait.add('titre')
        rempli.push('titre')
      } else manque.push('titre')
    }

    // --- Étape 2 : les photos, verrou de l'étape ----------------------------
    if (!dejaFait.has('photos') && listing.images?.length) {
      const fileInput = document.querySelector('input#fileInput, input[type="file"]')
      if (fileInput) {
        const n = await attachImages(fileInput, listing.images)
        if (n) {
          dejaFait.add('photos')
          rempli.push(`${n} photo(s)`)
        } else manque.push('photos')
      } else manque.push('photos')
    }

    // --- Étape 2 : l'état, une liste fermée de cinq valeurs -----------------
    // Un produit importé est neuf : c'est vrai, et ça évite au vendeur de
    // choisir cinq fois la même chose.
    if (!dejaFait.has('état')) {
      const select = [...document.querySelectorAll('select')].find((s) =>
        [...s.options].some((o) => /état neuf|tres bon état|très bon état/i.test(o.textContent)),
      )
      if (select && choisirDansSelect(select, ['État neuf', 'Etat neuf', 'neuf'])) {
        dejaFait.add('état')
        rempli.push('état (neuf)')
      }
    }

    // --- Étape 3 : description et prix --------------------------------------
    // Leboncoin propose sa propre description écrite par son IA ; la nôtre est
    // faite pour se vendre et pour le référencement, elle la remplace.
    if (!dejaFait.has('description') && listing.description) {
      const el = document.querySelector('textarea[name="body"], textarea#body')
      if (el) {
        setNativeValue(el, listing.description.slice(0, 4000))
        dejaFait.add('description')
        rempli.push('description')
      } else manque.push('description')
    }

    if (!dejaFait.has('prix') && listing.price) {
      const el = document.querySelector('input[name="price_cents"], input#price_cents')
      if (el) {
        // Le champ s'appelle « cents » mais attend des euros : c'est le nom
        // interne de Leboncoin, pas son unité.
        setNativeValue(el, String(listing.price))
        dejaFait.add('prix')
        rempli.push('prix')
      } else manque.push('prix')
    }

    /*
     * L'adresse reste au vendeur, et c'est délibéré.
     *
     * C'est l'endroit où se trouve le bien — la sienne, que nous ne connaissons
     * pas et qu'il serait faux de deviner. Elle exige en plus de choisir une
     * suggestion dans la liste : une ville tapée sans être sélectionnée reste
     * affichée mais n'est pas retenue, et le formulaire refuse en désignant un
     * champ qui a pourtant l'air rempli.
     */
    if (document.querySelector('input[name="location"]') && !dejaFait.has('adresse')) {
      manque.push('adresse (à choisir dans la liste déroulante)')
    }

    return { rempli, manque }
  }

  const widget = monterBoutonRemplissage({
    titre: 'Remplir cette étape',
    remplir: remplirCettePage,
    listing,
    onFermer: releasePendingListing,
  })

  const categorie = listing.category ? ` Catégorie suggérée : ${listing.category}.` : ''
  widget.dire(
    `« ${listing.title?.slice(0, 60) ?? 'Votre annonce'} » est prête.${categorie} ` +
      'Cliquez à chaque écran. Produit, matière et couleur sont proposés par Leboncoin ' +
      "d'après le titre : corrigez-les plutôt que de les ressaisir. C'est vous qui déposez.",
  )
})()
