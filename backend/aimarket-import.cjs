'use strict'
/**
 * Ecriture d'un rapport MarketSpy dans une base de rapports (rapports.db ou la
 * base du Poste d'analyses). Un seul code pour les deux chemins :
 *   - `importer-aimarket.cjs` (Max, en local : aiMarket/*.json -> rapports.db) ;
 *   - le serveur (`POST /api/agent/rapports-poste` -> rapports-poste.db, sur le
 *     disque durable), lu ensemble avec rapports.db par `ReportQuery`.
 *
 * Un fichier MarketSpy donne DEUX lignes dans `reports` (rayon et marketing),
 * chacune avec son enfant et, pour le rayon, une ligne `products` par produit.
 * Fonctionne avec better-sqlite3 comme avec node:sqlite (memes appels).
 */

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

/** Le meme schema que rapports.db (les colonnes de products dans le meme ordre : les deux bases sont lues en UNION). */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        date TEXT NOT NULL,
        categorie TEXT NOT NULL,
        theme TEXT NOT NULL,
        titre TEXT NOT NULL,
        agent TEXT NOT NULL,
        sources INTEGER,
        data JSON NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

CREATE TABLE IF NOT EXISTS marketing_reports (
        id TEXT PRIMARY KEY,
        report_id TEXT NOT NULL,
        social_places JSON,
        ads_current JSON,
        trends_daily JSON,
        trending_ads JSON,
        image_prompts JSON,
        video_prompts JSON,
        FOREIGN KEY (report_id) REFERENCES reports(id)
      );

CREATE TABLE IF NOT EXISTS rayon_reports (
        id TEXT PRIMARY KEY,
        report_id TEXT NOT NULL,
        analysis TEXT,
        products JSON,
        FOREIGN KEY (report_id) REFERENCES reports(id)
      );

CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        rayon_report_id TEXT NOT NULL,
        title TEXT NOT NULL,
        supplier TEXT,
        supplier_url TEXT,
        buy_price TEXT,
        sell_price TEXT,
        margin TEXT,
        import_method TEXT,
        reason TEXT,
        recommended_url TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP, product_key TEXT, brand TEXT, buy_price_eur REAL, sell_price_eur REAL, margin_eur REAL, margin_pct REAL, roi_pct REAL, report_date TEXT, categorie TEXT, theme TEXT, rank INTEGER, is_product INTEGER, verdict TEXT, url_type TEXT, image_url TEXT, moq TEXT, eu_stock INTEGER, score_global INTEGER, score_demand INTEGER, score_trend INTEGER, score_margin INTEGER, score_supplier INTEGER, score_competition INTEGER, score_ads INTEGER, score_risk INTEGER,
        FOREIGN KEY (rayon_report_id) REFERENCES rayon_reports(id)
      );

CREATE TABLE IF NOT EXISTS import_log (
        id TEXT PRIMARY KEY,
        import_date TEXT,
        file_path TEXT,
        status TEXT,
        message TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

CREATE INDEX IF NOT EXISTS idx_reports_date ON reports(date);

CREATE INDEX IF NOT EXISTS idx_reports_categorie ON reports(categorie);

CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(type);

CREATE INDEX IF NOT EXISTS idx_products_cle ON products(product_key, report_date);

CREATE INDEX IF NOT EXISTS idx_products_date ON products(report_date);

CREATE INDEX IF NOT EXISTS idx_products_cat ON products(categorie, theme, report_date);

CREATE INDEX IF NOT EXISTS idx_products_marge ON products(margin_eur);
`;

function creerSchema(db) {
  db.exec(SCHEMA);
}

/**
 * Ce que le rapport dit de lui-meme. Leve avec la raison quand le bloc study
 * est incomplet : sans date, categorie et theme, la ligne n'aurait pas de place.
 */
function lireEtude(d) {
  const s = (d && d.study) || {};
  if (!s.date || !s.category_name || !s.theme_slug) {
    throw new Error('bloc study incomplet (date, category_name, theme_slug attendus)');
  }
  const date = s.date;
  // Le Poste d'analyses envoie l'identifiant exact de l'agent (category_id) : slug(category_name) ne le
  // redonne pas pour 14 des 24 categories (« TV, son et photo » -> tv-son-et-photo, pas tv-son-photo).
  // Les fichiers n8n, sans category_id, gardent la regle d'origine.
  const categorie = s.category_id ? String(s.category_id) : slug(s.category_name);
  const theme = slug(s.theme_slug);
  const produits = Array.isArray(d.products) ? d.products : [];
  const nbSources = Array.isArray(d.sources) ? d.sources.length : 0;
  return {
    date,
    categorie,
    theme,
    produits,
    nbSources,
    idRayon: `rayon-${date}-${categorie}-${theme}`,
    idMkt: `marketing-${date}-${categorie}-${theme}`,
    titre: s.theme_name || s.category_name,
  };
}

/**
 * Ecrit le rapport rayon ET le rapport marketing d'un fichier MarketSpy, en
 * une transaction (tout ou rien). Remplace ce qui existait pour le meme jour,
 * la meme categorie et le meme theme. Leve si le fichier est refuse.
 */
function ecrireRapport(db, d, nom) {
  const { date, categorie, theme, produits, nbSources, idRayon, idMkt, titre } = lireEtude(d);

  // transaction a la main : node:sqlite n'a pas le helper de better-sqlite3
  /**
   * La colonne `data` est renvoyee TELLE QUELLE par l'API.
   *
   * getAllReports fait `JSON.parse(row.data)` et sert le resultat au site sans
   * rien remodeler : sa forme est donc un contrat, pas un espace libre. Y
   * mettre le JSON MarketSpy brut a casse toutes les pages de rapports et
   * l'import produits, qui cherchaient supplierUrl, importMethod et le reste.
   * On construit donc la forme attendue, et on range MarketSpy dessous.
   */
  const produitsPourLeSite = produits.map((p, i) => {
    const net = p.net_margin_estimated != null ? p.net_margin_estimated : p.gross_margin;
    const roi = Number(p.roi_estimated);
    return {
      title: [p.product_name, p.variant].filter(Boolean).join(' — ') || 'Sans titre',
      supplier: [p.supplier_name, p.supplier_platform].filter(Boolean).join(' / ') || '—',
      supplierUrl: p.supplier_url || '',
      buyPrice: eur(p.estimated_landed_cost_france != null ? p.estimated_landed_cost_france : p.purchase_price),
      sellPrice: eur(p.target_selling_price),
      margin: eur(net) + (Number.isFinite(roi) && roi ? ` (ROI ${(roi * 100).toFixed(1)} %)` : ''),
      importMethod: methodeImport(p),
      reason: [p.decision, p.problem_solved, p.target_customer].filter(Boolean).join(' · ') || '—',
      recommendedUrl: '-',
      rank: p.rank || i + 1,
    };
  });

  const enTete = {
    date,
    categorie,
    theme,
    titre,
    agent: 'marketspy',
    sources: nbSources,
  };
  const dataRayon = JSON.stringify({
    type: 'rayon',
    ...enTete,
    analysis: texteAnalyse(d),
    products: produitsPourLeSite,
    marketspy: d,
  });
  const cp0 = d.creative_prompts || {};
  const dataMarketing = JSON.stringify({
    type: 'marketing',
    ...enTete,
    socialPlaces: [],
    adsCurrent: (d.alerts && d.alerts.breakout_products) || [],
    trendsDaily: (d.market && d.market.current_trends) || [],
    trendingAds: (d.market && d.market.emerging_trends) || [],
    imagePrompts: cp0.image_ads || [],
    videoPrompts: cp0.short_videos_30s || [],
    marketspy: d,
  });

  const maj = () => {
    // --- le rapport RAYON : l'analyse et les 20 produits
    db.prepare(
      `INSERT INTO reports (id, type, date, categorie, theme, titre, agent, sources, data, updated_at)
       VALUES (?, 'rayon', ?, ?, ?, ?, 'marketspy', ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET titre=excluded.titre, sources=excluded.sources,
         data=excluded.data, updated_at=CURRENT_TIMESTAMP`
    ).run(idRayon, date, categorie, theme, titre, nbSources, dataRayon);

    const idEnfantR = `rayon-child-${date}-${categorie}-${theme}`;
    db.prepare(`DELETE FROM products WHERE rayon_report_id = ?`).run(idEnfantR);
    db.prepare(`DELETE FROM rayon_reports WHERE id = ?`).run(idEnfantR);
    db.prepare(
      `INSERT INTO rayon_reports (id, report_id, analysis, products) VALUES (?, ?, ?, ?)`
    ).run(idEnfantR, idRayon, texteAnalyse(d), JSON.stringify(produitsPourLeSite));

    // Les colonnes numeriques et d'identite sont remplies ICI, a l'import :
    // c'est ce qui rend les etudes comparables dans le temps. Les remplir plus
    // tard par migration marche une fois ; les remplir a la source marche
    // toujours. Voir memoire-migration.cjs pour le pourquoi.
    const insProd = db.prepare(
      `INSERT INTO products (id, rayon_report_id, title, supplier, supplier_url,
         buy_price, sell_price, margin, import_method, reason, recommended_url,
         product_key, brand, buy_price_eur, sell_price_eur, margin_eur, roi_pct,
         report_date, categorie, theme, rank, is_product,
         verdict, url_type, image_url, moq, eu_stock,
         score_global, score_demand, score_trend, score_margin,
         score_supplier, score_competition, score_ads, score_risk)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
               ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1,
               ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    // « POCO X7 Pro 12/512 » et « POCO X7 Pro 5G (EU) » doivent tomber sur la
    // meme cle, sinon il n'y a ni memoire ni evolution de prix.
    const BRUIT_CLE = new Set(('les le la un une de du des en pour avec et ou a au aux ' +
      'meilleur meilleure meilleurs top best nouveau promo prix pas cher achat ' +
      '2024 2025 2026 2027 sur par plus').split(' '));
    const cleProduit = (t) => {
      const base = String(t || '').split(/\s[—–]\s/)[0]
        .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
        .replace(/[^a-z0-9+]+/g, ' ').trim();
      const j = base.split(' ').filter((x) => x && !BRUIT_CLE.has(x));
      return j.slice(0, 5).join('-') || null;
    };
    produits.forEach((p, i) => {
      const titreP = [p.product_name, p.variant].filter(Boolean).join(' — ');
      const fournisseur = [p.supplier_name, p.supplier_platform]
        .filter(Boolean)
        .join(' / ');
      const pourquoi = [p.decision, p.problem_solved, p.target_customer]
        .filter(Boolean)
        .join(' · ');
      // le prix de reference d'une place de marche, quand il y en a un
      const sc = p.scores || {};
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
        refUrl,
        // --- identite et chiffres : la partie qui rend la memoire possible
        cleProduit(titreP),
        (cleProduit(titreP) || '').split('-')[0] || null,
        p.estimated_landed_cost_france != null ? Number(p.estimated_landed_cost_france) : (p.purchase_price != null ? Number(p.purchase_price) : null),
        p.target_selling_price != null ? Number(p.target_selling_price) : null,
        p.net_margin_estimated != null ? Number(p.net_margin_estimated) : (p.gross_margin != null ? Number(p.gross_margin) : null),
        p.roi_estimated != null ? Number(p.roi_estimated) * 100 : null,
        date,
        categorie,
        theme,
        p.rank != null ? Number(p.rank) : i + 1,
        // --- enrichissements MarketSpy
        p.decision || null,
        p.url_type || null,
        p.image_url || null,
        p.moq != null ? String(p.moq) : null,
        p.eu_stock === true ? 1 : p.eu_stock === false ? 0 : null,
        sc.global_opportunity_score ?? null,
        sc.demand_score ?? null,
        sc.trend_score ?? null,
        sc.margin_score ?? null,
        sc.supplier_score ?? null,
        sc.competition_score ?? null,
        sc.ads_potential_score ?? null,
        sc.risk_score ?? null
      );
    });

    // --- le rapport MARKETING : les routes de lecture le cherchent par type
    db.prepare(
      `INSERT INTO reports (id, type, date, categorie, theme, titre, agent, sources, data, updated_at)
       VALUES (?, 'marketing', ?, ?, ?, ?, 'marketspy', ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET titre=excluded.titre, sources=excluded.sources,
         data=excluded.data, updated_at=CURRENT_TIMESTAMP`
    ).run(idMkt, date, categorie, theme, titre, nbSources, dataMarketing);

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
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (e) {}
    throw err;
  }
  return { date, categorie, theme, idRayon, idMkt, produits: produits.length, sources: nbSources };
}

module.exports = { slug, eur, creerSchema, lireEtude, ecrireRapport, SCHEMA };
