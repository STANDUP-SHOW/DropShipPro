'use strict'
/**
 * Préparer UNE commande chez un fournisseur sans API, dans la session du vendeur
 * (mémo auto-fulfillment § III) : fiche → variante → panier → commande → adresse
 * du client → ARRÊT au paiement. Le vendeur paie lui-même ; l'application ne lit,
 * ne stocke, ne saisit jamais une carte, et ne clique jamais « Payer ».
 *
 * Ne connaît ni Electron ni le DOM : elle pilote un `pilote` (pilote-achat.js) et
 * se teste avec un faux. Chaque arrêt est rendu au vendeur avec sa raison et la
 * fenêtre reste ouverte là où l'agent s'est arrêté : il finit à la main.
 */
const plafonds = require('./plafonds')
const { BOUTONS, MOTS_PAIEMENT, champsAdresse, varianteADecider } = require('./achats')

const pause = (ms) => new Promise((ok) => setTimeout(ok, ms))
const INTERDITS = MOTS_PAIEMENT.map((re) => re.source)

/**
 * @returns {Promise<{statut: 'preparee'|'connexion'|'a_completer'|'bloque'|'echec', raison: string, manque?: string[], poses?: string[], url?: string}>}
 */
async function preparer({ api, pilote, achat, dormir = pause, attenteMs = 3000, etapesMax = 6 }) {
  const fournisseur = achat.produit.fournisseur || new URL(achat.produit.sourceUrl).hostname
  const finir = async (r) => {
    // Le serveur sait : préparée (le vendeur paie) ou pourquoi ça s'est arrêté. Jamais « commandée » d'ici.
    if (api) {
      const statut = r.statut === 'preparee' ? 'PREPARED' : 'FAILED'
      await api.resultatAchat(achat.id, statut, r.statut === 'preparee' ? r.url : r.raison).catch(() => undefined)
    }
    return r
  }

  try {
    await pilote.ouvrir(achat.produit.sourceUrl, fournisseur)
  } catch (err) {
    return finir({ statut: 'echec', raison: `La page du fournisseur ne s’ouvre pas : ${err.message}` })
  }

  let signes = await pilote.signes()
  if (signes.motDePasse) return finir({ statut: 'connexion', raison: `Vous n’êtes pas connecté chez ${fournisseur} : connectez-vous dans la fenêtre ouverte, puis relancez.` })
  const b = plafonds.detecterBlocage(signes)
  if (b.bloque) return finir({ statut: 'bloque', raison: `Vérification demandée par ${fournisseur} (« ${b.indice} ») : réglez-la vous-même dans la fenêtre, puis relancez.` })

  // La variante : jamais devinée. Fixée sur le site (Commandes › variante), elle est cliquée par son nom.
  if (varianteADecider(achat)) {
    return finir({ statut: 'a_completer', manque: ['variante'], raison: 'Ce produit a plusieurs variantes et la vente n’en fixe aucune : choisissez-la dans la fenêtre ouverte (ou sur le site, Commandes › variante) puis relancez.' })
  }
  if (achat.variante) {
    const clique = await pilote.cliquerTexte([achat.variante], INTERDITS, true)
    if (!clique) return finir({ statut: 'a_completer', manque: ['variante'], raison: `La variante « ${achat.variante} » n’a pas été trouvée sur la fiche : choisissez-la dans la fenêtre ouverte, puis continuez vous-même.` })
    await dormir(attenteMs / 2)
  }

  const panier = await pilote.cliquerTexte(BOUTONS.panier, INTERDITS, false)
  if (!panier) return finir({ statut: 'a_completer', manque: ['panier'], raison: 'Aucun bouton « Ajouter au panier » reconnu sur cette fiche : ajoutez l’article vous-même dans la fenêtre ouverte.' })
  await dormir(attenteMs)

  const champs = champsAdresse(achat)
  const poses = new Set()
  for (let etape = 0; etape < etapesMax; etape++) {
    signes = await pilote.signes()
    if (signes.motDePasse) return finir({ statut: 'connexion', raison: `${fournisseur} demande de vous connecter pour commander : connectez-vous dans la fenêtre ouverte, puis relancez.` })
    if (plafonds.detecterBlocage(signes).bloque) return finir({ statut: 'bloque', raison: `Vérification demandée par ${fournisseur} : réglez-la vous-même dans la fenêtre, puis relancez.` })
    if (signes.paiement) {
      const r = { statut: 'preparee', poses: [...poses], url: signes.url, raison: poses.size ? `Panier et adresse remplis (${[...poses].join(', ')}). Validez le paiement vous-même dans la fenêtre.` : 'Panier prêt. Relisez l’adresse et validez le paiement vous-même dans la fenêtre.' }
      return finir(r)
    }
    for (const cle of await pilote.remplirAdresse(champs)) poses.add(cle)
    const suivant = await pilote.cliquerTexte(BOUTONS.commander, INTERDITS, false)
    if (!suivant) {
      return finir({ statut: 'a_completer', manque: ['commande'], poses: [...poses], raison: poses.size ? `Adresse remplie (${[...poses].join(', ')}), mais le bouton pour continuer n’a pas été reconnu : continuez vous-même dans la fenêtre ouverte.` : 'Article au panier, mais la suite n’a pas été reconnue : continuez vous-même dans la fenêtre ouverte.' })
    }
    await dormir(attenteMs)
  }
  return finir({ statut: 'a_completer', manque: ['paiement'], poses: [...poses], raison: 'L’écran de paiement n’est pas apparu après plusieurs étapes : finissez vous-même dans la fenêtre ouverte.' })
}

module.exports = { preparer }
