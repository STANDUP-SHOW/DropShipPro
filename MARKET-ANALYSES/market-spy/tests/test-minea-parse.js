const fs=require('fs'),os=require('os');const body=fs.readFileSync('minea_parse.js','utf8');
const ad=t=>({kind:'ad',parts:t.split(' | '),url:t.match(/https?:\S+/)[0]});
const raw={ok:true,loggedIn:true,top10:{ads:[ad("Hears | 518 annonces actives | / 7.7k | 1d Active | 03 Oct 2026 | Aujourd'hui | EU | 16 | 0.1 | - | Lien de l'annonce | https://hears.com/p | Analyse de l'annonce")],products:[{kind:'product',parts:"Mistly+ | מכשיר אדים | Publié le 26 mai 2026 | $81.2 | mistlycare.com | Annonces | 52 actifs | / | 52 annonces totales".split(' | '),url:'https://mistlycare.com/products/mistly-plus'}],shops:[]},
search:[{section:'meta_ads',keyword:'chargeur',cards:[ad("Sueean | 257 annonces actives | / 9.2k | 3d Active | 30 Sep 2026 | Aujourd'hui | EU | 15 | 0.1 | Impr. faibles | 1 | Lien de l'annonce | https://sueean.com/p | Analyse de l'annonce")]}],competitors:[],warnings:[]};
const $=()=>({first:()=>({json:{rayon:'TELEPHONIE',sous_theme:'x',date_run:'04-10-26',date_prev:'03-10-26'}})});
const r=new Function('$','$input','$env','require',body)($,{first:()=>({json:raw})},{MARKET_ANALYSES_DIR:os.tmpdir()+'/mb'},require)[0].json;
console.log(JSON.stringify({ads:r.ads.map(a=>[a.boutique,a.annonces_actives,a.annonces_total,a.jours_actifs,a.zone,a.audience,a.engagement,a.commentaires,a.impressions_faibles,a.keyword||'']),prod:r.products}));
