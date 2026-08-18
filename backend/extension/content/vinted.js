/**
 * Vinted "vendre un article" autofill.
 *
 * Vinted has no public API and ships obfuscated class names, so these selectors
 * target stable-ish attributes (data-testid, name, id) with fallbacks. If Vinted
 * changes its form markup, the banner tells the user which fields were missed
 * instead of silently filling nothing.
 */
;(async () => {
  const listing = await consumePendingListing('VINTED')
  if (!listing) return

  showBanner('DropShipper IA : remplissage en cours…')

  await waitFor('input[name="title"], input#title, [data-testid="title--input"]')

  const filled = []
  const missed = []

  const titleOk = await fillFirst(
    ['input[name="title"]', 'input#title', '[data-testid="title--input"]'],
    listing.title,
  )
  titleOk ? filled.push('titre') : missed.push('titre')

  const descOk = await fillFirst(
    ['textarea[name="description"]', 'textarea#description', '[data-testid="description--input"]'],
    listing.description,
  )
  descOk ? filled.push('description') : missed.push('description')

  const priceOk = await fillFirst(
    ['input[name="price"]', 'input#price', '[data-testid="price-input--input"]'],
    listing.price,
  )
  priceOk ? filled.push('prix') : missed.push('prix')

  const fileInput = document.querySelector('input[type="file"]')
  const imageCount = await attachImages(fileInput, listing.images)
  imageCount ? filled.push(`${imageCount} photo(s)`) : missed.push('photos')

  // Category is a multi-step modal picker on Vinted, not a plain <select>, so it
  // can't be set programmatically in a reliable way — the user picks it manually.
  const note = listing.category ? ` Catégorie suggérée : ${listing.category}.` : ''
  showBanner(
    `Rempli : ${filled.join(', ') || 'rien'}.${missed.length ? ` À compléter : ${missed.join(', ')}, catégorie.` : ` Choisissez la catégorie.`}${note}`,
    missed.length ? 'error' : 'info',
  )
})()
