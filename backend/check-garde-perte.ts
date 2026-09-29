/**
 * Banc : le garde-fou de perte de la commande fournisseur (Maximum Loss Guard
 * du mémo V2, 29/09/2026). Sans base : la fonction est pure.
 *
 * Ce qu'il tient : une commande qui coûte autant ou plus que la vente est
 * bloquée avec le code FLAGGED_PRICE_ERROR et les deux montants ; une vente
 * rentable passe ; une vente sans montant (vitrine sans paiement) n'est pas
 * jugée ; une donnée illisible ne bloque pas à tort.
 */
import { gardePerte } from './src/services/supplierOrders.js'

let echecs = 0
function verifier(nom: string, condition: boolean, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

verifier('vente rentable : passe', gardePerte(12, 30) === null)
const aPerte = gardePerte(30, 25)
verifier('coût supérieur à la vente : bloquée, avec code et montants', !!aPerte && aPerte.startsWith('FLAGGED_PRICE_ERROR') && aPerte.includes('30,00 €') && aPerte.includes('25,00 €') && aPerte.includes('5,00 € de perte'), aPerte ?? '')
verifier('marge nulle : bloquée aussi (aucun gain, des frais)', gardePerte(25, 25) !== null)
verifier('vente sans montant : non jugée', gardePerte(10, 0) === null)
verifier('coût illisible : ne bloque pas à tort', gardePerte(Number.NaN, 20) === null)

if (echecs) {
  console.error(`\n${echecs} attente(s) manquée(s).`)
  process.exit(1)
}
console.log('\nGarde-fou de perte : tout passe.')
process.exit(0)
