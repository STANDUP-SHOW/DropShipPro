import 'dotenv/config'
import { prisma } from './src/lib/prisma.js'
import { findConnector } from './src/services/supplierConnectors.js'

/**
 * Sonde, lecture seule : les connecteurs reliés répondent-ils VRAIMENT ?
 *
 * Les bancs les éprouvent contre de faux serveurs — c'est ce qui prouve le
 * contrat, pas la liaison. Ici on appelle les vraies API avec les vrais
 * identifiants du vendeur, et on ne demande que de la lecture.
 */
const liens = await prisma.supplierConnection.findMany({ where: { connected: true } })

for (const lien of liens) {
  const c = findConnector(lien.supplier)
  console.log(`\n=== ${lien.supplier} ===`)
  if (!c) {
    console.log('  aucun connecteur écrit.')
    continue
  }
  const creds = (lien.data ?? {}) as Record<string, string>
  const capacites = [
    ['searchProducts', c.searchProducts && (() => c.searchProducts!('phone case', creds))],
    ['winningProducts', c.winningProducts && (() => c.winningProducts!(creds))],
  ] as const

  for (const [nom, appel] of capacites) {
    if (!appel) {
      console.log(`  ${nom.padEnd(16)} non implémenté`)
      continue
    }
    try {
      const r = await appel()
      console.log(`  ${nom.padEnd(16)} OK — ${r.length} résultat(s)`)
      for (const p of r.slice(0, 3)) {
        console.log(`      · ${p.titre.slice(0, 52)} — ${p.prix ?? '?'} ${p.devise} ${p.entrepot ?? ''}`)
      }
    } catch (e) {
      console.log(`  ${nom.padEnd(16)} ÉCHEC : ${e instanceof Error ? e.message : String(e)}`)
    }
  }
}
await prisma.$disconnect()
