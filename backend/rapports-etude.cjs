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
  // No bullets: sub-headings label the paragraph that follows them, table rows
  // become one item each; raw Markdown must never reach an item.
  const out = [];
  let titre = null;
  for (const para of bloc.split(/\r?\n\s*\r?\n/)) {
    const ls = para.split(/\r?\n/).filter((l) => l.trim());
    if (!ls.length) continue;
    if (ls.every((l) => l.trim().startsWith('|'))) {
      const cases = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => texteDeCellule(c));
      const entetes = cases(ls[0]);
      for (const l of ls.slice(1)) {
        if (/^\s*\|?[\s:|-]+\|?\s*$/.test(l)) continue;
        const c = cases(l);
        const reste = c
          .slice(1)
          .map((v, i) => (v && v !== '—' ? (entetes[i + 1] ? `${entetes[i + 1]} : ${v}` : v) : ''))
          .filter(Boolean);
        if (c[0]) out.push(reste.length ? `${titre ? `${titre} : ` : ''}${c[0]} — ${reste.join(' · ')}` : c[0]);
      }
      titre = null;
      continue;
    }
    let corps = ls;
    const h = /^\s*#{2,6}\s+(?:\d+(?:\.\d+)*\.?\s+)?(.*)$/.exec(ls[0]);
    if (h) {
      titre = texteDeCellule(h[1].replace(/\*\*/g, ''));
      corps = ls.slice(1);
      if (!corps.length) continue;
    }
    const texte = texteDeCellule(corps.join(' ').replace(/\*\*/g, ''));
    if (texte) out.push(titre ? `${titre} : ${texte}` : texte);
    titre = null;
  }
  return out;
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

/** Every Markdown table of a text: its header names (normalised) and its rows of cells. */
function tableaux(texte) {
  const out = [];
  let courant = null;
  for (const brut of String(texte || '').split(/\r?\n/)) {
    const l = brut.trim();
    if (!l.startsWith('|')) { courant = null; continue; }
    const cells = l.split('|').slice(1, -1).map((c) => c.trim());
    if (/^\|[\s:|-]+\|$/.test(l)) continue;
    if (!courant) { courant = { entetes: cells.map(normTitre), lignes: [] }; out.push(courant); continue; }
    courant.lignes.push(cells);
  }
  return out;
}

/**
 * English verdicts of other agents (« BUY IF NEGOTIATED ») in French. Longest
 * phrases first so « BUY IF NEGOTIATED » never becomes « ACHETER IF NEGOTIATED ».
 * An unknown verdict is left as written rather than half translated.
 */
const VERDICTS = [
  ['breakout candidate', 'candidat en décollage'],
  ["don't buy", 'ne pas acheter'],
  ['dont buy', 'ne pas acheter'],
  ['do not buy', 'ne pas acheter'],
  ['strong buy', 'achat prioritaire'],
  ['buy if negotiated', 'acheter si négocié'],
  ['buy after test', 'acheter après test'],
  ['buy small batch', 'acheter en petit lot'],
  ['test small batch', 'tester en petit lot'],
  ['test small', 'tester en petit lot'],
  ['test first', 'tester d’abord'],
  ['test only', 'tester seulement'],
  ['buy now', 'acheter maintenant'],
  ['no go', 'à écarter'],
  ['no-go', 'à écarter'],
  ['watchlist', 'à surveiller'],
  ['breakout', 'en décollage'],
  ['buy', 'acheter'],
  ['test', 'tester'],
  ['watch', 'surveiller'],
  ['monitor', 'surveiller'],
  ['hold', 'attendre'],
  ['wait', 'attendre'],
  ['avoid', 'éviter'],
  ['skip', 'écarter'],
  ['reject', 'écarter'],
  ['pass', 'passer'],
  ['maybe', 'à voir'],
];
// Case-sensitive on purpose: only UPPERCASE verdicts are translated, « BUY » is a verdict, « buy » in a sentence is prose.
const MOTIF_VERDICT = new RegExp(
  `(?<![A-Za-z0-9/._-])(${VERDICTS.map(([en]) => en.toUpperCase().replace(/'/g, "['’]").replace(/[-\s]+/g, '[-\\s]+')).join('|')})(?![A-Za-z0-9/_-])`,
  'g'
);
function verdictFr(texte) {
  if (!texte) return texte;
  return String(texte).replace(MOTIF_VERDICT, (m) => {
    const cle = m.toLowerCase().replace(/’/g, "'").replace(/[-\s]+/g, ' ');
    const fr = (VERDICTS.find(([en]) => en.replace(/-/g, ' ') === cle) || [])[1];
    return fr ? fr.toUpperCase() : m;
  }).replace(MOTIF_ANGLAIS, (m) => {
    const fr = ANGLAIS.find(([en]) => en.test(m))[1];
    return m.charAt(0) === m.charAt(0).toUpperCase() ? fr.charAt(0).toUpperCase() + fr.slice(1) : fr;
  });
}

/**
 * English labels with no French reading, whatever their case (« Breakout
 * candidate : », « Watchlist : », « ## Executive Summary »). Unlike verdicts,
 * these never mean anything else in a French sentence.
 */
const ANGLAIS = [
  [/^executive summary$/i, 'synthèse'],
  [/^breakout candidates?$/i, 'candidat en décollage'],
  [/^watch[-\s]?list$/i, 'liste de surveillance'],
  [/^social trends$/i, 'tendances sociales'],
  [/^battle sheet$/i, 'comparatif'],
  [/^don['’]?t buy$/i, 'ne pas acheter'],
  [/^breakout$/i, 'en décollage'],
];
const MOTIF_ANGLAIS = /(?<![A-Za-z0-9/._-])(executive summary|breakout candidates?|watch[-\s]?list|social trends|battle sheet|don['’]?t buy|breakout)(?![A-Za-z0-9/_-])/gi;
/** A whole cell that is just a verdict: « BUY IF NEGOTIATED » -> « Acheter si négocié ». */
function verdictCellule(texte) {
  const t = String(texte || '').trim();
  if (!t || t !== t.toUpperCase()) return t;
  const fr = verdictFr(t);
  return fr === t ? t : fr.charAt(0) + fr.slice(1).toLowerCase();
}

/**
 * The « ## Annexe — JSON structuré » block of other agents' files, parsed, or
 * null. It is read for what the tables do not say (observed sales, scores,
 * images); a broken or missing annex never blocks the import.
 */
function annexeJson(texte) {
  const lignes = String(texte || '').split(/\r?\n/);
  const debut = lignes.findIndex((l) => /^##\s+/.test(l) && /^annexe/.test(normTitre(l.replace(/^##\s+/, ''))));
  if (debut < 0) return null;
  const reste = lignes.slice(debut + 1).join('\n');
  const bloc = /```[a-z]*\s*\n([\s\S]*?)```/i.exec(reste);
  const brut = bloc ? bloc[1] : reste.slice(reste.indexOf('{'));
  try {
    const v = JSON.parse(brut.trim());
    return v && typeof v === 'object' ? v : null;
  } catch (e) {
    return null;
  }
}

/** The products array of an annex, wherever the agent put it, or []. */
function produitsAnnexe(json) {
  if (!json || typeof json !== 'object') return [];
  const estProduit = (o) => o && typeof o === 'object' && !Array.isArray(o) &&
    Object.keys(o).some((k) => /^(product_?name|name|title|produit|nom|titre)$/i.test(k));
  const candidats = [json, ...Object.values(json).filter((v) => v && typeof v === 'object' && !Array.isArray(v))];
  for (const o of candidats) {
    for (const k of ['products', 'top_20', 'top20', 'top_20_products', 'winning_products', 'top_products', 'produits']) {
      if (Array.isArray(o[k]) && o[k].some(estProduit)) return o[k].filter(estProduit);
    }
  }
  for (const o of candidats) {
    for (const v of Object.values(o)) if (Array.isArray(v) && v.length >= 3 && v.every(estProduit)) return v;
  }
  return [];
}

const CLE_VENTES = /^(nb |nombre de )?ventes( constatees| observees| mensuelles| estimees)?$|^(observed |monthly |estimated |verified )?(sales|orders|units sold|sold)( count| volume| observed| per month| monthly| 30d)?$|^commandes( constatees)?$|^vendus$/;
/** Observed sales as the agent wrote them (« 1 200+ / mois »), or null. Never computed. */
function ventesDe(p) {
  if (!p || typeof p !== 'object') return null;
  const lire = (o) => {
    for (const [k, v] of Object.entries(o)) {
      if (!CLE_VENTES.test(normTitre(k))) continue;
      if (typeof v === 'number' && Number.isFinite(v)) return v.toLocaleString('fr-FR');
      if (typeof v === 'string' && v.trim() && !/^(n\/?a|null|—|-|inconnu|unknown)$/i.test(v.trim())) return v.trim().slice(0, 60);
    }
    return null;
  };
  const direct = lire(p);
  if (direct) return direct;
  for (const v of Object.values(p)) if (v && typeof v === 'object' && !Array.isArray(v)) {
    const r = lire(v);
    if (r) return r;
  }
  return null;
}

/** The overall score (0-100) an agent gave a product, or null. */
function scoreDe(p) {
  if (!p || typeof p !== 'object') return null;
  const sc = p.scores && typeof p.scores === 'object' ? p.scores : {};
  for (const v of [sc.global_opportunity_score, sc.global, p.global_opportunity_score, p.opportunity_score, p.global_score, p.score]) {
    const n = Number(v);
    if (v != null && v !== '' && Number.isFinite(n)) return Math.round(n);
  }
  return null;
}

/**
 * Other agents' layout (« MARKETSPY AI », 12/10/2026): the TOP 20 table names
 * its columns (Rang | Produit | Variante | Source achat | Coût rendu FR | Prix
 * vente cible | Marge nette estimée | … | Décision) and carries no link; the
 * supplier and its URL sit in another table (Produit | Fournisseur | URL | …),
 * matched on the product name. Columns are found by name, never by position,
 * and a value that is not there stays empty.
 */
function tableauProduitsParEntetes(bloc, texteComplet) {
  const principal = tableaux(bloc).find((t) => t.entetes.some((e) => /^(rang|#)$/.test(e)) && t.entetes.some((e) => /^produit/.test(e)));
  if (!principal) return [];
  const col = (t, motif, sauf) => t.entetes.findIndex((e) => motif.test(e) && !(sauf && sauf.test(e)));
  const iRang = col(principal, /^(rang|#)$/);
  const iProduit = col(principal, /^produit/);
  const iAchat = col(principal, /cout rendu|prix (d )?achat/, /max/);
  const iVente = col(principal, /prix (de )?vente/);
  const iDecision = col(principal, /decision|verdict/);
  const iScore = col(principal, /^score/);
  const VENTES = /^(nb |nombre de )?ventes\b|ventes (constatees|observees|mensuelles)|commandes|vendus|\bsold\b|\bsales\b/;
  const iVentes = col(principal, VENTES, /prix/);
  const cle = (t) => normTitre(texteDeCellule(t));
  // observed sales may sit in another table (marketplaces), matched on the product name like the supplier
  const ventesAilleurs = new Map();
  // supplier table(s): any other table with a product column and an URL column
  const fournisseurs = new Map();
  for (const t of tableaux(texteComplet)) {
    if (t === principal) continue;
    const iP = col(t, /^produit/);
    const iU = col(t, /^url\b|lien/);
    if (iP >= 0 && iU < 0) {
      const iV = col(t, VENTES, /prix/);
      if (iV >= 0) for (const c of t.lignes) if (texteDeCellule(c[iV]) && !ventesAilleurs.has(cle(c[iP]))) ventesAilleurs.set(cle(c[iP]), texteDeCellule(c[iV]));
    }
    if (iP < 0 || iU < 0) continue;
    const iF = col(t, /fournisseur|source/);
    const iV = col(t, VENTES, /prix/);
    for (const c of t.lignes) {
      if (iV >= 0 && texteDeCellule(c[iV]) && !ventesAilleurs.has(cle(c[iP]))) ventesAilleurs.set(cle(c[iP]), texteDeCellule(c[iV]));
      const k = cle(c[iP]);
      if (k && !fournisseurs.has(k)) fournisseurs.set(k, { url: urlDeCellule(c[iU]), nom: iF >= 0 ? texteDeCellule(c[iF]) : '' });
    }
  }
  // the structured annex completes what the tables leave empty, never the reverse
  const annexe = produitsAnnexe(annexeJson(texteComplet));
  const deLAnnexe = (rang, titre) =>
    annexe.find((a) => Number(a.rank ?? a.rang) === rang) ||
    annexe.find((a) => {
      const n = normTitre(a.product_name || a.name || a.title || a.produit || a.nom || a.titre);
      return n && (n === normTitre(titre) || normTitre(titre).startsWith(n) || n.startsWith(normTitre(titre)));
    }) ||
    null;
  const out = [];
  for (const c of principal.lignes) {
    const rang = nombre(c[iRang]);
    const titre = texteDeCellule(c[iProduit]);
    if (rang == null || !titre) continue;
    const f = fournisseurs.get(cle(c[iProduit])) || { url: '', nom: '' };
    const a = deLAnnexe(Math.round(rang), titre) || {};
    const urlAnnexe = /^https?:\/\//.test(String(a.supplier_url || '')) ? String(a.supplier_url) : '';
    const url = f.url || urlDeCellule(c.join(' ')) || urlAnnexe;
    const nbA = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
    const achat = (iAchat >= 0 ? nombre(c[iAchat]) : null) ?? nbA(a.estimated_landed_cost_france ?? a.purchase_price);
    const vente = (iVente >= 0 ? nombre(c[iVente]) : null) ?? nbA(a.target_selling_price);
    const scoreTableau = iScore >= 0 ? nombre(c[iScore]) : null;
    const decision = verdictCellule((iDecision >= 0 ? texteDeCellule(c[iDecision]) : '') || String(a.decision || ''));
    out.push({
      rang: Math.round(rang),
      titre,
      fournisseur: f.nom || [a.supplier_name, a.supplier_platform].filter(Boolean).join(' / ') || '—',
      url,
      ventes: (iVentes >= 0 ? texteDeCellule(c[iVentes]) : '') || ventesAilleurs.get(cle(c[iProduit])) || ventesDe(a),
      score: scoreTableau != null ? Math.round(scoreTableau) : scoreDe(a),
      verdict: decision || null,
      image: /^https?:\/\//.test(String(a.image_url || '')) ? String(a.image_url) : null,
      achat,
      vente,
      margePct: achat != null && vente != null && vente > 0 ? Number((((vente - achat) / vente) * 100).toFixed(1)) : null,
      margeEur: achat != null && vente != null ? Number((vente - achat).toFixed(2)) : null,
      roiPct: achat != null && vente != null && achat > 0 ? Number((((vente - achat) / achat) * 100).toFixed(1)) : null,
      methode: EN_JS.some((x) => url.toLowerCase().includes(x)) ? 'extension' : 'url',
      pourquoi: decision || '—',
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

/** The first « ## » heading that is neither numbered nor an appendix, or null. */
function titreDuTexte(texte) {
  let dansCode = false;
  for (const l of String(texte || '').split(/\r?\n/)) {
    if (/^\s*```/.test(l)) { dansCode = !dansCode; continue; }
    const m = !dansCode && /^##\s+(.+?)\s*$/.exec(l);
    if (!m) continue;
    const t = texteDeCellule(m[1]).replace(/[*_`]/g, '').trim();
    if (!t || /^\d/.test(t) || /^(annexe|sources?|analyse)\b/i.test(normTitre(t))) continue;
    return t.slice(0, 140);
  }
  return null;
}

/**
 * Every « ## » section of a file, headings kept, in order, without the title
 * heading (it is the report title), the structured annex (read separately) or
 * empty sections. Section numbers (« 7. ») are dropped: some are missing (10 to
 * 13 on 12/10/2026) and a gap reads like a lost section.
 */
function sectionsCompletes(texte) {
  const numeros = new Map();
  for (const m of String(texte || '').matchAll(/^##\s+(\d+)\s*[.)]\s*(.+?)\s*$/gm)) numeros.set(m[1], texteDeCellule(m[2]));
  const renvois = (corps) =>
    corps
      .replace(/(voir\s+)?(?:le\s+fichier\s+)?`?[\w.-]+\.marketing\.md`?,?\s*(?:section\s*\d+)?/gi, (m, voir) => `${voir ?? ''}l'analyse marketing du même jour`)
      .replace(/\bsections?\s+(\d+)\b/gi, (m, n) => (numeros.has(n) ? `« ${verdictFr(numeros.get(n))} »` : m))
      .replace(/^(#{3,}\s+)\d+\.\d+\s+/gm, '$1');
  const out = [];
  let titre = null;
  let buf = [];
  let dansCode = false;
  const ranger = () => {
    if (titre === null) return;
    const corps = buf.join('\n').trim();
    const t = texteDeCellule(titre).replace(/^\d+\s*[.)]\s*/, '').trim();
    if (corps && !/^annexe/.test(normTitre(t))) out.push(`## ${t}\n${renvois(corps)}`);
  };
  let premier = true;
  for (const l of String(texte || '').split(/\r?\n/)) {
    if (/^\s*```/.test(l)) dansCode = !dansCode;
    const m = dansCode ? null : l.match(/^##\s+(.*?)\s*$/);
    if (m) {
      ranger();
      // the unnumbered first heading is the report title (titreDuTexte), not a section
      titre = premier && !/^\d/.test(m[1].trim()) && texteDeCellule(m[1]) === titreDuTexte(texte) ? null : m[1];
      premier = false;
      buf = [];
    } else if (titre !== null) {
      buf.push(l);
    }
  }
  ranger();
  return out.join('\n\n');
}

/**
 * Ce que dit le chemin d'un .rayon.md rangé <date>/<categorie>/<theme>.rayon.md
 * (dossier Drive, ou origine gardée dans la surcouche), ou null.
 */
function indicesDuChemin(chemin) {
  const m = /(?:^|[\/:])(\d{4}-\d{2}-\d{2})\/([^/]+)\/([^/]+)\.rayon\.md$/i.exec(String(chemin || ''));
  return m ? { date: m[1], categorie: m[2], theme: m[3] } : null;
}

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
function etudeMarkdown({ texteRayon, texteMarketing, origineRayon, origineMarketing, source = 'taches-planifiees', indices = null }) {
  // Other agents' files (« MARKETSPY AI », 12/10/2026) have no YAML header: the
  // Drive folder they sit in (<date>/<categorie>/<theme>.rayon.md) says the same
  // three things. The header still wins wherever it is present.
  const fm = { ...(indices || {}), ...(frontmatter(texteRayon || '') || {}) };
  if (!fm.date || !fm.categorie || !fm.theme) {
    return { ok: false, raison: "en-tête « --- » absent ou incomplet (date, categorie, theme attendus)" };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fm.date)) {
    return { ok: false, raison: `date illisible dans l'en-tête : « ${fm.date} » (AAAA-MM-JJ attendu)` };
  }

  // Le frontmatter est la source de verite ; le chemin n'est qu'un indice.
  const date = fm.date;
  const categorie = slug(fm.categorie);
  const theme = slug(fm.theme);
  // No header title (other agents' files): the first unnumbered « ## » heading,
  // « Électroménager — Lavage et séchage », rather than the bare theme slug that
  // gave /analyses/lavage-sechage/lavage-sechage-2/ (12/10/2026).
  const titre = fm.titre || titreDuTexte(texteRayon) || theme;
  const agent = fm.agent || `rayon-${categorie}`;
  const nbSources = nombre(fm.sources) != null ? Math.round(nombre(fm.sources)) : 0;

  const secRayon = sections(texteRayon);
  // « Analyse » in ours; other agents' files (MARKETSPY, 16 numbered sections)
  // are kept whole, every section under its own heading and in its order, so
  // the site shows all of them (12/10/2026: only the first two were kept).
  const analyse = section(secRayon, 'Analyse') || verdictFr(sectionsCompletes(texteRayon));
  // « 20 produits proposés », « 20 produits proposes », « 12 produits »… :
  // on accepte le titre exact, puis n'importe quel titre parlant de produits.
  const blocProduits = section(secRayon, '20 produits proposes', /produits/);
  // Ours puts the supplier URL in the 4th column; a table that names its
  // columns otherwise is read by header names.
  const entete = tableaux(blocProduits)[0];
  const produits = entete && !/url/.test(entete.entetes[3] || '') ? tableauProduitsParEntetes(blocProduits, texteRayon) : tableauProduits(blocProduits);

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
        titre: fmM.titre || titreDuTexte(tm) || titre,
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
    ...(p.ventes ? { sales: p.ventes } : {}),
    ...(p.score != null ? { score: p.score } : {}),
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

  const ecrire = (db, majLe = null) => {
    // --- le rapport RAYON : l'analyse et les produits
    db.prepare(
      `INSERT INTO reports (id, type, date, categorie, theme, titre, agent, sources, data, updated_at)
       VALUES (?, 'rayon', ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
       ON CONFLICT(id) DO UPDATE SET titre=excluded.titre, agent=excluded.agent,
         sources=excluded.sources, data=excluded.data,
         updated_at=CASE WHEN ? IS NOT NULL THEN excluded.updated_at WHEN reports.data IS excluded.data AND reports.titre IS excluded.titre THEN reports.updated_at ELSE CURRENT_TIMESTAMP END`
    ).run(idRayon, date, categorie, theme, titre, agent, nbSources, dataRayon, majLe, majLe);

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
         roi_pct, report_date, categorie, theme, rank, is_product, url_type,
         verdict, image_url, score_global)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
               ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`
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
        p.typeUrl,
        p.verdict || null,
        p.image || null,
        p.score != null ? p.score : null
      );
    });

    // --- le rapport MARKETING : les routes de lecture le cherchent par type
    if (dataMarketing) {
      db.prepare(
        `INSERT INTO reports (id, type, date, categorie, theme, titre, agent, sources, data, updated_at)
         VALUES (?, 'marketing', ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
         ON CONFLICT(id) DO UPDATE SET titre=excluded.titre, agent=excluded.agent,
           sources=excluded.sources, data=excluded.data,
         updated_at=CASE WHEN ? IS NOT NULL THEN excluded.updated_at WHEN reports.data IS excluded.data AND reports.titre IS excluded.titre THEN reports.updated_at ELSE CURRENT_TIMESTAMP END`
      ).run(idMkt, date, categorie, theme, mkt.titre, mkt.agent, mkt.sources, dataMarketing, majLe, majLe);

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
    avecScore: produits.filter((p) => p.score != null).length,
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
      reason: [verdictCellule(p.decision), p.problem_solved, p.target_customer].filter(Boolean).join(' · ') || '—',
      recommendedUrl: '-',
      rank: p.rank || i + 1,
      ...(ventesDe(p) ? { sales: ventesDe(p) } : {}),
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

  const ecrire = (db, majLe = null) => {
    // --- le rapport RAYON : l'analyse et les 20 produits
    db.prepare(
      `INSERT INTO reports (id, type, date, categorie, theme, titre, agent, sources, data, updated_at)
       VALUES (?, 'rayon', ?, ?, ?, ?, 'marketspy', ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
       ON CONFLICT(id) DO UPDATE SET titre=excluded.titre, sources=excluded.sources,
         data=excluded.data,
         updated_at=CASE WHEN ? IS NOT NULL THEN excluded.updated_at WHEN reports.data IS excluded.data AND reports.titre IS excluded.titre THEN reports.updated_at ELSE CURRENT_TIMESTAMP END`
    ).run(idRayon, date, categorie, theme, titre, nbSources, dataRayon, majLe, majLe);

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
      const pourquoi = [verdictCellule(p.decision), p.problem_solved, p.target_customer]
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
        verdictCellule(p.decision) || null,
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
       VALUES (?, 'marketing', ?, ?, ?, ?, 'marketspy', ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
       ON CONFLICT(id) DO UPDATE SET titre=excluded.titre, sources=excluded.sources,
         data=excluded.data,
         updated_at=CASE WHEN ? IS NOT NULL THEN excluded.updated_at WHEN reports.data IS excluded.data AND reports.titre IS excluded.titre THEN reports.updated_at ELSE CURRENT_TIMESTAMP END`
    ).run(idMkt, date, categorie, theme, titre, nbSources, dataMarketing, majLe, majLe);

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
    // majLe: when a replayed study was imported. A replay dates the row by it, changed data or not:
    // a reader fix that only adds fields nobody sees in public must not redate the page (12/10/2026).
    etude.ecrire(db, etude.majLe || null);
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
  indicesDuChemin,
  etudeAiMarket,
  ecrireEtude,
  verdictFr,
  puces,
};
