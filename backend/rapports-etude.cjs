/**
 * Lecture et ecriture d'une etude (rapport RAYON + MARKETING) dans rapports.db.
 *
 * Partagee par les deux importateurs en ligne de commande
 * (importer-markdown.cjs, importer-aimarket.cjs) et par l'import Google Drive
 * du back-office (src/services/importDrive.ts). Une seule copie du code : si
 * deux chemins d'import ecrivaient deux formes de `data`, le site lirait l'une
 * et casserait sur l'autre.
 *
 * Rien n'est invente : un prix illisible reste nul, une URL absente reste vide.
 */
function ouvrir(chemin) {
  try {
    return { db: new (require('better-sqlite3'))(chemin), pilote: 'better-sqlite3' };
  } catch (e) {
    return { db: new (require('node:sqlite').DatabaseSync)(chemin), pilote: 'node:sqlite' };
  }
}

// ------------------------------------------------------------------ outils

/** « Informatique » -> « informatique ». */
function slug(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * « 42,00 », « 42.00 €», « 1 299,90 » -> 42 / 1299.9. Renvoie null si le
 * contenu n'est pas un nombre : un prix non lisible ne doit pas devenir 0,
 * qui se calculerait ensuite comme une marge de 100 %.
 */
function nombre(txt) {
  if (txt == null) return null;
  const t = String(txt)
    .replace(/ /g, ' ')
    .replace(/[€\s]/g, '')
    .replace(/,/g, '.')
    .replace(/[^0-9.\-]/g, '');
  if (!t || t === '-' || t === '.') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Affichage euro a deux decimales, ou tiret quand la valeur manque. */
function eur(n) {
  return n == null ? '—' : `${Number(n).toFixed(2)} €`;
}

/**
 * Le tableau porte l'URL dans un lien Markdown : « [Fiche produit](https://…) ».
 * On prend la premiere adresse http du libelle, et rien d'autre.
 */
function urlDeCellule(cellule) {
  const m = String(cellule || '').match(/\((https?:\/\/[^)\s]+)\)/);
  if (m) return m[1];
  const brut = String(cellule || '').match(/https?:\/\/[^\s)|]+/);
  return brut ? brut[0] : '';
}

/** Le texte visible d'une cellule, liens Markdown aplatis. */
function texteDeCellule(cellule) {
  return String(cellule || '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Une URL de fiche porte un identifiant de produit ; une URL de plateforme
 * s'arrete a la racine. La distinction compte : c'est elle qui dit si l'import
 * automatique peut s'appuyer dessus ou s'il faut passer par l'extension.
 */
function typeUrl(u) {
  if (!u) return null;
  let chemin;
  try {
    chemin = new URL(u).pathname;
  } catch (e) {
    return null;
  }
  if (!chemin || chemin === '/') return 'plateforme';
  const MOTIFS = ['/item/', '/product-detail/', '/product/', '/products/', '/p/', '/pd/', '/goods/', '/shop/'];
  if (MOTIFS.some((m) => chemin.includes(m))) return 'fiche';
  if (/_\d{4,}\.html?$/.test(chemin) || /\d{5,}/.test(chemin)) return 'fiche';
  return 'liste';
}

/** Le frontmatter YAML en tete de fichier, lu a plat (pas de YAML imbrique ici). */
function frontmatter(texte) {
  const m = texte.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const out = {};
  for (const ligne of m[1].split(/\r?\n/)) {
    const i = ligne.indexOf(':');
    if (i < 1) continue;
    const cle = ligne.slice(0, i).trim();
    let val = ligne.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[cle] = val;
  }
  return out;
}

/**
 * Decoupe le document en sections de niveau 2, indexees par titre normalise.
 *
 * Premiere version faite avec une expression reguliere et un `\Z` pour « fin
 * de texte » : ce jeton N'EXISTE PAS en JavaScript, ou il vaut simplement la
 * lettre Z. La section s'arretait donc au premier Z majuscule rencontre, ce
 * qui tronquait les tableaux au milieu — 16 produits lus sur 20, et cinq
 * fichiers refuses pour « aucune ligne produit lisible ». Un decoupage ligne a
 * ligne n'a pas ce genre de piege.
 *
 * Les titres situes dans un bloc de code sont ignores : les prompts
 * publicitaires commencent par « # TikTok 9:16 » et ne sont pas des sections.
 */
function sections(texte) {
  const out = new Map();
  let titre = null;
  let buf = [];
  let dansCode = false;
  const ranger = () => {
    if (titre !== null) out.set(normTitre(titre), buf.join('\n').trim());
  };
  for (const l of texte.split(/\r?\n/)) {
    if (/^\s*```/.test(l)) dansCode = !dansCode;
    const m = dansCode ? null : l.match(/^##\s+(.*?)\s*$/);
    if (m) {
      ranger();
      titre = m[1];
      buf = [];
    } else if (titre !== null) {
      buf.push(l);
    }
  }
  ranger();
  return out;
}

/** « Publicités en cours » et « Publicites en cours » doivent tomber pareil. */
function normTitre(t) {
  return String(t || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Le corps d'une section, cherche par titre puis, a defaut, par motif. */
function section(map, titre, motif) {
  const direct = map.get(normTitre(titre));
  if (direct != null) return direct;
  if (motif) {
    for (const [k, v] of map) if (motif.test(k)) return v;
  }
  return '';
}

/** Les sections de prompts livrent des blocs de code autonomes et copiables. */
function blocsDeCode(bloc) {
  const out = [];
  const re = /```[a-z]*\r?\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(bloc)) !== null) {
    const t = m[1].trim();
    if (t) out.push(t);
  }
  return out;
}

/** Les puces d'une section, ou ses paragraphes quand il n'y a pas de puces. */
function puces(bloc) {
  if (!bloc) return [];
  const lignes = bloc.split(/\r?\n/);
  const p = lignes
    .filter((l) => /^\s*[-*+]\s+/.test(l))
    .map((l) => texteDeCellule(l.replace(/^\s*[-*+]\s+/, '')))
    .filter(Boolean);
  if (p.length) return p;
  return bloc
    .split(/\r?\n\s*\r?\n/)
    .map((x) => texteDeCellule(x))
    .filter(Boolean);
}

/**
 * « POCO X7 Pro 12/512 » et « POCO X7 Pro 5G (EU) » doivent tomber sur la meme
 * cle, sinon il n'y a ni memoire ni evolution de prix. Meme heuristique que
 * memoire-migration.cjs et importer-aimarket.cjs — les trois doivent rester
 * d'accord, sinon un produit se dedouble d'une etude a l'autre.
 */
const BRUIT_CLE = new Set(
  ('les le la un une de du des en pour avec et ou a au aux ' +
    'meilleur meilleure meilleurs top best nouveau promo prix pas cher achat ' +
    '2024 2025 2026 2027 sur par plus').split(' ')
);
function cleProduit(t) {
  const base = String(t || '')
    .split(/\s[—–]\s/)[0]
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, ' ')
    .trim();
  const j = base.split(' ').filter((x) => x && !BRUIT_CLE.has(x));
  return j.slice(0, 5).join('-') || null;
}

/**
 * Le tableau « ## 20 produits proposés ».
 *
 * Colonnes attendues, dans cet ordre :
 *   # | Titre | Fournisseur | URL fournisseur | Prix achat € |
 *   Prix vente conseillé € | Marge % | Import | Pourquoi
 *
 * ATTENTION — la colonne « Marge % » est ici un POURCENTAGE, alors que le
 * champ equivalent du schema aiMARKET est en EUROS. On garde donc le
 * pourcentage pour l'affichage et on recalcule la marge en euros depuis les
 * deux prix : c'est la seule valeur que la memoire et les alertes savent
 * comparer d'une etude a l'autre.
 */
function tableauProduits(bloc) {
  const lignes = bloc
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|'));
  const out = [];
  for (const l of lignes) {
    if (/^\|[\s:|-]+\|$/.test(l)) continue; // ligne de separation
    const cells = l.split('|').slice(1, -1);
    if (cells.length < 8) continue;
    const rang = nombre(cells[0]);
    if (rang == null) continue; // ligne d'en-tete
    const titre = texteDeCellule(cells[1]);
    if (!titre) continue;
    const url = urlDeCellule(cells[3]);
    const achat = nombre(cells[4]);
    const vente = nombre(cells[5]);
    const margePct = nombre(cells[6]);
    out.push({
      rang: Math.round(rang),
      titre,
      fournisseur: texteDeCellule(cells[2]) || '—',
      url,
      achat,
      vente,
      margePct,
      // marge en euros : recalculee, jamais devinee
      margeEur: achat != null && vente != null ? Number((vente - achat).toFixed(2)) : null,
      roiPct: achat != null && vente != null && achat > 0
        ? Number((((vente - achat) / achat) * 100).toFixed(1))
        : null,
      methode: texteDeCellule(cells[7]).toLowerCase() || 'url',
      pourquoi: texteDeCellule(cells[8] || '') || '—',
      typeUrl: typeUrl(url),
    });
  }
  return out;
}

// ---------------------------------------------------- outils aiMARKET

/** Un nombre devient « 245 € » ; ce qui manque devient « — », jamais 0. */
function eurAi(n) {
  if (n === null || n === undefined || n === '') return '—';
  const v = Number(n);
  return Number.isFinite(v) ? v.toFixed(2).replace(/\.00$/, '') + ' €' : String(n);
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
      l.push(`- **${b.bundle_name}** — coût ${eurAi(b.estimated_cost)}, vente ${eurAi(b.estimated_selling_price)}, marge ${eurAi(b.estimated_margin)} (${b.recommended_platform || '—'})`);
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


// ------------------------------------------------------- une etude Markdown

/**
 * Lit un couple <theme>.rayon.md / <theme>.marketing.md et rend soit un refus
 * motive, soit une etude prete a ecrire. Ne touche a aucune base : l'ecriture
 * est `ecrireEtude(db, etude)`, appelee par l'importateur en ligne de commande
 * comme par l'import Google Drive du back-office — les deux doivent produire
 * exactement les memes lignes, sinon le site lirait deux formes differentes.
 *
 * `origine` dit d'ou vient le texte (chemin relatif, ou dossier Drive) ; il est
 * range sous `data.markdown` et dans import_log, rien d'autre.
 */
function etudeMarkdown({ texteRayon, texteMarketing, origineRayon, origineMarketing, source = 'taches-planifiees' }) {
  const fm = frontmatter(texteRayon || '');
  if (!fm || !fm.date || !fm.categorie || !fm.theme) {
    return { ok: false, raison: 'frontmatter absent ou incomplet (date, categorie, theme attendus)' };
  }

  // Le frontmatter est la source de verite ; le chemin n'est qu'un indice.
  const date = fm.date;
  const categorie = slug(fm.categorie);
  const theme = slug(fm.theme);
  const titre = fm.titre || theme;
  const agent = fm.agent || `rayon-${categorie}`;
  const nbSources = nombre(fm.sources) != null ? Math.round(nombre(fm.sources)) : 0;

  const secRayon = sections(texteRayon);
  const analyse = section(secRayon, 'Analyse');
  // « 20 produits proposés », « 20 produits proposes », « 12 produits »… :
  // on accepte le titre exact, puis n'importe quel titre parlant de produits.
  const blocProduits = section(secRayon, '20 produits proposes', /produits/);
  const produits = tableauProduits(blocProduits);

  if (!produits.length) {
    return { ok: false, raison: 'aucune ligne produit lisible dans le tableau' };
  }

  // --- le volet marketing, quand il est la (il ne bloque pas l'import)
  let mkt = null;
  let noteMarketing = null;
  if (texteMarketing != null) {
    try {
      const tm = texteMarketing;
      const fmM = frontmatter(tm) || {};
      const sm = sections(tm);
      mkt = {
        titre: fmM.titre || titre,
        agent: fmM.agent || `marketing-${categorie}`,
        sources: nombre(fmM.sources) != null ? Math.round(nombre(fmM.sources)) : 0,
        socialPlaces: puces(section(sm, 'Social places', /social/)),
        adsCurrent: puces(section(sm, 'Publicites en cours', /publicites en cours/)),
        trendsDaily: puces(section(sm, 'Tendances du jour', /tendances du jour/)),
        trendingAds: puces(section(sm, 'Tendances publicitaires', /tendances publicitaires/)),
        imagePrompts: blocsDeCode(section(sm, "Prompts d images publicitaires", /prompts d image/)),
        videoPrompts: blocsDeCode(section(sm, 'Prompts de videos publicitaires', /prompts de video/)),
      };
    } catch (err) {
      noteMarketing = `marketing illisible (${err.message}), rayon importe seul`;
    }
  }

  const idRayon = `rayon-${date}-${categorie}-${theme}`;
  const idMkt = `marketing-${date}-${categorie}-${theme}`;

  /**
   * La colonne `data` est renvoyee TELLE QUELLE par l'API : getAllReports fait
   * un JSON.parse et sert le resultat au site sans rien remodeler. Sa forme est
   * donc un contrat. On reproduit exactement celle d'importer-aimarket.cjs,
   * et on range le Markdown d'origine sous `markdown` pour ne rien perdre.
   */
  const produitsPourLeSite = produits.map((p) => ({
    title: p.titre,
    supplier: p.fournisseur,
    supplierUrl: p.url,
    buyPrice: eur(p.achat),
    sellPrice: eur(p.vente),
    margin:
      (p.margeEur != null ? eur(p.margeEur) : '—') +
      (p.margePct != null ? ` (${p.margePct} %)` : ''),
    importMethod: p.methode,
    reason: p.pourquoi,
    recommendedUrl: '-',
    rank: p.rang,
  }));

  const enTete = { date, categorie, theme, titre, agent, sources: nbSources };

  const dataRayon = JSON.stringify({
    type: 'rayon',
    ...enTete,
    analysis: analyse,
    products: produitsPourLeSite,
    markdown: { rayon: origineRayon, source },
  });

  const dataMarketing = mkt
    ? JSON.stringify({
        type: 'marketing',
        ...enTete,
        titre: mkt.titre,
        agent: mkt.agent,
        sources: mkt.sources,
        socialPlaces: mkt.socialPlaces,
        adsCurrent: mkt.adsCurrent,
        trendsDaily: mkt.trendsDaily,
        trendingAds: mkt.trendingAds,
        imagePrompts: mkt.imagePrompts,
        videoPrompts: mkt.videoPrompts,
        markdown: { marketing: origineMarketing, source },
      })
    : null;

  const ecrire = (db) => {
    // --- le rapport RAYON : l'analyse et les produits
    db.prepare(
      `INSERT INTO reports (id, type, date, categorie, theme, titre, agent, sources, data, updated_at)
       VALUES (?, 'rayon', ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET titre=excluded.titre, agent=excluded.agent,
         sources=excluded.sources, data=excluded.data, updated_at=CURRENT_TIMESTAMP`
    ).run(idRayon, date, categorie, theme, titre, agent, nbSources, dataRayon);

    const idEnfantR = `rayon-child-${date}-${categorie}-${theme}`;
    db.prepare(`DELETE FROM products WHERE rayon_report_id = ?`).run(idEnfantR);
    db.prepare(`DELETE FROM rayon_reports WHERE id = ?`).run(idEnfantR);
    db.prepare(
      `INSERT INTO rayon_reports (id, report_id, analysis, products) VALUES (?, ?, ?, ?)`
    ).run(idEnfantR, idRayon, analyse, JSON.stringify(produitsPourLeSite));

    // Les colonnes numeriques sont remplies ICI, a l'import : c'est ce qui rend
    // les etudes comparables dans le temps. Les scores aiMARKET n'existent pas
    // dans ce format — ils restent nuls plutot que d'etre inventes.
    const insProd = db.prepare(
      `INSERT INTO products (id, rayon_report_id, title, supplier, supplier_url,
         buy_price, sell_price, margin, import_method, reason, recommended_url,
         product_key, brand, buy_price_eur, sell_price_eur, margin_eur, margin_pct,
         roi_pct, report_date, categorie, theme, rank, is_product, url_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
               ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
    );

    produits.forEach((p) => {
      const cle = cleProduit(p.titre);
      insProd.run(
        `${idEnfantR}-p${String(p.rang).padStart(2, '0')}`,
        idEnfantR,
        p.titre,
        p.fournisseur,
        p.url,
        eur(p.achat),
        eur(p.vente),
        (p.margeEur != null ? eur(p.margeEur) : '—') +
          (p.margePct != null ? ` (${p.margePct} %)` : ''),
        p.methode,
        p.pourquoi,
        '',
        cle,
        (cle || '').split('-')[0] || null,
        p.achat,
        p.vente,
        p.margeEur,
        p.margePct,
        p.roiPct,
        date,
        categorie,
        theme,
        p.rang,
        p.typeUrl
      );
    });

    // --- le rapport MARKETING : les routes de lecture le cherchent par type
    if (dataMarketing) {
      db.prepare(
        `INSERT INTO reports (id, type, date, categorie, theme, titre, agent, sources, data, updated_at)
         VALUES (?, 'marketing', ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET titre=excluded.titre, agent=excluded.agent,
           sources=excluded.sources, data=excluded.data, updated_at=CURRENT_TIMESTAMP`
      ).run(idMkt, date, categorie, theme, mkt.titre, mkt.agent, mkt.sources, dataMarketing);

      const idEnfantM = `marketing-child-${date}-${categorie}-${theme}`;
      db.prepare(`DELETE FROM marketing_reports WHERE id = ?`).run(idEnfantM);
      db.prepare(
        `INSERT INTO marketing_reports (id, report_id, social_places, ads_current,
           trends_daily, trending_ads, image_prompts, video_prompts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        idEnfantM,
        idMkt,
        JSON.stringify(mkt.socialPlaces),
        JSON.stringify(mkt.adsCurrent),
        JSON.stringify(mkt.trendsDaily),
        JSON.stringify(mkt.trendingAds),
        JSON.stringify(mkt.imagePrompts),
        JSON.stringify(mkt.videoPrompts)
      );
    }

    db.prepare(
      `INSERT INTO import_log (id, import_date, file_path, status, message)
       VALUES (?, CURRENT_TIMESTAMP, ?, 'ok', ?)`
    ).run(
      `imp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      origineRayon,
      `${produits.length} produits, ${nbSources} sources${mkt ? ', marketing' : ''}`
    );
  };

  return {
    ok: true,
    format: 'markdown',
    date,
    categorie,
    theme,
    titre,
    idRayon,
    idMarketing: mkt ? idMkt : null,
    sources: nbSources,
    produits: produits.length,
    fiches: produits.filter((p) => p.typeUrl === 'fiche').length,
    urlsDistinctes: new Set(produits.map((p) => p.url).filter((u) => /^https?:\/\//.test(u))).size,
    avecPrix: produits.filter((p) => p.achat != null && p.vente != null).length,
    avecScore: 0,
    marketing: !!mkt,
    noteMarketing,
    ecrire,
  };
}

// ------------------------------------------------------ une etude aiMARKET

/**
 * Un fichier MarketSpy (aiMARKET) porte l'etude ET le marketing. La base, elle,
 * separe les deux : un fichier donne donc DEUX lignes dans `reports`, chacune
 * avec son enfant. La colonne `data` recoit la forme lue par le site, avec le
 * JSON complet range sous `marketspy`.
 */
function etudeAiMarket(d, origine) {
  if (!d || typeof d !== 'object') return { ok: false, raison: 'JSON vide' };
  const s = d.study || {};
  if (!s.date || !s.category_name || !s.theme_slug) {
    return { ok: false, raison: 'bloc study incomplet (date, category_name, theme_slug attendus)' };
  }

  const date = s.date;
  // Le Poste d'analyses envoie l'identifiant exact de l'agent (category_id) : slug(category_name) ne le
  // redonne pas pour 14 des 24 categories (« TV, son et photo » -> tv-son-et-photo, pas tv-son-photo).
  // Les fichiers n8n, sans category_id, gardent la regle d'origine.
  const categorie = s.category_id ? String(s.category_id) : slug(s.category_name);
  const theme = slug(s.theme_slug);
  const produits = Array.isArray(d.products) ? d.products : [];
  const nbSources = Array.isArray(d.sources) ? d.sources.length : 0;

  const idRayon = `rayon-${date}-${categorie}-${theme}`;
  const idMkt = `marketing-${date}-${categorie}-${theme}`;
  const titre = s.theme_name || s.category_name;

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
      buyPrice: eurAi(p.estimated_landed_cost_france != null ? p.estimated_landed_cost_france : p.purchase_price),
      sellPrice: eurAi(p.target_selling_price),
      margin: eurAi(net) + (Number.isFinite(roi) && roi ? ` (ROI ${(roi * 100).toFixed(1)} %)` : ''),
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

  const ecrire = (db) => {
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
        eurAi(p.estimated_landed_cost_france != null ? p.estimated_landed_cost_france : p.purchase_price),
        eurAi(p.target_selling_price),
        // net_margin_estimated et gross_margin sont en EUROS chez MarketSpy,
        // pas en pourcentage : « 105 » veut dire 105 € de marge nette. Le ROI,
        // lui, est bien un ratio — on l'ajoute quand il est la.
        (() => {
          const net = p.net_margin_estimated != null ? p.net_margin_estimated : p.gross_margin;
          const roi = Number(p.roi_estimated);
          return eurAi(net) + (Number.isFinite(roi) && roi ? ` (ROI ${(roi * 100).toFixed(1)} %)` : '');
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
    ).run(`imp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, origine,
      `${produits.length} produits, ${nbSources} sources`);
  };

  const urls = produits.map((p) => p.supplier_url).filter((u) => /^https?:\/\//.test(String(u || '')));
  return {
    ok: true,
    format: 'aimarket',
    date,
    categorie,
    theme,
    titre,
    idRayon,
    idMarketing: idMkt,
    sources: nbSources,
    produits: produits.length,
    fiches: produits.filter((p) => typeUrl(p.supplier_url) === 'fiche').length,
    urlsDistinctes: new Set(urls).size,
    avecPrix: produits.filter((p) => (p.purchase_price != null || p.estimated_landed_cost_france != null) && p.target_selling_price != null).length,
    avecScore: produits.filter((p) => p.scores && p.scores.global_opportunity_score != null).length,
    marketing: true,
    noteMarketing: null,
    ecrire,
  };
}

/** Une etude s'ecrit en une transaction : tout ou rien. */
function ecrireEtude(db, etude) {
  db.exec('BEGIN');
  try {
    etude.ecrire(db);
    db.exec('COMMIT');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (e) {}
    throw err;
  }
}

module.exports = {
  ouvrir,
  slug,
  frontmatter,
  etudeMarkdown,
  etudeAiMarket,
  ecrireEtude,
};
