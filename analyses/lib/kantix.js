'use strict'
/**
 * KANTIX ANALYSER's own data: API keys (public records only), projects,
 * analyses, connectors. Everything is plain JSON in config.json; secrets
 * (key values, feed secrets) live in `config.secrets` under `cle:<id>` and
 * `flux:<id>`, encrypted by the OS vault (lib/config.js).
 *
 * Pure functions: the main process passes the config in and saves what comes out.
 */
const crypto = require('node:crypto')
const { fournisseur } = require('./fournisseurs-ia')
const { identifiant } = require('./sources')
const { normaliserRecurrence } = require('./recurrence')

const idUnique = (base, existants) => {
  let id = identifiant(base)
  let n = 2
  while (existants.some((x) => x.id === id)) id = `${identifiant(base)}-${n++}`
  return id
}

const texte = (v, max = 200) => String(v == null ? '' : v).trim().slice(0, max)

function urlOuVide(v, quoi) {
  const s = texte(v, 500)
  if (!s) return ''
  try {
    const u = new URL(s)
    if (!/^https?:$/.test(u.protocol)) throw new Error('x')
    return u.href.replace(/\/$/, '')
  } catch {
    throw new Error(`${quoi} invalide (https://…).`)
  }
}

// ------------------------------------------------------------------ keys
function normaliserCle(brut, existantes = []) {
  const f = fournisseur(brut.fournisseur)
  if (!f) throw new Error('Choisissez un fournisseur.')
  const nom = texte(brut.nom, 80) || f.nom
  const actuelle = brut.id ? existantes.find((c) => c.id === brut.id) : null
  const baseCle = f.id === 'compatible' ? urlOuVide(brut.base, 'Adresse de l’API') : ''
  if (f.id === 'compatible' && !baseCle) throw new Error('Donnez l’adresse de l’API (ex. https://…/v1).')
  return {
    id: actuelle ? actuelle.id : idUnique(`${f.id}-${nom}`, existantes),
    fournisseur: f.id,
    nom,
    modele: texte(brut.modele, 120),
    base: baseCle,
    creeLe: actuelle ? actuelle.creeLe : new Date().toISOString(),
    // set by « Tester » after a real call; never by typing the key
    verifieeLe: actuelle && actuelle.fournisseur === f.id ? actuelle.verifieeLe || null : null,
  }
}

const nomSecretCle = (id) => `cle:${id}`
const nomSecretFlux = (id) => `flux:${id}`

// ------------------------------------------------------------------ projects
function normaliserProjet(brut, existants = [], cles = []) {
  const nom = texte(brut.nom, 80)
  if (!nom) throw new Error('Donnez un nom au projet.')
  const actuel = brut.id ? existants.find((p) => p.id === brut.id) : null
  const cleId = texte(brut.cleId, 80)
  if (cleId && !cles.some((c) => c.id === cleId)) throw new Error('Clé API inconnue.')
  const d = brut.dossier || {}
  const type = d.type === 'drive' ? 'drive' : 'local'
  return {
    id: actuel ? actuel.id : idUnique(nom, existants),
    nom,
    url: urlOuVide(brut.url, 'Adresse du site'),
    cleId: cleId || null,
    dossier: { type, chemin: texte(d.chemin, 500) },
    flux: { adresse: urlOuVide(brut.flux && brut.flux.adresse, 'Adresse de réception du flux') },
    connecteur: actuel ? actuel.connecteur || null : null,
    creeLe: actuel ? actuel.creeLe : new Date().toISOString(),
  }
}

/** The feed secret: 256 random bits, shown never, copied on request for the site's developer. */
const fabriquerSecretFlux = () => `kx_${crypto.randomBytes(32).toString('base64url')}`

// ------------------------------------------------------------------ analyses
function normaliserAnalyse(brut, existantes = [], projets = [], sources = []) {
  const nom = texte(brut.nom, 100)
  if (!nom) throw new Error('Donnez un nom à l’analyse.')
  const actuelle = brut.id ? existantes.find((a) => a.id === brut.id) : null
  const prompt = String(brut.prompt || '').trim()
  if (prompt.length < 20) throw new Error('Le prompt de l’analyse est vide : écrivez-le ou faites-le rédiger par Claude.')
  if (prompt.length > 60000) throw new Error('Prompt trop long (60 000 caractères au plus).')
  const projetId = texte(brut.projetId, 80)
  if (!projets.some((p) => p.id === projetId)) throw new Error('Choisissez le projet relié à cette analyse.')
  const d = brut.dossier || {}
  const dossier = d.chemin ? { type: d.type === 'drive' ? 'drive' : 'local', chemin: texte(d.chemin, 500) } : null
  const onglets = [...new Set((Array.isArray(brut.onglets) ? brut.onglets : []).map(String))].filter((id) => sources.some((s) => s.id === id))
  const recurrence = normaliserRecurrence(brut.recurrence)
  const changeRecurrence = !actuelle || JSON.stringify(actuelle.recurrence) !== JSON.stringify(recurrence)
  return {
    id: actuelle ? actuelle.id : idUnique(nom, existantes),
    nom,
    projetId,
    prompt,
    briefId: texte(brut.briefId, 80) || (actuelle && actuelle.briefId) || null,
    recurrence,
    dossier,
    rechercheWeb: brut.rechercheWeb !== false,
    onglets,
    // a new or changed schedule starts from now: a slot already past is never run on save
    planifieeLe: changeRecurrence ? new Date().toISOString() : actuelle.planifieeLe,
    creeLe: actuelle ? actuelle.creeLe : new Date().toISOString(),
    modifieLe: new Date().toISOString(),
    derniere: actuelle ? actuelle.derniere || null : null,
  }
}

// ------------------------------------------------------------------ migration of a Poste d'analyses config
/**
 * Brings a 0.4.x config to KANTIX without losing anything:
 *  - the Anthropic key becomes the key « Anthropic (Poste) » (same encrypted value, old slot kept);
 *  - the DropShipper connector is on for an existing install, off for a new one;
 *  - a « DropShipper » project, linked to the connector.
 * Idempotent: `kantixV1` marks it done.
 */
function migrer(cfg, { installExistante }) {
  if (cfg.kantixV1) return { cfg, change: false }
  const c = { ...cfg, cles: [...(cfg.cles || [])], projets: [...(cfg.projets || [])], analyses: [...(cfg.analyses || [])], secrets: { ...(cfg.secrets || {}) } }
  let cleId = null
  if (c.secrets.anthropic && !c.cles.some((k) => k.fournisseur === 'anthropic')) {
    cleId = 'anthropic-poste'
    c.cles.push({ id: cleId, fournisseur: 'anthropic', nom: 'Anthropic (Poste)', modele: '', base: '', creeLe: new Date().toISOString(), verifieeLe: null })
    c.secrets[nomSecretCle(cleId)] = c.secrets.anthropic
  }
  const actif = Boolean(installExistante)
  c.connecteurs = { dropshipper: { actif, cleId: cleId || null }, ...(cfg.connecteurs || {}) }
  if (actif && !c.projets.some((p) => p.connecteur === 'dropshipper')) {
    c.projets.push({ id: idUnique('dropshipper', c.projets), nom: 'DropShipper', url: 'https://www.drop-shipper.fr', cleId, dossier: { type: 'local', chemin: '' }, flux: { adresse: '' }, connecteur: 'dropshipper', creeLe: new Date().toISOString() })
  }
  c.kantixV1 = true
  return { cfg: c, change: true }
}

module.exports = { normaliserCle, normaliserProjet, normaliserAnalyse, fabriquerSecretFlux, nomSecretCle, nomSecretFlux, migrer, idUnique }
