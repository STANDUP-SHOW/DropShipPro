/**
 * Banc : une marge négative n'est jamais un « acheter » (21/11/2026).
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

console.log('Règle')
const cas = C.coherencePrix({ achat: 79.9, vente: 27.9, margePct: null, verdict: 'Acheter', score: 90 })
exige(cas.margePct === -186.4, `marge recalculée des deux prix : ${cas.margePct} %`)
exige(cas.verdict === C.VERDICT_PRIX_INCOHERENT, `verdict forcé : ${cas.verdict}`)
exige(cas.score === C.SCORE_MAX_INCOHERENT, `score plafonné : ${cas.score}`)
exige(cas.verdictAgent === 'Acheter' && cas.scoreAgent === 90, "ce qu'a écrit l'agent est gardé à part")
const negatif = C.coherencePrix({ achat: null, vente: null, margePct: -12, verdict: 'BUY NOW', score: 70 })
exige(negatif.verdict === C.VERDICT_MARGE_NEGATIVE && negatif.score === 20, 'marge négative sans prix : « Ne pas acheter »')
const dejaNon = C.coherencePrix({ achat: 30, vente: 20, margePct: null, verdict: "DON'T BUY", score: 10 })
exige(dejaNon.verdict === "DON'T BUY" && !dejaNon.verdictAgent, "un « ne pas acheter » de l'agent reste le sien")
const nonSource = C.coherencePrix({ achat: 10, vente: 30, margePct: 66.7, verdict: 'BUY NOW', score: 88, source: false })
exige(nonSource.prixNonSource && nonSource.margePct === null && nonSource.verdict === C.VERDICT_NON_SOURCE && nonSource.score === 20, 'prix sans page vérifiée : non sourcé, sans marge, sans verdict favorable')
const sain = C.coherencePrix({ achat: 10, vente: 30, margePct: 66.7, verdict: 'BUY NOW', score: 88, source: true })
exige(sain.verdict === 'BUY NOW' && sain.score === 88 && !sain.incoherence, 'une ligne saine ne change pas')

console.log('Ligne de rapport')
const ligne = (ReportQuery as any).produitDeLigne(
  { title: 'Projecteur LED solaire extérieur', supplier: 'Cdiscount', supplier_url: 'https://www.cdiscount.com/f-1.html', buy_price: '79,90 €', sell_price: '27,90 €', verdict: 'Acheter', score_global: 90, import_method: 'url', margin_pct: null },
  0,
)
exige(ligne.prixAchat === 79.9 && ligne.prixVente === 27.9, 'prix lus')
exige(Math.round(ligne.margePct) === -186, `marge affichée ${ligne.margePct} %`)
exige(ligne.verdict === C.VERDICT_PRIX_INCOHERENT && ligne.score === 20 && ligne.incoherence === 'vente-sous-achat', 'verdict et score corrigés')

console.log('Synthèses')
const p = S.produitCoherent({
  id: 'jardin/projecteur', categorie: 'jardin', categorieLabel: 'Jardin', theme: 'eclairage', themeLabel: 'Éclairage', rang: 1,
  nom: 'Projecteur', variante: '', score: 90, decision: 'BUY NOW', source: 'Cdiscount', coutRendu: null, prixAchat: 79.9,
  prixVente: 27.9, margeNette: null, margeBrute: -52, roi: null, liens: {},
})
exige(p.decision === C.VERDICT_PRIX_INCOHERENT && p.score === 20 && p.decisionAgent === 'BUY NOW', 'décision et score corrigés')
const sections = S.sectionsCoherentes({ top5: [p.id], heros: [p.id], buyNow: [p.id], roi: [], highTicket: [], breakout: [], listeNoire: [] }, [p])
exige(!sections.top5.length && !sections.buyNow.length && sections.heros.length === 1, 'retiré des listes « à acheter »')

// Inventaire du rapports.db versionné (la base en ligne se lit par GET /api/reports-incoherences).
console.log('Audit de rapports.db (versionné)')
const audit = new ReportQuery().auditRapports()
const coherents = audit.filter((r) => r.aVerifier === 0).length
const somme = (k: 'lignes' | 'aVerifier' | 'prixSources' | 'prixNonSources' | 'venteSousAchat') => audit.reduce((n, r) => n + r[k], 0)
console.log(`  ${coherents}/${audit.length} rapports cohérents ; ${somme('aVerifier')}/${somme('lignes')} lignes à vérifier ; prix sourcés ${somme('prixSources')}, non sourcés ${somme('prixNonSources')} ; vente ≤ achat ${somme('venteSousAchat')}`)
exige(audit.length > 0 && audit.every((r) => r.lignes >= r.aVerifier), "l'audit lit chaque rapport")

console.log(echecs ? `\n${echecs} échec(s)` : '\nTout est conforme.')
process.exit(echecs ? 1 : 0)
