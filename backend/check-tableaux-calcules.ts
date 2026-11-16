/**
 * Banc : un tableau de prix calculé par formule n'atteint jamais une page publique (16/11/2026).
 * Constaté sur la page cheveux du 16/11 : chaque prix Amazon valait 0,95–1,15 × le prix conseillé.
 *
 *   npx tsx check-tableaux-calcules.ts
 */
import { estTableauCalcule, sansTableauxPrives, publiable, estFicheMarchande } from './src/services/analysesPubliques.js'

let echecs = 0
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? '✓' : '✗'} ${msg}`)
  if (!cond) echecs++
}

const calcule = `### Tableau 3 — Comparatif marketplaces

| Produit | Amazon FR | Cdiscount | Leboncoin (Neuf) | Prix cible | Concurrence |
|---|---|---|---|---|---|
| Styler | [61.66 €–74.64 €](https://www.amazon.fr/dp/B0CQKCC2ZM) | 58.41 €–68.15 € | 35.70 €–45.43 € | **64.90 €** | Moyenne |
| Brosse | [12.25 €–14.83 €](https://www.amazon.fr/dp/B0FDH61LP4) | 11.61 €–13.55 € | 7.10 €–9.03 € | **12.90 €** | Moyenne |
| Bonnet | [23.65 €–28.63 €](https://www.amazon.fr/dp/B0BVR3HHH5) | 22.41 €–26.14 € | 13.70 €–17.43 € | **24.90 €** | Moyenne |`
const lu = `| Produit | Amazon FR | Prix cible |
|---|---|---|
| Styler | 59,99 € | 64,90 € |
| Brosse | 14,49 € | 12,90 € |
| Bonnet | 21,00 € | 24,90 € |`

ok(estTableauCalcule(calcule.split('\n').slice(2)), 'prix en ratio fixe du prix cible → calculé')
ok(!estTableauCalcule(lu.split('\n')), 'prix relevés (ratios différents) → gardé')
const r = sansTableauxPrives(`## Comparatif\n\nTexte avant.\n\n${calcule}\n\nTexte après.`)
ok(!/61\.66|amazon\.fr/.test(r.corps) && r.retires === 1, 'le tableau calculé et son titre sont retirés')
ok(/Texte avant\./.test(r.corps) && /Texte après\./.test(r.corps) && !/Tableau 3/.test(r.corps), 'le texte autour reste')
ok(/59,99/.test(sansTableauxPrives(lu).corps), 'un tableau relevé reste publié')

// Les fiches marchandes non vérifiées du « Verdict rapide » (16/11/2026)
const v1 = publiable('- **Meilleur produit marketplace ([🛒 Amazon FR](https://www.amazon.fr/dp/B0FDH61LP4) — Bonnet de nuit en soie.')
ok(!/amazon\.fr\/dp|Amazon FR/.test(v1) && /Bonnet de nuit en soie/.test(v1), 'lien amazon.fr/dp et son libellé de boutique retirés : ' + v1)
const v2 = publiable('Voir [le bonnet en soie](https://fr.aliexpress.com/item/1005.html) ici.')
ok(/le bonnet en soie/.test(v2) && !/aliexpress/.test(v2), 'lien de fiche retiré, libellé descriptif gardé : ' + v2)
ok(/\(https:\/\/www\.ifop\.com\/etude\)/.test(publiable('Source : [Ifop](https://www.ifop.com/etude).')), 'un lien de source reste')
ok(!estFicheMarchande('https://www.amazon.fr/s?k=bonnet'), 'une recherche Amazon n’est pas une fiche')

console.log(echecs ? `\n${echecs} échec(s)` : '\nTout est conforme.')
process.exit(echecs ? 1 : 0)
