'use strict'
/**
 * La configuration locale : adresse de l'API, clé d'API, accords du vendeur.
 *
 * La clé est chiffrée par le coffre du système (`safeStorage` d'Electron) quand
 * il est fourni ; sans lui (banc), elle reste en clair dans le fichier. Le
 * fichier vit dans le dossier de données de l'application, jamais dans le dépôt.
 */
const fs = require('node:fs')
const path = require('node:path')

const PAR_DEFAUT = { apiBase: 'https://api.drop-shipper.fr', cleChiffree: null, cle: null, accords: {}, plafonds: {} }

function charger(dossier) {
  try {
    return { ...PAR_DEFAUT, ...JSON.parse(fs.readFileSync(path.join(dossier, 'config.json'), 'utf8')) }
  } catch {
    return { ...PAR_DEFAUT }
  }
}

function enregistrer(dossier, config) {
  fs.mkdirSync(dossier, { recursive: true })
  fs.writeFileSync(path.join(dossier, 'config.json'), JSON.stringify(config, null, 2), { mode: 0o600 })
}

/** Pose la clé : chiffrée si le coffre est disponible. */
function poserCle(config, cle, coffre) {
  if (coffre && coffre.isEncryptionAvailable()) {
    return { ...config, cleChiffree: coffre.encryptString(cle).toString('base64'), cle: null }
  }
  return { ...config, cle, cleChiffree: null }
}

function lireCle(config, coffre) {
  if (config.cleChiffree && coffre) return coffre.decryptString(Buffer.from(config.cleChiffree, 'base64'))
  return config.cle || null
}

module.exports = { charger, enregistrer, poserCle, lireCle, PAR_DEFAUT }
