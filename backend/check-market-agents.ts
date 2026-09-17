import fs from 'node:fs'
import path from 'node:path'

/**
 * Les deux copies du découpage des agents doivent être identiques.
 *
 * `MARKET-ANALYSES/agents.json` est lu en local par n8n (les agents tournent
 * sur la machine de Max) ; `backend/src/services/marketAgents.json` est lu par
 * l'API (Railway ne déploie que `backend/`). Deux fichiers pour une seule
 * vérité, donc un banc qui tombe dès qu'ils divergent — même leçon que
 * `check-llms.ts` : un commentaire qui demande de se souvenir ne remplace pas
 * un contrôle.
 */
const local = path.resolve('..', 'MARKET-ANALYSES', 'agents.json')
const serveur = path.resolve('src', 'services', 'marketAgents.json')

if (!fs.existsSync(local)) {
  console.log('Découpage des agents : MARKET-ANALYSES/agents.json absent (dépôt partiel ?), contrôle sauté.')
  process.exit(0)
}

const a = JSON.stringify(JSON.parse(fs.readFileSync(local, 'utf8')))
const b = JSON.stringify(JSON.parse(fs.readFileSync(serveur, 'utf8')))

if (a !== b) {
  console.log('ECHEC : MARKET-ANALYSES/agents.json et backend/src/services/marketAgents.json divergent — recopier l’un sur l’autre.')
  process.exitCode = 1
} else {
  console.log('Découpage des agents : les deux copies sont identiques.')
}
