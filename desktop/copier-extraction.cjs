'use strict'
/**
 * Copie les scripts de lecture de l'extension Chrome dans extraction/, pour que
 * l'application les emporte (lib/releveur.js). Une seule source : l'extension.
 * Lancé avant `start`, `check` et `build`.
 */
const fs = require('node:fs')
const path = require('node:path')

const SOURCE = path.join(__dirname, '..', 'backend', 'extension')
const CIBLE = path.join(__dirname, 'extraction')
const FICHIERS = {
  'config.js': 'config.js',
  'fill-helpers.js': 'content/fill-helpers.js',
  'image-scan.js': 'content/image-scan.js',
  'adapters.js': 'content/adapters.js',
  'photo-preselect.js': 'content/photo-preselect.js',
  'capture.js': 'content/capture.js',
  'aliexpress-sku.js': 'content/aliexpress-sku.js',
}

fs.mkdirSync(CIBLE, { recursive: true })
for (const [nom, source] of Object.entries(FICHIERS)) {
  fs.copyFileSync(path.join(SOURCE, source), path.join(CIBLE, nom))
}
console.log(`extraction/ : ${Object.keys(FICHIERS).length} scripts de l'extension copiés`)
