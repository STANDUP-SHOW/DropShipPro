const fs = require('fs'); const path = require('path');
const c = $input.first().json; const dir = $env.MARKET_ANALYSES_DIR || './MARKET-ANALYSES'; fs.mkdirSync(dir, { recursive: true });
const today = new Date();
const seen = new Set();
const ads = (c.meta_ads_raw || []).filter(a => a.id && !seen.has(a.id) && seen.add(a.id)).map(a => {
  const start = a.ad_delivery_start_time ? new Date(a.ad_delivery_start_time) : null;
  const jours = start ? Math.max(1, Math.round((today - start) / 86400000)) : null;
  const domaine = (a.ad_creative_link_captions || []).map(s => String(s).toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]).find(s => /\.[a-z]{2,}$/.test(s)) || null;
  return { id: a.id, keyword: a.keyword, page: a.page_name, page_id: a.page_id, domaine, debut: a.ad_delivery_start_time, jours_actifs: jours,
    reach_ue: a.eu_total_reach ?? null, plateformes: a.publisher_platforms, langues: a.languages,
    titre: (a.ad_creative_link_titles || [])[0] || null, texte: ((a.ad_creative_bodies || [])[0] || '').slice(0, 400),
    snapshot: a.ad_snapshot_url, cible_ages: a.target_ages, cible_genre: a.target_gender, payeur: (a.beneficiary_payers || [])[0] || null,
    score_meta: Math.min(20, Math.round(Math.min(8, (jours || 0) / 5) + Math.min(10, (a.eu_total_reach || 0) / 50000) + ((a.publisher_platforms || []).length >= 2 ? 2 : 0))) };
});
const byPage = {}; for (const a of ads) { const k = a.page || '?'; const v = (byPage[k] = byPage[k] || { page: k, domaine: a.domaine, nb_pubs: 0, reach_ue: 0, keywords: new Set() });
  v.nb_pubs++; v.reach_ue += a.reach_ue || 0; v.keywords.add(a.keyword); v.domaine = v.domaine || a.domaine; }
const pages = Object.values(byPage).map(v => ({ ...v, keywords: [...v.keywords] })).sort((a, b) => b.nb_pubs - a.nb_pubs);

let prev = {}; try { prev = JSON.parse(fs.readFileSync(path.join(dir, `${c.rayon}-${c.date_prev}-META.json`), 'utf8')); } catch (e) {}
const prevP = Object.fromEntries((prev.pages || []).map(p => [p.page, p]));
const alerts = [];
for (const p of pages) { const o = prevP[p.page];
  if (!o && p.nb_pubs >= 5) alerts.push({ type: 'NOUVEAU CONCURRENT META', page: p.page, domaine: p.domaine, nb_pubs: p.nb_pubs });
  else if (o && p.nb_pubs >= o.nb_pubs * 1.5 && p.nb_pubs >= 5) alerts.push({ type: 'BREAKOUT META', page: p.page, de: o.nb_pubs, a: p.nb_pubs }); }
const norm = s => String(s || '').toLowerCase().replace(/^www\./, '').replace(/[^a-z0-9.]/g, '');
const src = { Minea: new Set(), 'dropship.io': new Set(), TikTok: new Set() };
const rd = f => { try { return JSON.parse(fs.readFileSync(path.join(dir, `${c.rayon}-${c.date_run}-${f}.json`), 'utf8')); } catch (e) { return null; } };
const m = rd('MINEA'); (m?.ads || []).forEach(a => { src.Minea.add(norm(a.boutique)); try { src.Minea.add(norm(new URL(a.url_produit).hostname)); } catch (e) {} });
const ds = rd('DROPSHIP'); (ds?.rayon?.fb_ads || []).forEach(a => { src['dropship.io'].add(norm(a.annonceur)); src['dropship.io'].add(norm(a.domaine)); });
const tt = rd('TIKTOK'); (tt?.advertisers || []).forEach(a => src.TikTok.add(norm(a.annonceur)));
for (const p of pages) { const keys = [norm(p.page), norm(p.domaine)].filter(Boolean);
  const hits = ['Meta', ...Object.keys(src).filter(s => keys.some(k => src[s].has(k)))];
  if (hits.length >= 2) alerts.push({ type: `VALIDÉ ${hits.length} SOURCES`, page: p.page, domaine: p.domaine, sources: hits }); }

const out = { source: 'meta-ad-library-api', rayon_nom: c.rayon, sous_theme: c.sous_theme, mots_cles: c.keywords, pays: c.countries,
  date_run: c.date_run, ads, pages, alerts, warnings: c.warnings, scrapedAt: new Date().toISOString() };
fs.writeFileSync(path.join(dir, `${c.rayon}-${c.date_run}-META.json`), JSON.stringify(out, null, 2));
return [{ json: { rayon_nom: c.rayon, sous_theme: c.sous_theme, date_run: c.date_run, alerts, warnings: c.warnings,
  top_ads: [...ads].sort((a, b) => b.score_meta - a.score_meta).slice(0, 20), pages: pages.slice(0, 15) } }];
