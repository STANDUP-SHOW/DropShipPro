// n8n Code node « TikTok Commercial Content API » — extrait de tiktok-spy-n8n-workflow.json (référence / revue)
// Commercial Content API (registre officiel des pubs TikTok diffusées dans l'UE — DSA)
// Doc : POST https://open.tiktokapis.com/v2/research/adlib/ad/query/   scope research.adlib.basic   10 résultats / requête
const cfg = $input.first().json;
const MAX_PAGES = Number($env.TIKTOK_MAX_PAGES_PER_KEYWORD || 5);           // 5 x 10 = 50 pubs / mot-clé
const tok = await this.helpers.httpRequest({ method: 'POST', url: 'https://open.tiktokapis.com/v2/oauth/token/',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: `client_key=${encodeURIComponent($env.TIKTOK_CLIENT_KEY)}&client_secret=${encodeURIComponent($env.TIKTOK_CLIENT_SECRET)}&grant_type=client_credentials` });
const token = tok.access_token; if (!token) throw new Error('Token TikTok refusé : ' + JSON.stringify(tok).slice(0, 300));
const FIELDS = 'ad.id,ad.first_shown_date,ad.last_shown_date,ad.status,ad.videos,ad.image_urls,ad.reach,advertiser.business_id,advertiser.business_name,advertiser.paid_for_by';
const ads = []; const warnings = [];
for (const kw of cfg.keywords) {
  let search_id, page = 0, more = true;
  while (more && page < MAX_PAGES) {
    const body = { filters: { ad_published_date_range: cfg.range, country_code: cfg.country, ad_status: 'ACTIVE' },
                   search_term: kw.slice(0, 50), search_type: 'fuzzy_phrase', max_count: 10 };
    if (search_id) body.search_id = search_id;
    let r;
    try { r = await this.helpers.httpRequest({ method: 'POST', url: `https://open.tiktokapis.com/v2/research/adlib/ad/query/?fields=${FIELDS}`,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body, json: true }); }
    catch (e) { warnings.push(`${kw} p${page} : ${String(e.message || e).slice(0, 150)}`); break; }
    if (r.error && r.error.code && r.error.code !== 'ok') { warnings.push(`${kw} : ${r.error.code} ${r.error.message || ''}`); break; }
    for (const x of (r.data?.ads || [])) ads.push({ ...x, keyword: kw });
    more = !!r.data?.has_more; search_id = r.data?.search_id; page++;
    await new Promise(res => setTimeout(res, 1200));
  }
}
return [{ json: { ...cfg, tiktok_ads_raw: ads, warnings } }];
