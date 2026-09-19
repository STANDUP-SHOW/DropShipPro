import fs from 'node:fs'
import path from 'node:path'
import { CATEGORIES, CATEGORIES_PAR_RAYON, categoriesDuRayon } from './src/services/marketReports.js'
import { DEPARTMENTS } from './src/services/departments.js'

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
let echecs = 0
const exige = (c: boolean, m: string) => {
  if (!c) {
    echecs++
    console.log(`ECHEC : ${m}`)
  }
}

/*
 * ---------------------------------------------------------------------------
 * Le rattachement rayon ↔ catégorie d'agents
 * ---------------------------------------------------------------------------
 *
 * Les chefs de rayon portent les clés du référentiel de catégories, les 48
 * agents portent les catégories d'`agents.json` : deux découpages de 24 qui ne
 * se recouvrent pas. La table de `marketReports.ts` les raccorde, et ses deux
 * bornes sont ici.
 *
 * **La seconde borne est celle qui compte** : une catégorie que plus aucun
 * rayon ne lit produit un rapport chaque matin que personne ne voit jamais, et
 * rien dans l'écran ne le dirait — il serait simplement vide, comme un jour
 * sans dépôt.
 */
const clesRayons = new Set(DEPARTMENTS.map((d) => d.key))
for (const cle of Object.keys(CATEGORIES_PAR_RAYON)) {
  exige(clesRayons.has(cle), `« ${cle} » n'est pas un rayon du référentiel (voir departments.ts)`)
}
for (const d of DEPARTMENTS) {
  // Un rayon qui ne lit aucune catégorie affiche un bloc vide chaque matin : le
  // vendeur croit que les agents n'ont rien écrit, alors que personne n'a dit
  // au rayon où regarder.
  exige(categoriesDuRayon(d.key).length > 0, `le rayon « ${d.key} » ne lit aucune catégorie`)
}

const idsCategories = new Set(CATEGORIES.map((c) => c.id))
const lues = new Set<string>()
for (const [cle, cats] of Object.entries(CATEGORIES_PAR_RAYON)) {
  for (const id of cats) {
    exige(idsCategories.has(id), `le rayon « ${cle} » cite la catégorie inconnue « ${id} »`)
    lues.add(id)
  }
}
const orphelines = [...idsCategories].filter((id) => !lues.has(id))
exige(orphelines.length === 0, `catégorie(s) qu'aucun rayon ne lit : ${orphelines.join(', ')}`)

// Un rayon sans catégorie rend un tableau vide, pas une erreur : l'écran le dit
// et renvoie vers la vue globale.
exige(
  categoriesDuRayon('electronique').map((c) => c.id).join(',') === 'informatique,tv-son-photo',
  'un rayon peut lire plusieurs catégories',
)
exige(categoriesDuRayon('rayon-qui-nexiste-pas').length === 0, 'une clé inconnue ne lève pas')

const local = path.resolve('..', 'MARKET-ANALYSES', 'agents.json')
const serveur = path.resolve('src', 'services', 'marketAgents.json')

if (!fs.existsSync(local)) {
  console.log('Découpage des agents : MARKET-ANALYSES/agents.json absent (dépôt partiel ?), comparaison sautée.')
  process.exit(echecs ? 1 : 0)
}

const a = JSON.stringify(JSON.parse(fs.readFileSync(local, 'utf8')))
const b = JSON.stringify(JSON.parse(fs.readFileSync(serveur, 'utf8')))

exige(a === b, 'MARKET-ANALYSES/agents.json et backend/src/services/marketAgents.json divergent — recopier l’un sur l’autre.')

if (echecs) {
  console.log(`Découpage des agents : ${echecs} échec(s).`)
  process.exitCode = 1
} else {
  console.log(`Découpage des agents : les deux copies sont identiques, et les ${CATEGORIES.length} catégories sont toutes lues par un rayon.`)
}
