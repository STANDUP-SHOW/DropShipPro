import express from 'express'
import http from 'http'

/**
 * Éprouve que les chemins littéraux ne sont plus avalés par `/:id`.
 *
 * Le défaut ne levait aucune erreur : `/orders/accounting` répondait « Commande
 * introuvable » avec un code 404 parfaitement valide, et l'écran Comptabilité
 * restait vide sans que rien n'apparaisse dans les journaux. C'est exactement le
 * genre de panne qu'un banc attrape et qu'une relecture manque.
 */
const RESERVES = new Set(['purchases', 'accounting', 'summary', 'supplier-tracking', 'by-supplier', 'sav'])

const app = express()
const routeur = express.Router()

// Le même ordre de déclaration que dans orders.ts : `/:id` d'abord.
routeur.get('/summary', (_req, res) => res.json({ route: 'summary' }))
routeur.get('/:id', (req, res, next) => {
  // Retirez cette ligne et le banc echoue : c est elle qui est testee.
  if (RESERVES.has(req.params.id)) return next('route')
  res.json({ route: 'id', id: req.params.id })
})
routeur.get('/purchases', (_req, res) => res.json({ route: 'purchases' }))
routeur.get('/accounting', (_req, res) => res.json({ route: 'accounting' }))
// Ajoutée le 31/08/2026, et déclarée après `/:id` dans le vrai fichier : sans
// sa place dans la liste réservée, l'écran Fournisseurs aurait reçu
// « Commande introuvable » pour toute réponse.
routeur.get('/by-supplier', (_req, res) => res.json({ route: 'by-supplier' }))
routeur.get('/sav', (_req, res) => res.json({ route: 'sav' }))
app.use('/orders', routeur)

const serveur = http.createServer(app)
await new Promise<void>((r) => serveur.listen(8795, '127.0.0.1', r))

let echecs = 0
const exige = async (chemin: string, attendu: string) => {
  const res = await fetch(`http://127.0.0.1:8795${chemin}`)
  const corps = (await res.json()) as { route?: string }
  if (corps.route !== attendu) {
    echecs++
    console.log(`ECHEC ${chemin} -> « ${corps.route} », attendu « ${attendu} »`)
  }
}

try {
  await exige('/orders/purchases', 'purchases')
  await exige('/orders/accounting', 'accounting')
  await exige('/orders/by-supplier', 'by-supplier')
  await exige('/orders/sav', 'sav')
  await exige('/orders/summary', 'summary')
  // Un vrai identifiant doit continuer à passer par `/:id`.
  await exige('/orders/clx1a2b3c4d5e6f7g8h9i0j1k', 'id')

  console.log(echecs === 0 ? 'Routage des commandes : tout passe.' : `${echecs} échec(s).`)
  process.exitCode = echecs === 0 ? 0 : 1
} finally {
  serveur.close()
}
