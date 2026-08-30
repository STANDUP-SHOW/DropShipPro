/**
 * Facebook Marketplace "créer une annonce" autofill.
 *
 * Marketplace has no public listing API (the Commerce API only covers Shops, and
 * is gated), so the form is filled here. Facebook ships obfuscated class names and
 * re-renders aggressively, so fields are matched on their visible label text and
 * aria attributes rather than on selectors that change between deploys.
 */
;(async () => {
  const listing = await peekPendingListing('FACEBOOK')
  if (!listing) return

  const dejaFait = new Set()

  /** Finds the input whose surrounding label matches one of the given words. */
  function fieldByLabel(words) {
    const candidates = [...document.querySelectorAll('input[type="text"], textarea, [role="textbox"]')]
    for (const el of candidates) {
      const context = [
        el.getAttribute('aria-label'),
        el.getAttribute('placeholder'),
        el.closest('label')?.textContent,
        el.parentElement?.textContent?.slice(0, 60),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (words.some((w) => context.includes(w))) return el
    }
    return null
  }

  async function remplirCettePage() {
    const rempli = []
    const manque = []

    const essayer = (nom, mots, valeur) => {
      if (!valeur || dejaFait.has(nom)) return
      const el = fieldByLabel(mots)
      if (!el) return manque.push(nom)
      setNativeValue(el, valeur)
      dejaFait.add(nom)
      rempli.push(nom)
    }

    essayer('titre', ['titre', 'title'], listing.title)
    essayer('prix', ['prix', 'price'], listing.price)
    essayer('description', ['description', 'détails', 'details'], listing.description)

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

  const categorie = listing.category ? ` Catégorie suggérée : ${listing.category}.` : ''
  widget.dire(
    `« ${listing.title?.slice(0, 60) ?? 'Votre annonce'} » est prête.${categorie} ` +
      "Cliquez à chaque étape ; choisissez la catégorie vous-même. C'est vous qui publiez.",
  )
})()
