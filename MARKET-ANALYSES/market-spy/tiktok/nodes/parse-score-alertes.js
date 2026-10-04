// n8n Code node « Parse, score & alertes » — extrait de tiktok-spy-n8n-workflow.json (référence / revue)
// Normalisation + scoring + alertes + croisement Minea/Dropship + archivage
const fs = require('fs'); const path = require('path');
const c = $input.first().json; const dir = $env.MARKET_ANALYSES_DIR || './MARKET-ANALYSES'; fs.mkdirSync(dir, { recursive: true });
const reachMin = r => { if (r == null) return null; const s = typeof r === 'object' ? (r.unique_users_seen || r.reach || JSON.stringify(r)) : String(r);
  const m = String(s).replace(/,/g, '').match(/([\d.]+)\s*([KkMm]?)/); if (!m) return null; return Math.round(parseFloat(m[1]) * (/k/i.test(m[2]) ? 1e3 : /m/i.test(m[2]) ? 1e6 : 1)); };
const ymdToDate = s => s ? new Date(`${String(s).slice(0,4)}-${String(s).slice(4,6)}-${String(s).slice(6,8)}`) : null;
const seen = new Set();
const ads = (c.tiktok_ads_raw || []).filter(x => { const id = x.ad?.id; if (!id || seen.has(id)) return false; seen.add(id); return true; }).map(x => {
  const first = ymdToDate(x.ad?.first_shown_date), last = ymdToDate(x.ad?.last_shown_date);
  const jours = first && last ? Math.max(1, Math.round((last - first) / 86400000)) : null;
  const reach = reachMin(x.ad?.reach);
  return { id: x.ad.id, keyword: x.keyword, annonceur: x.advertiser?.business_name, annonceur_id: x.advertiser?.business_id, paye_par: x.advertiser?.paid_for_by,
    statut: x.ad?.status, debut: x.ad?.first_shown_date, fin: x.ad?.last_shown_date, jours_diffusion: jours, reach_brut: x.ad?.reach, reach_min: reach,
    videos: (x.ad?.videos || []).map(v => v.url || v.cover_image_url || v).slice(0, 3), images: (x.ad?.image_urls || []).slice(0, 3),
    score_tiktok: Math.min(20, Math.round(Math.min(8, (jours || 0) / 4) + Math.min(10, (reach || 0) / 100000) + (x.ad?.status === 'ACTIVE' ? 2 : 0))) };
});
// annonceurs : regroupement (un annonceur avec beaucoup de pubs actives = produit qui scale)
const byAdv = {}; for (const a of ads) { const k = a.annonceur || '?'; (byAdv[k] = byAdv[k] || { annonceur: k, nb_pubs: 0, reach_total: 0, keywords: new Set() });
  byAdv[k].nb_pubs++; byAdv[k].reach_total += a.reach_min || 0; byAdv[k].keywords.add(a.keyword); }
const advertisers = Object.values(byAdv).map(v => ({ ...v, keywords: [...v.keywords] })).sort((a, b) => b.nb_pubs - a.nb_pubs);

// alertes vs J-1
let prev = {}; try { prev = JSON.parse(fs.readFileSync(path.join(dir, `${c.rayon}-${c.date_prev}-TIKTOK.json`), 'utf8')); } catch (e) {}
const prevAdv = Object.fromEntries((prev.advertisers || []).map(a => [a.annonceur, a]));
const alerts = [];
for (const a of advertisers) { const p = prevAdv[a.annonceur];
  if (!p && a.nb_pubs >= 3) alerts.push({ type: 'NOUVEAU CONCURRENT TIKTOK', annonceur: a.annonceur, nb_pubs: a.nb_pubs });
  else if (p && a.nb_pubs >= p.nb_pubs * 1.5 && a.nb_pubs >= 3) alerts.push({ type: 'BREAKOUT TIKTOK', annonceur: a.annonceur, de: p.nb_pubs, a: a.nb_pubs }); }

// croisement 3 sources (noms d'annonceurs / boutiques Minea et Dropship du jour)
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const mineaN = new Set(), dsN = new Set();
try { const m = JSON.parse(fs.readFileSync(path.join(dir, `${c.rayon}-${c.date_run}-MINEA.json`), 'utf8')); (m.ads || []).forEach(a => mineaN.add(norm(a.boutique))); } catch (e) {}
try { const d = JSON.parse(fs.readFileSync(path.join(dir, `${c.rayon}-${c.date_run}-DROPSHIP.json`), 'utf8'));
  (d.rayon?.fb_ads || []).forEach(a => dsN.add(norm(a.annonceur))); (d.rayon?.tiktok_products || []).forEach(p => dsN.add(norm(p.boutique))); } catch (e) {}
for (const a of advertisers) { const n = norm(a.annonceur); const src = ['TikTok', mineaN.has(n) && 'Minea', dsN.has(n) && 'dropship.io'].filter(Boolean);
  if (src.length >= 2) alerts.push({ type: `VALIDÉ ${src.length} SOURCES`, annonceur: a.annonceur, sources: src }); }

const out = { source: 'tiktok-commercial-content-api', rayon_nom: c.rayon, sous_theme: c.sous_theme, mots_cles: c.keywords, pays: c.country,
  date_run: c.date_run, periode: c.range, ads, advertisers, alerts, warnings: c.warnings, scrapedAt: new Date().toISOString() };
const file = path.join(dir, `${c.rayon}-${c.date_run}-TIKTOK.json`); fs.writeFileSync(file, JSON.stringify(out, null, 2));
return [{ json: { file, rayon_nom: c.rayon, sous_theme: c.sous_theme, date_run: c.date_run, alerts, warnings: c.warnings,
  top_ads: [...ads].sort((a, b) => b.score_tiktok - a.score_tiktok).slice(0, 20), advertisers: advertisers.slice(0, 15) } }];
