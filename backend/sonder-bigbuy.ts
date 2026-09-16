import 'dotenv/config'
import { prisma } from './src/lib/prisma.js'

/**
 * Sonde lecture seule : la clé BigBuy enregistrée passe-t-elle, et OÙ ?
 *
 * Deux hypothèses à départager, et elles se ressemblent de l'extérieur : une
 * clé périmée, ou une clé de BAC À SABLE présentée à la production. BigBuy
 * répond « Invalid Token » dans les deux cas.
 */
const lien = await prisma.supplierConnection.findFirst({ where: { supplier: 'bigbuy' } })
const data = (lien?.data ?? {}) as Record<string, string>
const cle = data.apiKey?.trim() ?? ''
console.log(`Liaison : ${lien ? (lien.connected ? 'reliée' : 'éteinte') : 'absente'}`)
console.log(`Clé enregistrée : ${cle.length} caractères, commence par « ${cle.slice(0, 4)} », modifiée le ${lien?.updatedAt.toISOString().slice(0, 16).replace('T', ' ')}`)

const bases = [
  ['production', 'https://api.bigbuy.eu'],
  ['bac à sable', 'https://api.sandbox.bigbuy.eu'],
]

for (const [nom, base] of bases) {
  for (const chemin of ['/rest/user/purse.json', '/rest/catalog/categories.json?isoCode=fr']) {
    try {
      const res = await fetch(`${base}${chemin}`, {
        headers: { Authorization: `Bearer ${cle}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(25000),
      })
      const texte = await res.text()
      let resume = texte.slice(0, 120)
      try {
        const j = JSON.parse(texte)
        resume = j.message ? `« ${j.message} »` : Array.isArray(j) ? `tableau de ${j.length}` : JSON.stringify(j).slice(0, 110)
      } catch {}
      console.log(`  ${String(res.status).padEnd(4)} ${nom.padEnd(12)} ${chemin}\n         ${resume}`)
    } catch (e) {
      console.log(`  ERR  ${nom.padEnd(12)} ${chemin} — ${e instanceof Error ? e.message : e}`)
    }
  }
}
await prisma.$disconnect()
