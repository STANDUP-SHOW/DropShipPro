/**
 * Banc : le verdict et le score de l'agent ne sont jamais remplacés (27/11/2026 ; la règle du 21/11 est retirée).
 *
 * Cas réel collé par max : « Jardin et extérieur · Éclairage extérieur · 17 novembre 2026 · Cdiscount »,
 * achat 79,90 €, vente indiquée 27,90 €, marge -186 %, verdict « acheter », score 90/100.
 * Vérifie la règle (coherencePrix.ts), la ligne des rapports (reportsDb.ts), la page publique
 * (analysesPubliques.ts) et les synthèses (synthesesQuotidiennes.ts). Aucun réseau, aucune base écrite.
 *
 *   npx tsx check-coherence-prix.ts
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

process.env.DOSSIER_SYNTHESES = fs.mkdtempSync(path.join(os.tmpdir(), 'coherence-'))
const C = await import('./src/services/coherencePrix.js')
const { ReportQuery } = await import('./src/services/reportsDb.js')
const S = await import('./src/services/synthesesQuotidiennes.js')

let echecs = 0
function exige(ok: unknown, libelle: string) {
  if (ok) console.log(`  ok  ${libelle}`)
  else {
    echecs++
    console.log(`  ÉCHEC  ${libelle}`)
  }
}

// 27/11/2026, max : « ce ne sont pas nos règles ». Le verdict, le score et les prix de l'agent restent les siens.
console.log('Règle')
const cas = C.coherencePrix({ achat: 79.9, vente: 27.9, margePct: null, verdict: 'Acheter', score: 90 })
exige(cas.margePct === -186.4, `marge des deux prix : ${cas.margePct} %`)
exige(cas.verdict === 'Acheter' && cas.score === 90 && !cas.incoherence, `verdict et score de l'agent gardés : ${cas.verdict}, ${cas.score}`)
const nonSource = C.coherencePrix({ achat: 10, vente: 30, margePct: 66.7, verdict: 'BUY NOW', score: 88, source: false })
exige(nonSource.verdict === 'BUY NOW' && nonSource.score === 88 && nonSource.margePct === 66.7 && !nonSource.prixNonSource, 'jamais « non sourcé »')

console.log('Ligne de rapport')
const ligne = (ReportQuery as any).produitDeLigne(
  { title: 'Projecteur LED solaire extérieur', supplier: 'Cdiscount', supplier_url: 'https://www.cdiscount.com/f-1.html', buy_price: '79,90 €', sell_price: '27,90 €', verdict: 'Acheter', score_global: 90, import_method: 'url', margin_pct: null },
  0,
)
exige(ligne.prixAchat === 79.9 && ligne.prixVente === 27.9, 'prix lus')
exige(ligne.verdict === 'Acheter' && ligne.score === 90 && !ligne.incoherence && ligne.url === 'https://www.cdiscount.com/f-1.html', 'verdict, score et lien de l’agent servis tels quels')

console.log('Synthèses')
const p = S.produitCoherent({
  id: 'jardin/projecteur', categorie: 'jardin', categorieLabel: 'Jardin', theme: 'eclairage', themeLabel: 'Éclairage', rang: 1,
  nom: 'Projecteur', variante: '', score: 90, decision: 'BUY NOW', source: 'Cdiscount', coutRendu: null, prixAchat: 79.9,
  prixVente: 27.9, margeNette: null, margeBrute: -52, roi: null, liens: {},
})
exige(p.decision === 'BUY NOW' && p.score === 90 && !p.incoherence, 'décision et score de l’agent gardés')
const sections = S.sectionsCoherentes({ top5: [p.id], heros: [p.id], buyNow: [p.id], roi: [], highTicket: [], breakout: [], listeNoire: [] }, [p])
exige(sections.top5.length === 1 && sections.buyNow.length === 1 && sections.heros.length === 1, 'les listes de l’agent restent les siennes')

// Inventaire du rapports.db versionné (la base en ligne se lit par GET /api/reports-incoherences).
console.log('Audit de rapports.db (versionné)')
const audit = new ReportQuery().auditRapports()
const coherents = audit.filter((r) => r.aVerifier === 0).length
const somme = (k: 'lignes' | 'aVerifier' | 'prixSources' | 'prixNonSources' | 'venteSousAchat') => audit.reduce((n, r) => n + r[k], 0)
console.log(`  ${coherents}/${audit.length} rapports cohérents ; ${somme('aVerifier')}/${somme('lignes')} lignes à vérifier ; prix sourcés ${somme('prixSources')}, non sourcés ${somme('prixNonSources')} ; vente ≤ achat ${somme('venteSousAchat')}`)
exige(audit.length > 0 && audit.every((r) => r.lignes >= r.aVerifier), "l'audit lit chaque rapport")

console.log(echecs ? `\n${echecs} échec(s)` : '\nTout est conforme.')
process.exit(echecs ? 1 : 0)
