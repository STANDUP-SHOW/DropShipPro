'use strict'
/**
 * Where things live on disk.
 *
 * Two places, kept apart on purpose: the deposit folder (visible, the reports
 * Max opens in Explorer) and the app data folder (sessions, config, state).
 * Uninstalling never touches the deposit folder.
 */
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const SOUS_DOSSIERS = ['rapports', 'releves', 'journaux', 'diagnostics', 'sauvegardes', 'prompts']

function depotParDefaut() {
  return process.platform === 'win32' ? 'C:\\DropShipper-Analyses' : path.join(os.homedir(), 'DropShipper-Analyses')
}

function racineDepot(config) {
  return (config && config.depot) || depotParDefaut()
}

/** Creates the deposit tree (idempotent). Returns the root. */
function creerArborescence(racine) {
  fs.mkdirSync(racine, { recursive: true })
  for (const d of SOUS_DOSSIERS) fs.mkdirSync(path.join(racine, d), { recursive: true })
  return racine
}

/** AAAA-MM-JJ in local time (the night belongs to the day it starts). */
function jourLocal(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

module.exports = { SOUS_DOSSIERS, depotParDefaut, racineDepot, creerArborescence, jourLocal }
