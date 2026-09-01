/**
 * Rejoue la resolution d apparence du serveur, sans base ni API.
 *
 * Lit la vraie bibliotheque -- `backend/src/services/themeSeed.json` -- et pas
 * une copie : une demo qui invente ses propres couleurs ne prouverait pas que
 * les themes de la bibliotheque s affichent, ce qui est precisement la question.
 */
const lib = require('../backend/src/services/themeSeed.json')

const THEME = process.env.THEME || 'presse'

function resoudre(demande) {
  const theme = lib.themes.find((t) => t.id === (demande || THEME)) || lib.themes[0]
  const structure = lib.structures.find((s) => s.id === theme.structure)
  const palette = lib.palettes.find((p) => p.id === theme.palette)
  const typo = lib.typographies.find((t) => t.id === theme.typo)

  return {
    theme: { id: theme.id, nom: theme.nom },
    structure,
    jetons: palette.couleurs,
    polices: { titre: typo.titre, texte: typo.texte, familles: [...new Set([typo.titre, typo.texte])] },
    contenu: {
      annonce: 'Livraison offerte des 80 EUR — jusqu au 30 septembre',
      accroche: 'Imprime, livre,',
      accrocheSuite: 'au prix que vous choisissez.',
      sousTitre:
        'Le prix depend du support, de la quantite et du delai. Choisissez, il s affiche immediatement.',
      fraisPort: 5.9,
      portOffertDes: 80,
    },
    boutique: { nom: 'Print34 · ' + theme.nom, logo: null },
  }
}

function enVariablesCss(a) {
  const tiret = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
  const l = Object.entries(a.jetons).map(([k, v]) => `  --${tiret(k)}: ${v};`)
  l.push(`  --police-titre: '${a.polices.titre}';`)
  l.push(`  --police-texte: '${a.polices.texte}';`)
  l.push(`  --photo-rapport: ${a.structure.photos.rapport};`)
  return `:root {\n${l.join('\n')}\n}`
}

module.exports = { resoudre, enVariablesCss }
