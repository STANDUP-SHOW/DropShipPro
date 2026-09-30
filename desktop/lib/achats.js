'use strict'
/**
 * La commande chez un fournisseur SANS API, préparée dans la session du vendeur
 * (mémo auto-fulfillment § III) : fiche du produit → variante → panier → commande
 * → adresse du client, et ARRÊT au paiement. Le vendeur paie lui-même, toujours.
 *
 * Ce fichier ne connaît ni Electron ni le DOM : il décide (mots des boutons,
 * champs d'adresse, signes d'arrêt) et se teste sans navigateur. Les fonctions de
 * page sont dans page.js ; le pilote dans pilote-achat.js.
 *
 * Interdits, et écrits pour ne pas être « oubliés » (CLAUDE.md, décision du 29/09) :
 * aucun geste simulé, aucun délai aléatoire, aucun contournement d'anti-robot ;
 * aucune lecture ni saisie de carte bancaire, jamais de clic sur « Payer ».
 */

/** Les boutons qu'on cherche, par texte visible (normalisé), dans l'ordre de préférence. */
const BOUTONS = {
  panier: ['ajouter au panier', 'add to cart', 'ajouter', 'acheter maintenant', 'buy now', 'acheter', 'add to bag', 'add to basket'],
  commander: ['passer la commande', 'passer commande', 'commander', 'proceed to checkout', 'checkout', 'check out', 'valider mon panier', 'valider le panier', 'continuer', 'continue', 'voir le panier', 'view cart', 'go to cart'],
}

/** Les mots d'un bouton qu'on NE CLIQUE JAMAIS : c'est le paiement. */
const MOTS_PAIEMENT = [/\bpay(er|ment|ez|ing)?\b/i, /\bpaiement\b/i, /place (your )?order/i, /confirm(er)? (la |l')?commande/i, /confirm (and|&) pay/i, /acheter et payer/i, /valider (le|mon) paiement/i, /commander et payer/i, /\bbuy now\b.*\bpay\b/i]

/** Les signes que la page est l'écran de paiement : on s'arrête là, quoi qu'il reste. */
const SIGNES_PAIEMENT = {
  champs: ['input[autocomplete="cc-number"]', 'input[autocomplete="cc-csc"]', 'input[name*="card" i][name*="number" i]', 'input[name*="cvv" i]', 'input[name*="cvc" i]', 'iframe[src*="stripe" i]', 'iframe[src*="adyen" i]', 'iframe[src*="paypal" i]', 'iframe[src*="checkout" i]', 'iframe[name*="card" i]'],
  textes: [/num[ée]ro de carte/i, /card number/i, /\bcvv\b|\bcvc\b|cryptogramme/i, /mode de paiement|moyen de paiement|payment method/i],
}

/**
 * L'adresse du client → les champs d'un formulaire de livraison, reconnus par
 * \`autocomplete\`, \`name\`/\`id\`, libellé ou placeholder. Prénom et nom séparés quand
 * le formulaire les sépare, sinon le nom complet dans le premier champ « nom ».
 */
function champsAdresse(achat) {
  const a = achat.buyerAddress || {}
  const nom = String(achat.buyerName || '').trim()
  const [prenom, ...reste] = nom.split(/\s+/)
  const famille = reste.join(' ') || prenom
  const rue = a.street || a.line1 || a.address || ''
  return [
    { cle: 'nomComplet', valeur: nom, autocomplete: ['name'], mots: ['nom complet', 'full name', 'nom et prénom', 'prénom et nom', 'destinataire', 'recipient'] },
    { cle: 'prenom', valeur: prenom || '', autocomplete: ['given-name'], mots: ['prénom', 'first name', 'firstname', 'given name'] },
    { cle: 'nom', valeur: famille || '', autocomplete: ['family-name'], mots: ['nom de famille', 'last name', 'lastname', 'surname', 'family name', 'nom'] },
    { cle: 'rue', valeur: rue, autocomplete: ['address-line1', 'street-address'], mots: ['adresse', 'address', 'rue', 'street', 'voie'] },
    { cle: 'complement', valeur: a.line2 || a.complement || '', autocomplete: ['address-line2'], mots: ['complément', 'apartment', 'appartement', 'address 2', 'adresse 2', 'bâtiment'] },
    { cle: 'codePostal', valeur: a.zip || a.postalCode || a.postcode || '', autocomplete: ['postal-code'], mots: ['code postal', 'postal code', 'zip', 'postcode', 'cp'] },
    { cle: 'ville', valeur: a.city || '', autocomplete: ['address-level2'], mots: ['ville', 'city', 'town', 'commune'] },
    { cle: 'pays', valeur: a.country || 'France', autocomplete: ['country', 'country-name'], mots: ['pays', 'country'] },
    { cle: 'telephone', valeur: a.phone || achat.buyerPhone || '', autocomplete: ['tel', 'tel-national'], mots: ['téléphone', 'telephone', 'phone', 'mobile', 'portable'] },
    { cle: 'email', valeur: achat.buyerEmail || '', autocomplete: ['email'], mots: ['e-mail', 'email', 'courriel'] },
  ].filter((c) => c.valeur)
}

/** Le vendeur doit choisir la variante lui-même quand le produit en a et qu'aucune n'est fixée. */
function varianteADecider(achat) {
  const v = achat.produit && achat.produit.variantes
  const enA = Array.isArray(v) ? v.length > 0 : v && typeof v === 'object' ? Object.keys(v).length > 0 : false
  return enA && !achat.variante
}

const normaliser = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

/** Un texte de bouton est-il un paiement ? (jamais cliqué) */
const estPaiement = (texte) => MOTS_PAIEMENT.some((re) => re.test(String(texte || '')))

module.exports = { BOUTONS, MOTS_PAIEMENT, SIGNES_PAIEMENT, champsAdresse, varianteADecider, estPaiement, normaliser }
