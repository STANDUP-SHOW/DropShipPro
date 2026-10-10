/**
 * Controle qualite des rapports : le contrat de drop-shipper.fr, verifie.
 *
 *   cd backend && node verifier-rapports.cjs                  # la date du jour
 *   cd backend && node verifier-rapports.cjs --date 2026-09-20
 *   cd backend && node verifier-rapports.cjs --toutes         # tout l'historique
 *   cd backend && node verifier-rapports.cjs --date 2026-10-04 --detail
 *
 * Code de sortie 0 si tout est conforme, 1 sinon. C'est ce code qui doit
 * empecher la chaine d'import d'annoncer un succes.
 *
 * ========================================================================
 * POURQUOI CE FICHIER EXISTE
 *
 * Trois fois de suite, le systeme a echoue en silence.
 *
 *   19/09 — Claude renvoie un rapport VIDE. La reflexion adaptative avait
 *           avale tout le budget de tokens. Rien ne l'a signale : c'est un
 *           fichier de diagnostic ecrit par hasard qui a permis de le voir.
 *
 *   23/09 — Serper refuse les requetes, faute de credits. Le noeud etant en
 *           « continuer malgre l'erreur », la liste de produits sort vide et
 *           n8n conclut « success ». Deux executions marquees reussies sans
 *           avoir rien ecrit. Six jours de silence.
 *
 *   04/10 — 24 rapports importes, 439 produits, zero refus : annonce comme
 *           une reussite. Mais 0 score sur 439, 0 verdict, 0 image, 0 MOQ,
 *           la ou le 20/09 en avait sur chaque produit. Le volume avait
 *           augmente, la substance avait disparu, et le compte rendu ne
 *           regardait que le volume.
 *
 * Le point commun des trois n'est pas une panne : c'est qu'AUCUNE etape ne
 * comparait la sortie au contrat. Un systeme qui ne sait pas dire « ce
 * rapport n'est pas vendable » finira toujours par en publier un.
 *
 * Ce fichier est cette etape. Il ne produit rien, il ne repare rien : il
 * refuse. Et il nomme ce qui manque, rayon par rayon, pour qu'on n'ait pas a
 * le chercher.
 *
 * ========================================================================
 * LE CONTRAT, DANS LES MOTS DE MAX
 *
 *   « 20 produits par jour, et 20 URL. Sans URL je n'ai pas de liste
 *     produit. » L'URL est aussi importante que le produit, parce que le
 *     produit vendu est l'import automatique, et que l'import a besoin d'une
 *     adresse.
 *
 *   « Les deux agents ne doivent JAMAIS inventer une URL ou un prix. » Un
 *     champ vide est acceptable, un champ vraisemblable ne l'est pas. Ce
 *     controle ne sait pas detecter une invention — personne ne sait — mais
 *     il compte les champs vides, ce qui rend l'honnetete mesurable.
 *
 *   Les rapports detaillees sont un ARGUMENT DE VENTE. Un rapport pauvre ne
 *   degrade pas une statistique interne : il degrade le produit.
 */
const path = require('path');

const args = process.argv.slice(2);
const detail = args.includes('--detail');
const toutes = args.includes('--toutes');
const dateVoulue = args.includes('--date')
  ? args[args.indexOf('--date') + 1]
  : new Date().toISOString().slice(0, 10);

const BASE = path.resolve(__dirname, 'rapports.db');

/**
 * Les seuils.
 *
 * `produits` et `urls` sont des engagements commerciaux : en dessous, le
 * rapport n'est pas livrable, point. Les autres sont des attendus de
 * richesse : le format aiMARKET les porte, le format Markdown simple non.
 * Un rayon qui les rate n'est pas faux, il est pauvre — on le dit autrement.
 */
const CONTRAT = {
  produits: 20,
  urlsDistinctes: 20,
  // en dessous, l'import automatique n'a presque rien a se mettre sous la dent
  fichesMin: 10,
  // part maximale de produits sans prix d'achat ou sans prix de vente
  sansPrixMaxPct: 10,
  // richesse aiMARKET : score, verdict, image
  richesseMinPct: 80,
};

function ouvrir(chemin) {
  try {
    return new (require('better-sqlite3'))(chemin, { readonly: true, fileMustExist: true });
  } catch (e) {
    return new (require('node:sqlite').DatabaseSync)(chemin, { readOnly: true });
  }
}

const db = ouvrir(BASE);

const dates = toutes
  ? db.prepare("SELECT DISTINCT date FROM reports WHERE type='rayon' ORDER BY date").all().map((r) => r.date)
  : [dateVoulue];

let rayonsVus = 0;
let horsContrat = 0;
let pauvres = 0;

for (const date of dates) {
  const rayons = db.prepare(`
    SELECT r.id, r.categorie, r.theme, r.titre, r.sources,
           (SELECT COUNT(*) FROM products p
              JOIN rayon_reports rr ON rr.id = p.rayon_report_id
             WHERE rr.report_id = r.id) AS nb
      FROM reports r
     WHERE r.type = 'rayon' AND r.date = ?
     ORDER BY r.categorie
  `).all(date);

  console.log(`\n${'='.repeat(78)}`);
  console.log(`${date} — ${rayons.length} rayon(s)`);
  console.log('='.repeat(78));

  if (!rayons.length) {
    console.log('AUCUN RAPPORT. Si la nuit devait tourner, c\'est une panne, pas un vide.');
    horsContrat++;
    continue;
  }

  const stats = db.prepare(`
    SELECT rr.report_id AS rid,
           COUNT(*) AS n,
           COUNT(DISTINCT CASE WHEN p.supplier_url LIKE 'http%' THEN p.supplier_url END) AS urls,
           SUM(CASE WHEN p.url_type = 'fiche' THEN 1 ELSE 0 END) AS fiches,
           SUM(CASE WHEN p.buy_price_eur IS NULL OR p.sell_price_eur IS NULL THEN 1 ELSE 0 END) AS sansPrix,
           SUM(CASE WHEN p.score_global IS NOT NULL THEN 1 ELSE 0 END) AS avecScore,
           SUM(CASE WHEN p.verdict IS NOT NULL THEN 1 ELSE 0 END) AS avecVerdict,
           SUM(CASE WHEN p.image_url IS NOT NULL THEN 1 ELSE 0 END) AS avecImage
      FROM products p
      JOIN rayon_reports rr ON rr.id = p.rayon_report_id
      JOIN reports r ON r.id = rr.report_id
     WHERE r.date = ? AND r.type = 'rayon'
     GROUP BY rr.report_id
  `).all(date);
  const parId = new Map(stats.map((s) => [s.rid, s]));

  for (const r of rayons) {
    rayonsVus++;
    const s = parId.get(r.id) || { n: 0, urls: 0, fiches: 0, sansPrix: 0, avecScore: 0, avecVerdict: 0, avecImage: 0 };
    const n = Number(s.n) || 0;

    const fautes = [];   // rupture de contrat : le rapport n'est pas livrable
    const manques = [];  // pauvrete : livrable, mais en dessous du 20/09

    if (n < CONTRAT.produits) fautes.push(`${n} produits au lieu de ${CONTRAT.produits}`);
    if (Number(s.urls) < CONTRAT.urlsDistinctes) {
      fautes.push(`${s.urls} URL http distinctes au lieu de ${CONTRAT.urlsDistinctes}`);
    }
    if (n && (Number(s.sansPrix) * 100) / n > CONTRAT.sansPrixMaxPct) {
      fautes.push(`${s.sansPrix}/${n} produits sans prix complet`);
    }
    if (Number(s.fiches) < CONTRAT.fichesMin) {
      manques.push(`${s.fiches} URL de fiche seulement (l'import auto en vit)`);
    }
    for (const [cle, lbl] of [['avecScore', 'score'], ['avecVerdict', 'verdict'], ['avecImage', 'image']]) {
      const pct = n ? (Number(s[cle]) * 100) / n : 0;
      if (pct < CONTRAT.richesseMinPct) {
        manques.push(`${lbl} : ${s[cle]}/${n}`);
      }
    }

    let etat;
    if (fautes.length) { etat = 'HORS CONTRAT'; horsContrat++; }
    else if (manques.length) { etat = 'PAUVRE      '; pauvres++; }
    else { etat = 'CONFORME    '; }

    const nom = `${r.categorie}/${r.theme}`;
    console.log(`${etat} ${nom.padEnd(42)} ${String(n).padStart(2)} prod · ${String(s.urls).padStart(2)} url · ${String(s.fiches).padStart(2)} fiches`);
    for (const f of fautes) console.log(`             ! ${f}`);
    if (detail) for (const m of manques) console.log(`             · ${m}`);
    else if (manques.length) console.log(`             · ${manques.join(' | ')}`);
  }
}

console.log(`\n${'='.repeat(78)}`);
console.log(`${rayonsVus} rayon(s) examine(s) : ${rayonsVus - horsContrat - pauvres} conforme(s), ${pauvres} pauvre(s), ${horsContrat} hors contrat`);

if (horsContrat) {
  console.log('');
  console.log('RUPTURE DE CONTRAT. Ces rapports ne sont pas livrables a un client payant :');
  console.log('il manque des produits, des URL, ou des prix. Ne pas publier en l\'etat.');
  console.log('');
  console.log('Causes deja rencontrees, dans l\'ordre de probabilite :');
  console.log('  - credits Serper epuises -> les agents n\'ont plus de recherche fiable');
  console.log('  - solde Anthropic a zero -> le rapport se casse au dernier noeud');
  console.log('  - prompt degrade -> le contrat aiMARKET a ete remplace par un contrat plus pauvre');
} else if (pauvres) {
  console.log('');
  console.log('Contrat tenu sur les produits, les URL et les prix, mais la richesse aiMARKET');
  console.log('manque : ni score, ni verdict, ni image. C\'est le symptome d\'un rapport');
  console.log('produit au format Markdown simple au lieu du schema aiMARKET complet.');
  console.log('Comparer avec le 20/09/2026 : node verifier-rapports.cjs --date 2026-09-20');
} else {
  console.log('\nTout est conforme. C\'est ce qui se vend.');
}

db.close();
process.exit(horsContrat ? 1 : 0);
