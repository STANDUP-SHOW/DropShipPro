/**
 * Sert la vitrine et un faux flux, pour la regarder sans base ni API.
 *
 * Le faux flux n'est pas décoratif : il porte exactement le piège que le
 * configurateur doit tenir. La grille est **volontairement trouée** — le
 * grammage 400 g n'existe qu'en petites quantités, et le délai de 2 jours
 * disparaît au-delà de 1 000 exemplaires — parce que c'est ce que produit un
 * relevé partiel, et qu'un relevé partiel est la seule façon tenable de relever
 * un configurateur. Une démo à grille complète ne prouverait rien.
 *
 *   node storefront-imprimerie/demo.cjs
 *   http://localhost:4321/?api=http://localhost:4321&shop=demo
 */

const http = require('http')
const fs = require('fs')
const path = require('path')

const PORT = Number(process.env.PORT) || 4321

const GRAMMAGES = ['250 g', '350 g', '400 g']
const ORIENTATIONS = ['Horizontale', 'Verticale']
const QUANTITES = [100, 250, 500, 1000, 2500, 7500]
const DELAIS = [2, 5, 8]

function grilleCartes() {
  const rows = []
  for (const grammage of GRAMMAGES) {
    for (const orientation of ORIENTATIONS) {
      for (const quantite of QUANTITES) {
        // Le 400 g n'est tiré qu'en petites séries : au-delà, la ligne n'existe
        // pas, et l'option doit se barrer au lieu de mener à un prix vide.
        if (grammage === '400 g' && quantite > 500) continue
        for (const delaiJours of DELAIS) {
          // L'express ferme sur les gros tirages.
          if (delaiJours === 2 && quantite > 1000) continue
          const base = 12 + GRAMMAGES.indexOf(grammage) * 4
          const prix = base + quantite * 0.045 + (delaiJours === 2 ? quantite * 0.02 : 0)
          rows.push({
            combo: { grammage, orientation },
            quantite,
            delaiJours,
            prix: Math.round(prix * 100) / 100,
          })
        }
      }
    }
  }
  return rows
}

const FLUX = {
  shop: 'Print34',
  count: 3,
  products: [
    {
      id: 'demo-cartes',
      name: 'Cartes de visite classiques',
      description: 'Papier couché mat, coupe droite, impression quadri recto-verso.',
      category: 'Papeterie > Cartes de visite',
      images: [],
      dimensions: [
        { cle: 'grammage', libelle: 'Grammage', options: GRAMMAGES.map((v) => ({ valeur: v })) },
        { cle: 'orientation', libelle: 'Orientation', options: ORIENTATIONS.map((v) => ({ valeur: v })) },
      ],
      aPartirDe: null, // rempli plus bas
      grille: grilleCartes(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'demo-flyers',
      name: 'Flyers A5',
      description: 'Papier 135 g brillant, recto-verso.',
      category: 'Publicité > Flyers',
      images: [],
      dimensions: [],
      aPartirDe: null,
      grille: [500, 1000, 5000].flatMap((quantite) =>
        [3, 7].map((delaiJours) => ({
          combo: {},
          quantite,
          delaiJours,
          prix: Math.round((25 + quantite * 0.028 + (delaiJours === 3 ? 18 : 0)) * 100) / 100,
        })),
      ),
      updatedAt: new Date().toISOString(),
    },
    {
      // Une fiche sans grille : la carte doit dire « sur devis » au lieu de
      // planter ou d'afficher un prix à zéro.
      id: 'demo-sans-grille',
      name: 'Bâche grand format',
      description: 'Sur mesure.',
      category: 'Signalétique',
      images: [],
      dimensions: [],
      aPartirDe: null,
      grille: [],
      updatedAt: new Date().toISOString(),
    },
  ],
}

for (const p of FLUX.products) {
  if (!p.grille.length) continue
  const mini = p.grille.reduce((a, b) => (b.prix < a.prix ? b : a))
  p.aPartirDe = { prix: mini.prix, quantite: mini.quantite, delaiJours: mini.delaiJours, combo: mini.combo }
}

http
  .createServer((req, res) => {
    const url = req.url.split('?')[0]

    if (url.startsWith('/api/public/print/')) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      return res.end(JSON.stringify(FLUX))
    }

    const fichier = path.join(__dirname, url === '/' ? 'index.html' : url)
    if (!fichier.startsWith(__dirname) || !fs.existsSync(fichier)) {
      res.writeHead(404)
      return res.end('introuvable')
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(fs.readFileSync(fichier))
  })
  .listen(PORT, () => {
    console.log(`Vitrine de démonstration : http://localhost:${PORT}/?api=http://localhost:${PORT}&shop=demo`)
    console.log(`${FLUX.products[0].grille.length} lignes tarifaires sur les cartes de visite.`)
  })
