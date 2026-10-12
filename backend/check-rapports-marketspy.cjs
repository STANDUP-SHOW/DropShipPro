/**
 * Les rapports complets des autres agents (« MARKETSPY AI », Google Drive, 12/10/2026).
 *
 *   cd backend && node check-rapports-marketspy.cjs
 *
 * Max : « ils possèdent tout ce qu'on doit importer dans le site… seize sections
 * chacun, plus l'annexe en JSON structuré ». Le lecteur n'en gardait que deux.
 * Ce banc fabrique un fichier de cette forme et vérifie que tout arrive :
 * chaque section à sa place, les ventes constatées et le score (tableau ou
 * annexe), les verdicts en français, et une date de mise à jour qui ne bouge
 * que si le contenu bouge. Aucune base réelle n'est touchée : une copie
 * jetable de rapports.db, dans le dossier temporaire du système.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const lib = require('./rapports-etude.cjs');

let rates = 0;
function exige(cond, nom) {
  console.log(`${cond ? 'ok  ' : 'RATE'}  ${nom}`);
  if (!cond) rates++;
}

const annexe = {
  meta: { category_id: 'electromenager', theme_slug: 'lavage-sechage' },
  products: [
    { rank: 1, product_name: 'Mini lave-linge portable', supplier_name: 'Usine X', observed_sales: '1 200+ / mois', scores: { global_opportunity_score: 82 }, image_url: 'https://img.test/1.jpg', decision: 'BUY' },
    { rank: 2, product_name: 'Sèche-linge pliable', marketplace_data: { units_sold: 640 }, scores: { global_opportunity_score: 71 }, decision: 'BUY IF NEGOTIATED' },
    { rank: 3, product_name: 'Filtre anti-peluches', scores: { global_opportunity_score: 40 }, decision: 'AVOID' },
  ],
};

const texte = `## Électroménager — Lavage et séchage

## 1. Executive Summary
Le marché du petit lavage nomade progresse. Budget de test : 600 € (détail en section 15).

## 2. Verdict rapide
Lancer le mini lave-linge : BUY. Le filtre : AVOID.

## 3. Marché actuel
La demande monte au printemps.

## 6. Analyse publicitaire et social trends
Voir le fichier \`lavage-sechage.marketing.md\`, section 6.

## 4. Analyse sourcing
L'achat unitaire AliExpress est perdant, le lot Alibaba passe.

## 7. TOP 20 produits gagnants
Classement du jour.

| Rang | Produit | Variante | Source achat | Coût rendu FR | Prix vente cible | Marge nette estimée | Score | Ventes constatées | Décision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Mini lave-linge portable | 3 kg | Usine | 32 € | 89 € | 40 € | 85 | | BUY |
| 2 | Sèche-linge pliable | — | Usine | 18 € | 49 € | 20 € | | | BUY IF NEGOTIATED |
| 3 | Filtre anti-peluches | — | Usine | 2 € | 9,90 € | 4 € | | 300 / mois | AVOID |

## 8. Battle sheet achat / revente
| Produit | Fournisseur | URL | Prix achat |
| --- | --- | --- | --- |
| Mini lave-linge portable | Usine X | https://www.usine.test/item/1001.html | 32 € |
| Sèche-linge pliable | Usine Y | https://www.usine.test/item/1002.html | 18 € |
| Filtre anti-peluches | Usine Z | https://www.usine.test/item/1003.html | 2 € |

## 15. Décision finale
Tester le top 3.

## 16. Sources
- https://www.usine.test/

## Annexe — JSON structuré
\`\`\`json
${JSON.stringify(annexe, null, 2)}
\`\`\`
`;

const etude = lib.etudeMarkdown({
  texteRayon: texte,
  texteMarketing: null,
  origineRayon: 'drive:dossier/2026-10-12/electromenager/lavage-sechage.rayon.md',
  origineMarketing: null,
  source: 'google-drive',
  indices: lib.indicesDuChemin('drive:dossier/2026-10-12/electromenager/lavage-sechage.rayon.md'),
});

console.log('\nLa lecture');
exige(etude.ok, 'le fichier sans en-tête est lu');
exige(etude.titre === 'Électroménager — Lavage et séchage', 'le titre vient du premier « ## »');
exige(etude.produits === 3 && etude.urlsDistinctes === 3, '3 produits, 3 adresses');
exige(etude.avecScore === 3, 'un score pour chacun (tableau, sinon annexe)');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'banc-marketspy-'));
const base = path.join(tmp, 'rapports.db');
fs.copyFileSync(path.join(__dirname, 'rapports.db'), base);
const db = new Database(base);
try {
  lib.ecrireEtude(db, etude);
  const r = db.prepare('SELECT data, updated_at FROM reports WHERE id = ?').get(etude.idRayon);
  const data = JSON.parse(r.data);
  const analyse = data.analysis;

  console.log('\nLes sections');
  for (const t of ['Synthèse', 'Verdict rapide', 'Marché actuel', 'Analyse sourcing', 'TOP 20 produits gagnants', 'Comparatif achat / revente', 'Décision finale', 'Sources']) {
    exige(analyse.includes(`## ${t}\n`), `« ${t} » est gardée, sous son titre`);
  }
  exige(!/^## \d/m.test(analyse), 'sans numéro (10 à 13 manquent dans les fichiers : un trou se lirait comme une perte)');
  exige(!/Annexe|"products"/.test(analyse), "l'annexe JSON n'est pas recopiée dans le texte");
  exige(!/^## Électroménager/m.test(analyse), 'le titre du rapport ne devient pas une section');
  exige(analyse.indexOf('Synthèse') < analyse.indexOf('Décision finale'), "l'ordre du fichier est gardé");
  exige(analyse.includes('(détail en « Décision finale »)'), 'un renvoi « section 15 » nomme la section, dont le numéro a disparu');
  exige(analyse.includes("Voir l'analyse marketing du même jour.") && analyse.includes('## Analyse publicitaire et tendances sociales'), 'le renvoi au fichier marketing devient une phrase lisible');
  exige(/ACHETER/.test(analyse) && /ÉVITER/.test(analyse) && !/\bBUY\b|\bAVOID\b/.test(analyse), 'les verdicts du texte en français');

  console.log('\nLes produits');
  const p = db
    .prepare(`SELECT p.title, p.verdict, p.score_global, p.image_url, p.reason FROM products p JOIN rayon_reports rr ON rr.id = p.rayon_report_id WHERE rr.report_id = ? ORDER BY p.rank`)
    .all(etude.idRayon);
  exige(p[0].score_global === 85, 'le score du tableau prime sur celui de l’annexe');
  exige(p[1].score_global === 71, 'à défaut, le score de l’annexe');
  exige(p[0].image_url === 'https://img.test/1.jpg', "l'image de l'annexe");
  exige(p[1].verdict === 'Acheter si négocié' && p[1].reason === 'Acheter si négocié', '« BUY IF NEGOTIATED » devient « Acheter si négocié »');
  exige(p[2].verdict === 'Éviter', '« AVOID » devient « Éviter »');
  const ventes = data.products.map((x) => x.sales ?? null);
  exige(ventes[0] === '1 200+ / mois', "ventes de l'annexe quand la case du tableau est vide");
  exige(ventes[1] === (640).toLocaleString('fr-FR'), 'ventes rangées un niveau plus bas dans l’annexe');
  exige(ventes[2] === '300 / mois', 'ventes du tableau, telles qu’écrites');

  console.log('\nLa date de mise à jour');
  db.prepare("UPDATE reports SET updated_at = '2026-10-01 00:00:00' WHERE id = ?").run(etude.idRayon);
  lib.ecrireEtude(db, etude);
  exige(db.prepare('SELECT updated_at u FROM reports WHERE id = ?').get(etude.idRayon).u === '2026-10-01 00:00:00', 'relire le même contenu ne change pas la date (lastmod du sitemap)');
  const autre = lib.etudeMarkdown({ texteRayon: texte.replace('progresse', 'accélère'), texteMarketing: null, origineRayon: 'drive:dossier/2026-10-12/electromenager/lavage-sechage.rayon.md', origineMarketing: null, source: 'google-drive', indices: lib.indicesDuChemin('drive:dossier/2026-10-12/electromenager/lavage-sechage.rayon.md') });
  lib.ecrireEtude(db, autre);
  exige(db.prepare('SELECT updated_at u FROM reports WHERE id = ?').get(etude.idRayon).u !== '2026-10-01 00:00:00', 'un contenu changé change la date');
  db.pragma('foreign_keys = OFF');
  db.prepare('DELETE FROM reports WHERE id = ?').run(etude.idRayon);
  lib.ecrireEtude(db, { ...etude, majLe: '2026-10-12 14:05:00' });
  exige(db.prepare('SELECT updated_at u FROM reports WHERE id = ?').get(etude.idRayon).u === '2026-10-12 14:05:00', "une base reconstruite date l'étude de son import, pas du démarrage");
  db.prepare("UPDATE reports SET updated_at = '2026-10-12 18:17:02' WHERE id = ?").run(etude.idRayon);
  lib.ecrireEtude(db, { ...etude, majLe: '2026-10-08 09:00:00' });
  exige(db.prepare('SELECT updated_at u FROM reports WHERE id = ?').get(etude.idRayon).u === '2026-10-08 09:00:00', "une relecture date la ligne de l'import, même déjà redatée par une relecture précédente (07/10 et 08/10 à 18:17)");
  const ai = lib.etudeAiMarket({ study: { date: '2026-10-08', category_name: 'Informatique', category_id: 'informatique', theme_slug: 'banc-ai', theme_name: 'Banc' }, analysis: 'Texte.', products: [{ rank: 1, product_name: 'P', product_url: 'https://x.test/1' }] }, 'drive:banc/ai.json');
  if (ai.ok) {
    lib.ecrireEtude(db, { ...ai, majLe: '2026-10-08 10:00:00' });
    db.prepare("UPDATE reports SET updated_at = '2026-10-12 18:17:02' WHERE id = ?").run(ai.idRayon);
    lib.ecrireEtude(db, { ...ai, majLe: '2026-10-08 10:00:00' });
    exige(db.prepare('SELECT updated_at u FROM reports WHERE id = ?').get(ai.idRayon).u === '2026-10-08 10:00:00', 'de même pour un import aiMARKET');
    lib.ecrireEtude(db, ai);
    exige(db.prepare('SELECT updated_at u FROM reports WHERE id = ?').get(ai.idRayon).u === '2026-10-08 10:00:00', 'sans date d’import, le même contenu garde sa date');
  } else exige(false, 'étude aiMARKET de banc lisible : ' + ai.raison);
} finally {
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('\nLes verdicts');
exige(lib.verdictFr('BUY IF NEGOTIATED') === 'ACHETER SI NÉGOCIÉ', 'la phrase la plus longue d’abord');
exige(lib.verdictFr('- Breakout : service posé') === '- En décollage : service posé', '« Breakout : » seul, en tête de puce, se traduit aussi');
exige(lib.verdictFr('to buy or not') === 'to buy or not', 'la prose en minuscules reste telle quelle');

console.log(rates ? `\n${rates} attente(s) manquée(s).` : '\nTout est conforme.');
process.exit(rates ? 1 : 0);
