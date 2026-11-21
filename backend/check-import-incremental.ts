/**
 * Banc de l'import qui n'écrit que les nouvelles analyses (21/11/2026 : rejouer
 * toute la surcouche à chaque import a gelé l'API plusieurs minutes).
 * Travaille sur une copie de storage/ restaurée à la fin.
 *
 *   npx tsx check-import-incremental.ts
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { ajouterEtudesImportees, cheminRapportsActif, CHEMIN_RAPPORTS_DEPOSE, lireSurcouche } from './src/services/reportsDb.js'

let echecs = 0
function exige(ok: unknown, libelle: string) {
  if (ok) console.log(`  ok  ${libelle}`)
  else {
    echecs++
    console.log(`  ÉCHEC  ${libelle}`)
  }
}

function rayon(date: string, categorie: string, theme: string) {
  const lignes = Array.from({ length: 20 }, (_, k) => `| ${k + 1} | Produit ${theme} ${k + 1} | AliExpress | https://fr.aliexpress.com/item/100500${theme.length}${String(k).padStart(5, '0')}.html | 5€ | 15€ | 66% | api | Bon |`)
  return ['---', 'type: rayon', `date: ${date}`, `categorie: ${categorie}`, `theme: ${theme}`, `titre: Rayon ${theme}`, '---', '## Analyse', '- Marché porteur.', '## 20 produits proposés',
    '| # | Titre | Fournisseur | URL fournisseur | Prix achat € | Prix vente conseillé € | Marge % | Import | Pourquoi |', '|---|---|---|---|---|---|---|---|---|', ...lignes, ''].join('\n')
}
const etude = (date: string, categorie: string, theme: string) => ({
  idRayon: `drive-${date}-${categorie}-${theme}-rayon`, format: 'markdown' as const, origine: `drive:${date}/${categorie}/${theme}.rayon.md`,
  importeLe: new Date().toISOString(), texteRayon: rayon(date, categorie, theme), texteMarketing: null,
})

const storage = path.dirname(CHEMIN_RAPPORTS_DEPOSE)
const sauvegarde = fs.mkdtempSync(path.join(os.tmpdir(), 'storage-'))
const existait = fs.existsSync(storage)
if (existait) fs.cpSync(storage, sauvegarde, { recursive: true })
try {
  const a = ajouterEtudesImportees([etude('2026-11-18', 'jardin', 'arrosage')])
  exige(cheminRapportsActif() === CHEMIN_RAPPORTS_DEPOSE, 'la copie servie est celle du stockage')
  const b = ajouterEtudesImportees([etude('2026-11-19', 'sport', 'velo')])
  exige(b.reports > a.reports, `le second import ajoute des rapports (${a.reports} → ${b.reports})`)
  const db = new Database(cheminRapportsActif(), { readonly: true })
  const ids = (db.prepare('SELECT id FROM reports').all() as { id: string }[]).map((r) => r.id).join(' ')
  db.close()
  exige(/2026-11-18/.test(ids) && /2026-11-19/.test(ids), 'le premier import reste en ligne après le second (seul le nouveau est écrit)')
  exige(lireSurcouche().length >= 2, 'la surcouche garde les deux analyses pour les rejouer plus tard')
} finally {
  fs.rmSync(storage, { recursive: true, force: true })
  if (existait) fs.cpSync(sauvegarde, storage, { recursive: true })
  fs.rmSync(sauvegarde, { recursive: true, force: true })
}
console.log(echecs ? `\nImport incrémental : ${echecs} échec(s)` : '\nImport incrémental : tout est vert')
process.exit(echecs ? 1 : 0)
