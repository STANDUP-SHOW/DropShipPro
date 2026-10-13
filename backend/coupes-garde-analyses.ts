/**
 * Liste chaque coupe du garde des données privées sur toutes les pages /analyses de la base locale,
 * avec son motif (13/10/2026, constat de #91) : de quoi relire les faux positifs avant une fusion.
 *
 *   npx tsx coupes-garde-analyses.ts [sortie.md]
 *
 * Réécrit storage/rendus-publics.json comme tout rendu local : le remettre ensuite si besoin.
 */
import fs from 'node:fs'
import { lignesPubliques, versPublicBrut } from './src/routes/analysesPubliques.js'
import { journalDuGarde, cheminRapport, type CoupeGarde } from './src/services/analysesPubliques.js'

const sortie = process.argv[2] ?? 'coupes-garde-analyses.md'
const lignes = lignesPubliques()
const coupes: Array<CoupeGarde & { page: string }> = []
for (const l of lignes) {
  journalDuGarde.ecrire = (c) => coupes.push({ ...c, page: cheminRapport(l) })
  versPublicBrut(l.id)
}
journalDuGarde.ecrire = null
const motif = (r: string) => r.replace(/[\d\s,.]+€/g, ' X €').replace(/« [^»]+ »/, '« … »').replace(/\(.*\)/, '').replace(/\s+/g, ' ').trim()
const parMotif = new Map<string, number>()
for (const c of coupes) parMotif.set(motif(c.raison), (parMotif.get(motif(c.raison)) ?? 0) + 1)
const md = [
  '# Coupes du garde des données privées (pages /analyses)',
  '',
  `${lignes.length} pages publiques de la base locale, ${coupes.length} coupes.`,
  '',
  '## Par motif',
  '',
  ...[...parMotif].sort((a, b) => b[1] - a[1]).map(([m, n]) => `- ${m} : ${n}`),
  '',
  '## Par page',
]
let page = ''
for (const c of coupes) {
  if (c.page !== page) md.push('', `### ${(page = c.page)}`, '')
  md.push(`- **${c.raison}**`, `  - avant : ${c.avant.replace(/\n/g, ' ')}`, `  - après : ${c.apres ? c.apres.replace(/\n/g, ' ') : '(retiré)'}`)
}
fs.writeFileSync(sortie, md.join('\n') + '\n')
console.log(`${coupes.length} coupes sur ${lignes.length} pages → ${sortie}`)
process.exit(0)
