/**
 * /outils/ — six outils gratuits, sans compte (chantier SEO du 07/10/2026,
 * d'après l'audit de dropship.io : leurs calculateurs et leur détecteur de
 * thème sont des « aimants à liens »).
 *
 * Chaque page est statique : le calcul tourne dans le navigateur, en
 * JavaScript sans dépendance, donc la page s'ouvre vite et un robot lit le
 * texte entier. Un seul outil appelle le serveur : le détecteur de thème
 * Shopify (GET /api/outils/theme-shopify, backend/src/routes/outilsPublics.ts),
 * parce qu'un navigateur ne peut pas lire la page d'une autre boutique.
 * Le générateur de titre n'appelle aucune IA : il compose le titre à partir de
 * ce que vous saisissez et le coupe à la limite de chaque destination
 * (TITRE_MAX de backend/src/services/channelRules.ts).
 *
 * Appelé par build-geo.cjs, qui écrit les pages et les ajoute au sitemap.
 */
const { layout, esc, faqLd, faqHtml, breadcrumbLd, crumb, SITE } = require('./build-seo.cjs')

/** Recopie de TITRE_MAX (backend/src/services/channelRules.ts) — un chiffre changé là-bas se change ici. */
const LIMITES_TITRE = [
  ['Leboncoin', 50],
  ['Vinted', 70],
  ['eBay', 80],
  ['Kaufland', 80],
  ['Facebook Marketplace', 100],
  ['La Redoute', 120],
  ['Cdiscount', 132],
  ['Etsy', 140],
  ['Google Shopping', 150],
  ['Amazon', 200],
]

const CSS_OUTIL = `<style>
.outil{border:1px solid #ffffff1f;background:#ffffff0a;border-radius:1rem;padding:1.1rem 1.25rem;margin:1.25rem 0}
.outil .champs{display:grid;gap:.8rem;grid-template-columns:repeat(auto-fill,minmax(14rem,1fr))}
.outil label{display:block;font-size:.85rem;color:#cfc9e8;font-weight:600}
.outil label small{font-weight:400;color:#9d95c0}
.outil input,.outil select{display:block;width:100%;margin-top:.3rem;padding:.6rem .7rem;border-radius:.6rem;border:1px solid #ffffff26;background:#140f28;color:#e9e6f5;font:inherit;font-size:1rem}
.outil input:focus,.outil select:focus{outline:2px solid #e85290;outline-offset:1px}
.outil button{margin-top:1rem;border:0;cursor:pointer;background:linear-gradient(90deg,#f28a4b,#e85290);color:#fff;font:inherit;font-weight:600;padding:.7rem 1.15rem;border-radius:.75rem}
.resultat{margin-top:1rem;display:grid;gap:.6rem;grid-template-columns:repeat(auto-fill,minmax(11rem,1fr))}
.resultat .val{border:1px solid #ffffff1a;background:#ffffff08;border-radius:.75rem;padding:.7rem .85rem}
.resultat .val b{display:block;font-size:1.35rem;color:#fff}
.resultat .val span{font-size:.8rem;color:#9d95c0}
.verdict{margin-top:.9rem;font-size:.95rem}
.ok{color:#6ee7b7}.ko{color:#fca5a5}
.barre{display:flex;height:1.6rem;border-radius:.5rem;overflow:hidden;margin-top:.9rem}
.barre i{display:block;height:100%}
.legende{display:flex;flex-wrap:wrap;gap:.4rem .9rem;font-size:.8rem;color:#cfc9e8;margin-top:.5rem}
.legende span::before{content:"";display:inline-block;width:.7rem;height:.7rem;border-radius:.2rem;margin-right:.3rem;background:var(--c);vertical-align:-.05rem}
.titres{margin-top:1rem}
.titres .ligne{border-top:1px solid #ffffff12;padding:.6rem 0}
.titres .ligne b{color:#c4b5fd;font-size:.85rem}
.titres .ligne p{margin:.2rem 0;color:#fff;word-break:break-word}
.titres .ligne small{color:#9d95c0}
.lien-outils{display:grid;gap:.6rem;grid-template-columns:repeat(auto-fill,minmax(15rem,1fr));margin:1rem 0}
.lien-outils a{display:block;border:1px solid #ffffff1a;background:#ffffff0d;border-radius:.75rem;padding:.8rem .9rem;text-decoration:none;color:#e9e6f5}
.lien-outils a b{display:block;color:#fff}
.lien-outils a small{color:#9d95c0}
</style>`

/** Fonctions partagées des calculateurs : lecture d'un nombre « 12,50 », affichage en euros. */
const JS_COMMUN = `
function n(id){var v=document.getElementById(id).value;if(v===undefined||v===null)return NaN;v=String(v).replace(/\\s/g,'').replace(',','.');return v===''?NaN:parseFloat(v)}
function z(id){var x=n(id);return isNaN(x)?0:x}
function eur(x){return isFinite(x)?x.toLocaleString('fr-FR',{style:'currency',currency:'EUR'}):'—'}
function pct(x){return isFinite(x)?x.toLocaleString('fr-FR',{maximumFractionDigits:1})+' %':'—'}
function nb(x,d){return isFinite(x)?x.toLocaleString('fr-FR',{maximumFractionDigits:d==null?2:d}):'—'}
function val(t,l){return '<div class="val"><b>'+t+'</b><span>'+l+'</span></div>'}
`

const OUTILS = [
  {
    slug: 'calculateur-marge',
    nom: 'Calculateur de marge',
    court: 'Marge nette, taux de marge et taux de marque d’un produit en dropshipping, TVA et commissions comprises.',
    title: 'Calculateur de marge dropshipping gratuit (TVA incluse)',
    description:
      "Calculez la marge nette d'un produit en dropshipping : prix d'achat, port, commission de la place de marché, publicité et TVA. Gratuit, sans compte.",
    h1: 'Calculateur de marge en dropshipping',
    enBref:
      "Ce calculateur de marge gratuit donne, pour un produit vendu en dropshipping, la marge nette en euros après TVA, frais de port, commission de la place de marché et publicité, ainsi que le taux de marge, le taux de marque et le coefficient multiplicateur. Sans compte, rien n'est envoyé : le calcul se fait dans votre navigateur.",
    outil: `<form class="outil" id="f" onsubmit="return false">
<div class="champs">
<label>Prix de vente TTC (€)<input id="pv" inputmode="decimal" placeholder="29,90" value="29,90"></label>
<label>Prix d'achat du produit (€)<input id="pa" inputmode="decimal" placeholder="8,50" value="8,50"></label>
<label>Frais de port payés au fournisseur (€)<input id="port" inputmode="decimal" value="3,00"></label>
<label>Commission de la place de marché <small>(% du TTC)</small><input id="com" inputmode="decimal" value="15"></label>
<label>Frais de paiement <small>(% du TTC)</small><input id="fp" inputmode="decimal" value="1,5"></label>
<label>Publicité par vente (€)<input id="pub" inputmode="decimal" value="4,00"></label>
<label>TVA<select id="tva"><option value="20">20 % (taux normal)</option><option value="10">10 %</option><option value="5.5">5,5 %</option><option value="0">0 % (franchise en base)</option></select></label>
</div>
<button type="button" onclick="calc()">Calculer la marge</button>
<div class="resultat" id="r" aria-live="polite"></div>
<div id="b"></div>
</form>`,
    js: `function calc(){var pv=z('pv'),tva=z('tva')/100,ht=pv/(1+tva),pa=z('pa'),port=z('port'),com=pv*z('com')/100,fp=pv*z('fp')/100,pub=z('pub');
var couts=pa+port+com+fp+pub,marge=ht-couts,tvaE=pv-ht;
var r=document.getElementById('r');
if(!(pv>0)){r.innerHTML='<p class="ko">Saisissez un prix de vente.</p>';return}
r.innerHTML=val(eur(marge),'marge nette par vente')+val(pct(marge/ht*100),'taux de marque (sur le prix HT)')+val(pa+port>0?pct(marge/(pa+port)*100):'—','taux de marge (sur le coût d’achat)')+val(pa+port>0?nb(pv/(pa+port)):'—','coefficient multiplicateur')+val(eur(couts),'coûts par vente')+val(eur(tvaE),'TVA reversée');
var parts=[['TVA',tvaE,'#7c6fb0'],['Produit',pa,'#f28a4b'],['Port',port,'#fbbf24'],['Commission',com,'#e85290'],['Paiement',fp,'#a78bfa'],['Publicité',pub,'#60a5fa'],['Marge',Math.max(marge,0),'#34d399']];
var t=parts.reduce(function(s,p){return s+Math.max(p[1],0)},0)||1;
document.getElementById('b').innerHTML='<div class="barre">'+parts.map(function(p){return '<i style="width:'+(Math.max(p[1],0)/t*100)+'%;background:'+p[2]+'" title="'+p[0]+'"></i>'}).join('')+'</div><div class="legende">'+parts.map(function(p){return '<span style="--c:'+p[2]+'">'+p[0]+' '+eur(p[1])+'</span>'}).join('')+'</div><p class="verdict '+(marge>0?'ok':'ko')+'">'+(marge>0?'Ce produit est rentable à ce prix : il vous reste '+eur(marge)+' par vente.':'À ce prix, chaque vente vous coûte '+eur(-marge)+'. Montez le prix ou baissez le coût d’acquisition.')+'</p>'}
calc()`,
    texte: `<h2>Comment la marge est calculée</h2>
<p>La marge nette est ce qui reste de votre prix de vente une fois tout payé. Le calculateur part du prix TTC affiché à l'acheteur, en retire la TVA pour obtenir le prix hors taxes — la seule partie qui vous revient —, puis soustrait le coût d'achat du produit, les frais de port payés au fournisseur, la commission de la place de marché, les frais de paiement et la publicité dépensée pour obtenir la vente.</p>
<p>La commission des places de marché et les frais de paiement se calculent sur le prix TTC payé par l'acheteur : c'est ainsi que la plupart des plateformes les prélèvent. Si votre place de marché facture autrement, ajustez le pourcentage.</p>
<h2>Taux de marge, taux de marque, coefficient : trois chiffres différents</h2>
<ul>
<li><strong>Le taux de marque</strong> rapporte la marge au prix de vente hors taxes. C'est le chiffre qui dit quelle part de chaque euro encaissé vous reste.</li>
<li><strong>Le taux de marge</strong> rapporte la marge au coût d'achat (produit et port). Un taux de marge de 100 % signifie que vous gagnez autant que le produit vous coûte.</li>
<li><strong>Le coefficient multiplicateur</strong> divise le prix TTC par le coût d'achat. En dropshipping, un coefficient inférieur à 2,5 laisse rarement assez de place pour la publicité.</li>
</ul>
<h2>Les coûts qu'on oublie</h2>
<p>La plupart des marges annoncées comme confortables oublient un ou plusieurs postes : la TVA sur un produit vendu en France (20 % au taux normal), la commission de 10 à 20 % des places de marché, les frais de paiement, et surtout la publicité par vente. Un produit acheté 8 € et vendu 29,90 € paraît rentable ; avec 15 % de commission et 4 € de publicité par vente, la marge réelle fond. Le calculateur les fait apparaître dans la barre de décomposition.</p>
<p>Si vous êtes en franchise en base de TVA (micro-entreprise sous le seuil), choisissez 0 % : vous ne facturez pas de TVA, et le prix affiché est votre prix hors taxes.</p>
<h2>Et ensuite ?</h2>
<p>Une marge positive ne suffit pas : il faut qu'elle couvre la publicité. Le <a href="/outils/roas-equilibre/">calculateur de ROAS d'équilibre</a> dit quel retour publicitaire minimal votre marge impose. Dans DropShipper IA, la <a href="/fonctions/fournisseurs/">comparaison fournisseurs</a> fait ce calcul pour chaque fournisseur relié d'une même référence, et les <a href="/fonctions/analyses-de-marche/">analyses de marché</a> donnent pour chaque produit gagnant le prix de vente conseillé et la marge visée.</p>`,
    faq: [
      { q: 'Comment calculer la marge d’un produit en dropshipping ?', a: "Retirez la TVA du prix de vente TTC pour obtenir le prix hors taxes, puis soustrayez le prix d'achat, les frais de port, la commission de la place de marché, les frais de paiement et la publicité par vente. Le reste est votre marge nette." },
      { q: 'Quelle différence entre taux de marge et taux de marque ?', a: "Le taux de marge rapporte la marge au coût d'achat ; le taux de marque la rapporte au prix de vente hors taxes. Pour une même vente, le taux de marge est toujours plus élevé que le taux de marque." },
      { q: 'Quel coefficient multiplicateur viser en dropshipping ?', a: "Il n'y a pas de règle unique, mais un coefficient (prix TTC divisé par le coût d'achat) inférieur à 2,5 laisse rarement assez de marge pour payer la publicité. Vérifiez-le avec le ROAS d'équilibre." },
      { q: 'Faut-il compter la TVA dans le calcul de la marge ?', a: "Oui, si vous y êtes assujetti : la TVA encaissée est reversée à l'État et ne vous appartient pas. En franchise en base de TVA, choisissez 0 %." },
      { q: 'Mes chiffres sont-ils enregistrés ?', a: "Non. Le calcul se fait dans votre navigateur ; rien n'est envoyé ni conservé." },
    ],
    fonctions: [['/fonctions/fournisseurs/', 'Fournisseurs : comparer une même référence'], ['/fonctions/analyses-de-marche/', 'Analyses de marché : prix conseillé et marge visée']],
  },
  {
    slug: 'calculateur-roas',
    nom: 'Calculateur de ROAS',
    court: 'Le retour sur dépense publicitaire d’une campagne, son ACoS et le bénéfice réel une fois la marge comptée.',
    title: 'Calculateur de ROAS gratuit : retour sur dépense pub',
    description:
      "Calculez le ROAS de votre campagne (chiffre d'affaires ÷ dépense publicitaire), l'ACoS et le bénéfice réel après marge. Gratuit, sans compte.",
    h1: 'Calculateur de ROAS',
    enBref:
      "Le ROAS (Return On Ad Spend) est le chiffre d'affaires généré par une campagne divisé par ce qu'elle a coûté. Ce calculateur gratuit donne le ROAS, l'ACoS (son inverse, en pourcentage) et, si vous indiquez votre taux de marge, le bénéfice réel de la campagne. Le calcul se fait dans votre navigateur.",
    outil: `<form class="outil" onsubmit="return false">
<div class="champs">
<label>Chiffre d'affaires généré par la publicité (€)<input id="ca" inputmode="decimal" value="1 200"></label>
<label>Dépense publicitaire (€)<input id="dep" inputmode="decimal" value="400"></label>
<label>Taux de marque avant publicité <small>(%, facultatif)</small><input id="tm" inputmode="decimal" placeholder="40"></label>
</div>
<button type="button" onclick="calc()">Calculer le ROAS</button>
<div class="resultat" id="r" aria-live="polite"></div><div id="v"></div>
</form>`,
    js: `function calc(){var ca=z('ca'),dep=z('dep'),tm=n('tm'),r=document.getElementById('r'),v=document.getElementById('v');
if(!(dep>0)){r.innerHTML='<p class="ko">Saisissez une dépense publicitaire.</p>';v.innerHTML='';return}
var roas=ca/dep,acos=dep/ca*100;
var h=val(nb(roas),'ROAS')+val(pct(acos),'ACoS (dépense ÷ chiffre d’affaires)');
var msg='';
if(!isNaN(tm)){var benef=ca*tm/100-dep,be=100/tm;h+=val(eur(benef),'bénéfice après publicité')+val(nb(be),'ROAS d’équilibre');msg='<p class="verdict '+(benef>=0?'ok':'ko')+'">'+(benef>=0?'La campagne est rentable : chaque euro dépensé rapporte '+eur(benef/dep+1)+' de marge.':'La campagne perd '+eur(-benef)+' : il faudrait un ROAS d’au moins '+nb(be)+'.')+'</p>'}
r.innerHTML=h;v.innerHTML=msg}
calc()`,
    texte: `<h2>La formule du ROAS</h2>
<p>ROAS = chiffre d'affaires attribué à la publicité ÷ dépense publicitaire. Une campagne qui coûte 400 € et génère 1 200 € de ventes a un ROAS de 3 : chaque euro dépensé a rapporté trois euros de chiffre d'affaires. Les régies (Meta Ads, TikTok Ads, Google Ads) l'affichent souvent sous le nom de « retour sur les dépenses publicitaires » ou « purchase ROAS ».</p>
<p>L'ACoS (Advertising Cost of Sales), utilisé notamment sur Amazon, est l'inverse exprimé en pourcentage : dépense ÷ chiffre d'affaires. Un ROAS de 3 correspond à un ACoS de 33 %.</p>
<h2>Un bon ROAS n'existe pas dans l'absolu</h2>
<p>Un ROAS de 3 est excellent pour un produit à 70 % de marge et ruineux pour un produit à 25 %. Ce qui compte n'est pas le ROAS mais ce qu'il laisse une fois la marge comptée. C'est pourquoi le calculateur demande, en option, votre taux de marque avant publicité : il en tire le bénéfice réel de la campagne et le ROAS d'équilibre, en dessous duquel chaque vente vous coûte de l'argent.</p>
<h2>Les pièges de lecture</h2>
<ul>
<li><strong>TTC ou HT ?</strong> La plupart des pixels remontent la valeur de commande TTC. Comparez le ROAS à un seuil calculé sur la même base.</li>
<li><strong>La fenêtre d'attribution</strong> : un achat compté par la régie à 7 jours après un clic ne l'est pas forcément par une autre. Comparez des campagnes sur la même fenêtre.</li>
<li><strong>Les retours et annulations</strong> ne sont pas déduits du chiffre d'affaires remonté par la régie.</li>
</ul>
<h2>Aller plus loin</h2>
<p>Calculez votre seuil exact avec le <a href="/outils/roas-equilibre/">calculateur de ROAS d'équilibre</a> et votre coût par vente avec le <a href="/outils/calculateur-cpa/">calculateur de CPA</a>. Dans DropShipper IA, les <a href="/fonctions/visuels-ia/">publicités composées par l'IA</a> et les <a href="/fonctions/reseaux-sociaux/">régies reliées</a> (Meta Ads, TikTok Ads, Pinterest Ads) partent toujours en pause : aucun budget n'est dépensé sans votre accord.</p>`,
    faq: [
      { q: 'Comment calculer le ROAS ?', a: "Divisez le chiffre d'affaires généré par la publicité par la dépense publicitaire. 1 200 € de ventes pour 400 € de publicité donnent un ROAS de 3." },
      { q: 'Quelle différence entre ROAS et ACoS ?', a: "L'ACoS est l'inverse du ROAS exprimé en pourcentage : dépense ÷ chiffre d'affaires. Un ROAS de 4 correspond à un ACoS de 25 %." },
      { q: 'Qu’est-ce qu’un bon ROAS en dropshipping ?', a: "Celui qui dépasse votre ROAS d'équilibre, c'est-à-dire 1 divisé par votre taux de marque avant publicité. À 40 % de marge, le seuil est de 2,5 ; à 25 %, il est de 4." },
      { q: 'Le ROAS tient-il compte de la marge ?', a: "Non, c'est un rapport de chiffre d'affaires. Pour juger la rentabilité, il faut le comparer au ROAS d'équilibre, que ce calculateur donne si vous indiquez votre taux de marque." },
    ],
    fonctions: [['/fonctions/visuels-ia/', 'Visuels et publicités IA'], ['/fonctions/reseaux-sociaux/', 'Réseaux sociaux et régies publicitaires']],
  },
  {
    slug: 'calculateur-cpa',
    nom: 'Calculateur de CPA',
    court: 'Le coût par acquisition d’une campagne, le CPC, le taux de conversion et le CPA maximal que votre marge permet.',
    title: 'Calculateur de CPA gratuit : coût par acquisition',
    description:
      "Calculez le coût par acquisition (CPA) de vos publicités, le coût par clic, le taux de conversion et le CPA maximal rentable. Gratuit, sans compte.",
    h1: 'Calculateur de CPA (coût par acquisition)',
    enBref:
      "Le CPA, coût par acquisition, est ce que vous coûte en publicité chaque vente obtenue : dépense ÷ nombre de ventes. Ce calculateur gratuit le compare à votre marge par vente pour dire si la campagne gagne ou perd de l'argent, et donne le coût par clic et le taux de conversion si vous indiquez les clics.",
    outil: `<form class="outil" onsubmit="return false">
<div class="champs">
<label>Dépense publicitaire (€)<input id="dep" inputmode="decimal" value="300"></label>
<label>Nombre de ventes obtenues<input id="ventes" inputmode="numeric" value="25"></label>
<label>Nombre de clics <small>(facultatif)</small><input id="clics" inputmode="numeric" value="900"></label>
<label>Marge par vente avant publicité (€) <small>(facultatif)</small><input id="marge" inputmode="decimal" value="14"></label>
</div>
<button type="button" onclick="calc()">Calculer le CPA</button>
<div class="resultat" id="r" aria-live="polite"></div><div id="v"></div>
</form>`,
    js: `function calc(){var dep=z('dep'),ve=z('ventes'),cl=n('clics'),m=n('marge'),r=document.getElementById('r'),v=document.getElementById('v');
if(!(ve>0)){r.innerHTML='<p class="ko">Saisissez au moins une vente.</p>';v.innerHTML='';return}
var cpa=dep/ve,h=val(eur(cpa),'CPA — coût par vente');
if(cl>0){h+=val(eur(dep/cl),'CPC — coût par clic')+val(pct(ve/cl*100),'taux de conversion')}
var msg='';
if(!isNaN(m)){h+=val(eur(m),'CPA maximal rentable')+val(eur((m-cpa)*ve),'bénéfice de la campagne');msg='<p class="verdict '+(cpa<=m?'ok':'ko')+'">'+(cpa<=m?'Chaque vente vous laisse '+eur(m-cpa)+' après publicité.':'Chaque vente vous coûte '+eur(cpa-m)+' : il faut un CPA sous '+eur(m)+'.')+'</p>'}
r.innerHTML=h;v.innerHTML=msg}
calc()`,
    texte: `<h2>La formule du CPA</h2>
<p>CPA = dépense publicitaire ÷ nombre de ventes (ou d'« acquisitions ») obtenues. 300 € dépensés pour 25 ventes donnent un CPA de 12 € : chaque client vous a coûté 12 € de publicité. Si vous indiquez le nombre de clics, le calculateur en tire aussi le coût par clic (CPC = dépense ÷ clics) et le taux de conversion (ventes ÷ clics), les deux leviers qui font le CPA : CPA = CPC ÷ taux de conversion.</p>
<h2>Le CPA maximal : votre marge avant publicité</h2>
<p>Une campagne est rentable tant que le CPA reste sous la marge que vous laisse une vente avant publicité. Si un produit vous laisse 14 € une fois payés le produit, le port, la TVA et les commissions, tout CPA sous 14 € rapporte de l'argent ; au-dessus, chaque vente en perd. Le <a href="/outils/calculateur-marge/">calculateur de marge</a> donne ce chiffre : mettez la publicité à 0 pour l'obtenir.</p>
<h2>Faire baisser le CPA</h2>
<ul>
<li><strong>Baisser le CPC</strong> : un visuel plus pertinent et une accroche différente pour chaque audience améliorent le taux de clic, que les régies récompensent par un coût plus bas.</li>
<li><strong>Monter le taux de conversion</strong> : une fiche produit complète (photos, arguments, avis, délai annoncé honnêtement) convertit mieux qu'une fiche recopiée du fournisseur.</li>
<li><strong>Monter la marge</strong> plutôt que de baisser le CPA : un fournisseur moins cher ou un prix de vente plus juste relève le CPA maximal.</li>
</ul>
<h2>Dans DropShipper IA</h2>
<p>Les <a href="/fonctions/visuels-ia/">publicités composées par l'IA</a> changent d'angle à chaque demande (problème, bénéfice, preuve, urgence…), ce qui permet de tester plusieurs accroches sur une même audience. Les <a href="/fonctions/annonces-ia/">annonces réécrites par l'IA</a> donnent à la fiche produit ses arguments et ses attributs. Et les <a href="/fonctions/agents-ia/">agents IA</a> peuvent juger si un produit mérite un budget avant que vous ne dépensiez le premier euro.</p>`,
    faq: [
      { q: 'Comment calculer le CPA ?', a: 'Divisez la dépense publicitaire par le nombre de ventes obtenues. 300 € pour 25 ventes donnent un CPA de 12 €.' },
      { q: 'Quel est le CPA maximal rentable ?', a: "Votre marge par vente avant publicité : une fois payés le produit, le port, la TVA et les commissions. Tant que le CPA reste en dessous, chaque vente rapporte." },
      { q: 'Quel lien entre CPA, CPC et taux de conversion ?', a: 'CPA = CPC ÷ taux de conversion. Un clic à 0,33 € avec 2,8 % de conversion donne un CPA d’environ 12 €.' },
      { q: 'Quelle différence entre CPA et ROAS ?', a: "Le CPA mesure le coût d'une vente en euros ; le ROAS mesure le chiffre d'affaires rapporté par euro dépensé. Les deux se jugent contre la marge." },
    ],
    fonctions: [['/fonctions/visuels-ia/', 'Visuels et publicités IA'], ['/fonctions/annonces-ia/', 'Annonces IA']],
  },
  {
    slug: 'roas-equilibre',
    nom: 'Calculateur de ROAS d’équilibre',
    court: 'Le ROAS minimal pour ne pas perdre d’argent (BEROAS), avec la décomposition du prix de vente.',
    title: 'Calculateur de ROAS d’équilibre (BEROAS) gratuit',
    description:
      "Calculez votre ROAS d'équilibre (BEROAS) : le retour publicitaire minimal pour ne pas perdre d'argent, avec la décomposition du prix de vente. Gratuit.",
    h1: "Calculateur de ROAS d'équilibre (BEROAS)",
    enBref:
      "Le ROAS d'équilibre, ou BEROAS (Break-Even ROAS), est le retour publicitaire minimal pour qu'une campagne ne perde pas d'argent : prix de vente ÷ marge avant publicité. Ce calculateur gratuit le donne, avec le CPA maximal et la décomposition du prix de vente poste par poste. Le calcul se fait dans votre navigateur.",
    outil: `<form class="outil" onsubmit="return false">
<div class="champs">
<label>Prix de vente TTC (€)<input id="pv" inputmode="decimal" value="39,90"></label>
<label>Coût du produit (€)<input id="pa" inputmode="decimal" value="11"></label>
<label>Frais de port (€)<input id="port" inputmode="decimal" value="3,50"></label>
<label>Commission et frais de paiement <small>(% du TTC)</small><input id="com" inputmode="decimal" value="3"></label>
<label>Autres frais par vente (€) <small>(emballage, application…)</small><input id="autres" inputmode="decimal" value="0"></label>
<label>TVA<select id="tva"><option value="20">20 %</option><option value="10">10 %</option><option value="5.5">5,5 %</option><option value="0">0 % (franchise)</option></select></label>
</div>
<button type="button" onclick="calc()">Calculer le seuil</button>
<div class="resultat" id="r" aria-live="polite"></div><div id="b"></div>
</form>`,
    js: `function calc(){var pv=z('pv'),tva=z('tva')/100,ht=pv/(1+tva),tv=pv-ht,pa=z('pa'),port=z('port'),com=pv*z('com')/100,au=z('autres'),m=ht-pa-port-com-au,r=document.getElementById('r'),b=document.getElementById('b');
if(!(pv>0)){r.innerHTML='<p class="ko">Saisissez un prix de vente.</p>';b.innerHTML='';return}
if(m<=0){r.innerHTML='<p class="verdict ko">Avant même la publicité, ce produit perd '+eur(-m)+' par vente : aucun ROAS ne le rend rentable.</p>';b.innerHTML='';return}
r.innerHTML=val(nb(pv/m),'ROAS d’équilibre (sur le CA TTC)')+val(nb(ht/m),'ROAS d’équilibre (sur le CA HT)')+val(eur(m),'CPA maximal (marge avant pub)')+val(pct(m/ht*100),'taux de marque avant pub');
var p=[['TVA',tv,'#7c6fb0'],['Produit',pa,'#f28a4b'],['Port',port,'#fbbf24'],['Commission',com,'#e85290'],['Autres',au,'#a78bfa'],['Marge avant pub',m,'#34d399']];
b.innerHTML='<div class="barre">'+p.map(function(x){return '<i style="width:'+(Math.max(x[1],0)/pv*100)+'%;background:'+x[2]+'" title="'+x[0]+'"></i>'}).join('')+'</div><div class="legende">'+p.map(function(x){return '<span style="--c:'+x[2]+'">'+x[0]+' '+eur(x[1])+' ('+pct(x[1]/pv*100)+')</span>'}).join('')+'</div><p class="verdict">Toute campagne dont le ROAS (calculé sur le chiffre d’affaires TTC) dépasse <b>'+nb(pv/m)+'</b> gagne de l’argent ; en dessous, chaque vente en perd.</p>'}
calc()`,
    texte: `<h2>La formule du ROAS d'équilibre</h2>
<p>BEROAS = prix de vente ÷ marge par vente avant publicité. Si un produit vendu 39,90 € TTC vous laisse 15 € une fois payés la TVA, le produit, le port et les commissions, son ROAS d'équilibre est 39,90 ÷ 15 ≈ 2,66. Une campagne qui rapporte 2,66 € de chiffre d'affaires par euro dépensé ne gagne rien et ne perd rien ; au-dessus, elle est rentable.</p>
<p>Le calculateur donne le seuil sur deux bases. <strong>Sur le chiffre d'affaires TTC</strong>, celui que remontent la plupart des pixels publicitaires (Meta, TikTok) : c'est le chiffre à comparer au ROAS affiché par votre régie. <strong>Sur le chiffre d'affaires HT</strong>, si votre outil de suivi remonte des montants hors taxes.</p>
<h2>La décomposition du prix</h2>
<p>La barre montre où part chaque euro payé par l'acheteur : TVA, produit, port, commission, autres frais, et ce qui reste pour payer la publicité et vous rémunérer. C'est souvent là qu'on comprend pourquoi une campagne « à ROAS 2 » perd de l'argent : sur un produit vendu au double de son coût, la TVA et le port mangent presque toute la marge.</p>
<h2>Le CPA maximal</h2>
<p>La marge avant publicité est aussi le coût par acquisition maximal : le prix que vous pouvez payer en publicité pour une vente sans perdre d'argent. Suivez votre CPA réel avec le <a href="/outils/calculateur-cpa/">calculateur de CPA</a> et votre ROAS avec le <a href="/outils/calculateur-roas/">calculateur de ROAS</a>.</p>
<h2>Relever le seuil avant de dépenser</h2>
<p>Un ROAS d'équilibre au-dessus de 3 signale un produit difficile à rentabiliser en publicité payante. Trois leviers : un fournisseur moins cher (la <a href="/fonctions/fournisseurs/">comparaison fournisseurs</a> de DropShipper IA compare une même référence chez chaque fournisseur relié), un prix de vente plus élevé justifié par une meilleure fiche (<a href="/fonctions/annonces-ia/">Annonces IA</a>), ou un canal sans coût publicitaire, comme les places de marché et les comparateurs (<a href="/fonctions/diffusion/">Diffusion multicanal</a>).</p>`,
    faq: [
      { q: 'Qu’est-ce que le ROAS d’équilibre ?', a: "C'est le ROAS minimal pour qu'une campagne ne perde pas d'argent : prix de vente divisé par la marge par vente avant publicité. On l'appelle aussi BEROAS, pour Break-Even ROAS." },
      { q: 'Comment calculer le BEROAS ?', a: "Calculez la marge par vente avant publicité (prix HT moins produit, port, commissions et frais), puis divisez le prix de vente par cette marge. 39,90 € ÷ 15 € donnent un BEROAS d'environ 2,66." },
      { q: 'Faut-il calculer le BEROAS sur le TTC ou le HT ?', a: "Sur la même base que le ROAS de votre régie. Les pixels Meta et TikTok remontent en général la valeur de commande TTC : comparez alors au BEROAS calculé sur le TTC." },
      { q: 'Quel lien entre BEROAS et CPA maximal ?', a: "La marge avant publicité qui sert au calcul du BEROAS est aussi le CPA maximal : le coût publicitaire d'une vente au-delà duquel vous perdez de l'argent." },
    ],
    fonctions: [['/fonctions/fournisseurs/', 'Fournisseurs : comparer une même référence'], ['/fonctions/diffusion/', 'Diffusion multicanal']],
  },
  {
    slug: 'detecteur-theme-shopify',
    nom: 'Détecteur de thème Shopify',
    court: 'Le thème, la version et l’identifiant Theme Store d’une boutique Shopify, à partir de son adresse.',
    title: 'Détecteur de thème Shopify gratuit : quel thème ?',
    description:
      "Collez l'adresse d'une boutique : le détecteur dit si elle tourne sur Shopify, quel thème elle utilise, sa version et son identifiant Theme Store. Gratuit.",
    h1: 'Détecteur de thème Shopify',
    enBref:
      "Le détecteur de thème Shopify de DropShipper IA lit la page d'accueil publique d'une boutique et dit si elle tourne sur Shopify, quel thème elle utilise (Dawn, Impulse, Prestige…), sa version et, quand le thème vient du Theme Store, son identifiant. Gratuit et sans compte ; seule la page publique est lue.",
    outil: `<form class="outil" id="f">
<div class="champs"><label>Adresse de la boutique<input id="u" type="url" inputmode="url" placeholder="https://boutique.exemple.com" required></label></div>
<button type="submit">Détecter le thème</button>
<div id="r" aria-live="polite"></div>
</form>`,
    js: `document.getElementById('f').addEventListener('submit',function(e){e.preventDefault();var u=document.getElementById('u').value.trim(),r=document.getElementById('r');if(!u)return;if(!/^https?:\\/\\//i.test(u))u='https://'+u;r.innerHTML='<p>Lecture de la boutique…</p>';
fetch('/api/outils/theme-shopify?url='+encodeURIComponent(u)).then(function(x){return x.json().then(function(j){return [x.ok,j]})}).then(function(a){var ok=a[0],j=a[1];
if(!ok){r.innerHTML='<p class="verdict ko">'+(j.erreur||j.error||'La boutique n’a pas pu être lue.')+'</p>';return}
if(!j.shopify){r.innerHTML='<p class="verdict ko">Cette boutique ne semble pas tourner sur Shopify (aucune trace de Shopify dans sa page d’accueil publique).</p>';return}
var t=j.theme||{};function s(x){return String(x==null?'':x).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
r.innerHTML='<div class="resultat">'+val(s(t.nom||'Inconnu'),'thème (nom donné par la boutique)')+val(s(t.schema||'—'),'thème d’origine')+val(s(t.version||'—'),'version')+val(t.themeStoreId?s(t.themeStoreId):'—','identifiant Theme Store')+'</div><p class="verdict ok">Boutique Shopify'+(j.boutique?' : '+s(j.boutique):'')+'.'+(t.themeStoreId?'':' Le thème n’a pas d’identifiant Theme Store : thème sur mesure ou acheté hors de la boutique officielle.')+'</p>'}).catch(function(){r.innerHTML='<p class="verdict ko">Le service de détection ne répond pas. Réessayez dans un instant.</p>'})})`,
    texte: `<h2>Comment le thème est détecté</h2>
<p>Une boutique Shopify déclare son thème dans le code de chacune de ses pages : un petit objet <code>Shopify.theme</code> qui porte le nom donné au thème par le marchand, le nom du thème d'origine (son « schéma »), sa version et, si le thème vient du Theme Store officiel, son identifiant. Le détecteur lit la page d'accueil publique de la boutique — celle que voit n'importe quel visiteur — et en extrait ces informations. Rien d'autre n'est lu, et rien n'est conservé.</p>
<h2>Lire le résultat</h2>
<ul>
<li><strong>Thème (nom donné par la boutique)</strong> : le nom que le marchand a donné à sa copie du thème. Il est souvent identique au thème d'origine, parfois renommé (« Dawn — copie du 12 mars »).</li>
<li><strong>Thème d'origine</strong> : le thème dont la boutique est partie, par exemple Dawn, Impulse ou Prestige. C'est l'information la plus fiable.</li>
<li><strong>Version</strong> : la version du thème installée ; une version ancienne signale une boutique qui n'a pas été mise à jour depuis longtemps.</li>
<li><strong>Identifiant Theme Store</strong> : présent quand le thème a été installé depuis la boutique de thèmes officielle de Shopify. Son absence indique un thème sur mesure ou acheté ailleurs.</li>
</ul>
<h2>Pourquoi une détection peut échouer</h2>
<p>Certaines boutiques bloquent les lectures automatiques, demandent un mot de passe (boutique en préparation) ou servent leur page depuis une adresse qui n'est pas Shopify. Le détecteur le dit plutôt que de deviner. Il n'accepte que des adresses publiques en http ou https, et le nombre de détections est limité par visiteur.</p>
<h2>Et si vous n'aviez pas besoin d'un thème ?</h2>
<p>Un thème Shopify se choisit dans un catalogue, puis se personnalise ; la boutique, elle, se paie chaque mois. <a href="/fonctions/dropshop-ia/">DropShop IA</a> prend le chemin inverse : l'IA écrit une boutique unique à partir de votre description et des couleurs de votre logo, avec panier, commande et paiement Stripe sur votre compte, pour 3,50 € une seule fois. Et si vous restez sur Shopify, DropShipper IA est aussi une application Shopify qui y publie vos annonces avec photos, variantes et stock (voir <a href="/fonctions/diffusion/">Diffusion multicanal</a>).</p>`,
    faq: [
      { q: 'Comment savoir quel thème utilise une boutique Shopify ?', a: "Collez son adresse dans le détecteur : il lit l'objet Shopify.theme déclaré dans la page d'accueil publique et donne le nom du thème, le thème d'origine, la version et l'identifiant Theme Store." },
      { q: 'Comment savoir si un site est une boutique Shopify ?', a: "Le détecteur cherche les traces de Shopify dans la page d'accueil publique (objet Shopify, ressources servies par le CDN de Shopify). S'il n'en trouve aucune, il le dit." },
      { q: 'Le détecteur est-il gratuit ?', a: "Oui, sans compte. Le nombre de détections est simplement limité par visiteur pour éviter les abus." },
      { q: 'Pourquoi la détection échoue-t-elle sur certaines boutiques ?', a: "Une boutique protégée par mot de passe, qui bloque les lectures automatiques ou qui n'est pas servie par Shopify ne peut pas être lue. Le détecteur le dit au lieu de deviner." },
    ],
    fonctions: [['/fonctions/dropshop-ia/', 'DropShop IA : une boutique écrite par l’IA'], ['/fonctions/diffusion/', 'Diffusion : publier sur Shopify']],
  },
  {
    slug: 'generateur-titre-annonce',
    nom: 'Générateur de titre d’annonce',
    court: 'Un titre de fiche produit à la bonne longueur pour Leboncoin, Vinted, eBay, Amazon et les autres, sans IA.',
    title: 'Générateur de titre d’annonce gratuit, par plateforme',
    description:
      "Composez le titre de votre annonce à la bonne longueur pour Leboncoin (50), Vinted (70), eBay (80), Amazon (200) et sept autres plateformes. Gratuit.",
    h1: "Générateur de titre d'annonce",
    enBref:
      "Ce générateur de titre gratuit compose le titre d'une fiche produit à partir de ce que vous saisissez — type de produit, marque, caractéristique, matière, couleur, taille — et le coupe à la limite de chaque plateforme : 50 caractères pour Leboncoin, 70 pour Vinted, 80 pour eBay, 200 pour Amazon. Aucun appel à une IA, rien n'est envoyé.",
    outil: `<form class="outil" onsubmit="return false" oninput="gen()">
<div class="champs">
<label>Type de produit<input id="type" placeholder="Lampe de bureau LED" value="Lampe de bureau LED"></label>
<label>Marque <small>(facultatif)</small><input id="marque" placeholder="Lumio"></label>
<label>Caractéristique principale<input id="carac" placeholder="intensité réglable" value="intensité réglable"></label>
<label>Matière<input id="matiere" placeholder="aluminium" value="aluminium"></label>
<label>Couleur<input id="couleur" placeholder="noir mat" value="noir mat"></label>
<label>Taille, quantité ou capacité<input id="taille" placeholder="45 cm"></label>
<label>Pour qui<select id="public"><option value="">—</option><option>femme</option><option>homme</option><option>enfant</option><option>bébé</option><option>mixte</option></select></label>
<label>Usage ou bénéfice<input id="usage" placeholder="le télétravail" value="le télétravail"></label>
</div>
<div class="titres" id="t" aria-live="polite"></div>
</form>`,
    js: `var LIM=${JSON.stringify(LIMITES_TITRE)};
function v(id){return document.getElementById(id).value.trim().replace(/\\s+/g,' ')}
function cap(s){return s?s.charAt(0).toUpperCase()+s.slice(1):s}
function compose(p,keep){var o=[];if(keep.marque&&p.marque)o.push(p.marque);o.push(cap(p.type));var a=[];if(keep.carac&&p.carac)a.push(p.carac);if(keep.matiere&&p.matiere)a.push('en '+p.matiere);var t=o.join(' ')+(a.length?' '+a.join(' '):'');var b=[];if(keep.couleur&&p.couleur)b.push(p.couleur);if(keep.taille&&p.taille)b.push(p.taille);if(b.length)t+=', '+b.join(', ');if(keep.public&&p.public)t+=(p.public==='mixte'?', mixte':' pour '+p.public);if(keep.usage&&p.usage)t+=' – idéal '+(/^(pour|en|au|à)\\s/i.test(p.usage)?p.usage:'pour '+p.usage);return cap(t)}
var ORDRE=['carac','couleur','marque','matiere','taille','public','usage'];
function meilleur(p,max){var keep={};var t=compose(p,keep);if(t.length>max){t=t.slice(0,max).replace(/[\\s,–-]+\\S*$/,'')}for(var i=0;i<ORDRE.length;i++){var k=ORDRE[i];if(!p[k])continue;keep[k]=true;var c=compose(p,keep);if(c.length<=max)t=c;else keep[k]=false}return t}
function gen(){var p={type:v('type'),marque:v('marque'),carac:v('carac'),matiere:v('matiere'),couleur:v('couleur'),taille:v('taille'),public:v('public'),usage:v('usage')};var el=document.getElementById('t');
if(!p.type){el.innerHTML='<p class="ko">Saisissez au moins le type de produit.</p>';return}
function s(x){return x.replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
el.innerHTML=LIM.map(function(l){var t=meilleur(p,l[1]);return '<div class="ligne"><b>'+l[0]+'</b> <small>— '+t.length+' / '+l[1]+' caractères</small><p>'+s(t)+'</p></div>'}).join('')}
gen()`,
    texte: `<h2>Pourquoi un titre par plateforme</h2>
<p>Aucun titre ne convient partout. Leboncoin coupe à 50 caractères, Vinted à 70, eBay et Kaufland à 80, alors qu'Amazon accepte 200 caractères et en attend au moins une soixantaine pour bien référencer la fiche. Un titre écrit pour Amazon est tronqué en plein mot sur Leboncoin ; un titre écrit pour Leboncoin laisse sur Amazon des mots-clés sur la table.</p>
<p>Le générateur compose donc un titre par destination. Il part du type de produit, puis ajoute les autres éléments par ordre d'importance — caractéristique principale, couleur, marque, matière, taille, public, usage — tant que le titre tient dans la limite de la plateforme. Ce qui ne tient pas est retiré proprement, jamais coupé au milieu d'un mot.</p>
<h2>Les limites utilisées</h2>
<table><thead><tr><th>Plateforme</th><th>Longueur maximale</th></tr></thead><tbody>
${LIMITES_TITRE.map(([p, l]) => `<tr><td>${esc(p)}</td><td>${l} caractères</td></tr>`).join('\n')}
</tbody></table>
<p>Ce sont les limites que DropShipper IA applique lui-même au moment de publier. Kaufland recommande 50 à 80 caractères et raccourcit au-delà : 80 est la limite utile.</p>
<h2>Écrire un bon titre de fiche produit</h2>
<ul>
<li><strong>Commencez par ce que l'acheteur tape</strong> : le type de produit, pas une accroche (« Super offre ! »), que les places de marché pénalisent.</li>
<li><strong>Une caractéristique qui distingue</strong> : intensité réglable, sans fil, pliable. C'est souvent elle qui fait cliquer.</li>
<li><strong>Les attributs que l'acheteur filtre</strong> : couleur, taille, matière. Ils doivent aussi figurer dans les attributs structurés de la fiche.</li>
<li><strong>Pas de majuscules partout, pas de symboles</strong> : la plupart des plateformes les refusent ou les déclassent.</li>
</ul>
<h2>La version complète, dans DropShipper IA</h2>
<p>Ce générateur assemble ce que vous saisissez ; il n'invente rien et n'appelle aucune IA. Dans DropShipper IA, <a href="/fonctions/annonces-ia/">Annonces IA</a> fait le travail en entier à partir de la fiche du fournisseur : trois titres (court, moyen, long), la description, cinq arguments de vente, huit attributs, douze mots-clés et la catégorie, puis la <a href="/fonctions/diffusion/">diffusion</a> envoie à chaque plateforme le titre à sa longueur. 12 drops (0,12 €) l'annonce, import compris.</p>`,
    faq: [
      { q: 'Quelle est la longueur maximale d’un titre sur Leboncoin ?', a: '50 caractères. Au-delà, le titre est coupé : mettez le type de produit et la caractéristique principale en premier.' },
      { q: 'Quelle longueur de titre pour Vinted et eBay ?', a: '70 caractères pour Vinted, 80 pour eBay. Kaufland recommande 50 à 80 caractères.' },
      { q: 'Quelle longueur de titre pour Amazon ?', a: "Jusqu'à 200 caractères. Un titre d'au moins une soixantaine de caractères, avec marque, type, caractéristique et attributs, référence mieux la fiche." },
      { q: 'Le générateur utilise-t-il une IA ?', a: "Non. Il assemble ce que vous saisissez et le coupe à la limite de chaque plateforme, dans votre navigateur. La réécriture complète par l'IA est la fonction Annonces IA de DropShipper IA." },
    ],
    fonctions: [['/fonctions/annonces-ia/', 'Annonces IA : la fiche entière réécrite'], ['/fonctions/diffusion/', 'Diffusion multicanal']],
  },
]

function pageOutil(o) {
  const url = `/outils/${o.slug}/`
  const trail = [{ name: 'Accueil', url: '/' }, { name: 'Outils gratuits', url: '/outils/' }, { name: o.nom, url }]
  const autres = OUTILS.filter((x) => x.slug !== o.slug)
  return {
    url,
    html: layout({
      url,
      title: o.title,
      description: o.description,
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: o.h1,
          url: `${SITE}${url}`,
          inLanguage: 'fr-FR',
          description: o.description,
          isAccessibleForFree: true,
          isPartOf: { '@id': `${SITE}/#site` },
        },
        faqLd(o.faq),
        breadcrumbLd(trail),
      ],
      body: `${CSS_OUTIL}
${crumb(trail)}
<p class="badge">Outil gratuit · sans compte</p>
<h1>${esc(o.h1)}</h1>
<p class="lede"><strong>En bref.</strong> ${esc(o.enBref)}</p>
${o.outil}
<script>${JS_COMMUN}${o.js}</script>
${o.texte}
${faqHtml(o.faq)}
<h2>La fonction complète dans DropShipper IA</h2>
<ul>${o.fonctions.map(([href, label]) => `<li><a href="${href}">${esc(label)}</a></li>`).join('')}</ul>
<p>120 drops offerts à l'inscription, sans abonnement : <a href="/register">créer un compte</a> · <a href="/tarifs/">voir les tarifs</a>.</p>
<h2>Les autres outils gratuits</h2>
<div class="lien-outils">${autres.map((x) => `<a href="/outils/${x.slug}/"><b>${esc(x.nom)}</b><small>${esc(x.court)}</small></a>`).join('')}</div>
<p><a href="/">← Retour à l'accueil</a></p>`,
    }),
  }
}

function pageHubOutils() {
  const url = '/outils/'
  const trail = [{ name: 'Accueil', url: '/' }, { name: 'Outils gratuits', url }]
  return {
    url,
    html: layout({
      url,
      title: 'Outils gratuits pour le dropshipping et l’e-commerce',
      description:
        'Six outils gratuits sans compte : calculateurs de marge, ROAS, CPA et ROAS d’équilibre, détecteur de thème Shopify, générateur de titre d’annonce.',
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: 'Outils gratuits DropShipper IA',
          url: `${SITE}${url}`,
          numberOfItems: OUTILS.length,
          itemListElement: OUTILS.map((o, i) => ({ '@type': 'ListItem', position: i + 1, name: o.nom, url: `${SITE}/outils/${o.slug}/` })),
        },
        breadcrumbLd(trail),
      ],
      body: `${CSS_OUTIL}
${crumb(trail)}
<h1>Outils gratuits pour le dropshipping</h1>
<p class="lede">Six outils pour décider avant de dépenser : la marge réelle d'un produit, la rentabilité d'une campagne, le thème d'une boutique concurrente, le titre de votre annonce à la bonne longueur. Gratuits, sans compte ; les calculs se font dans votre navigateur.</p>
<div class="lien-outils">${OUTILS.map((o) => `<a href="/outils/${o.slug}/"><b>${esc(o.nom)}</b><small>${esc(o.court)}</small></a>`).join('')}</div>
<h2>Par où commencer</h2>
<p>Commencez par la <a href="/outils/calculateur-marge/">marge</a> : elle dit ce qu'un produit vous laisse une fois payés la TVA, le port, la commission et la publicité. Le <a href="/outils/roas-equilibre/">ROAS d'équilibre</a> en tire le retour publicitaire minimal, puis les calculateurs de <a href="/outils/calculateur-roas/">ROAS</a> et de <a href="/outils/calculateur-cpa/">CPA</a> jugent une campagne en cours. Le <a href="/outils/generateur-titre-annonce/">générateur de titre</a> prépare l'annonce, et le <a href="/outils/detecteur-theme-shopify/">détecteur de thème</a> dit comment une boutique concurrente est construite.</p>
<p>Ces outils sont la version libre de ce que fait <a href="/">DropShipper IA</a> : importer un produit depuis n'importe quel fournisseur, en faire une annonce avec l'IA et la publier partout. 120 drops offerts à l'inscription.</p>`,
    }),
  }
}

function pagesOutils() {
  return [pageHubOutils(), ...OUTILS.map(pageOutil)]
}

module.exports = { pagesOutils, OUTILS, LIMITES_TITRE }
