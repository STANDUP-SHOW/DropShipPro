/**
 * Connexion par le navigateur du poste.
 *
 * Google refuse sa connexion dans la vue intégrée de l'application (sa fenêtre
 * s'ouvrait dans le navigateur, sans lien de retour, et restait sur
 * accounts.google.com/gsi/transform). L'application ouvre donc
 * drop-shipper.fr/connexion-desktop dans le navigateur, avec un « état » tiré au
 * hasard ; une fois connecté, le site rend la main par
 * dropshipper://connexion?code=…&etat=…, et le code (2 minutes, usage unique)
 * s'échange contre une session. Un retour dont l'état n'a pas été émis ici est
 * refusé : personne ne peut connecter ce poste à un autre compte par un lien.
 */
const crypto = require('node:crypto')

const DUREE_MS = 15 * 60 * 1000

function creerEtats(maintenant = () => Date.now()) {
  const etats = new Map()
  return {
    nouveau() {
      const etat = crypto.randomBytes(24).toString('base64url')
      etats.set(etat, maintenant() + DUREE_MS)
      return etat
    },
    /** Vrai une seule fois par état émis et encore valide. */
    consommer(etat) {
      const fin = etats.get(etat)
      etats.delete(etat)
      return typeof fin === 'number' && fin >= maintenant()
    },
  }
}

/** Adresse de la page de connexion du site, pour le navigateur du poste. */
function adresseConnexion(site, etat) {
  return `${site}/connexion-desktop?${new URLSearchParams({ etat })}`
}

/** Lit dropshipper://connexion?code=…&etat=… ; null pour toute autre adresse. */
function lireRetour(brut) {
  try {
    const u = new URL(brut)
    if (u.protocol !== 'dropshipper:' || u.hostname !== 'connexion') return null
    const code = u.searchParams.get('code') || ''
    const etat = u.searchParams.get('etat') || ''
    if (!/^[0-9a-f]{64}$/.test(code) || !/^[A-Za-z0-9_-]{16,128}$/.test(etat)) return null
    return { code, etat }
  } catch {
    return null
  }
}

/** Les fenêtres de connexion Google que le site ouvre (bouton « Continuer avec Google »). */
function estConnexionGoogle(url) {
  try {
    return new URL(url).hostname === 'accounts.google.com'
  } catch {
    return false
  }
}

module.exports = { creerEtats, adresseConnexion, lireRetour, estConnexionGoogle, DUREE_MS }
