import 'dotenv/config'
import { prisma } from './src/lib/prisma.js'

const lien = await prisma.supplierConnection.findFirst({ where: { supplier: 'bigbuy' } })
const data = (lien?.data ?? {}) as Record<string, string>
const cle = data.apiKey?.trim() ?? ''
console.log(`Liaison  : ${lien ? (lien.connected ? 'reliée' : 'ÉTEINTE') : 'absente'}`)
console.log(`Clé      : ${cle.length} caractères, « ${cle.slice(0, 6)}…${cle.slice(-4)} »`)
console.log(`Modifiée : ${lien?.updatedAt.toISOString().slice(0, 19).replace('T', ' ')} UTC`)
console.log(`Champs   : ${Object.keys(data).join(', ')}`)

const base = 'https://api.bigbuy.eu'
// Trois façons d'envoyer la même clé : si l'une passe, ce n'est pas la clé
// qui est en cause mais la façon dont on la présente.
const facons: Array<[string, Record<string, string>]> = [
  ['Bearer (ce qu\'on envoie)', { Authorization: `Bearer ${cle}` }],
  ['Authorization brute', { Authorization: cle }],
  ['en-tête X-Api-Key', { 'X-Api-Key': cle }],
]
for (const [nom, entetes] of facons) {
  try {
    const res = await fetch(`${base}/rest/user/purse.json`, {
      headers: { ...entetes, Accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    })
    const t = await res.text()
    let m = t.slice(0, 120)
    try { const j = JSON.parse(t); m = j.message ? `« ${j.message} »` : JSON.stringify(j).slice(0, 120) } catch {}
    console.log(`  ${String(res.status).padEnd(4)} ${nom.padEnd(26)} ${m}`)
  } catch (e) {
    console.log(`  ERR  ${nom.padEnd(26)} ${e instanceof Error ? e.message : e}`)
  }
}
await prisma.$disconnect()
