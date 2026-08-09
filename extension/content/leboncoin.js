/**
 * Leboncoin "déposer une annonce" autofill.
 *
 * Leboncoin's flow starts with a category step that gates the rest of the form,
 * so the fill runs against whatever fields are present once the user has reached
 * the details step; fields not yet rendered are reported back in the banner.
 */
;(async () => {
  const listing = await consumePendingListing('LEBONCOIN')
  if (!listing) return

  showBanner('DropShip Pro : remplissage en cours…')

  await waitFor('input[name="subject"], input[name="title"], textarea[name="body"]')

  const filled = []
  const missed = []

  const titleOk = await fillFirst(
    ['input[name="subject"]', 'input[name="title"]', 'input#subject'],
    listing.title,
  )
  titleOk ? filled.push('titre') : missed.push('titre')

  const descOk = await fillFirst(
    ['textarea[name="body"]', 'textarea[name="description"]', 'textarea#body'],
    listing.description,
  )
  descOk ? filled.push('description') : missed.push('description')

  const priceOk = await fillFirst(['input[name="price"]', 'input#price'], listing.price)
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
