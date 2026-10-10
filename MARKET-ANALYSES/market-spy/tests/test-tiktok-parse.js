const fs=require('fs'),os=require('os');const body=fs.readFileSync('tt_parse.js','utf8');
const c={rayon:'TELEPHONIE',sous_theme:'chargeurs',keywords:['chargeur'],country:'FR',date_run:'04-10-26',date_prev:'03-10-26',range:{min:'20260904',max:'20261004'},warnings:[],
tiktok_ads_raw:[{keyword:'chargeur',ad:{id:'1',first_shown_date:'20260910',last_shown_date:'20261003',status:'ACTIVE',reach:{unique_users_seen:'250K'},videos:[{url:'https://v/1.mp4'}]},advertiser:{business_name:'VaporSeguro'}},
{keyword:'chargeur',ad:{id:'2',first_shown_date:'20261001',last_shown_date:'20261003',status:'ACTIVE',reach:'10K-100K'},advertiser:{business_name:'VaporSeguro'}},
{keyword:'chargeur',ad:{id:'3',first_shown_date:'20261001',last_shown_date:'20261003',status:'ACTIVE',reach:'0-10K'},advertiser:{business_name:'VaporSeguro'}}]};
fs.mkdirSync(os.tmpdir()+'/tt',{recursive:true}); fs.writeFileSync(os.tmpdir()+'/tt/TELEPHONIE-04-10-26-MINEA.json',JSON.stringify({ads:[{boutique:'VaporSeguro'}]}));
const r=new Function('$input','$env','require',body)({first:()=>({json:c})},{MARKET_ANALYSES_DIR:os.tmpdir()+'/tt'},require)[0].json;
console.log(JSON.stringify({alerts:r.alerts,top:r.top_ads.map(a=>[a.id,a.jours_diffusion,a.reach_min,a.score_tiktok]),adv:r.advertisers}));
