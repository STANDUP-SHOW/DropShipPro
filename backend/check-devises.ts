import http from 'http'

/**
 * Éprouve la conversion en euros contre un faux Frankfurter.
 *
 * Le contrat est écrit EN DUR — leçon du banc Kaufland : un faux serveur qui
 * réutilise le code du connecteur ne prouve rien. Ici :
 * GET /latest?from=JPY&to=EUR → {"rates":{"EUR":0.0056}}.
 *
 * Vérifié : la conversion et son arrondi, le cache (un seul appel pour deux
 * conversions), l'euro laissé tel quel, une devise inconnue jamais convertie,
 * et le repli sur la table datée quand le serveur ne répond plus.
 */
const PORT = 8794
process.env.FRANKFURTER_BASE = `http://127.0.0.1:${PORT}`

const { enEuros, oublierTaux, REPLI_DATE } = await import('./src/services/devises.js')

let appels = 0
const serveur = http.createServer((req, res) => {
  appels++
  const u = new URL(req.url ?? '/', 'http://x')
  if (u.pathname === '/latest' && u.searchParams.get('from') === 'JPY' && u.searchParams.get('to') === 'EUR') {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ amount: 1, base: 'JPY', date: '2026-09-14', rates: { EUR: 0.0056 } }))
    return
  }
  res.statusCode = 404
  res.end('{}')
})
await new Promise<void>((r) => serveur.listen(PORT, '127.0.0.1', r))

let echecs = 0
const exige = (condition: boolean, message: string) => {
  if (!condition) {
    echecs++
    console.log(`ECHEC : ${message}`)
  }
}

const a = await enEuros(1234, 'JPY')
exige(a.montant === 6.91 && a.source === 'bce', `1234 JPY → ${a.montant} € (${a.source}), attendu 6.91 (bce)`)
const b = await enEuros(10000, 'jpy')
exige(b.montant === 56 && appels === 1, `cache : ${appels} appel(s) pour deux conversions, attendu 1 ; 10000 JPY → ${b.montant}`)
const e = await enEuros(12.5, 'EUR')
exige(e.montant === 12.5 && e.taux === 1, "l'euro doit rester tel quel")
const x = await enEuros(100, 'XYZ')
exige(x.source === 'aucune' && x.montant === 100, `devise inconnue : ${x.montant} (${x.source}), attendu 100 (aucune)`)

serveur.close()
oublierTaux()
const r = await enEuros(178.52, 'JPY')
exige(
  r.source === 'repli' && Math.abs(r.montant - 1) < 0.01,
  `repli sans serveur : ${r.montant} € (${r.source}), attendu ≈ 1 € par la table du ${REPLI_DATE}`,
)

console.log(echecs === 0 ? 'Devises : tout passe.' : `${echecs} échec(s).`)
process.exitCode = echecs === 0 ? 0 : 1
