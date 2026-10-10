const fs=require('fs'),os=require('os');const body=fs.readFileSync('meta_parse.js','utf8');const dir=os.tmpdir()+'/mt';fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(dir+'/TELEPHONIE-04-10-26-MINEA.json',JSON.stringify({ads:[{boutique:'VaporSeguro',url_produit:'https://vaporseguro.com/p'}]}));
fs.writeFileSync(dir+'/TELEPHONIE-04-10-26-TIKTOK.json',JSON.stringify({advertisers:[{annonceur:'VaporSeguro'}]}));
const ad=(i,p,cap,r)=>({id:String(i),keyword:'chargeur',page_name:p,ad_delivery_start_time:'2026-09-10',eu_total_reach:r,publisher_platforms:['FACEBOOK','INSTAGRAM'],ad_creative_link_captions:[cap],ad_creative_bodies:['Le chargeur ultra rapide'],ad_snapshot_url:'https://fb/x'});
const c={rayon:'TELEPHONIE',sous_theme:'chargeurs',keywords:['chargeur'],countries:['FR'],date_run:'04-10-26',date_prev:'03-10-26',warnings:[],meta_ads_raw:[1,2,3,4,5].map(i=>ad(i,'VaporSeguro','VAPORSEGURO.COM',120000)).concat([ad(9,'Autre','autre.fr',1000)])};
const r=new Function('$input','$env','require',body)({first:()=>({json:c})},{MARKET_ANALYSES_DIR:dir},require)[0].json;
console.log(JSON.stringify({alerts:r.alerts,top:r.top_ads.slice(0,2).map(a=>[a.page,a.domaine,a.jours_actifs,a.score_meta])}));
