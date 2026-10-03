'use strict'
/**
 * Local configuration. Secrets (Anthropic, Serper, site agent key) are typed
 * by Max in the app and encrypted by the OS vault (`safeStorage`); without the
 * vault (test bench) they stay in clear in the file — never in the repo.
 */
const fs = require('node:fs')
const path = require('node:path')

const PAR_DEFAUT = {
  depot: null,
  apiBase: 'https://api.drop-shipper.fr',
  modele: 'claude-sonnet-5-5',
  // Anthropic workspace id (not a secret): only for API keys that are not scoped to a workspace.
  espaceAnthropic: '',
  // Night run: OFF until Max switches it on himself, after a validated test.
  nuitActivee: false,
  heureNuit: '01:00',
  plafondPages: 25,
  plafondDeuxiemeVague: 26,
  // Every validated report goes to the site (rayon + marketing, filed by the site). Needs the admin agent key.
  envoiAuSite: true,
  envoiSiteV2: false,
  // Public signals read in a hidden window (Max's "go" of 03/10): Meta Ad Library, Google Trends.
  signauxPublics: { meta: true, trends: true, plafondPubsParRayon: 6, plafondTendancesParRayon: 2 },
  // Extra Serper readings (Max's "go" of 03/10): Google Shopping France, autocomplete, Google Images.
  serperEtendu: { shopping: true, autocomplete: true, images: true, plafondShopping: 20, plafondImages: 10 },
  // Rayons (category ids) run by the night: null = all of them, a list = only those (e.g. two, to test).
  rayonsNuit: null,
  sources: [],
  secrets: {},
}

function charger(dossier) {
  try {
    return { ...PAR_DEFAUT, ...JSON.parse(fs.readFileSync(path.join(dossier, 'config.json'), 'utf8')) }
  } catch {
    return { ...PAR_DEFAUT, sources: [], secrets: {} }
  }
}

function enregistrer(dossier, config) {
  fs.mkdirSync(dossier, { recursive: true })
  fs.writeFileSync(path.join(dossier, 'config.json'), JSON.stringify(config, null, 2), { mode: 0o600 })
}

const NOMS_SECRETS = ['anthropic', 'serper', 'agent']

function poserSecret(config, nom, valeur, coffre) {
  if (!NOMS_SECRETS.includes(nom)) throw new Error(`Secret inconnu : ${nom}`)
  const secrets = { ...config.secrets }
  if (!valeur) delete secrets[nom]
  else if (coffre && coffre.isEncryptionAvailable()) secrets[nom] = { chiffre: coffre.encryptString(valeur).toString('base64') }
  else secrets[nom] = { clair: valeur }
  return { ...config, secrets }
}

function lireSecret(config, nom, coffre) {
  const s = config.secrets && config.secrets[nom]
  if (!s) return null
  if (s.chiffre && coffre) return coffre.decryptString(Buffer.from(s.chiffre, 'base64'))
  return s.clair || null
}

/** What the screen may show: which keys are set, never their value. */
function etatSecrets(config) {
  return Object.fromEntries(NOMS_SECRETS.map((n) => [n, Boolean(config.secrets && config.secrets[n])]))
}

module.exports = { PAR_DEFAUT, charger, enregistrer, poserSecret, lireSecret, etatSecrets, NOMS_SECRETS }
