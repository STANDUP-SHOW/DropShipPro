// n8n Code node « Meta Ad Library API » — extrait de meta-spy-n8n-workflow.json (référence / revue)
// Meta Ad Library API — GET https://graph.facebook.com/{version}/ads_archive (pubs diffusées dans l'UE : ad_type=ALL)
const c = $input.first().json;
const V = $env.META_API_VERSION || 'v23.0';
const TOKEN = $env.META_ADLIB_TOKEN;                      // token utilisateur long-lived d'un compte vérifié (identité Meta)
const MAX_PAGES = Number($env.META_MAX_PAGES_PER_KEYWORD || 4), LIMIT = Number($env.META_PAGE_SIZE || 50);
const FULL = 'id,ad_creation_time,ad_delivery_start_time,ad_delivery_stop_time,ad_creative_bodies,ad_creative_link_titles,ad_creative_link_captions,ad_creative_link_descriptions,ad_snapshot_url,page_id,page_name,publisher_platforms,languages,eu_total_reach,target_ages,target_gender,target_locations,beneficiary_payers';
const MIN = 'id,ad_delivery_start_time,ad_creative_bodies,ad_creative_link_titles,ad_creative_link_captions,ad_snapshot_url,page_id,page_name,publisher_platforms,eu_total_reach';
let fields = FULL; const ads = [], warnings = [];
const qs = o => Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(typeof v === 'string' ? v : JSON.stringify(v))}`).join('&');
for (const kw of c.keywords) {
  let url = `https://graph.facebook.com/${V}/ads_archive?` + qs({ access_token: TOKEN, search_terms: kw, ad_type: 'ALL', ad_active_status: 'ACTIVE',
    ad_reached_countries: c.countries, ad_delivery_date_min: c.since, fields, limit: String(LIMIT) });
  for (let p = 0; p < MAX_PAGES && url; p++) {
    let r;
    try { r = await this.helpers.httpRequest({ method: 'GET', url, json: true }); }
    catch (e) {
      const msg = String(e.description || e.message || e).slice(0, 200);
      if (fields === FULL && /field|param/i.test(msg)) { fields = MIN; warnings.push('Champs réduits (refus API) : ' + msg); p--; 
        url = url.replace(/fields=[^&]+/, 'fields=' + encodeURIComponent(MIN)); continue; }
      warnings.push(`${kw} p${p} : ${msg}`); break;
    }
    for (const a of (r.data || [])) ads.push({ ...a, keyword: kw });
    url = r.paging?.next || null;
    await new Promise(res => setTimeout(res, 1500));
  }
}
return [{ json: { ...c, meta_ads_raw: ads, warnings } }];
