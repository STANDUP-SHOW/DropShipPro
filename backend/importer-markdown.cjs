/**
 * Importe dans rapports.db les rapports Markdown produits par les taches
 * planifiees « DropPost — Rapports RAYON+MARKETING (lot 1..4/4) ».
 *
 *   cd backend && node importer-markdown.cjs                  # tout ce qui manque
 *   cd backend && node importer-markdown.cjs --date 2026-10-04
 *   cd backend && node importer-markdown.cjs --sec             # lecture seule, rien n'est ecrit
 *
 * ------------------------------------------------------------------------
 * POURQUOI CE FICHIER EXISTE
 *
 * Deux moteurs produisent des rapports, dans deux formats differents :
 *
 *   1. l'agent n8n « agentRayonUnifie » ecrit du JSON au schema aiMARKET,
 *      a plat dans rapports/ — c'est importer-aimarket.cjs qui le lit ;
 *   2. les quatre taches planifiees Claude ecrivent du MARKDOWN dans
 *      rapports/<date>/<categorie>/<theme>.rayon.md et .marketing.md.
 *
 * Le site, lui, ne lit ni l'un ni l'autre : il lit rapports.db. Les rapports
 * du 4 octobre etaient donc bien produits — 48 fichiers, 24 rayons — et
 * invisibles, faute de route entre le disque et la base.
 *
 * Ce script est cette route pour le format Markdown.
 *
 * ------------------------------------------------------------------------
 * CE QU'IL NE FAIT PAS
 *
 * Il n'invente rien. Un prix illisible reste nul, une URL absente reste vide,
 * un fichier au format inattendu est refuse avec sa raison. C'est la regle du
 * projet : mieux vaut un champ vide qu'une donnee qui a l'air fiable.
 */
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------- arguments
const args = process.argv.slice(2);
const sec = args.includes('--sec');
const dateVoulue = args.includes('--date') ? args[args.indexOf('--date') + 1] : null;

const RACINE = path.resolve(__dirname, '..', 'MARKET-ANALYSES', 'rapports');
const BASE = path.resolve(__dirname, 'rapports.db');

if (!fs.existsSync(RACINE)) {
  console.error(`Aucun dossier ${RACINE}.`);
  process.exit(1);
}

/**
 * better-sqlite3 est compile pour la plateforme ; node:sqlite est integre.
 * On prend le premier qui repond, pour que le script tourne aussi la ou la
 * compilation native n'a pas eu lieu.
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

// ----------------------------------------------------- recensement sur disque

/** Les dossiers de date, tries, filtres par --date s'il est donne. */
function dossiersDate() {
  return fs
    .readdirSync(RACINE, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name))
    .map((e) => e.name)
    .filter((d) => !dateVoulue || d === dateVoulue)
    .sort();
}

/** Un couple rayon/marketing par categorie et par theme. */
function etudes() {
  const out = [];
  for (const date of dossiersDate()) {
    const dDate = path.join(RACINE, date);
    for (const cat of fs.readdirSync(dDate, { withFileTypes: true })) {
      if (!cat.isDirectory()) continue;
      const dCat = path.join(dDate, cat.name);
      const themes = new Map();
      for (const f of fs.readdirSync(dCat)) {
        const m = f.match(/^(.+)\.(rayon|marketing)\.md$/);
        if (!m) continue;
        if (!themes.has(m[1])) themes.set(m[1], {});
        themes.get(m[1])[m[2]] = path.join(dCat, f);
      }
      for (const [theme, fichiers] of themes) {
        out.push({ date, categorie: cat.name, theme, ...fichiers });
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------ import

const liste = etudes();
if (!liste.length) {
  console.error(
    `Aucun rapport Markdown trouve sous ${RACINE}` +
    (dateVoulue ? ` pour la date ${dateVoulue}.` : '.')
  );
  process.exit(1);
}

const ouverture = sec ? null : ouvrir(BASE);
const db = ouverture ? ouverture.db : null;
if (ouverture) console.log(`pilote : ${ouverture.pilote}\n`);

let ok = 0;
let ko = 0;
let produitsTotal = 0;

for (const e of liste) {
  const nom = `${e.date}/${e.categorie}/${e.theme}`;

  if (!e.rayon) {
    console.log(`refus  ${nom} — pas de fichier .rayon.md`);
    ko++;
    continue;
  }

  let texteRayon;
  try {
    texteRayon = fs.readFileSync(e.rayon, 'utf8');
  } catch (err) {
    console.log(`refus  ${nom} — lecture impossible : ${err.message}`);
    ko++;
    continue;
  }

  const fm = frontmatter(texteRayon);
  if (!fm || !fm.date || !fm.categorie || !fm.theme) {
    console.log(`refus  ${nom} — frontmatter absent ou incomplet (date, categorie, theme attendus)`);
    ko++;
    continue;
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
    console.log(`refus  ${nom} — aucune ligne produit lisible dans le tableau`);
    ko++;
    continue;
  }

  // --- le volet marketing, quand il est la (il ne bloque pas l'import)
  let mkt = null;
  if (e.marketing) {
    try {
      const tm = fs.readFileSync(e.marketing, 'utf8');
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
      console.log(`  note ${nom} — marketing illisible (${err.message}), rayon importe seul`);
    }
  }

  const idRayon = `rayon-${date}-${categorie}-${theme}`;
  const idMkt = `marketing-${date}-${categorie}-${theme}`;

  if (sec) {
    console.log(`lu     ${nom} — ${produits.length} produits, ${nbSources} sources${mkt ? ', marketing ok' : ', SANS marketing'}`);
    const fiches = produits.filter((p) => p.typeUrl === 'fiche').length;
    const sansPrix = produits.filter((p) => p.achat == null || p.vente == null).length;
    console.log(`       ${fiches} URL de fiche | ${sansPrix} produit(s) sans prix complet`);
    ok++;
    produitsTotal += produits.length;
    continue;
  }

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
    markdown: { rayon: path.relative(RACINE, e.rayon), source: 'taches-planifiees' },
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
        markdown: { marketing: path.relative(RACINE, e.marketing), source: 'taches-planifiees' },
      })
    : null;

  const maj = () => {
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
      path.relative(RACINE, e.rayon),
      `${produits.length} produits, ${nbSources} sources${mkt ? ', marketing' : ''}`
    );
  };

  try {
    db.exec('BEGIN');
    maj();
    db.exec('COMMIT');
    const fiches = produits.filter((p) => p.typeUrl === 'fiche').length;
    console.log(
      `ok     ${nom} — ${produits.length} produits (${fiches} fiches), ` +
      `${nbSources} sources${mkt ? ', marketing' : ', SANS marketing'}`
    );
    ok++;
    produitsTotal += produits.length;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (e2) {}
    console.log(`refus  ${nom} — ${err.message}`);
    ko++;
  }
}

if (db) db.close();
console.log(`\n${ok} etude(s) importee(s), ${ko} refusee(s), ${produitsTotal} produits.`);
if (!sec && ok) {
  console.log('\nEnchainer pour la memoire et les alertes :');
  console.log('  node memoire-migration.cjs');
  console.log('  node memoire-alertes.cjs');
}
