/**
 * Banc des pages publiques gardées d'un import à l'autre (21/11/2026 : après
 * chaque import, toutes les pages étaient refaites d'un bloc et l'API gelait).
 * Travaille sur une copie de storage/ restaurée à la fin.
 *
 *   npx tsx check-rendus-caches.ts
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ajouterEtudesImportees, CHEMIN_RAPPORTS_DEPOSE } from './src/services/reportsDb.js'
import { lignesPubliques, versPublicBrut } from './src/routes/analysesPubliques.js'

let echecs = 0
function exige(ok: unknown, libelle: string) {
  if (ok) console.log(`  ok  ${libelle}`)
  else {
    echecs++
    console.log(`  ÉCHEC  ${libelle}`)
  }
}
function rayon(date: string, categorie: string, theme: string) {
  const lignes = Array.from({ length: 20 }, (_, k) => `| ${k + 1} | Produit ${theme} ${k + 1} | AliExpress | https://fr.aliexpress.com/item/100577${String(k).padStart(6, '0')}.html | 5€ | 15€ | 66% | api | Bon |`)
  return ['---', 'type: rayon', `date: ${date}`, `categorie: ${categorie}`, `theme: ${theme}`, `titre: Rayon ${theme}`, '---', '## Analyse', '- Marché porteur.', '## 20 produits proposés',
    '| # | Titre | Fournisseur | URL fournisseur | Prix achat € | Prix vente conseillé € | Marge % | Import | Pourquoi |', '|---|---|---|---|---|---|---|---|---|', ...lignes, ''].join('\n')
}

const storage = path.dirname(CHEMIN_RAPPORTS_DEPOSE)
const sauvegarde = fs.mkdtempSync(path.join(os.tmpdir(), 'storage-'))
const existait = fs.existsSync(storage)
if (existait) fs.cpSync(storage, sauvegarde, { recursive: true })
try {
  let t = Date.now()
  const avant = lignesPubliques()
  const tout = Date.now() - t
  const premier = avant.find((l) => l.day !== '2026-11-19')!
  const rendu = JSON.stringify(versPublicBrut(premier.id))
  ajouterEtudesImportees([{ idRayon: 'drive-2026-11-19-jardin-arrosage-rayon', format: 'markdown', origine: 'drive:2026-11-19/jardin/arrosage.rayon.md', importeLe: new Date().toISOString(), texteRayon: rayon('2026-11-19', 'jardin', 'arrosage'), texteMarketing: null }])
  t = Date.now()
  const apres = lignesPubliques()
  const refait = Date.now() - t
  exige(apres.length === avant.length + 1, `la page importée est publiée (${avant.length} → ${apres.length})`)
  exige(refait < tout / 2, `après un import, seules les pages changées sont refaites (${tout} ms → ${refait} ms)`)
  exige(JSON.stringify(versPublicBrut(premier.id)) === rendu, 'une page inchangée rend exactement le même contenu')
  const neuf = versPublicBrut(apres.find((l) => l.day === '2026-11-19' && l.categorie === 'jardin')!.id)
  exige(neuf?.produits.length === 20, 'la nouvelle page a ses 20 produits')
} finally {
  fs.rmSync(storage, { recursive: true, force: true })
  if (existait) fs.cpSync(sauvegarde, storage, { recursive: true })
  fs.rmSync(sauvegarde, { recursive: true, force: true })
}
console.log(echecs ? `\nPages gardées : ${echecs} échec(s)` : '\nPages gardées : tout est vert')
process.exit(echecs ? 1 : 0)
