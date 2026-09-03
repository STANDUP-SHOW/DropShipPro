import { PLATFORMS } from './src/services/platforms.js'

/**
 * Où en est chaque destination, en une commande.
 *
 *   cd backend && npx tsx etat-destinations.ts
 *
 * **Lecture seule.** Sert à répondre à « qu'est-ce qui reste à brancher », sans
 * relire `platforms.ts` de haut en bas et sans se tromper de compte.
 */
const par = new Map<string, string[]>()
for (const p of PLATFORMS) {
  const liste = par.get(p.integration) ?? []
  liste.push(p.warning ? `${p.label} ⚠` : p.label)
  par.set(p.integration, liste)
}

for (const [etat, liste] of [...par.entries()].sort()) {
  console.log(`\n${etat} — ${liste.length}`)
  for (const l of liste.sort()) console.log(`  ${l}`)
}
console.log(`\nTotal : ${PLATFORMS.length} destinations. ⚠ = contrainte à connaître avant de s'inscrire.`)
