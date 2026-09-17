import fs from 'node:fs'
import path from 'node:path'

/**
 * Dépose les rapports de MARKET-ANALYSES/rapports/ sur le serveur.
 *
 *   cd backend && npx tsx deposer-rapports.ts                # tout ce qui n'est pas encore déposé
 *   cd backend && npx tsx deposer-rapports.ts --jour 2026-09-17
 *   cd backend && npx tsx deposer-rapports.ts --tout         # rejoue même les déjà déposés
 *
 * Les agents locaux (n8n) écrivent sur ce disque ; le serveur ne le lit pas.
 * Ce script — ou le nœud HTTP final d'un flux n8n — envoie chaque fichier à
 * `POST /api/agent/market-reports` avec la clé d'agent du compte
 * administrateur (`AGENT_API_KEY` dans backend/.env, jamais dans le dépôt).
 * Le serveur relit le contrat et refuse un rapport mal formé avec la raison :
 * elle s'affiche ici, en face du fichier, pour corriger l'agent fautif.
 *
 * Un fichier déposé est noté dans `MARKET-ANALYSES/rapports/.deposes.json`
 * (hors dépôt) : relancer le script ne renvoie que le neuf.
 */
const args = process.argv.slice(2)
const tout = args.includes('--tout')
const jour = args.includes('--jour') ? args[args.indexOf('--jour') + 1] : null

const API = (process.env.PUBLIC_API_URL || 'https://api.drop-shipper.fr').replace(/\/+$/, '')
const CLE = process.env.AGENT_API_KEY
if (!CLE) {
  console.error('AGENT_API_KEY manquante dans backend/.env (la clé d’agent du compte administrateur, Réglages › API).')
  process.exit(1)
}

const racine = path.resolve('..', 'MARKET-ANALYSES', 'rapports')
if (!fs.existsSync(racine)) {
  console.error(`Aucun dossier ${racine} : les agents n'ont encore rien écrit.`)
  process.exit(1)
}
const journal = path.join(racine, '.deposes.json')
const deposes: Record<string, string> = fs.existsSync(journal) ? JSON.parse(fs.readFileSync(journal, 'utf8')) : {}

function* fichiers(dossier: string): Generator<string> {
  for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
    const p = path.join(dossier, entree.name)
    if (entree.isDirectory()) yield* fichiers(p)
    else if (/\.(rayon|marketing)\.md$/.test(entree.name)) yield p
  }
}

async function main() {
  let envoyes = 0
  let refuses = 0
  let sautes = 0
  for (const fichier of fichiers(racine)) {
    const relatif = path.relative(racine, fichier).replace(/\\/g, '/')
    if (jour && !relatif.startsWith(jour + '/')) continue
    const contenu = fs.readFileSync(fichier, 'utf8')
    const empreinte = String(contenu.length) + ':' + fs.statSync(fichier).mtimeMs
    if (!tout && deposes[relatif] === empreinte) {
      sautes++
      continue
    }
    const res = await fetch(`${API}/api/agent/market-reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${CLE}` },
      body: JSON.stringify({ markdown: contenu }),
    })
    const corps = (await res.json().catch(() => ({}))) as { error?: string; produits?: number }
    if (res.ok) {
      envoyes++
      deposes[relatif] = empreinte
      console.log(`ok     ${relatif}${corps.produits ? ` — ${corps.produits} produits` : ''}`)
    } else {
      refuses++
      console.log(`REFUSE ${relatif} — ${res.status} ${corps.error ?? ''}`)
    }
  }
  fs.writeFileSync(journal, JSON.stringify(deposes, null, 2))
  console.log(`\n${envoyes} déposé(s), ${refuses} refusé(s), ${sautes} déjà à jour.`)
  process.exitCode = refuses ? 1 : 0
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
