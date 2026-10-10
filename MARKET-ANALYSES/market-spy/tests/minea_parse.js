// Normalisation + scoring + alertes + archivage JSON
// Nécessite NODE_FUNCTION_ALLOW_BUILTIN=fs,path et la variable MARKET_ANALYSES_DIR
const fs = require('fs'); const path = require('path');
const cfg = $('Config du jour').first().json;
const raw = $input.first().json;
if (!raw.ok) throw new Error('Minea : ' + (raw.error || 'échec scraping'));

const num = s => { if (!s || s === '-') return null; const m = String(s).replace(',', '.').match(/([\d.]+)\s*([kKmM]?)/); if (!m) return null; return Math.round(parseFloat(m[1]) * (/k/i.test(m[2]) ? 1e3 : /m/i.test(m[2]) ? 1e6 : 1) * 10) / 10; };

function parseAd(card, source) {
  const p = card.parts; const o = { source: 'minea', type: 'meta_ad', origine: source, url_produit: card.url };
  const iA = p.findIndex(x => /annonces actives/i.test(x));
  o.boutique = iA > 0 ? p[iA - 1] : p[0];
  o.annonces_actives = iA >= 0 ? num(p[iA]) : null;
  const tot = p.find(x => /^\/\s*\d+/.test(x)); o.annonces_total = tot ? num(tot.replace('/', '')) : null;
  const act = p.find(x => /\d+\s*d\s*Active/i.test(x)); o.jours_actifs = act ? parseInt(act) : null;
  o.date_debut = p.find(x => /^\d{1,2} [A-Za-z]{3} \d{4}$/.test(x)) || null;
  const zone = p.find(x => /^[A-Z]{2}$/.test(x)); o.zone = zone || null;
  o.impressions_faibles = p.some(x => /Impr\. faibles/i.test(x));
  const iL = p.findIndex(x => /Lien de l'annonce/.test(x));
  const iLast = p.findIndex(x => /Aujourd'hui|Hier|^\d{1,2} [A-Za-z]{3} \d{4}$/.test(x) && x !== o.date_debut);
  let metrics = iL > 0 ? p.slice(Math.max(iLast, iA) + 1, iL).filter(x => x !== zone && !/Impr\. faibles/i.test(x)) : [];
  while (metrics.length < 3) metrics.unshift(null);            // alignement à droite (cf. cartes partielles)
  [o.audience, o.engagement, o.commentaires] = metrics.slice(-3).map(num);
  o.analyse_raw = card.analyse_raw || null;
  return o;
}
function parseProduct(card, source) {
  const p = card.parts; const iPub = p.findIndex(x => /^Publié le/.test(x));
  const prix = p.find(x => /^[$€£]\s?[\d.,]+|[\d.,]+\s?[$€£]$/.test(x));
  const act = p.find(x => /\d+\s*actifs/.test(x)); const tot = p.find(x => /annonces totales/.test(x));
  return { source: 'minea', type: 'product', origine: source, nom: iPub > 0 ? p.slice(0, iPub).join(' — ') : p[0],
    date_publication: iPub >= 0 ? p[iPub].replace('Publié le ', '') : null,
    prix: prix ? parseFloat(prix.replace(/[^\d.,]/g, '').replace(',', '.')) : null,
    devise: prix ? (prix.match(/[$€£]/) || [null])[0] : null,
    domaine: p.find(x => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(x)) || null,
    annonces_actives: act ? parseInt(act) : null, annonces_total: tot ? parseInt(tot) : null, url: card.url };
}
const generic = (card, type, source) => ({ source: 'minea', type, origine: source, url: card.url, nom: card.parts[0], texte: card.parts.join(' | ').slice(0, 600) });

const ads = [
  ...(raw.top10.ads || []).filter(c => c.kind !== 'product').map(c => parseAd(c, 'top10')),
  ...raw.search.filter(s => s.section === 'meta_ads').flatMap(s => s.cards.filter(c => c.kind === 'ad').map(c => ({ ...parseAd(c, 'recherche'), keyword: s.keyword }))),
];
const products = [
  ...(raw.top10.products || []).map(c => c.kind === 'product' ? parseProduct(c, 'top10') : generic(c, 'product', 'top10')),
  ...raw.search.filter(s => s.section === 'products').flatMap(s => s.cards.filter(c => c.kind === 'product').map(c => ({ ...parseProduct(c, 'recherche'), keyword: s.keyword }))),
];
const shops = (raw.top10.shops || []).map(c => generic(c, 'shop', 'top10'));
const compByUrl = Object.fromEntries((raw.competitors || []).map(c => [c.url, c]));

// historique J-1
const dir = $env.MARKET_ANALYSES_DIR || './MARKET-ANALYSES';
fs.mkdirSync(dir, { recursive: true });
const prevFile = path.join(dir, `${cfg.rayon}-${cfg.date_prev}-MINEA.json`);
let prev = { ads: [] }; try { prev = JSON.parse(fs.readFileSync(prevFile, 'utf8')); } catch (e) {}
const prevByShop = Object.fromEntries((prev.ads || []).map(a => [a.boutique, a]));

const alerts = [];
for (const a of ads) {
  a.rayon = cfg.rayon; a.sous_theme = cfg.sous_theme; a.date_run = cfg.date_run;
  a.concurrent = compByUrl[a.url_produit] || null;
  a.prix_concurrent = a.concurrent?.price ?? null;
  const p = prevByShop[a.boutique];
  if (!p) { a.signal = 'nouveau'; if ((a.annonces_actives || 0) >= 10) alerts.push({ type: 'NOUVEAU CONCURRENT', boutique: a.boutique, url: a.url_produit }); }
  else if (p.annonces_actives && a.annonces_actives >= p.annonces_actives * 1.5) { a.signal = 'breakout'; alerts.push({ type: 'BREAKOUT', boutique: a.boutique, de: p.annonces_actives, a: a.annonces_actives, url: a.url_produit }); }
  else if (p.annonces_actives && a.annonces_actives < p.annonces_actives * 0.5) { a.signal = 'declin'; }
  else a.signal = 'stable';
  // score "opportunité pub" /20 pour aiMARKET
  a.score_pub = Math.min(20, Math.round(
    Math.min(8, (a.jours_actifs || 0) / 5) +           // ancienneté (40 j = 8)
    Math.min(8, (a.annonces_actives || 0) / 25) +       // intensité (200 annonces = 8)
    (a.zone === 'EU' || a.zone === 'FR' ? 4 : 0)        // marché cible
  ));
  a.gagnant = (a.jours_actifs || 0) >= 14 && (a.annonces_actives || 0) >= 10;
}
for (const p of prev.ads || []) if (!ads.find(a => a.boutique === p.boutique)) alerts.push({ type: 'PUB ARRÊTÉE', boutique: p.boutique, url: p.url_produit });

const out = { rayon: cfg.rayon, sous_theme: cfg.sous_theme, date_run: cfg.date_run, loggedIn: raw.loggedIn,
  ads, products, shops, competitors: raw.competitors, alerts, warnings: raw.warnings, scrapedAt: raw.scrapedAt };
const file = path.join(dir, `${cfg.rayon}-${cfg.date_run}-MINEA.json`);
fs.writeFileSync(file, JSON.stringify(out, null, 2));
return [{ json: { ...out, file } }];
