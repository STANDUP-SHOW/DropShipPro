#!/usr/bin/env node

/**
 * Génère un manifest de tous les logos disponibles dans public/logos/
 * et le sauvegarde dans public/logos-manifest.json
 *
 * Ce fichier est généré à la compilation pour que le composant LogosHeader
 * puisse afficher tous les logos sans avoir à les scanner à l'exécution.
 */

const fs = require('fs')
const path = require('path')

const logosDir = path.join(__dirname, '../public/logos')
const outputFile = path.join(__dirname, '../public/logos-manifest.json')

try {
  // Lire le contenu du répertoire
  const files = fs.readdirSync(logosDir)

  // Filtrer les images et les fichiers markdown
  const logoFiles = files.filter((file) => {
    const ext = path.extname(file).toLowerCase()
    return ['.png', '.jpg', '.jpeg', '.webp', '.svg'].includes(ext)
  })

  // Créer le manifest
  const logos = logoFiles
    .sort()
    .map((file) => {
      // Générer un nom lisible à partir du nom de fichier
      const name = file
        .replace(/\.[^/.]+$/, '') // Retirer l'extension
        .replace(/[-_]/g, ' ') // Remplacer tirets et underscores par espaces
        .replace(/\b\w/g, (l) => l.toUpperCase()) // Capitaliser chaque mot

      return {
        path: `/logos/${file}`,
        name,
        filename: file,
      }
    })

  const manifest = { logos, count: logos.length, generated: new Date().toISOString() }

  // Écrire le manifest
  fs.writeFileSync(outputFile, JSON.stringify(manifest, null, 2))

  console.log(`✓ Logos manifest généré avec ${logos.length} logos`)
} catch (error) {
  console.error('Erreur lors de la génération du manifest des logos:', error.message)
  process.exit(1)
}
