import { prisma } from './src/lib/prisma.js'
import { gagnantsDuRayon, rayonsAutoShipper, semerGagnants, needsExtension, IMPORTABLES_PAR_RAYON } from './src/services/autoShipperRayons.js'
import { DEPARTMENTS } from './src/services/departments.js'
import { ReportQuery, CHEMIN_RAPPORTS_DB } from './src/services/reportsDb.js'

/**
 * La passerelle rapports → AUTO-SHIPPER (14/10/2026), contre la vraie base des
 * rapports versionnée (rapports.db) et un compte jetable : jamais la production.
 *
 *   cd backend && npx tsx check-autoshipper-rayons.ts
 *
 * Ce qu'il vérifie : les 24 rayons sont décrits ; un rayon boost reçoit au plus
 * dix gagnants, tous lisibles par le serveur (lien http, pas un site réservé à
 * l'extension, lu par l'API ou l'application desktop depuis le 14/10/2026) avec un prix de vente au-dessus du prix d'achat ; un second
 * passage n'ajoute rien ; un rayon qui n'est pas en boost ne reçoit rien.
 */

let echecs = 0
function verifier(nom: string, condition: boolean, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

async function main() {
  const q = new ReportQuery(CHEMIN_RAPPORTS_DB, null)
  const rayons = rayonsAutoShipper(q)
  verifier('les rayons du catalogue sont tous décrits', rayons.length === DEPARTMENTS.length, `${rayons.length}`)
  verifier('aucun rayon ne promet plus de dix importables', rayons.every((r) => r.importables <= IMPORTABLES_PAR_RAYON))

  const plein = rayons.find((r) => r.importables > 0)
  verifier('au moins un rayon a des produits importables', Boolean(plein))
  if (!plein) return

  const g = gagnantsDuRayon(plein.key, q)
  verifier('chaque importable a un lien http', g.importables.every((p) => /^https?:\/\//.test(p.url)))
  // Depuis le 14/10/2026, les fiches que seul un navigateur lit en font partie (API, desktop, extension).
  const navigateur = rayons.reduce((n, r) => n + r.navigateur.length, 0)
  verifier('les fiches réservées au navigateur ne sont plus écartées', navigateur > 0, `${navigateur} sur les 24 rayons`)
  verifier(
    'les fiches « navigateur » comptées sont bien celles que le serveur ne lit pas',
    rayons.every((r) => r.navigateur.every((u) => /^https?:/.test(u))) && rayons.some((r) => r.navigateur.some((u) => needsExtension(u))),
  )
  verifier(
    'chaque importable vend au-dessus de son prix d’achat',
    g.importables.every((p) => p.prixAchat !== null && p.prixAchat > 0 && p.prixVente !== null && p.prixVente > p.prixAchat),
  )

  const user = await prisma.user.create({ data: { email: `banc-as-rayons-${Date.now()}@example.com`, passwordHash: 'x', credits: 0 } })
  try {
    const autre = DEPARTMENTS.find((d) => d.key !== plein.key)!
    const boost = await prisma.department.create({ data: { userId: user.id, key: plein.key, agentName: 'Banc', autoMode: true } })
    await prisma.department.create({ data: { userId: user.id, key: autre.key, agentName: 'Banc 2', autoMode: false } })

    const n1 = await semerGagnants(user.id, q)
    verifier('le rayon boost reçoit ses importables', n1 === g.importables.length, `${n1} sur ${g.importables.length}`)
    const opps = await prisma.opportunity.findMany({ where: { userId: user.id } })
    verifier('toutes rattachées au rayon boost, au statut NEW', opps.every((o) => o.departmentId === boost.id && o.status === 'NEW'))
    verifier('marge positive pour chacune', opps.every((o) => o.marketPrice !== null && Number(o.marketPrice) > Number(o.sourcePrice)))

    const n2 = await semerGagnants(user.id, q)
    verifier('un second passage n’ajoute rien', n2 === 0, `${n2}`)
  } finally {
    await prisma.user.delete({ where: { id: user.id } })
    q.close()
  }
}

main()
  .catch((err) => {
    console.error(err)
    echecs++
  })
  .finally(async () => {
    await prisma.$disconnect()
    console.log(echecs ? `\n${echecs} échec(s)` : '\nTout est conforme.')
    process.exit(echecs ? 1 : 0)
  })
