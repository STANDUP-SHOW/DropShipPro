import { CANAUX } from './src/services/channelDirectory.js'
import { PLATFORMS } from './src/services/platforms.js'

/**
 * Les deux listes, et ce qui les sépare.
 *
 *   cd backend && npx tsx etat-annuaire.ts
 *
 * **Lecture seule.** Écrit parce que la question s'est posée le 03/09/2026 :
 * « tu en comptes 16, j'en compte 300 ». Les deux comptes sont justes, ils ne
 * portent pas sur la même chose — et sans ce relevé on discute d'impressions.
 */
const parType = new Map<string, number>()
for (const c of CANAUX) parType.set(c.type, (parType.get(c.type) ?? 0) + 1)

console.log(`ANNUAIRE — ${CANAUX.length} marques dont nous avons le logo`)
for (const [type, n] of [...parType.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${type}`)
}

console.log(`\nDESTINATIONS — ${PLATFORMS.length} déclarées dans platforms.ts`)
const parEtat = new Map<string, number>()
for (const p of PLATFORMS) parEtat.set(p.integration, (parEtat.get(p.integration) ?? 0) + 1)
for (const [etat, n] of [...parEtat.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${etat}`)
}

/*
 * Le recouvrement : combien des destinations declarees figurent aussi dans
 * l annuaire. Rapproche sur le libelle, faute d identifiant commun -- l annuaire
 * est engendre depuis des noms de fichiers, pas depuis l enum Prisma.
 */
const libellesAnnuaire = new Set(CANAUX.map((c) => c.label.toLowerCase()))
const communes = PLATFORMS.filter((p) => libellesAnnuaire.has(p.label.toLowerCase()))
console.log(`\nLes deux listes se recoupent sur ${communes.length} nom(s) : ${communes.map((p) => p.label).join(', ')}`)

const marketplaces = CANAUX.filter((c) => c.type === 'marketplace')
console.log(
  `\nDans l'annuaire, ${marketplaces.length} sont des places de marché — c'est le vivier où puiser la suivante.`,
)
