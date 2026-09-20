/**
 * Migration mémoire : rendre les rapports comparables dans le temps.
 *
 *   cd backend && node memoire-migration.cjs
 *   cd backend && node memoire-migration.cjs --sec     # montre, n'écrit rien
 *
 * POURQUOI.
 * Les prix et les marges sont stockés en TEXTE (« 245 € », « 36 € (ROI 21 %) »).
 * On ne trie pas du texte, on ne calcule pas une variation dessus. Tant que
 * c'est le cas, « les 200 meilleurs produits de la semaine classés par marge »
 * est impossible, et aucune alerte ne peut être calculée.
 *
 * Et deux études qui parlent du même produit ne le savent pas : « POCO X7 Pro »
 * et « Xiaomi POCO X7 Pro 12/512 » sont deux lignes sans rapport. Sans identité
 * stable, pas de mémoire, pas d'évolution de prix, pas de « faut-il remplacer ».
 *
 * CE QUE FAIT LA MIGRATION.
 * Elle ajoute à `products` des colonnes numériques, une clé d'identité produit,
 * et recopie la date, la catégorie et le thème du rapport parent — pour qu'une
 * question transversale soit un seul balayage de table et non une triple
 * jointure. Puis elle remplit tout ça à partir de ce qui est déjà là.
 *
 * Rien n'est supprimé : les colonnes texte d'origine restent intactes.
 */
const path = require('node:path');

function ouvrir(chemin) {
  try {
    return new (require('better-sqlite3'))(chemin);
  } catch (e) {
    return new (require('node:sqlite').DatabaseSync)(chemin);
  }
}

const sec = process.argv.includes('--sec');
const db = ouvrir(path.resolve(__dirname, 'rapports.db'));

// ---------------------------------------------------------------- colonnes
const COLONNES = [
  // identité, la brique qui porte tout le reste
  ['product_key', 'TEXT'],
  ['brand', 'TEXT'],
  // chiffres : c'est là que tout se joue
  ['buy_price_eur', 'REAL'],
  ['sell_price_eur', 'REAL'],
  ['margin_eur', 'REAL'],
  ['margin_pct', 'REAL'],
  ['roi_pct', 'REAL'],
  // contexte recopié du rapport parent, pour interroger sans jointure
  ['report_date', 'TEXT'],
  ['categorie', 'TEXT'],
  ['theme', 'TEXT'],
  ['rank', 'INTEGER'],
  // qualité de la ligne : tout ce qui est dans la table n'est pas un produit
  ['is_product', 'INTEGER'],
  // enrichissements MarketSpy, vides tant que la source ne les donne pas
  ['verdict', 'TEXT'],
  ['url_type', 'TEXT'],
  ['image_url', 'TEXT'],
  ['moq', 'TEXT'],
  ['eu_stock', 'INTEGER'],
  ['score_global', 'INTEGER'],
  ['score_demand', 'INTEGER'],
  ['score_trend', 'INTEGER'],
  ['score_margin', 'INTEGER'],
  ['score_supplier', 'INTEGER'],
  ['score_competition', 'INTEGER'],
  ['score_ads', 'INTEGER'],
  ['score_risk', 'INTEGER'],
];

const existantes = new Set(
  db.prepare('PRAGMA table_info(products)').all().map((r) => r.name)
);

let ajoutees = 0;
for (const [nom, type] of COLONNES) {
  if (existantes.has(nom)) continue;
  if (sec) {
    console.log(`+ colonne ${nom} ${type}`);
  } else {
    db.exec(`ALTER TABLE products ADD COLUMN ${nom} ${type}`);
  }
  ajoutees++;
}

// ---------------------------------------------------------------- outils
/**
 * Lit un nombre écrit à la française dans du texte libre.
 *
 * « 245 € » -> 245. « 12-18 € » -> 15, le milieu de la fourchette : un
 * intervalle reste utilisable pour trier, à condition de ne pas prétendre
 * qu'il est exact. « — » et « Non vérifié » -> null, jamais 0 : zéro voudrait
 * dire gratuit, et on trierait dessus.
 */
function nombre(texte) {
  if (texte === null || texte === undefined) return null;
  const s = String(texte).replace(/ /g, ' ').trim();
  if (!s || /^(—|-|n\/?a|non vérifié|non verifie)$/i.test(s)) return null;
  const nombres = (s.match(/-?\d+(?:[.,]\d+)?/g) || [])
    .map((x) => Number(x.replace(',', '.')))
    .filter((x) => Number.isFinite(x));
  if (!nombres.length) return null;
  // une fourchette « 12-18 » : on prend le milieu
  if (/\d\s*[-–à]\s*\d/.test(s) && nombres.length >= 2) {
    return (nombres[0] + nombres[1]) / 2;
  }
  return nombres[0];
}

/** Le ROI est écrit entre parenthèses : « 36 € (ROI 21,0 %) ». */
function roi(texte) {
  const m = String(texte || '').match(/ROI\s*(-?\d+(?:[.,]\d+)?)/i);
  return m ? Number(m[1].replace(',', '.')) : null;
}

/** Un pourcentage quand le texte en contient un et pas d'euros. */
function pourcent(texte) {
  const s = String(texte || '');
  if (!/%/.test(s) || /ROI/i.test(s)) return null;
  return nombre(s);
}

const BRUIT = new Set(
  ('les le la l un une de du des en pour avec et ou a à au aux meilleur meilleure ' +
   'meilleurs meilleures top best guide comparatif comparer choisir avis test ' +
   'tests nouveau nouvelle promo prix pas cher achat acheter vente gros wholesale ' +
   '2024 2025 2026 2027 sur par plus tout tous quel quelle').split(' ')
);

/** « Les 8 meilleurs cafés en grains en 2026 - Coffee Webstore » n'est pas un produit. */
const TITRES_NON_PRODUITS = [
  /^titre$/i,
  /^les?\s+\d+\s+meilleur/i,
  /^les?\s+meilleur/i,
  /^meilleure?s?\s/i,
  /^comparer\b/i,
  /^comparatif\b/i,
  /^guide\b/i,
  /^choisir\b/i,
  /^top\s+\d/i,
  /^tout\s+savoir/i,
  /\ben\s+gros\b/i,
  /\b(webstore|blog|actualit[ée]s?)\b/i,
];

function estUnProduit(titre) {
  const t = String(titre || '').trim();
  if (t.length < 4) return false;
  return !TITRES_NON_PRODUITS.some((r) => r.test(t));
}

/**
 * La clé d'identité produit.
 *
 * On coupe la variante (tout ce qui suit un tiret cadratin), on enlève les
 * accents et les mots de remplissage, et on garde les cinq premiers jetons
 * significatifs. « Xiaomi POCO X7 Pro 12/512 » et « POCO X7 Pro 5G (EU) »
 * tombent ainsi sur une clé proche — jamais parfaite, mais stable d'un jour à
 * l'autre, ce qui est tout ce qu'on lui demande.
 */
function cleProduit(titre) {
  let t = String(titre || '').split(/\s[—–]\s/)[0];
  t = t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, ' ')
    .trim();
  const jetons = t.split(' ').filter((x) => x && !BRUIT.has(x));
  return jetons.slice(0, 5).join('-') || null;
}

/** La marque : le premier jeton significatif, quand il ressemble à un nom. */
function marque(titre) {
  const c = cleProduit(titre);
  if (!c) return null;
  const premier = c.split('-')[0];
  return /^[a-z][a-z0-9]{1,}$/.test(premier) ? premier : null;
}

// ---------------------------------------------------------------- remplissage
const lignes = db
  .prepare(
    `SELECT p.id, p.title, p.buy_price, p.sell_price, p.margin,
            r.date AS d, r.categorie AS cat, r.theme AS th
       FROM products p
       JOIN rayon_reports rr ON rr.id = p.rayon_report_id
       JOIN reports r        ON r.id  = rr.report_id`
  )
  .all();

const maj = db.prepare(
  `UPDATE products SET product_key=?, brand=?, buy_price_eur=?, sell_price_eur=?,
     margin_eur=?, margin_pct=?, roi_pct=?, report_date=?, categorie=?, theme=?,
     is_product=?
   WHERE id=?`
);

let remplies = 0;
let rebuts = 0;

if (!sec) db.exec('BEGIN');
for (const l of lignes) {
  const produit = estUnProduit(l.title) ? 1 : 0;
  if (!produit) rebuts++;
  const mEur = nombre(String(l.margin || '').replace(/\(.*\)/, ''));
  const valeurs = [
    cleProduit(l.title),
    marque(l.title),
    nombre(l.buy_price),
    nombre(l.sell_price),
    /%/.test(String(l.margin || '')) && !/€/.test(String(l.margin || '')) ? null : mEur,
    pourcent(l.margin),
    roi(l.margin),
    l.d,
    l.cat,
    l.th,
    produit,
    l.id,
  ];
  if (!sec) maj.run(...valeurs);
  remplies++;
}
if (!sec) db.exec('COMMIT');

// ---------------------------------------------------------------- index
const INDEX = [
  ['idx_products_cle', 'products(product_key, report_date)'],
  ['idx_products_date', 'products(report_date)'],
  ['idx_products_cat', 'products(categorie, theme, report_date)'],
  ['idx_products_marge', 'products(margin_eur)'],
];
for (const [nom, cible] of INDEX) {
  if (sec) console.log(`+ index ${nom}`);
  else db.exec(`CREATE INDEX IF NOT EXISTS ${nom} ON ${cible}`);
}

// ---------------------------------------------------------------- rapport
console.log(`${ajoutees} colonne(s) ajoutée(s), ${INDEX.length} index.`);
console.log(`${remplies} ligne(s) remplie(s), dont ${rebuts} écartée(s) (pas des produits).`);

if (!sec) {
  const n = (q) => db.prepare(q).all()[0];
  const s = n(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN buy_price_eur IS NOT NULL THEN 1 ELSE 0 END) AS avec_achat,
            SUM(CASE WHEN sell_price_eur IS NOT NULL THEN 1 ELSE 0 END) AS avec_vente,
            SUM(CASE WHEN margin_eur IS NOT NULL THEN 1 ELSE 0 END) AS avec_marge,
            SUM(CASE WHEN product_key IS NOT NULL THEN 1 ELSE 0 END) AS avec_cle,
            SUM(is_product) AS vrais_produits
       FROM products`
  );
  console.log('\nÉtat de la table products :');
  for (const [k, v] of Object.entries(s)) console.log(`  ${k.padEnd(16)} ${v}`);

  const doublons = db
    .prepare(
      `SELECT product_key, COUNT(DISTINCT report_date) AS jours
         FROM products WHERE is_product=1 AND product_key IS NOT NULL
         GROUP BY product_key HAVING jours > 1 ORDER BY jours DESC LIMIT 8`
    )
    .all();
  console.log(`\nProduits déjà vus plusieurs jours (la mémoire commence) : ${doublons.length}`);
  for (const d of doublons) console.log(`  ${d.product_key} — ${d.jours} jours`);
}

db.close();
