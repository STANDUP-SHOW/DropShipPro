// Normalisation par module + filtrage rayon + scoring + alertes + croisement Minea + archivage
const fs = require('fs'); const path = require('path');
const cfg = $('Config du jour').first().json;
const raw = $input.first().json;
if (!raw.ok) throw new Error('Dropship : ' + (raw.error || 'échec'));
const dir = $env.MARKET_ANALYSES_DIR || './MARKET-ANALYSES'; fs.mkdirSync(dir, { recursive: true });

const inRayon = (...cats) => cats.filter(Boolean).some(c => cfg.categories.some(k => String(c).toLowerCase().includes(k)));
const kwHit = (t) => cfg.keywords.some(k => String(t || '').toLowerCase().includes(k.toLowerCase().split(' ')[0]));
const media = (o) => { const out = []; JSON.stringify(o || {}, (k, v) => { if (typeof v === 'string' && /^https?:\/\/.+\.(jpe?g|png|webp|mp4)(\?|$)/i.test(v)) out.push(v); return v; }); return [...new Set(out)].slice(0, 6); };
const host = (u) => { try { return new URL(u.startsWith('http') ? u : 'https://' + u).hostname.replace(/^www\./, ''); } catch { return null; } };

const N = { tiktok_products: [], tiktok_shops: [], creators: [], fb_ads: [], advertisers: [], shopify_products: [], tracked_shops: [], tracked_advertisers: [], portfolio: [] };
for (const c of raw.captures || []) {
  const rows = Array.isArray(c.body) ? c.body : (c.body.results || []);
  const a = c.api;
  for (const r of rows) {
    if (/tiktok_shops\/search/.test(a)) N.tiktok_products.push({ id: r.product_id, titre: r.title, url: r.url, image: r.image,
      prix_usd: r.usd_price, ventes_30j: r.monthly_sales, ca_30j_usd: r.monthly_revenue, croissance_30j: r.revenue_growth_rate_30d,
      categorie: r.category_name, pays: r.country?.code, lance_le: r.publish_date, note: r.rating, avis: r.review_count, videos: r.videos_count,
      boutique: r.shop?.name, livraison_gratuite: r.shipping?.[0]?.is_free ?? null, delai_jours: r.shipping?.[0]?.delivery_days_duration ?? null });
    else if (/tiktok_shops\/shops\/search/.test(a)) N.tiktok_shops.push({ id: r.seller_id, nom: r.name, url: r.url, ca_30j_usd: r.monthly_revenue,
      ventes_30j: r.monthly_sales, croissance_30j: r.revenue_growth_rate_30d, nb_produits: r.products_count, prix_moyen: r.avg_product_price,
      pays: r.country?.code, categories: r.categories, top_produits: (r.top_products || []).map(p => ({ titre: p.title, url: p.url, ca_30j_usd: p.monthly_revenue, ventes_30j: p.monthly_sales })) });
    else if (/tiktok_creators\/search/.test(a)) { const m = r.monthly_creator_metrics || {}; N.creators.push({ id: r.creator_id, nom: r.name, username: r.username,
      ca_30j_usd: m.revenue, ventes_30j: m.sales, croissance: m.revenue_growth_rate, vues_30j: m.video_views, engagement: m.engagement_rate,
      abonnes: r.creator_metrics?.follower_count, nb_produits: r.products_count,
      top_videos: (r.top_viewed_videos || []).map(v => ({ id: v.video_id, cover: v.video_cover_image_url, description: (v.video_description || '').slice(0, 200) })) }); }
    else if (/ad_library\/ads\/search/.test(a)) { const s = r.snapshot || {}; N.fb_ads.push({ id: r.collation_id, annonceur: r.advertiser?.page_name,
      annonces_actives_page: r.advertiser?.active_ads_count, depense_usd: r.ad_spend, adsets: r.ad_sets_count, reach: r.total_reaches_count,
      format: r.creative_type, cree_le: r.created_at, vue_le: r.last_seen_date, active: r.is_active, eu: r.is_eu_targeted, langue: r.language,
      domaine: (r.domain_fld || [])[0] || host(s.link_url || ''), lien: s.link_url, titre: s.title, texte: (s.body?.text || s.body || '').toString().slice(0, 400),
      cta: s.cta_text, creatives: media(s) }); }
    else if (/advertisers_library\/search/.test(a)) N.advertisers.push({ id: r.id, nom: r.name, categorie: r.page_category, domaines: r.domains,
      depense_30j_usd: r.monthly_spend, reach_30j: r.monthly_reach, croissance_depense: r.ad_spend_growth_rate_30d, depense_totale_usd: r.total_ads_spend,
      adsets_eu_actifs: r.total_eu_active_adsets_count, pays: (r.targeted_countries || []).map(x => x.code), derniere_pub: r.last_ad_date, pct_non_shopify: r.percent_non_shopify });
    else if (/product_database\/.*competitors\/search/.test(a)) { const st = r.store || {}; const dom = st.custom_domain || st.best_ranked_domain || st.original_domain;
      N.shopify_products.push({ id: r.id, titre: r.title, prix_usd: r.usd_price, categorie: r.category, sous_categorie: r.subcategory_short_name,
        cree_le: r.created_at, image: r.main_image, domaine: dom, boutique: st.title, nb_produits_boutique: st.products_count,
        url: dom && r.handle ? `https://${dom}/products/${r.handle}` : null }); }
    else if (/collections\/shops\/entities/.test(a)) N.tracked_shops.push(r.full_info);
    else if (/collections\/advertisers\/entities/.test(a)) N.tracked_advertisers.push(r.full_info);
    else if (/\/portfolio\//.test(a)) N.portfolio.push({ mois: r.month, annee: r.year, drops: (r.drops || []).map(x => ({ id: x.drop_id, date: x.drop_date, taille: x.drop_plan_size, a_venir: x.comming_up })) });
  }
}
// dédoublonnage par id
for (const k of Object.keys(N)) { const seen = new Set(); N[k] = N[k].filter(x => { const id = x?.id ?? JSON.stringify(x).slice(0, 80); if (seen.has(id)) return false; seen.add(id); return true; }); }

// filtrage rayon (catégorie OU mot-clé du sous-thème)
const R = {
  tiktok_products: N.tiktok_products.filter(p => inRayon(p.categorie) || kwHit(p.titre)),
  fb_ads: N.fb_ads.filter(a => kwHit(a.titre) || kwHit(a.texte) || cfg.competitorDomains.includes(a.domaine)),
  shopify_products: N.shopify_products.filter(p => inRayon(p.categorie, p.sous_categorie) || kwHit(p.titre) || cfg.competitorDomains.includes(p.domaine)),
  advertisers: N.advertisers.filter(a => inRayon(a.categorie) || (a.domaines || []).some(d => cfg.competitorDomains.includes(host(d)))),
};

// scores /20
for (const p of R.tiktok_products) p.score_ventes = Math.min(20, Math.round(Math.min(10, (p.ca_30j_usd || 0) / 5000) + Math.min(6, Math.max(0, (p.croissance_30j || 0) * 10)) + (p.videos > 0 ? 2 : 0) + ((p.note || 0) >= 4.5 ? 2 : 0)));
for (const a of R.fb_ads) a.score_pub = Math.min(20, Math.round(Math.min(10, (a.depense_usd || 0) / 2000) + Math.min(6, (a.adsets || 0) * 1.5) + (a.active ? 2 : 0) + (a.eu ? 2 : 0)));

// historique J-1 + alertes
const prevFile = path.join(dir, `${cfg.rayon}-${cfg.date_prev}-DROPSHIP.json`);
let prev = {}; try { prev = JSON.parse(fs.readFileSync(prevFile, 'utf8')); } catch (e) {}
const byId = (arr) => Object.fromEntries((arr || []).map(x => [x.id, x]));
const alerts = [];
const pp = byId(prev.rayon?.tiktok_products);
for (const p of R.tiktok_products) { const o = pp[p.id];
  if (o && o.ventes_30j && p.ventes_30j >= o.ventes_30j * 1.5) alerts.push({ type: 'BREAKOUT', source: 'tiktok', titre: p.titre, de: o.ventes_30j, a: p.ventes_30j, url: p.url });
  if (o && o.prix_usd && p.prix_usd < o.prix_usd * 0.85) alerts.push({ type: 'BAISSE DE PRIX', titre: p.titre, de: o.prix_usd, a: p.prix_usd, url: p.url });
  if ((p.croissance_30j || 0) >= 0.5) alerts.push({ type: 'FORTE CROISSANCE', titre: p.titre, croissance: p.croissance_30j, url: p.url }); }
for (const a of R.fb_ads) if ((a.depense_usd || 0) >= 10000 && a.active) alerts.push({ type: 'GROS BUDGET PUB', annonceur: a.annonceur, depense_usd: a.depense_usd, domaine: a.domaine });
// croisement Minea : même domaine trouvé par les 2 outils
const valid = [...new Set([...R.fb_ads.map(a => a.domaine), ...R.shopify_products.map(p => p.domaine)].filter(d => cfg.competitorDomains.includes(d)))];
for (const d of valid) alerts.push({ type: 'VALIDÉ 2 SOURCES', domaine: d, note: 'gagnant Minea confirmé par dropship.io' });

const out = { source: 'dropship.io', rayon_nom: cfg.rayon, sous_theme: cfg.sous_theme, mots_cles: cfg.keywords, date_run: cfg.date_run,
  plan: raw.plan, limits: raw.limits, budget: raw.budget, spent: raw.spent, credits: raw.credits, warnings: raw.warnings, alerts,
  rayon: R,      // données filtrées sur le rayon (relues au run suivant pour les alertes)
  tout: N,       // tout ce qui a été capturé, toutes catégories
  scrapedAt: raw.scrapedAt };
const file = path.join(dir, `${cfg.rayon}-${cfg.date_run}-DROPSHIP.json`);
fs.writeFileSync(file, JSON.stringify(out, null, 2));
return [{ json: { file, rayon_nom: cfg.rayon, sous_theme: cfg.sous_theme, date_run: cfg.date_run, plan: raw.plan, budget: raw.budget, spent: raw.spent, credits: raw.credits, warnings: raw.warnings, alerts,
  top: { tiktok_products: [...R.tiktok_products].sort((a, b) => (b.score_ventes || 0) - (a.score_ventes || 0)).slice(0, 20),
         fb_ads: [...R.fb_ads].sort((a, b) => (b.score_pub || 0) - (a.score_pub || 0)).slice(0, 15),
         shopify_products: R.shopify_products.slice(0, 20), advertisers: R.advertisers.slice(0, 10),
         creators: N.creators.slice(0, 10), tracked_shops: N.tracked_shops, portfolio: N.portfolio.slice(0, 1) } } }];
