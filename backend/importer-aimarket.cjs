/**
 * Importe les rapports MarketSpy (aiMarket/*.json) dans rapports.db.
 *
 *   cd backend && node importer-aimarket.cjs            # tout aiMarket/
 *   cd backend && node importer-aimarket.cjs --fichier X.json
 *   cd backend && node importer-aimarket.cjs --sec       # n'ecrit rien, montre
 *
 * Un fichier MarketSpy porte l'etude ET le marketing. La base, elle, separe
 * les deux : les routes de lecture filtrent sur `type = 'marketing'` pour les
 * prompts et sur `type = 'rayon'` pour les produits. Un fichier donne donc
 * DEUX lignes dans `reports`, chacune avec son enfant — c'est la convention
 * deja en place (rayon-2026-09-18-automobile-interieur / marketing-...).
 *
 * Rien n'est perdu au passage : la colonne `data` de `reports` recoit le JSON
 * MarketSpy complet, y compris les champs que le schema n'a pas de colonne
 * pour accueillir (bundles, alerts, scores, business_ideas).
 */
const fs = require('node:fs');
const path = require('node:path');

/**
 * Deux pilotes possibles, sans rien installer.
 *
 * Le serveur utilise better-sqlite3 ; en local ses node_modules ne sont pas
 * toujours la, et le compiler pour un script d'import serait absurde. Node 22+
 * embarque `node:sqlite`, qui ouvre le meme fichier. On prend ce qu'on trouve.
 */
function ouvrir(chemin) {
  try {
    const Database = require('better-sqlite3');
    const db = new Database(chemin);
    return { db, pilote: 'better-sqlite3' };
  } catch (e) {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(chemin);
    return { db, pilote: 'node:sqlite' };
  }
}

const args = process.argv.slice(2);
const sec = args.includes('--sec');
const unSeul = args.includes('--fichier') ? args[args.indexOf('--fichier') + 1] : null;

const DOSSIER = path.resolve(__dirname, '..', 'aiMarket');
const BASE = path.resolve(__dirname, 'rapports.db');

if (!fs.existsSync(DOSSIER)) {
  console.error(`Aucun dossier ${DOSSIER}.`);
  process.exit(1);
}

/** « Informatique » -> « informatique ». */
function slug(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Un nombre devient « 245 € » ; ce qui manque devient « — », jamais 0. */
function eur(n) {
  if (n === null || n === undefined || n === '') return '—';
  const v = Number(n);
  return Number.isFinite(v) ? v.toFixed(2).replace(/\.00$/, '') + ' €' : String(n);
}

function pct(n) {
  if (n === null || n === undefined || n === '') return '—';
  const v = Number(n);
  return Number.isFinite(v) ? v + ' %' : String(n);
}

/**
 * Qui peut importer ce produit sans humain.
 *
 * Meme regle que le contrat des agents : `url` quand la fiche se lit a
 * l'adresse, `extension` quand la page se construit en JavaScript.
 */
const EN_JS = ['aliexpress', 'temu', 'alibaba', 'shein', 'superdelivery', '1688', 'taobao'];
function methodeImport(p) {
  const ou = (p.supplier_platform || '') + ' ' + (p.supplier_url || '');
  return EN_JS.some((x) => ou.toLowerCase().includes(x)) ? 'extension' : 'url';
}

/** L'analyse lisible : ce que le rapport decide, avant le tableau. */
function texteAnalyse(d) {
  const e = d.executive_summary || {};
  const m = d.market || {};
  const l = [];
  l.push("## Ce qu'il faut retenir", '');
  const libelles = {
    main_opportunity: 'Opportunité principale',
    best_budget_product: 'Meilleur rapport prix',
    best_premium_product: 'Meilleur premium',
    best_marketplace_product: 'Meilleur pour marketplace',
    best_ads_product: 'Meilleur pour la publicité',
    best_bundle: 'Meilleur bundle',
    product_to_avoid: 'À éviter',
    breakout_candidate: 'Candidat en décollage',
    recommended_test_budget: 'Budget de test conseillé',
  };
  for (const [k, lib] of Object.entries(libelles)) {
    if (e[k]) l.push(`**${lib}** : ${e[k]}`, '');
  }
  const blocs = [
    ['Tendances actuelles', m.current_trends],
    ['Tendances émergentes', m.emerging_trends],
    ['Tendances en recul', m.declining_trends],
    ['Saisonnalité', m.seasonality],
    ['Innovations', m.innovations],
    ['Risques', m.risks],
  ];
  for (const [titre, arr] of blocs) {
    if (!Array.isArray(arr) || !arr.length) continue;
    l.push(`## ${titre}`, '');
    for (const x of arr) {
      l.push('- ' + (typeof x === 'string' ? x : JSON.stringify(x)));
    }
    l.push('');
  }
  if (Array.isArray(d.bundles) && d.bundles.length) {
    l.push('## Bundles proposés', '');
    for (const b of d.bundles) {
      l.push(`- **${b.bundle_name}** — coût ${eur(b.estimated_cost)}, vente ${eur(b.estimated_selling_price)}, marge ${eur(b.estimated_margin)} (${b.recommended_platform || '—'})`);
    }
    l.push('');
  }
  if (Array.isArray(d.business_ideas) && d.business_ideas.length) {
    l.push('## Idées de business', '');
    for (const b of d.business_ideas) {
      l.push('- ' + (typeof b === 'string' ? b : JSON.stringify(b)));
    }
    l.push('');
  }
  return l.join('\n').trim();
}

const ouverture = sec ? null : ouvrir(BASE);
const db = ouverture ? ouverture.db : null;
if (ouverture) console.log(`pilote : ${ouverture.pilote}\n`);

const fichiers = unSeul
  ? [path.isAbsolute(unSeul) ? unSeul : path.join(DOSSIER, unSeul)]
  : fs.readdirSync(DOSSIER).filter((f) => f.endsWith('.json')).map((f) => path.join(DOSSIER, f));

if (!fichiers.length) {
  console.error(`Aucun .json dans ${DOSSIER}.`);
  process.exit(1);
}

let ok = 0;
let ko = 0;

for (const fichier of fichiers) {
  const nom = path.basename(fichier);
  let d;
  try {
    d = JSON.parse(fs.readFileSync(fichier, 'utf8'));
  } catch (err) {
    console.log(`refus  ${nom} — JSON illisible : ${err.message}`);
    ko++;
    continue;
  }

  const s = d.study || {};
  if (!s.date || !s.category_name || !s.theme_slug) {
    console.log(`refus  ${nom} — bloc study incomplet (date, category_name, theme_slug attendus)`);
    ko++;
    continue;
  }

  const date = s.date;
  const categorie = slug(s.category_name);
  const theme = slug(s.theme_slug);
  const produits = Array.isArray(d.products) ? d.products : [];
  const nbSources = Array.isArray(d.sources) ? d.sources.length : 0;

  const idRayon = `rayon-${date}-${categorie}-${theme}`;
  const idMkt = `marketing-${date}-${categorie}-${theme}`;
  const titre = s.theme_name || s.category_name;

  if (sec) {
    console.log(`lu     ${nom}`);
    console.log(`       rayon     -> ${idRayon}`);
    console.log(`       marketing -> ${idMkt}`);
    console.log(`       ${produits.length} produits, ${nbSources} sources`);
    ok++;
    continue;
  }

  // transaction a la main : node:sqlite n'a pas le helper de better-sqlite3
  const maj = () => {
    // --- le rapport RAYON : l'analyse et les 20 produits
    db.prepare(
      `INSERT INTO reports (id, type, date, categorie, theme, titre, agent, sources, data, updated_at)
       VALUES (?, 'rayon', ?, ?, ?, ?, 'marketspy', ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET titre=excluded.titre, sources=excluded.sources,
         data=excluded.data, updated_at=CURRENT_TIMESTAMP`
    ).run(idRayon, date, categorie, theme, titre, nbSources, JSON.stringify(d));

    const idEnfantR = `rayon-child-${date}-${categorie}-${theme}`;
    db.prepare(`DELETE FROM products WHERE rayon_report_id = ?`).run(idEnfantR);
    db.prepare(`DELETE FROM rayon_reports WHERE id = ?`).run(idEnfantR);
    db.prepare(
      `INSERT INTO rayon_reports (id, report_id, analysis, products) VALUES (?, ?, ?, ?)`
    ).run(idEnfantR, idRayon, texteAnalyse(d), JSON.stringify(produits));

    const insProd = db.prepare(
      `INSERT INTO products (id, rayon_report_id, title, supplier, supplier_url,
         buy_price, sell_price, margin, import_method, reason, recommended_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    produits.forEach((p, i) => {
      const titreP = [p.product_name, p.variant].filter(Boolean).join(' — ');
      const fournisseur = [p.supplier_name, p.supplier_platform]
        .filter(Boolean)
        .join(' / ');
      const pourquoi = [p.decision, p.problem_solved, p.target_customer]
        .filter(Boolean)
        .join(' · ');
      // le prix de reference d'une place de marche, quand il y en a un
      const mp = p.marketplace_prices || {};
      let refUrl = '';
      if (Array.isArray(mp.other) && mp.other.length && mp.other[0].merchant) {
        refUrl = mp.other[0].merchant;
      }
      insProd.run(
        `${idEnfantR}-p${String(p.rank || i + 1).padStart(2, '0')}`,
        idEnfantR,
        titreP || 'Sans titre',
        fournisseur || '—',
        p.supplier_url || '',
        eur(p.estimated_landed_cost_france != null ? p.estimated_landed_cost_france : p.purchase_price),
        eur(p.target_selling_price),
        // net_margin_estimated et gross_margin sont en EUROS chez MarketSpy,
        // pas en pourcentage : « 105 » veut dire 105 € de marge nette. Le ROI,
        // lui, est bien un ratio — on l'ajoute quand il est la.
        (() => {
          const net = p.net_margin_estimated != null ? p.net_margin_estimated : p.gross_margin;
          const roi = Number(p.roi_estimated);
          return eur(net) + (Number.isFinite(roi) && roi ? ` (ROI ${(roi * 100).toFixed(1)} %)` : '');
        })(),
        methodeImport(p),
        pourquoi || '—',
        refUrl
      );
    });

    // --- le rapport MARKETING : les routes de lecture le cherchent par type
    db.prepare(
      `INSERT INTO reports (id, type, date, categorie, theme, titre, agent, sources, data, updated_at)
       VALUES (?, 'marketing', ?, ?, ?, ?, 'marketspy', ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET titre=excluded.titre, sources=excluded.sources,
         data=excluded.data, updated_at=CURRENT_TIMESTAMP`
    ).run(idMkt, date, categorie, theme, titre, nbSources, JSON.stringify(d));

    const idEnfantM = `marketing-child-${date}-${categorie}-${theme}`;
    db.prepare(`DELETE FROM marketing_reports WHERE id = ?`).run(idEnfantM);
    const cp = d.creative_prompts || {};
    db.prepare(
      `INSERT INTO marketing_reports (id, report_id, social_places, ads_current,
         trends_daily, trending_ads, image_prompts, video_prompts)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      idEnfantM,
      idMkt,
      JSON.stringify([]),
      JSON.stringify((d.alerts && d.alerts.breakout_products) || []),
      JSON.stringify((d.market && d.market.current_trends) || []),
      JSON.stringify((d.market && d.market.emerging_trends) || []),
      JSON.stringify(cp.image_ads || []),
      JSON.stringify(cp.short_videos_30s || [])
    );

    db.prepare(
      `INSERT INTO import_log (id, import_date, file_path, status, message)
       VALUES (?, CURRENT_TIMESTAMP, ?, 'ok', ?)`
    ).run(`imp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, nom,
      `${produits.length} produits, ${nbSources} sources`);
  };

  try {
    db.exec('BEGIN');
    maj();
    db.exec('COMMIT');
    console.log(`ok     ${nom} — ${produits.length} produits, ${nbSources} sources`);
    ok++;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (e) {}
    console.log(`refus  ${nom} — ${err.message}`);
    ko++;
  }
}

if (db) db.close();
console.log(`\n${ok} importé(s), ${ko} refusé(s).`);
