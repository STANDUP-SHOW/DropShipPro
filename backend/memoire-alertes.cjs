/**
 * MARKET ALERT — les alertes sont CALCULÉES, jamais rédigées.
 *
 *   cd backend && node memoire-alertes.cjs
 *   cd backend && node memoire-alertes.cjs --theme telephonie/smartphones
 *
 * POURQUOI PAS L'IA.
 * Un « breakout » repéré par un modèle qui ne voit qu'une étude n'est pas une
 * détection, c'est une opinion sur une photo. Un vrai breakout, c'est un
 * produit dont quelque chose a bougé ENTRE DEUX études : son rang, son prix
 * fournisseur, sa marge. Ça se calcule sur deux lignes de la base. C'est
 * gratuit, c'est reproductible, et c'est impossible à halluciner.
 *
 * L'IA garde son rôle : expliquer POURQUOI ça a bougé. Pas le constater.
 */
const path = require('node:path');

function ouvrir(chemin) {
  try {
    return new (require('better-sqlite3'))(chemin);
  } catch (e) {
    return new (require('node:sqlite').DatabaseSync)(chemin);
  }
}

const args = process.argv.slice(2);
const filtre = args.includes('--theme') ? args[args.indexOf('--theme') + 1] : null;
const db = ouvrir(path.resolve(__dirname, 'rapports.db'));

// ---------------------------------------------------------------- la table
db.exec(`
  CREATE TABLE IF NOT EXISTS alerts (
    id TEXT PRIMARY KEY,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    type TEXT NOT NULL,
    gravite TEXT NOT NULL,
    categorie TEXT,
    theme TEXT,
    product_key TEXT,
    title TEXT,
    supplier TEXT,
    supplier_url TEXT,
    image_url TEXT,
    date_avant TEXT,
    date_apres TEXT,
    valeur_avant REAL,
    valeur_apres REAL,
    variation_pct REAL,
    message TEXT
  )
`);
db.exec('CREATE INDEX IF NOT EXISTS idx_alerts_date ON alerts(date_apres, type)');
db.exec('CREATE INDEX IF NOT EXISTS idx_alerts_cle ON alerts(product_key)');

// ---------------------------------------------------------------- seuils
/**
 * Les seuils décident de ce qui mérite de réveiller quelqu'un.
 *
 * Trop bas, l'écran se remplit de bruit et plus personne ne le regarde ; trop
 * haut, on rate le mouvement pendant qu'il est encore exploitable. Ceux-ci
 * sont un point de départ à ajuster sur les premières semaines de données.
 */
const SEUILS = {
  baissePrixPct: 10, // une baisse fournisseur qui change la décision
  haussePrixPct: 15, // une hausse qui referme la marge
  margePct: 20, // un mouvement de marge qui compte
  bondRang: 5, // un produit qui gagne 5 places a un signal derrière
  entreeTop: 5, // entrer directement dans le top 5, c'est un breakout
  margeForte: 30, // % de marge nette au-delà duquel on veut être prévenu
};

function pct(avant, apres) {
  if (!avant || avant === 0 || apres === null || apres === undefined) return null;
  return ((apres - avant) / Math.abs(avant)) * 100;
}

const eur = (n) => (n === null || n === undefined ? '—' : `${Number(n).toFixed(2).replace(/\.00$/, '')} €`);

// ---------------------------------------------------------------- les paires
/**
 * Pour chaque thème, les deux dates d'étude les plus récentes.
 *
 * On ne compare jamais deux thèmes différents : un smartphone et une perceuse
 * n'ont rien à se dire. La comparaison n'a de sens qu'à l'intérieur d'un thème.
 */
let sqlThemes = `
  SELECT categorie, theme, report_date
    FROM products
   WHERE is_product = 1 AND report_date IS NOT NULL
   GROUP BY categorie, theme, report_date
   ORDER BY categorie, theme, report_date DESC
`;
const toutes = db.prepare(sqlThemes).all();

const parTheme = new Map();
for (const r of toutes) {
  const cle = `${r.categorie}/${r.theme}`;
  if (filtre && cle !== filtre) continue;
  if (!parTheme.has(cle)) parTheme.set(cle, []);
  parTheme.get(cle).push(r.report_date);
}

const lireProduits = db.prepare(
  `SELECT product_key, title, supplier, supplier_url, image_url,
          buy_price_eur, sell_price_eur, margin_eur, margin_pct, rank, verdict
     FROM products
    WHERE is_product = 1 AND categorie = ? AND theme = ? AND report_date = ?`
);

const insAlerte = db.prepare(
  `INSERT OR REPLACE INTO alerts
     (id, type, gravite, categorie, theme, product_key, title, supplier,
      supplier_url, image_url, date_avant, date_apres, valeur_avant,
      valeur_apres, variation_pct, message)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
);

const alertes = [];
function alerte(type, gravite, cat, th, p, dAvant, dApres, vAvant, vApres, variation, message) {
  alertes.push({
    id: `${type}-${cat}-${th}-${p.product_key}-${dApres}`,
    type, gravite, cat, th,
    cle: p.product_key,
    titre: p.title,
    fournisseur: p.supplier || '',
    url: p.supplier_url || '',
    image: p.image_url || '',
    dAvant, dApres, vAvant, vApres, variation, message,
  });
}

let themesCompares = 0;
let themesSansHistorique = 0;

for (const [cle, dates] of parTheme) {
  const [cat, th] = cle.split('/');
  const apres = dates[0];

  // --- ce qui ne demande aucun historique : une marge forte se voit seule
  for (const p of lireProduits.all(cat, th, apres)) {
    if (p.margin_pct !== null && p.margin_pct >= SEUILS.margeForte) {
      alerte('MARGE_FORTE', 'important', cat, th, p, null, apres, null, p.margin_pct, null,
        `Marge nette de ${p.margin_pct.toFixed(0)} % — au-dessus du seuil de ${SEUILS.margeForte} %.`);
    }
  }

  if (dates.length < 2) {
    themesSansHistorique++;
    continue;
  }

  const avant = dates[1];
  themesCompares++;

  const listeAvant = lireProduits.all(cat, th, avant);
  const listeApres = lireProduits.all(cat, th, apres);
  const indexAvant = new Map(listeAvant.map((p) => [p.product_key, p]));
  const clesApres = new Set(listeApres.map((p) => p.product_key));

  for (const p of listeApres) {
    const a = indexAvant.get(p.product_key);

    // --- produit qui n'était pas là la fois précédente
    if (!a) {
      const entreeForte = p.rank !== null && p.rank <= SEUILS.entreeTop;
      alerte(
        entreeForte ? 'BREAKOUT' : 'NOUVEAU',
        entreeForte ? 'fort' : 'info',
        cat, th, p, avant, apres, null, p.rank, null,
        entreeForte
          ? `Entre directement au rang ${p.rank} — absent de l'étude du ${avant}.`
          : `Nouveau dans l'étude, absent le ${avant}.`
      );
      continue;
    }

    // --- le prix fournisseur a bougé
    const vPrix = pct(a.buy_price_eur, p.buy_price_eur);
    if (vPrix !== null && vPrix <= -SEUILS.baissePrixPct) {
      alerte('BAISSE_PRIX_FOURNISSEUR', 'fort', cat, th, p, avant, apres,
        a.buy_price_eur, p.buy_price_eur, vPrix,
        `Prix fournisseur en baisse de ${Math.abs(vPrix).toFixed(0)} % : ${eur(a.buy_price_eur)} le ${avant}, ${eur(p.buy_price_eur)} aujourd'hui.`);
    } else if (vPrix !== null && vPrix >= SEUILS.haussePrixPct) {
      alerte('HAUSSE_PRIX_FOURNISSEUR', 'important', cat, th, p, avant, apres,
        a.buy_price_eur, p.buy_price_eur, vPrix,
        `Prix fournisseur en hausse de ${vPrix.toFixed(0)} % : la marge se referme.`);
    }

    // --- la marge a bougé
    const vMarge = pct(a.margin_eur, p.margin_eur);
    if (vMarge !== null && Math.abs(vMarge) >= SEUILS.margePct) {
      alerte(vMarge > 0 ? 'MARGE_EN_HAUSSE' : 'MARGE_EN_BAISSE',
        vMarge > 0 ? 'important' : 'fort',
        cat, th, p, avant, apres, a.margin_eur, p.margin_eur, vMarge,
        `Marge nette ${vMarge > 0 ? 'en hausse' : 'en baisse'} de ${Math.abs(vMarge).toFixed(0)} % : ${eur(a.margin_eur)} → ${eur(p.margin_eur)}.`);
    }

    // --- le produit remonte dans le classement
    if (a.rank !== null && p.rank !== null && a.rank - p.rank >= SEUILS.bondRang) {
      alerte('BREAKOUT', 'fort', cat, th, p, avant, apres, a.rank, p.rank, null,
        `Gagne ${a.rank - p.rank} places : rang ${a.rank} le ${avant}, rang ${p.rank} aujourd'hui.`);
    }
  }

  // --- disparitions : rupture, retrait, ou fournisseur qui a fermé
  for (const a of listeAvant) {
    if (clesApres.has(a.product_key)) continue;
    alerte('DISPARU', 'important', cat, th, a, avant, apres, a.rank, null, null,
      `Présent le ${avant}, absent aujourd'hui — rupture, retrait ou fournisseur disparu, à vérifier.`);
  }
}

// ---------------------------------------------------------------- écriture
db.exec('BEGIN');
for (const a of alertes) {
  insAlerte.run(a.id, a.type, a.gravite, a.cat, a.th, a.cle, a.titre, a.fournisseur,
    a.url, a.image, a.dAvant, a.dApres, a.vAvant, a.vApres, a.variation, a.message);
}
db.exec('COMMIT');

// ---------------------------------------------------------------- rapport
const parType = {};
for (const a of alertes) parType[a.type] = (parType[a.type] || 0) + 1;

console.log(`${parTheme.size} thème(s) examiné(s) : ${themesCompares} comparé(s) à une étude antérieure, ${themesSansHistorique} sans historique.`);
console.log(`${alertes.length} alerte(s) écrite(s).`);
for (const [t, n] of Object.entries(parType).sort((x, y) => y[1] - x[1])) {
  console.log(`  ${t.padEnd(26)} ${n}`);
}
if (themesSansHistorique && !themesCompares) {
  console.log(`\nAucune comparaison possible : chaque thème n'a qu'une seule étude.`);
  console.log(`La mémoire commence à la deuxième étude d'un même thème.`);
}

db.close();
