/**
 * Facebook Marketplace "créer une annonce" autofill.
 *
 * Marketplace has no public listing API (the Commerce API only covers Shops, and
 * is gated), so the form is filled here. Facebook ships obfuscated class names and
 * re-renders aggressively, so fields are matched on their visible label text and
 * aria attributes rather than on selectors that change between deploys.
 */
;(async () => {
  const listing = await consumePendingListing('FACEBOOK')
  if (!listing) return

  showBanner('DropShipper IA : remplissage en cours…')

  await waitFor('input[type="text"], textarea, [role="textbox"]')

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

  const filled = []
  const missed = []

  const titleEl = fieldByLabel(['titre', 'title'])
  if (titleEl) {
    setNativeValue(titleEl, listing.title)
    filled.push('titre')
  } else missed.push('titre')

  const priceEl = fieldByLabel(['prix', 'price'])
  if (priceEl) {
    setNativeValue(priceEl, listing.price)
    filled.push('prix')
  } else missed.push('prix')

  const descEl = fieldByLabel(['description', 'détails', 'details'])
  if (descEl) {
    setNativeValue(descEl, listing.description)
    filled.push('description')
  } else missed.push('description')

  const fileInput = document.querySelector('input[type="file"]')
  const imageCount = await attachImages(fileInput, listing.images)
  imageCount ? filled.push(`${imageCount} photo(s)`) : missed.push('photos')

  const note = listing.category ? ` Catégorie suggérée : ${listing.category}.` : ''
  showBanner(
    `Rempli : ${filled.join(', ') || 'rien'}.${missed.length ? ` À compléter : ${missed.join(', ')}, catégorie.` : ' Choisissez la catégorie.'}${note}`,
    missed.length ? 'error' : 'info',
  )
})()
