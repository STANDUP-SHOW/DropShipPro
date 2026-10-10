'use strict'
/** A provider failure with the provider's own words, never swallowed into "success". */
class ErreurFournisseur extends Error {
  constructor(fournisseur, message, extra) {
    super(`${fournisseur} : ${message}`)
    this.name = 'ErreurFournisseur'
    this.fournisseur = fournisseur
    Object.assign(this, extra || {})
  }
}
module.exports = { ErreurFournisseur }
