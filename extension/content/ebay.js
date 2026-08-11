/**
 * eBay listing-form autofill.
 *
 * This is the stopgap for eBay: once the user connects their eBay Sell API
 * credentials in Réglages, publishing goes through the API server-side and this
 * script is no longer needed. Until then it fills the web form like the others.
 */
;(async () => {
  const listing = await consumePendingListing('EBAY')
  if (!listing) return

  showBanner('DropShipper IA : remplissage en cours…')

  await waitFor('input[name="title"], input#s0-1-24-7-8-primaryTitle, textarea[name="description"]')

  const filled = []
  const missed = []

  const titleOk = await fillFirst(
    ['input[name="title"]', 'input[aria-label*="titre" i]', 'input[placeholder*="titre" i]'],
    listing.title,
  )
  titleOk ? filled.push('titre') : missed.push('titre')

  const descOk = await fillFirst(
    ['textarea[name="description"]', 'textarea[aria-label*="description" i]'],
    listing.description,
  )
  descOk ? filled.push('description') : missed.push('description')

  const priceOk = await fillFirst(
    ['input[name="price"]', 'input[name="startPrice"]', 'input[aria-label*="prix" i]'],
    listing.price,
  )
  priceOk ? filled.push('prix') : missed.push('prix')

  const fileInput = document.querySelector('input[type="file"]')
  const imageCount = await attachImages(fileInput, listing.images)
  imageCount ? filled.push(`${imageCount} photo(s)`) : missed.push('photos')

  const note = listing.category ? ` Catégorie suggérée : ${listing.category}.` : ''
  showBanner(
    `Rempli : ${filled.join(', ') || 'rien'}.${missed.length ? ` À compléter : ${missed.join(', ')}.` : ''}${note}`,
    missed.length ? 'error' : 'info',
  )
})()
