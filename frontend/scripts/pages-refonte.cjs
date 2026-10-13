/**
 * Les cinq pages du menu des pages statiques, à la refonte de Max du 13/10/2026
 * (maquette « drop-shipper-refonte-5-pages ») : Import, Annonces, Boutiques,
 * Diffusion, Tarifs.
 *
 * Disposition de la maquette reprise telle quelle : un en-tête animé (aperçu
 * illustratif avec pause et relecture), une grille de blocs aux descriptions
 * brèves, des questions qui se déplient. Ce que la maquette n'avait pas et que
 * Max a demandé ensuite : nos vidéos dans les premiers blocs, sans contour ; la
 * FAQ du site dans la même présentation ; les outils gratuits ; les liens vers
 * les autres fonctions. Le texte long des pages (fonctions-contenu.cjs) reste,
 * sous « En détail » : c'est lui que lisent les moteurs.
 *
 * Aucun prix n'est écrit ici : tout vient de TARIFS (build-llms.cjs, recopié de
 * backend/src/services/tarifs.ts). Changer la grille change ces pages.
 * Charte DropShipper (Onest, fond #101321, cartes #191E2E) ; la maquette était
 * en Outfit avec des couleurs néon, ramenées aux couleurs de la charte.
 */
const { esc, SITE, titreCourt, GUIDES, NAV_STATIQUE } = require('./build-seo.cjs')
const { piedDePage, CSS_PIED } = require('./pied-de-page.cjs')
const { TARIFS } = require('./build-llms.cjs')
const { CONTENU, CHROME_STORE } = require('./fonctions-contenu.cjs')
const { OUTILS } = require('./build-outils.cjs')
const { canaux } = require('./seo-channels.cjs')
const ACCUEIL = require('../src/data/accueil-themes.json')

const FOURNISSEURS = require('../src/data/fournisseurs.json').fournisseurs
const MARKET = 'https://drop-shop.cloud'
const DEGRADE_DROPSHOP = 'linear-gradient(90deg,#07eeb7,#4a98eb 30%,#8c5ed0 50%,#dd2488 70%,#f48e35 90%,#ffc90b)'

/** Une ligne de la grille ; une ligne disparue doit casser le build, pas afficher « undefined ». */
function ligne(motif) {
  const l = TARIFS.find(([nom]) => motif.test(nom))
  if (!l) throw new Error(`pages-refonte : tarif introuvable ${motif}`)
  return l
}
const euros = (drops) => `${(drops / 100).toFixed(2).replace('.', ',')} €`
const nombre = (n) => new Intl.NumberFormat('fr-FR').format(n)
/** « 0,12 € » → ['0,12', '€'] pour le gros chiffre des blocs prix. */
const grosPrix = (texte) => {
  const [chiffre] = texte.split(' ')
  return `${esc(chiffre)}<small>€</small>`
}

/** Ce que la grille dit des modifications d'une boutique, quelle que soit la formule. */
function boutique() {
  const [nom, drops, prix] = ligne(/^DropShop IA : création/)
  const inclus = (nom.match(/\(([^)]*)\)/) || [, ''])[1]
  const n = inclus.match(/(\d+)\s+modifications? comprises?/)
  const sup = TARIFS.find(([l]) => /modification au-delà/.test(l))
  let modifs
  if (n) modifs = { court: `${n[1]} modifications comprises`, long: `${n[1]} modifications sont comprises${sup ? `, puis ${sup[2]} chacune` : ''}.` }
  else if (/volonté|illimit/i.test(nom)) modifs = { court: 'modifications à volonté', long: 'Les modifications sont à volonté : demandez autant de changements que vous voulez.' }
  else modifs = { court: 'modifications sur demande', long: 'Demandez vos modifications en français.' }
  return { drops, prix, modifs, uneFois: /une seule fois/.test(nom) }
}

const CUBE = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3 28 10V23L16 30 4 23V10Z M4 10 16 17 28 10 M16 17V30" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>'
const LAMPE = '<div class="lamp" aria-hidden="true"><span></span></div>'

/** Les accents par page : couleurs de la charte (DropShipper, DropShop, drops), pas celles de la maquette. */
const ACCENTS = {
  import: ['#f28a4b', '242,138,75'],
  annonces: ['#ec6aa0', '232,82,144'],
  boutiques: ['#f48e35', '221,36,136'],
  diffusion: ['#f59d66', '232,82,144'],
  tarifs: ['#fdbf06', '253,191,6'],
}

const CSS = `
:root{color-scheme:dark;--ink:#101321;--surface:#191e2e;--surface-2:#21273a;--trait:#2a3147;--texte:#f5f7fa;--texte-2:#b8c0d0;--texte-3:#8f98ab;--orange:#f28a4b;--rose:#e85290}
*{box-sizing:border-box}
html{scroll-behavior:smooth;scroll-padding-top:80px}
body{margin:0;background:var(--ink);color:var(--texte);font-family:"Onest",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-size:16px;line-height:1.5}
button,input,select{font:inherit}
a{color:inherit;text-decoration:none}
button{cursor:pointer}
a:focus-visible,button:focus-visible,summary:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--accent);outline-offset:4px}
.skip{position:fixed;top:-100px;left:15px;z-index:30;background:#fff;color:#000;padding:12px}
.skip:focus{top:10px}
.entete{position:sticky;top:0;z-index:20;background:rgba(16,19,33,.92);backdrop-filter:blur(8px);border-bottom:1px solid var(--trait)}
.entete-in{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:14px 5%;max-width:1400px;margin:auto}
.brand{display:flex;align-items:flex-start;gap:5px;height:34px;flex:none}
.brand img{display:block}
.brand .mot{height:21.8px;width:auto;margin-top:8.3px}
.menu{display:flex;gap:28px;margin-left:auto}
.menu a{font-size:14px;color:var(--texte-2);padding:7px 0;position:relative}
.menu a:hover,.menu a[aria-current]{color:var(--texte)}
.menu a[aria-current]:after{content:'';position:absolute;left:0;right:0;bottom:0;height:2px;background:var(--accent)}
.entete-cta{padding:10px 16px;border-radius:10px;font-size:13px;font-weight:600;background:linear-gradient(90deg,#f28a4b,#e85290);color:#fff}
.menubtn{display:none}
.crumb{font-size:12px;color:var(--texte-3);margin-bottom:18px}
.crumb a{color:var(--texte-3);text-decoration:underline;text-underline-offset:3px}
.hero{position:relative;overflow:hidden;isolation:isolate;border-bottom:1px solid var(--trait);background:radial-gradient(ellipse at 85% 50%,rgba(var(--rgb),.10),transparent 52%)}
.hero-inner{max-width:1400px;margin:auto;display:grid;grid-template-columns:1fr 1.06fr;align-items:center;gap:5%;padding:60px 5% 60px;min-height:600px}
.overline{font-size:11px;font-weight:600;letter-spacing:2.5px;color:var(--accent);text-transform:uppercase}
.hero h1{font-size:clamp(42px,4.9vw,72px);line-height:1.05;letter-spacing:-2px;font-weight:700;margin:20px 0}
.hero h1 em{font-style:normal;color:var(--accent)}
.hero h1 em.degrade{background:var(--degrade);-webkit-background-clip:text;background-clip:text;color:transparent}
.intro{max-width:500px;font-size:18px;line-height:1.65;color:var(--texte-2);margin:24px 0 28px}
.cta{display:inline-flex;align-items:center;gap:22px;border-radius:12px;padding:16px 22px;background:linear-gradient(90deg,#f28a4b,#e85290);color:#fff;font-size:15px;font-weight:700;transition:transform .25s,box-shadow .25s}
.cta:hover{transform:translateY(-3px);box-shadow:0 8px 40px rgba(var(--rgb),.22)}
.cta.dropshop{background:${DEGRADE_DROPSHOP};border-radius:999px;text-transform:uppercase;letter-spacing:.04em;text-shadow:0 1px 2px rgba(0,0,0,.45)}
.small{font-size:13px;color:var(--texte-2);margin-top:14px}
.hero-foot{max-width:1400px;margin:auto;padding:18px 5%;display:flex;justify-content:space-between;gap:20px;font-size:12px;color:var(--texte-3);border-top:1px solid #ffffff0d}
.hero-foot>span{font-size:10px;letter-spacing:1.8px}
.hero-foot a{color:var(--texte-2)}
.city{position:absolute;bottom:0;height:78%;inset-inline:0;z-index:-2;opacity:.12;display:flex;align-items:end;gap:9px;-webkit-mask-image:linear-gradient(transparent,#000 45%,transparent);mask-image:linear-gradient(transparent,#000 45%,transparent)}
.city i{flex:1;background:repeating-linear-gradient(0deg,transparent 0 16px,var(--accent) 17px 18px),repeating-linear-gradient(90deg,#11131e 0 12px,#3a4360 13px 15px);border:1px solid #3a4360}
.lightline{position:absolute;inset:auto -10% 10%;height:1px;background:linear-gradient(90deg,transparent,var(--accent),var(--rose),transparent);transform:rotate(-9deg);opacity:.25;z-index:-1}
.visual{min-width:0}
.demo{position:relative;height:385px;display:flex;align-items:center;justify-content:center}
.window{border:1px solid #ffffff1f;border-radius:16px;background:var(--surface);box-shadow:0 30px 60px #0007;overflow:hidden}
.windowbar{padding:13px 16px;border-bottom:1px solid #ffffff12;display:flex;justify-content:space-between;gap:12px;font-size:12px;color:var(--texte-2)}
.source{width:42%;transform:rotate(-5deg);z-index:1}
.product-image{height:165px;display:grid;place-items:center;background:radial-gradient(ellipse at 50% 90%,#a0763525,transparent),#21273a}
.lamp{width:100px;height:120px;position:relative;flex-shrink:0;filter:drop-shadow(0 10px 20px #0a070740)}
.lamp:before{content:'';position:absolute;top:5px;left:0;width:100%;height:57px;background:linear-gradient(110deg,#fff3d5,#b9a083);border-radius:70px 70px 10px 10px}
.lamp:after{content:'';position:absolute;left:43%;top:61px;width:15%;height:46px;background:linear-gradient(90deg,#af9579,#fae7ca,#a99379)}
.lamp span{position:absolute;bottom:5px;left:24%;width:52%;height:9px;border-radius:50%;background:#c9b69d}
.source-label{font-size:13px;padding:16px 15px 4px}
.skeleton{height:5px;background:#ffffff18;border-radius:3px;margin:10px 15px}
.skeleton.short{width:40%;margin-bottom:20px}
.flight{width:13%;display:flex;flex-direction:column;align-items:center;gap:4px;color:var(--accent);font-size:10px;position:relative;z-index:3}
.flight svg{width:25px;animation:transfer 4s infinite}
.flight i{position:absolute;top:50%;width:3px;height:3px;background:var(--accent);border-radius:50%;animation:particle 4s infinite}
.flight i:nth-last-child(1){animation-delay:.2s}
.flight i:nth-last-child(2){animation-delay:.4s}
.destination{width:48%;z-index:2;transform:rotate(3deg)}
.mini-product{display:flex;align-items:center;gap:9px;padding:17px 14px}
.mini-product .lamp{width:45px;height:65px;transform:scale(.75);margin:-5px 0}
.mini-product .lamp:before{height:30px}
.mini-product .lamp:after{top:34px;height:24px}
.mini-product b{display:block;font-size:14px}
.mini-product small{display:block;font-size:10px;color:var(--texte-2);margin-top:4px}
.checkline{font-size:12px;padding:9px 15px;border-top:1px solid #ffffff08;color:var(--texte-2)}
.good{color:#a7e7b5}
.pill{font-size:11px;border:1px solid rgba(var(--rgb),.35);background:rgba(var(--rgb),.07);color:var(--accent);margin:13px;padding:8px;border-radius:6px;text-align:center}
.demo-controls{display:flex;align-items:center;justify-content:flex-end;gap:12px;margin-top:22px;font-size:10px;color:var(--texte-3);letter-spacing:1px}
.demo-controls button{background:none;color:var(--texte-2);border:1px solid #ffffff22;border-radius:8px;padding:6px 10px;font-size:11px;letter-spacing:0;min-height:32px}
.demo-controls button:hover{color:#fff;border-color:var(--accent)}
.copy{animation:rise .8s both}
.demo .window{animation:pop .9s both}
.destination{animation-delay:.5s!important}
.checkline{animation:rise .7s both}
.checkline:nth-child(3){animation-delay:1.1s}
.checkline:nth-child(4){animation-delay:1.4s}
.checkline:nth-child(5){animation-delay:1.7s}
.pill{animation:rise .7s 2s both}
.content{max-width:1400px;margin:auto;padding:70px 5% 50px}
.section-heading{display:flex;align-items:end;justify-content:space-between;gap:40px;margin-bottom:30px}
.section-heading p{font-size:15px;color:var(--texte-2);max-width:320px;margin:0 0 5px}
.content h2{font-size:clamp(28px,3vw,42px);line-height:1.15;letter-spacing:-1px;font-weight:600;margin:14px 0 0}
.bento{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:17px}
.tile{border:1px solid #ffffff12;border-radius:18px;padding:30px;background:var(--surface);min-height:240px;position:relative;overflow:hidden;transition:border-color .3s,transform .3s}
.tile:hover{border-color:rgba(var(--rgb),.4);transform:translateY(-3px)}
.tile.wide{grid-column:span 2}
.tile.full{grid-column:1/-1}
.tile.featured{background:radial-gradient(ellipse at 100% 100%,rgba(var(--rgb),.12),transparent 70%),var(--surface)}
.tile-media{display:block;width:100%;height:auto;aspect-ratio:16/9;object-fit:cover;border:0;border-radius:12px;margin:0 0 22px;background:var(--ink)}
.tile-icon{font-size:25px;color:var(--accent);display:block;margin-bottom:20px}
.tile h3{font-size:23px;letter-spacing:-.5px;line-height:1.2;font-weight:600;margin:0 0 12px}
.tile p{font-size:15px;line-height:1.65;color:var(--texte-2);max-width:560px;margin:0 0 16px}
.textlink{font-size:13px;display:inline-block;color:var(--accent);margin-top:10px;font-weight:600}
.textlink:hover{text-decoration:underline;text-underline-offset:3px}
.urlbar{margin-top:25px;display:flex;justify-content:space-between;gap:12px;background:var(--ink);border:1px solid #ffffff19;border-radius:9px;padding:14px;font-size:13px;color:var(--texte-2)}
.urlbar span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.urlbar b{color:var(--accent)}
.footnote{font-size:12px!important;color:var(--texte-3)!important;display:block;margin-top:10px!important}
.stat{font-size:29px;letter-spacing:-1px;color:var(--accent);font-weight:600}
.stat small{font-size:12px;color:var(--texte-2);letter-spacing:0;font-weight:400}
.tokens{display:flex;flex-wrap:wrap;gap:8px;margin-top:24px}
.tokens span,.tokens a{border:1px solid #ffffff1c;padding:7px 11px;border-radius:7px;font-size:12px;color:var(--texte-2)}
.tokens a:hover{border-color:var(--accent);color:var(--texte)}
.price{display:flex;flex-direction:column;align-items:start;background:linear-gradient(145deg,rgba(var(--rgb),.13),var(--surface))}
.price>strong{font-size:62px;letter-spacing:-3px;font-weight:600;margin:24px 0 10px;line-height:1}
.price strong small{font-size:28px;margin-left:5px}
.price .textlink{margin-top:auto}
.faq,.article{display:grid;grid-template-columns:.85fr 1.4fr;gap:70px;margin:85px 0}
.faq h2,.article h2{position:sticky;top:90px}
details{border-top:1px solid #ffffff17}
details:last-child{border-bottom:1px solid #ffffff17}
summary{list-style:none;cursor:pointer;display:flex;justify-content:space-between;gap:20px;padding:22px 0;font-size:16px;font-weight:500}
summary::-webkit-details-marker{display:none}
summary span{color:var(--accent);transition:transform .2s;flex:none}
details[open] summary span{transform:rotate(45deg)}
details p{font-size:15px;color:var(--texte-2);margin:0 0 22px;line-height:1.7}
.article .prose{font-size:16px;line-height:1.75;color:var(--texte-2)}
.prose h3{font-size:22px;color:var(--texte);margin:42px 0 10px;font-weight:600;letter-spacing:-.3px}
.prose h3:first-child{margin-top:0}
.prose h4{font-size:17px;color:var(--texte);margin:24px 0 6px}
.prose p{margin:10px 0}
.prose strong{color:var(--texte)}
.prose a{color:var(--accent);text-decoration:underline;text-underline-offset:3px}
.prose ul{padding-left:1.1rem}
.prose li{margin:6px 0}
.prose li::marker{color:var(--accent)}
.prose .bref{border-left:3px solid var(--accent);background:var(--surface);border-radius:12px;padding:16px 20px;color:var(--texte)}
.prose table,.faq table{width:100%;border-collapse:collapse;font-size:14px;margin:16px 0}
.prose th,.prose td,.faq th,.faq td{text-align:left;padding:11px 10px;border-bottom:1px solid #ffffff15;vertical-align:top}
.prose th,.faq thead th{color:var(--accent);font-weight:600}
.table-scroll{overflow:auto}
.faq td.n{white-space:nowrap;text-align:right;color:var(--texte)}
.faq td{color:var(--texte-2)}
.liens{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px;margin-top:26px}
.liens a{display:block;border:1px solid #ffffff12;border-radius:14px;padding:18px 20px;background:var(--surface);transition:border-color .3s,transform .3s}
.liens a:hover{border-color:rgba(var(--rgb),.45);transform:translateY(-2px)}
.liens b{display:block;font-size:16px;font-weight:600;margin-bottom:6px}
.liens small{display:block;font-size:13px;color:var(--texte-2);line-height:1.55}
.bloc-liens{margin:85px 0 0}
.next{border-top:1px solid #ffffff20;margin-top:85px;padding:30px 0 5px;display:flex;justify-content:space-between;align-items:center}
.next span{font-size:10px;letter-spacing:2px;color:var(--texte-3)}
.next h3{font-size:34px;margin:10px 0;font-weight:600}
.next b{font-size:40px;color:var(--accent);font-weight:400}
.next:hover h3{color:var(--accent)}
footer{border-top:1px solid var(--trait);margin-top:3rem;padding:1.5rem 0;font-size:.85rem;color:var(--texte-3)}
footer .wrap{max-width:1400px;margin:auto;padding:0 5%}
footer a{color:var(--texte-3);margin-right:1rem}
.writing-demo .raw-note{position:absolute;top:0;left:0;width:53%;padding:20px;background:var(--surface-2);border:1px dashed #ffffff30;border-radius:10px;transform:rotate(-7deg);font-family:ui-monospace,monospace;font-size:12px;color:var(--texte-2);animation:rise .7s both}
.raw-note small{font-size:10px;color:var(--accent)}
.written{position:absolute;right:0;top:45px;width:77%;max-width:410px}
.written .mini-product{padding:18px}
.written .mini-product b{font-size:18px}
.written .mini-product small{color:var(--accent)}
.written .revealtext{font-size:13px;line-height:1.7;margin:0 20px 15px;color:var(--texte-2);animation:wipe 2s .8s both}
.written .tokens{margin:12px 15px 18px}
.floating-label{position:absolute;bottom:-8px;left:0;font-size:12px;padding:10px 15px;background:var(--surface-2);border:1px solid rgba(var(--rgb),.35);border-radius:8px;color:var(--accent);animation:pop .8s 1.8s both}
.text-preview{padding:18px 20px;background:var(--ink);border-radius:10px;margin-top:25px}
.text-preview span{display:block;font-size:10px;letter-spacing:2px;color:var(--accent);margin:8px 0}
.text-preview b{font-size:15px;font-weight:500}
.text-preview p{font-size:13px;margin:0}
.prompt-note{position:absolute;top:0;left:0;font-size:13px;border:1px solid rgba(var(--rgb),.3);background:var(--surface-2);padding:12px 16px;border-radius:10px;animation:rise .8s both;z-index:2}
.storefront{width:96%;margin-top:27px;background:#f1eadf;color:#252921;--store:#d2c2a9;--store-ink:#252921}
.store-nav{display:flex;justify-content:space-between;align-items:center;padding:15px 18px;font-size:9px;border-bottom:1px solid #0001}
.store-nav b{font-size:11px;letter-spacing:1px}
.store-hero{display:flex;align-items:center;justify-content:space-between;padding:25px;background:var(--store);color:var(--store-ink);transition:background .4s}
.store-hero small{font-size:8px;letter-spacing:1px}
.store-hero h3{font-family:Georgia,serif;font-size:29px;font-weight:400;margin:8px 0 17px}
.store-button{padding:7px 10px;background:var(--store-ink);color:var(--store);font-size:9px}
.store-products{display:grid;grid-template-columns:repeat(3,1fr);padding:12px;gap:10px}
.store-products>div{background:#e4dacc;height:90px;position:relative;display:flex;align-items:center;justify-content:center;animation:pop .8s 1s both}
.store-products>div:nth-child(2){animation-delay:1.2s}
.store-products>div:nth-child(3){animation-delay:1.4s}
.store-products .lamp{transform:scale(.45);margin-top:-12px}
.store-products small{position:absolute;bottom:3px;font-size:9px}
.vase{width:40px;height:53px;background:linear-gradient(90deg,#a18d77,#e7d5bf,#b5a28e);clip-path:polygon(30% 0,70% 0,65% 18%,100% 60%,95% 100%,5% 100%,0 60%,35% 18%)}
.cushion{width:55px;height:46px;border-radius:10px;background:linear-gradient(120deg,#e7dbc3,#b9a992);box-shadow:inset 0 0 0 4px #cdbda5;transform:rotate(-9deg)}
.direction-picker{display:flex;flex-wrap:wrap;gap:10px;margin-top:22px}
.direction-picker button{border:1px solid #ffffff22;background:var(--ink);color:var(--texte-2);padding:10px 16px;border-radius:8px;font-size:13px}
.direction-picker button.selected{border-color:var(--accent);color:var(--accent)}
.network-demo{max-width:540px;margin:auto}
.network-demo>svg{position:absolute;width:100%;height:100%;overflow:visible}
.network-demo>svg path{fill:none;stroke:var(--accent);stroke-width:1.5;stroke-dasharray:850;animation:draw 3s both;opacity:.55}
.hub{position:absolute;top:38%;left:36%;width:28%;height:100px;display:flex;flex-direction:column;gap:10px;align-items:center;justify-content:center;background:var(--surface-2);border:1px solid rgba(var(--rgb),.5);border-radius:20px;animation:pop .8s both}
.hub svg{width:35px;height:35px;color:var(--accent)}
.hub b{font-size:12px}
.node{position:absolute;border:1px solid #ffffff24;background:var(--surface);padding:11px 13px;border-radius:9px;font-size:12px;animation:pop .8s both}
.node em{font-style:normal;color:var(--accent);margin-left:6px;font-weight:600}
.n1{left:0;top:13%;animation-delay:.6s}
.n2{right:0;top:13%;animation-delay:.9s}
.n3{left:0;top:46%;animation-delay:1.2s}
.n4{right:0;top:46%;animation-delay:1.5s}
.n5{left:0;top:78%;animation-delay:1.8s}
.n6{right:0;top:78%;animation-delay:2.1s}
.network-caption{position:absolute;bottom:-18px;left:0;right:0;text-align:center;color:var(--texte-2);font-size:12px}
.network-caption b{font-size:22px;color:var(--accent);margin-right:5px}
.notice{padding:14px 17px;border-left:2px solid var(--accent);background:rgba(var(--rgb),.06);font-size:13px;margin-top:24px}
.pricing-demo{padding:30px}
.receipt{width:100%;max-width:430px;transform:rotate(2deg)}
.receiptrow{display:flex;justify-content:space-between;gap:15px;margin:0 23px;padding:17px 0;border-bottom:1px dashed #ffffff20;font-size:13px;color:var(--texte-2);animation:rise .7s both}
.receiptrow:nth-child(2){animation-delay:.5s}
.receiptrow:nth-child(3){animation-delay:.9s}
.receiptrow:nth-child(4){animation-delay:1.3s}
.receiptrow b{white-space:nowrap;color:#fff}
.receipt-total{padding:22px;display:flex;align-items:center;justify-content:space-between;gap:25px}
.receipt-total span{font-size:13px}
.receipt-total strong{font-size:45px;color:var(--accent);font-weight:600;animation:pop 1s 1.8s both}
.coin{position:absolute;right:0;top:-6px;width:92px;height:92px;z-index:3;animation:coin 4s infinite}
.calculator label{font-size:13px;color:var(--texte-2);display:block;margin:18px 0 7px}
.calculator select,.calculator input{border:1px solid #ffffff25;border-radius:8px;background:var(--ink);color:var(--texte);padding:13px;width:100%}
.calculator input{max-width:150px}
.quantity{display:flex;justify-content:space-between;align-items:center;margin-top:16px}
.quantity label{margin:0}
.estimate{display:flex;align-items:baseline;gap:20px;margin-top:24px}
.estimate strong{font-size:45px;font-weight:600;letter-spacing:-2px;color:var(--accent)}
.estimate span{font-size:14px;color:var(--texte-2)}
.price-list>div{display:flex;justify-content:space-between;gap:15px;font-size:14px;padding:14px 0;border-bottom:1px solid #ffffff12;color:var(--texte-2)}
.price-list b{white-space:nowrap;color:var(--accent);font-weight:600}
body.paused .hero *,body.paused .hero *:before,body.paused .hero *:after{animation-play-state:paused!important}
body.reduced .hero *,body.reduced .hero *:before,body.reduced .hero *:after{animation:none!important;opacity:1!important;clip-path:none!important}
body.reduced .network-demo>svg path{stroke-dasharray:none}
@keyframes rise{from{opacity:0;translate:0 18px}to{opacity:1;translate:0 0}}
@keyframes pop{0%{opacity:0;scale:.86;translate:0 25px}70%{opacity:1;scale:1.025;translate:0 -3px}100%{opacity:1;scale:1;translate:0 0}}
@keyframes transfer{0%,15%{translate:-15px 0;opacity:.3}50%{translate:14px 0;opacity:1}85%,100%{translate:-15px 0;opacity:.3}}
@keyframes particle{0%{translate:-30px 0;opacity:0}50%{opacity:1}100%{translate:35px 0;opacity:0}}
@keyframes wipe{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0)}}
@keyframes draw{from{stroke-dashoffset:850}to{stroke-dashoffset:0}}
@keyframes coin{0%,100%{translate:0 0;rotate:-8deg}50%{translate:0 -9px;rotate:8deg}}
.bento>.tile:last-child{grid-column:1/-1;min-height:0;display:flex;align-items:center;gap:28px;flex-wrap:wrap}
.bento>.tile:last-child .tile-icon,.bento>.tile:last-child h3,.bento>.tile:last-child .textlink{margin:0}
.bento>.tile:last-child p{margin:0;flex:1;min-width:220px}
.bento>.price:last-child>strong{margin:0;font-size:54px}
.bento>.price:last-child>.overline{max-width:160px}
@media(max-width:1050px){.menu{gap:15px}.hero-inner{gap:30px;padding-top:50px;padding-bottom:55px}.hero h1{font-size:48px}.intro{font-size:16px}.demo{height:345px}.written{width:85%}.hub{width:30%;left:35%}.tile{padding:24px}.faq,.article{gap:40px}.source{width:43%}.flight{width:10%}.destination{width:47%}}
@media(max-width:760px){
.entete-in{padding:12px 16px;gap:10px;flex-wrap:wrap}
.entete-cta{margin-left:auto;padding:9px 12px}
.menubtn{display:block;order:3;background:var(--surface);border:1px solid #ffffff25;border-radius:8px;color:#fff;width:40px;height:40px;font-size:19px}
.menu{display:none;order:4;width:100%;flex-wrap:wrap;padding:12px 0 5px;gap:12px 22px;margin:0}
.entete.open .menu{display:flex}
.hero-inner{grid-template-columns:1fr;padding:36px 16px 30px;gap:40px;min-height:0}
.hero h1{font-size:44px;letter-spacing:-1.5px}
.intro{font-size:16px;margin:20px 0}
.cta{font-size:14px;padding:15px 18px;gap:16px}
.visual{max-width:520px;width:100%;margin:auto}
.demo{height:340px}
.demo-controls{margin-top:28px;gap:9px}
.demo-controls>span{margin-right:auto;font-size:9px}
.hero-foot{padding:18px 16px}
.hero-foot>span{display:none}
.content{padding:45px 16px}
footer .wrap{padding:0 16px}
.section-heading{display:block;margin-bottom:25px}
.section-heading p{max-width:400px;margin-top:16px}
.bento{grid-template-columns:minmax(0,1fr)}
.tile.wide,.tile.full{grid-column:auto}
.tile{min-height:0;padding:22px}
.faq,.article{grid-template-columns:minmax(0,1fr);gap:20px;margin:55px 0}
.faq h2,.article h2{position:static}
.bloc-liens{margin-top:55px}
.next{margin-top:55px}
.next h3{font-size:28px}
.network-demo{height:330px}
.node{font-size:11px;padding:9px}
.hub b{font-size:10px}
.network-caption{bottom:-10px}
.product-image{height:135px}
.windowbar{font-size:10px;padding:12px 10px}
.mini-product{gap:4px;padding:13px 7px}
.mini-product b{font-size:11px}
.mini-product small{font-size:9px}
.checkline{font-size:10px;padding:8px}
.pill{font-size:10px;margin:9px;padding:6px}
.lamp{scale:.85}
.written{width:85%;top:43px}
.written .mini-product b{font-size:15px}
.written .revealtext{font-size:12px}
.written .tokens{gap:4px}
.written .tokens span{font-size:10px;padding:5px}
.writing-demo .raw-note{font-size:11px;padding:15px}
.floating-label{font-size:10px;bottom:-9px}
.store-hero{padding:17px}
.store-hero h3{font-size:23px}
.prompt-note{font-size:11px;padding:10px}
.store-products>div{height:75px}
.pricing-demo{padding:15px}
.receiptrow{margin:0 15px;font-size:11px}
.receipt-total{padding:18px}
.coin{width:64px;height:64px}
.receipt-total strong{font-size:37px}
.quantity input{max-width:120px}
.bento>.tile:last-child{display:block}
.bento>.tile:last-child .tile-icon{margin-bottom:20px}
.bento>.tile:last-child h3{margin-bottom:12px}
.bento>.tile:last-child p{margin:15px 0}
.bento>.price:last-child>strong{display:block;margin:22px 0}
}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*,*:before,*:after{animation:none!important;transition:none!important}.network-demo>svg path{stroke-dasharray:none}.revealtext{clip-path:none!important}}
`

/* The maquette's app.js, made safe on pages that lack one of its pieces. */
const JS = `(function(){
var city=document.querySelector('.city');if(city)for(var i=0;i<32;i++){var e=document.createElement('i');e.style.height=(20+i*31%75)+'%';city.appendChild(e)}
var media=matchMedia('(prefers-reduced-motion: reduce)'),motion=document.querySelector('.motion'),paused=media.matches;
document.body.classList.toggle('reduced',media.matches);
function videos(){document.querySelectorAll('video.tile-media').forEach(function(v){if(paused){v.pause()}else{var p=v.play();if(p&&p.catch)p.catch(function(){})}})}
function sync(){document.body.classList.toggle('paused',paused);if(motion){motion.textContent=paused?'\\u25B6 Animer':'\\u2161 Pause';motion.setAttribute('aria-pressed',String(paused));motion.setAttribute('aria-label',paused?'Reprendre les animations':'Mettre les animations en pause')}videos()}
sync();
if(motion)motion.addEventListener('click',function(){paused=!paused;sync()});
media.addEventListener&&media.addEventListener('change',function(){paused=media.matches;document.body.classList.toggle('reduced',media.matches);sync()});
var replay=document.querySelector('.replay');if(replay)replay.addEventListener('click',function(){var d=document.querySelector('.demo');if(d&&d.getAnimations)d.getAnimations({subtree:true}).forEach(function(a){a.currentTime=0;a.play()});paused=false;sync()});
var menu=document.querySelector('.menubtn');if(menu)menu.addEventListener('click',function(){var open=document.querySelector('.entete').classList.toggle('open');menu.setAttribute('aria-expanded',String(open));menu.setAttribute('aria-label',open?'Fermer le menu':'Ouvrir le menu')});
var themes={nature:['#d2c2a9','#252921'],studio:['#c6cde0','#172238'],pop:['#edb4db','#442444']};
document.querySelectorAll('[data-ambiance]').forEach(function(b){b.addEventListener('click',function(){var t=themes[b.dataset.ambiance],shop=document.querySelector('.storefront');if(!t||!shop)return;shop.style.setProperty('--store',t[0]);shop.style.setProperty('--store-ink',t[1]);document.querySelectorAll('[data-ambiance]').forEach(function(x){x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b))})})});
var action=document.querySelector('#action'),quantity=document.querySelector('#quantity');
if(action&&quantity){var euro=new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'});
function calculate(){var n=quantity.valueAsNumber;if(!isFinite(n)||n<1||n>10000||Math.floor(n)!==n){quantity.setCustomValidity('Choisissez un nombre entier de 1 à 10 000.');document.querySelector('#total').textContent='\\u2014';document.querySelector('#drops').textContent='Quantité : 1 à 10 000';return}quantity.setCustomValidity('');var drops=n*Number(action.value);document.querySelector('#total').textContent=euro.format(drops/100);document.querySelector('#drops').textContent=new Intl.NumberFormat('fr-FR').format(drops)+' drops'}
action.addEventListener('change',calculate);quantity.addEventListener('input',calculate);calculate()}
})()`

/* ---------- Gabarit ---------- */

function layout({ url, page, title: titreLong, description, jsonLd, body, degrade }) {
  const title = titreCourt(titreLong)
  const [accent, rgb] = ACCENTS[page]
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${SITE}${url}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="DropShipper IA">
<meta property="og:locale" content="fr_FR">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${SITE}${url}">
<meta name="twitter:card" content="summary">
<link rel="icon" type="image/png" sizes="48x48" href="/favicon-48.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700;800&display=swap">
<style>${CSS}${CSS_PIED}</style>
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body data-page="${page}" style="--accent:${accent};--rgb:${rgb};--degrade:${degrade || 'linear-gradient(90deg,#f28a4b,#e85290)'}">
<a class="skip" href="#main">Aller au contenu</a>
<header class="entete"><div class="entete-in">
  <a class="brand" href="/" aria-label="DropShipper IA, accueil"><img src="/marque/dropshipper-icone.png" alt="" width="34" height="34"><img class="mot" src="/marque/dropshipper-mot.png" alt="DropShipper IA" width="120" height="22"></a>
  <button class="menubtn" type="button" aria-label="Ouvrir le menu" aria-expanded="false">☰</button>
  <nav class="menu" aria-label="Sections">${NAV_STATIQUE.map(([href, label]) => `<a href="${href}"${href === url ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>
  <a class="entete-cta" href="/register">Créer un compte</a>
</div></header>
<main id="main">
${body}
</main>
<footer><div class="wrap">
${piedDePage(GUIDES)}
</div></footer>
<script>${JS}</script>
</body>
</html>
`
}

function crumb(trail) {
  return `<nav class="crumb" aria-label="Fil d'Ariane">${trail
    .map((item, i) => (i === trail.length - 1 ? esc(item.name) : `<a href="${item.url}">${esc(item.name)}</a>`))
    .join(' › ')}</nav>`
}

function hero({ trail, overline, h1, em, emDegrade, intro, cta, ctaHref = '/register', ctaClass = '', demo }) {
  return `<section class="hero"><div class="city" aria-hidden="true"></div><div class="lightline" aria-hidden="true"></div>
<div class="hero-inner"><div class="copy">${crumb(trail)}<div class="overline">${esc(overline)}</div>
<h1>${esc(h1)}<br><em${emDegrade ? ' class="degrade"' : ''}>${esc(em)}</em></h1>
<p class="intro">${esc(intro)}</p>
<a class="cta ${ctaClass}" href="${esc(ctaHref)}">${esc(cta)} <span aria-hidden="true">↗</span></a>
<p class="small">120 drops offerts · Sans abonnement</p></div>
<div class="visual">${demo}<div class="demo-controls"><span>APERÇU ILLUSTRATIF</span><button class="motion" type="button" aria-pressed="false">Ⅱ Pause</button><button class="replay" type="button">↻ Rejouer</button></div></div></div>
<div class="hero-foot"><span>LE PRODUIT AU CENTRE. L’IA À VOS CÔTÉS.</span><a href="#details">Comprendre la fonction ↓</a></div></section>`
}

/** Our own loop (the home page's), in the first block, without a frame (Max, 13/10). */
function video(slug, label) {
  return `<video class="tile-media" autoplay muted loop playsinline preload="metadata" poster="/images/accueil/${slug}.jpg" src="/images/accueil/${slug}.mp4" width="1280" height="720" aria-label="${esc(label)}"></video>`
}

function faqBloc(faq, { overline = 'AVANT DE COMMENCER', titre = 'Vos questions.<br>Des réponses courtes.' } = {}) {
  return `<div class="faq"><div><div class="overline">${overline}</div><h2>${titre}</h2></div><div>
${faq.map(({ q, a, html }) => `<details><summary>${esc(q)}<span aria-hidden="true">+</span></summary>${html || `<p>${esc(a)}</p>`}</details>`).join('\n')}
</div></div>`
}

function faqLd(faq) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.filter((f) => f.a).map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  }
}

function breadcrumbLd(trail) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((item, i) => ({ '@type': 'ListItem', position: i + 1, name: item.name, item: `${SITE}${item.url}` })),
  }
}

/** Les outils gratuits : ceux de la page d'abord, puis les autres. */
function outilsBloc(premiers = []) {
  const ordre = [...premiers, ...OUTILS.map((o) => o.slug).filter((s) => !premiers.includes(s))]
  const liste = ordre.map((s) => OUTILS.find((o) => o.slug === s)).filter(Boolean)
  return `<section class="bloc-liens"><div class="section-heading"><div><div class="overline">GRATUIT, SANS COMPTE</div><h2>Nos outils gratuits.</h2></div><p>Des calculateurs et générateurs à utiliser tout de suite, sans inscription.</p></div>
<div class="liens">${liste.map((o) => `<a href="/outils/${o.slug}/"><b>${esc(o.nom)}</b><small>${esc(o.court)}</small></a>`).join('')}</div></section>`
}

/** Toutes les fonctions sauf celle de la page, puis les tarifs. */
function fonctionsBloc(slugActuel) {
  const autres = ACCUEIL.themes.filter((t) => t.slug !== slugActuel)
  const tuiles = autres.map((t) => `<a href="/fonctions/${t.slug}/"><b>${esc(CONTENU[t.slug]?.nom ?? t.eyebrow)}</b><small>${esc(t.titre)}</small></a>`)
  if (slugActuel !== 'tarifs') tuiles.push('<a href="/tarifs/"><b>Tarifs</b><small>Le prix de chaque action, en drops, sans abonnement.</small></a>')
  return `<section class="bloc-liens"><div class="section-heading"><div><div class="overline">TOUT DROPSHIPPER IA</div><h2>Les autres fonctions.</h2></div><p>Du produit trouvé à la vente encaissée, chaque étape a son outil.</p></div>
<div class="liens">${tuiles.join('')}</div></section>`
}

/** Le texte long de fonctions-contenu.cjs, gardé pour le référencement. */
function articleBloc(t, c) {
  return `<div class="article"><div><div class="overline">EN DÉTAIL</div><h2>${esc(c.h1)}</h2></div><div class="prose">
<p class="bref"><strong>En bref.</strong> ${esc(c.enBref)}</p>
<h3>${esc(t.titre)}</h3>
<p>${esc(t.detail)}</p>
<h3>Ce que vous obtenez</h3>
<ul>${t.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
${c.sections.map((s) => `<h3>${esc(s.h2)}</h3>\n${s.html.replace(/<(\/?)h3>/g, '<$1h4>')}`).join('\n')}
</div></div>`
}

const SUITE = {
  'scraping-produits': ['/fonctions/annonces-ia/', 'Annonces'],
  'annonces-ia': ['/fonctions/dropshop-ia/', 'Boutiques'],
  'dropshop-ia': ['/fonctions/diffusion/', 'Diffusion'],
  diffusion: ['/tarifs/', 'Tarifs'],
  tarifs: ['/fonctions/scraping-produits/', 'Import'],
}
function suite(slug) {
  const [href, nom] = SUITE[slug]
  return `<a class="next" href="${href}"><div><span>LA SUITE DU PARCOURS</span><h3>${nom}</h3></div><b aria-hidden="true">↗</b></a>`
}

function enTeteSection(overline, titre, texte) {
  return `<div class="section-heading"><div><div class="overline">${esc(overline)}</div><h2>${esc(titre)}</h2></div><p>${esc(texte)}</p></div>`
}

/* ---------- Les quatre pages de fonction ---------- */

function demoImport() {
  return `<div class="import-demo demo"><div class="window source"><div class="windowbar"><span>Fiche fournisseur</span><span>•••</span></div><div class="product-image">${LAMPE}</div><div class="source-label">Lampe nomade Alba</div><div class="skeleton"></div><div class="skeleton short"></div></div><div class="flight">${CUBE}<span>Import</span><i></i><i></i><i></i></div><div class="window destination"><div class="windowbar"><span>Votre catalogue</span><span class="good">✓</span></div><div class="mini-product">${LAMPE}<div><b>Lampe nomade Alba</b><small>Décoration / Éclairage</small></div></div><div class="checkline">✓ Photos du produit</div><div class="checkline">✓ Variantes et prix</div><div class="checkline">✓ Annonce recomposée</div><div class="pill">Prête à vérifier</div></div></div>`
}

function pageImport(t, c) {
  const [, dropsUnite, eurosUnite] = ligne(/^Importer une annonce/)
  const [, dropsLot, eurosLot] = ligne(/^Importer en lot/)
  return {
    hero: {
      overline: '01 / Du fournisseur à votre catalogue',
      h1: 'Le bon produit.',
      em: 'Déjà chez vous.',
      intro: 'Collez son lien ou utilisez l’extension Chrome. Photos, variantes et description rejoignent votre catalogue ; l’IA prépare l’annonce.',
      cta: 'Importer mon premier produit',
      demo: demoImport(),
    },
    bento: `${enTeteSection('L’essentiel, simplement', 'Trois façons de commencer.', 'Choisissez celle qui correspond à votre fournisseur.')}
<div class="bento">
<article class="tile wide featured">${video(t.slug, `${c.nom} : ${t.titre}`)}<span class="tile-icon" aria-hidden="true">↗</span><h3>Une adresse. Un produit.</h3><p>Copiez le lien de la fiche fournisseur. DropShipper récupère les informations et prépare votre annonce.</p><div class="urlbar"><span>https://fournisseur.fr/mon-produit</span><b aria-hidden="true">↗</b></div><span class="footnote">Pour les sites lisibles par adresse.</span></article>
<article class="tile"><span class="tile-icon" aria-hidden="true">◉</span><h3>L’extension Chrome</h3><p>Sur AliExpress, Temu ou Shein, ouvrez la fiche puis importez le produit depuis votre navigateur.</p><a class="textlink" href="${CHROME_STORE}" rel="noopener" target="_blank">Installer l’extension ↗</a></article>
<article class="tile"><span class="tile-icon" aria-hidden="true">▤</span><h3>Plusieurs produits à la fois</h3><p>Constituez votre sélection et importez-la en lot. La réécriture est comprise.</p><span class="stat">${esc(eurosLot)} <small>/ annonce en lot · ${dropsLot} drops</small></span></article>
<article class="tile wide"><span class="tile-icon" aria-hidden="true">✦</span><h3>Les informations utiles. Au bon endroit.</h3><p>Photos du produit, variantes, prix et description. Le code-barres et les avis sont repris lorsqu’ils sont disponibles.</p><div class="tokens"><span>Photos</span><span>Variantes</span><span>Prix en euros</span><span>Description</span><span>EAN</span><span>Avis</span></div></article>
<article class="tile full"><span class="tile-icon" aria-hidden="true">◎</span><h3>${FOURNISSEURS.length} fournisseurs référencés</h3><p>Pour chacun, le mode d’import qui marche et ses vraies conditions : délais, douane, dropshipping autorisé ou non.</p><a class="textlink" href="/fonctions/fournisseurs/">Voir les fournisseurs ↗</a></article>
<article class="tile price"><span class="overline">Import + annonce IA</span><strong>${grosPrix(eurosUnite)}</strong><p>${dropsUnite} drops par annonce, par adresse ou extension.</p><a class="textlink" href="/tarifs/">Tous les tarifs ↗</a></article>
</div>`,
    questions: [
      { q: 'Dois-je réécrire l’annonce moi-même ?', a: 'Non. La réécriture IA est comprise dans l’import. Vous pouvez vérifier et modifier le résultat avant sa diffusion.' },
      { q: 'Que se passe-t-il si la fiche manque d’informations ?', a: 'Une fiche sans matière reste en brouillon plutôt que de recevoir des caractéristiques inventées, et le crédit de réécriture est rendu.' },
    ],
  }
}

function demoAnnonces() {
  return `<div class="writing-demo demo"><div class="raw-note"><small>FICHE SOURCE</small><p>ALBA / portable lamp<br>color: sand / USB-C<br>3 brightness settings</p></div><div class="window written"><div class="windowbar"><span>✦ Annonce IA</span><span class="good">Brouillon</span></div><div class="mini-product">${LAMPE}<div><small>ÉCLAIRAGE</small><b>Lampe nomade Alba</b></div></div><p class="revealtext">Un éclairage à emporter d’une pièce à l’autre, avec trois niveaux de luminosité.</p><div class="checkline">✓ Recharge USB-C</div><div class="checkline">✓ Coloris sable</div><div class="checkline">✓ 3 niveaux de luminosité</div><div class="tokens"><span>Titre</span><span>Description</span><span>Mots-clés</span></div></div><div class="floating-label">Votre dernière touche. Votre annonce.</div></div>`
}

function pageAnnonces(t, c) {
  const [, dropsUnite, eurosUnite] = ligne(/^Importer une annonce/)
  const [, dropsLot, eurosLot] = ligne(/^Importer en lot/)
  const [, dropsRefaire, eurosRefaire] = ligne(/^Refaire la réécriture/)
  return {
    hero: {
      overline: '02 / La fiche devient une annonce',
      h1: 'L’IA prépare.',
      em: 'Vous validez.',
      intro: 'Transformez les informations du fournisseur en titre, description et caractéristiques. Relisez, ajustez et choisissez vos canaux.',
      cta: 'Créer ma première annonce',
      demo: demoAnnonces(),
    },
    bento: `${enTeteSection('L’essentiel, simplement', 'Une fiche claire. Prête à être trouvée.', 'Tout ce qui aide votre client à comprendre le produit, et les moteurs à le montrer.')}
<div class="bento">
<article class="tile wide featured">${video(t.slug, `${c.nom} : ${t.titre}`)}<span class="tile-icon" aria-hidden="true">✦</span><h3>Du contenu prêt à travailler</h3><p>Titres, description et arguments de vente sont préparés à partir de la fiche source, en français.</p><div class="text-preview"><span>TITRE</span><b>Lampe nomade Alba — coloris sable</b><span>DESCRIPTION</span><p>Une lumière réglable pour accompagner vos moments de détente.</p></div></article>
<article class="tile"><span class="tile-icon" aria-hidden="true">⌘</span><h3>Les caractéristiques structurées</h3><p>Matière, couleur, dimensions et autres informations disponibles sont rangées dans les bons champs.</p></article>
<article class="tile"><span class="tile-icon" aria-hidden="true">↔</span><h3>Un titre adapté au canal</h3><p>Trois longueurs de titre : chaque destination reçoit celle qui lui va. Vous gardez une fiche centrale.</p><div class="tokens"><span>Court</span><span>Moyen</span><span>Long</span></div></article>
<article class="tile wide featured"><span class="tile-icon" aria-hidden="true">⌕</span><h3>Écrite pour le référencement</h3><p>Chaque annonce reçoit ses mots-clés, un méta-titre et une méta-description, pour que votre boutique et vos fiches remontent dans les recherches. Le texte est original : recopier la fiche du fournisseur fait sanctionner le référencement.</p><div class="tokens"><span>12 mots-clés</span><span>Méta-titre</span><span>Méta-description</span><span>Catégorie</span><span>Texte original</span></div></article>
<article class="tile full"><span class="tile-icon" aria-hidden="true">✓</span><h3>Vérifiez avant de publier</h3><p>Complétez les informations manquantes et ajustez le texte. Les exigences de la destination sont contrôlées avant l’envoi.</p><a class="textlink" href="/fonctions/diffusion/">Passer à la diffusion ↗</a></article>
<article class="tile price"><span class="overline">Import + réécriture</span><strong>${grosPrix(eurosUnite)}</strong><p>Ou ${esc(eurosLot)} par annonce en lot. Une nouvelle réécriture : ${esc(eurosRefaire)}.</p><a class="textlink" href="/tarifs/">Tous les tarifs ↗</a></article>
</div>`,
    questions: [
      { q: 'L’IA invente-t-elle les caractéristiques ?', a: 'Non. Elle s’appuie sur les données de la fiche source ; si la matière est insuffisante, l’annonce reste en brouillon. Relisez toujours le résultat.' },
      { q: 'La réécriture est-elle facturée en plus de l’import ?', a: `Non. Elle est comprise dans les ${dropsUnite} drops de l’import, ou ${dropsLot} drops par annonce en lot. Refaire ensuite une réécriture coûte ${dropsRefaire} drops.` },
      { q: 'Mes annonces sont-elles optimisées pour le SEO ?', a: 'Oui. Chaque annonce reçoit ses mots-clés, un méta-titre, une méta-description et une catégorie. Le texte est réécrit, jamais recopié du fournisseur, ce que les moteurs de recherche pénalisent.' },
    ],
  }
}

function demoBoutiques() {
  return `<div class="shop-demo demo"><div class="prompt-note">✦ « Une boutique de décoration douce et naturelle. »</div><div class="storefront window"><div class="store-nav"><b>ALBA STUDIO</b><span>Collection &nbsp; À propos &nbsp; ◇</span></div><div class="store-hero"><div><small>LES OBJETS DU QUOTIDIEN</small><h3>Une lumière.<br>Une atmosphère.</h3><span class="store-button">La collection ↗</span></div>${LAMPE}</div><div class="store-products"><div>${LAMPE}<small>Éclairages</small></div><div><div class="vase"></div><small>Objets</small></div><div><div class="cushion"></div><small>Textiles</small></div></div></div><div class="floating-label">Votre logo. Vos couleurs. Vos produits.</div></div>`
}

function pageBoutiques(t, c) {
  const b = boutique()
  const [, dropsBo, eurosBo] = ligne(/^Extension Back Office/)
  return {
    degrade: DEGRADE_DROPSHOP,
    hero: {
      overline: '03 / DropShop, à votre image',
      h1: 'Vos produits.',
      em: 'Votre boutique.',
      emDegrade: true,
      intro: 'Décrivez votre univers, ajoutez votre logo et choisissez une direction. DropShop crée une boutique reliée à votre catalogue.',
      cta: 'Créer ma boutique',
      ctaClass: 'dropshop',
      demo: demoBoutiques(),
    },
    bento: `${enTeteSection('L’essentiel, simplement', 'Une boutique pour chaque univers.', 'Un catalogue central, autant de boutiques thématiques que vous le souhaitez.')}
<div class="bento">
<article class="tile wide featured">${video(t.slug, `${c.nom} : ${t.titre}`)}<span class="tile-icon" aria-hidden="true">◇</span><h3>Décrivez. Choisissez. Personnalisez.</h3><p>Ajoutez votre logo et décrivez votre boutique. Choisissez parmi trois directions, puis demandez vos modifications en français.</p><div class="direction-picker" role="group" aria-label="Changer les couleurs de l’exemple"><button type="button" data-ambiance="nature" class="selected" aria-pressed="true">Nature</button><button type="button" data-ambiance="studio" aria-pressed="false">Studio</button><button type="button" data-ambiance="pop" aria-pressed="false">Pop</button></div><span class="footnote">Essayez une ambiance sur l’aperçu du haut de page.</span></article>
<article class="tile price"><span class="overline">Par boutique${b.uneFois ? ' · une fois' : ''}</span><strong>${grosPrix(b.prix)}</strong><p>Hébergement et ${esc(b.modifs.court)}. ${nombre(b.drops)} drops.</p><a class="textlink" href="/tarifs/">Tous les tarifs ↗</a></article>
<article class="tile"><span class="tile-icon" aria-hidden="true">▦</span><h3>Votre catalogue connecté</h3><p>Associez les produits à chaque boutique. Retrouvez commandes, clients et suivi dans DropShipper.</p></article>
<article class="tile wide"><span class="tile-icon" aria-hidden="true">↗</span><h3>De la fiche au paiement</h3><p>Catalogue, panier, commande et e-mails sont intégrés. Les paiements sont versés sur votre compte Stripe.</p><div class="tokens"><span>Catalogue</span><span>Panier</span><span>Commande</span><span>E-mails</span><span>Stripe</span></div></article>
<article class="tile"><span class="tile-icon" aria-hidden="true">✎</span><h3>Faites-la évoluer</h3><p>${esc(b.modifs.long)} Vous pouvez revenir à une version précédente.</p></article>
<article class="tile wide"><span class="tile-icon" aria-hidden="true">⚿</span><h3>Un back-office à part</h3><p>Une administration propre à la boutique, avec identifiant et mot de passe, pour un associé ou un employé.</p><span class="stat">${esc(eurosBo)} <small>· ${dropsBo} drops</small></span></article>
<article class="tile full featured"><span class="tile-icon" aria-hidden="true">◈</span><h3>Vos produits aussi sur DropShop Market</h3><p>DropShop Market, la marketplace des boutiques DropShop, est ouverte : vos produits y gagnent une vitrine de plus, en plus de votre boutique.</p><a class="textlink" href="${MARKET}" rel="noopener" target="_blank">Consulter la marketplace ↗</a></article>
<article class="tile full"><span class="tile-icon" aria-hidden="true">0 €</span><h3>Une vitrine gratuite, aussi</h3><p>Une vitrine à thèmes, gratuite, reste disponible. Elle est distincte de la boutique écrite par l’IA.</p><a class="textlink" href="/register">Créer mon compte ↗</a></article>
</div>`,
    questions: [
      { q: 'Puis-je créer plusieurs boutiques ?', a: `Oui. Chaque boutique est facturée séparément${b.uneFois ? ', une seule fois' : ''}. Vous pouvez créer un univers par niche, produit ou marché.` },
      { q: 'La marque DropShipper apparaît-elle dans la boutique ?', a: 'Non. La boutique porte votre nom, votre logo et vos couleurs, sans mention DropShipper.' },
      { q: 'Existe-t-il une option gratuite ?', a: `Oui : une vitrine à thèmes, gratuite. Elle est distincte de la boutique écrite par l’IA à ${b.prix}.` },
    ],
  }
}

function demoDiffusion(parType) {
  const n = (type) => `<em>${parType[type] || 0}</em>`
  return `<div class="network-demo demo"><svg viewBox="0 0 540 360" aria-hidden="true"><path d="M270 180 Q170 40 65 65 M270 180 Q400 30 475 65 M270 180H55 M270 180H485 M270 180 Q180 310 65 295 M270 180 Q380 300 475 295"/></svg><div class="hub">${CUBE}<b>Votre catalogue</b></div><span class="node n1">Boutiques</span><span class="node n2">Marketplaces${n('marketplace')}</span><span class="node n3">Comparateurs${n('comparateur')}</span><span class="node n4">Outils${n('outil')}</span><span class="node n5">Affiliation${n('affiliation')}</span><span class="node n6">Régies${n('regie')}</span><div class="network-caption"><b>${canaux.length}</b> canaux référencés</div></div>`
}

function pageDiffusion(t, c) {
  const parType = {}
  for (const x of canaux) parType[x.type] = (parType[x.type] || 0) + 1
  return {
    hero: {
      overline: '04 / Un catalogue, plusieurs destinations',
      h1: 'Préparez une fois.',
      em: 'Diffusez plus loin.',
      emDegrade: true,
      intro: 'Retrouvez vos boutiques, marketplaces et réseaux dans un même espace. Chaque destination dispose de son mode de connexion.',
      cta: 'Préparer ma diffusion',
      demo: demoDiffusion(parType),
    },
    bento: `${enTeteSection('L’essentiel, simplement', 'La bonne connexion, pour chaque canal.', 'Publication directe, flux, fichier ou assistance : sachez comment votre annonce est envoyée.')}
<div class="bento">
<article class="tile wide featured">${video(t.slug, `${c.nom} : ${t.titre}`)}<span class="tile-icon" aria-hidden="true">↗</span><h3>Publication directe</h3><p>Connectez vos comptes compatibles. Les fiches sont transmises avec leurs photos, variantes et informations.</p><div class="tokens"><span>Votre boutique</span><span>Shopify</span><span>WooCommerce</span><span>PrestaShop</span><span>eBay</span><span>Kaufland</span><span>Enseignes Mirakl</span></div></article>
<article class="tile"><span class="tile-icon" aria-hidden="true">⇄</span><h3>Flux produit</h3><p>Fournissez l’adresse du flux à votre espace marchand : il sert de source pour votre catalogue.</p><div class="tokens"><span>Google Shopping</span><span>Meta</span><span>Comparateurs</span></div></article>
<article class="tile"><span class="tile-icon" aria-hidden="true">▤</span><h3>Fichier à déposer</h3><p>Certains canaux utilisent un fichier catalogue. Suivez le mode de liaison indiqué pour la destination.</p></article>
<article class="tile wide"><span class="tile-icon" aria-hidden="true">✓</span><h3>L’extension prépare. Vous publiez.</h3><p>Sur Vinted, Leboncoin et Facebook Marketplace, l’extension remplit le formulaire. Vous relisez et cliquez sur « Publier ».</p><div class="notice">La validation finale reste entre vos mains.</div></article>
<article class="tile full"><span class="tile-icon" aria-hidden="true">0 €</span><h3>Diffusion gratuite</h3><p>La publication, les flux catalogue et l’annuaire des ${canaux.length} canaux sont gratuits. L’import et la réécriture sont facturés séparément.</p><a class="textlink" href="/tarifs/">Voir les coûts ↗</a></article>
</div>`,
    questions: [
      { q: `Les ${canaux.length} canaux ont-ils tous une publication automatique ?`, a: 'Non. L’annuaire inclut plusieurs modes de liaison : publication directe, flux, fichier ou extension. Vérifiez celui de votre destination et les conditions de votre compte vendeur.' },
      { q: 'Puis-je publier plusieurs annonces à la fois ?', a: 'Oui, la publication en lot est proposée. Les modalités dépendent du canal choisi et des informations qu’il exige.' },
    ],
  }
}

const FABRIQUES = { 'scraping-produits': pageImport, 'annonces-ia': pageAnnonces, 'dropshop-ia': pageBoutiques, diffusion: pageDiffusion }
const PAGE_DE = { 'scraping-produits': 'import', 'annonces-ia': 'annonces', 'dropshop-ia': 'boutiques', diffusion: 'diffusion' }

/** Une des quatre pages du menu, ou null pour les autres fonctions (gabarit inchangé). */
function pageFonctionRefonte(t, index) {
  const fab = FABRIQUES[t.slug]
  if (!fab) return null
  const url = `/fonctions/${t.slug}/`
  const c = CONTENU[t.slug]
  const p = fab(t, c)
  const trail = [{ name: 'Accueil', url: '/' }, { name: 'Fonctions', url: '/#' + t.slug }, { name: c.nom, url }]
  const faq = [...p.questions, ...c.faq]
  return {
    url,
    html: layout({
      url,
      page: PAGE_DE[t.slug],
      degrade: p.degrade,
      title: c.title,
      description: c.description,
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: c.h1,
          url: `${SITE}${url}`,
          inLanguage: 'fr-FR',
          description: c.description,
          isPartOf: { '@id': `${SITE}/#site` },
          about: { '@id': `${SITE}/#application` },
          position: index + 1,
        },
        faqLd(faq),
        breadcrumbLd(trail),
      ],
      body: `${hero({ trail, ...p.hero })}
<section class="content" id="details">
${p.bento}
${faqBloc(faq)}
${articleBloc(t, c)}
${outilsBloc(c.outils)}
${fonctionsBloc(t.slug)}
${suite(t.slug)}
</section>`,
    }),
  }
}

/* ---------- Tarifs ---------- */

/** Une ligne de grille sans sa parenthèse ni son « — … » : le libellé court du simulateur. */
const libelleCourt = (nom) => nom.replace(/\s*\([^)]*\)/g, '').replace(/\s+—.*$/, '').trim()
/** Pas d'étiquette « bientôt » sur le site (décision de Max, 12/10/2026). */
const enService = (l) => !/bientôt/i.test(l[0])

function pageTarifsRefonte({ RECHARGES, familles, faqTarifs }) {
  const url = '/tarifs/'
  const trail = [{ name: 'Accueil', url: '/' }, { name: 'Tarifs', url }]
  const [, dropsUnite, eurosUnite] = ligne(/^Importer une annonce/)
  const exemple = 10
  const payants = TARIFS.filter(enService).filter(([, d]) => d > 0)
  const b = boutique()
  const courants = [/^Importer une annonce/, /^Importer en lot/, /photo en situation/, /publicité/, /^DropShop IA : création/].map(ligne)
  const offres = {
    '@context': 'https://schema.org',
    '@type': 'OfferCatalog',
    name: 'Tarifs de DropShipper IA',
    url: `${SITE}${url}`,
    itemListElement: TARIFS.filter(enService).map(([nom, drops]) => ({ '@type': 'Offer', name: nom, price: (drops / 100).toFixed(2), priceCurrency: 'EUR' })),
  }
  const table = (lignes) => `<div class="table-scroll"><table><thead><tr><th>Action</th><th>Drops</th><th>Euros</th></tr></thead><tbody>
${lignes.map(([nom, drops, eur]) => `<tr><td>${esc(nom)}</td><td class="n">${drops}</td><td class="n">${esc(eur)}</td></tr>`).join('\n')}
</tbody></table></div>`
  const grille = [
    ...familles()
      .map(([titre, lignes]) => [titre, lignes.filter(enService)])
      .filter(([, l]) => l.length)
      .map(([titre, lignes]) => ({ q: titre, html: table(lignes) })),
    {
      q: 'Les recharges et leurs remises',
      html: `<div class="table-scroll"><table><thead><tr><th>Vous payez</th><th>Vous recevez</th><th>Prix du drop</th></tr></thead><tbody>
${RECHARGES.map(([prix, drops, unite]) => `<tr><td>${esc(prix)}</td><td>${esc(drops)}</td><td class="n">${esc(unite)}</td></tr>`).join('\n')}
</tbody></table></div><p>Le prix d’une action en drops ne change pas avec la recharge : c’est le drop qui coûte moins cher quand on en achète davantage.</p>`,
    },
  ]
  const faq = faqTarifs()
  const demo = `<div class="pricing-demo demo"><img class="coin" src="/marque/drops.png" alt="" width="96" height="96"><div class="receipt window"><div class="windowbar"><span>Exemple d’utilisation</span><span>•••</span></div><div class="receiptrow"><span>${exemple} imports avec annonce IA</span><b>${nombre(exemple * dropsUnite)} drops</b></div><div class="receiptrow"><span>Coût au tarif de base</span><b>${euros(exemple * dropsUnite)}</b></div><div class="receiptrow"><span>Crédit de bienvenue</span><b>120 drops</b></div><div class="receipt-total"><span>${exemple * dropsUnite <= 120 ? `${exemple} premiers imports couverts` : 'Reste à payer'}</span><strong>${euros(Math.max(0, exemple * dropsUnite - 120))}</strong></div></div><div class="floating-label">1 drop = 0,01 € au tarif de base</div></div>`
  return {
    url,
    html: layout({
      url,
      page: 'tarifs',
      title: `Tarifs DropShipper IA : ${eurosUnite} l'annonce, sans abonnement`,
      description: `La grille complète de DropShipper IA : chaque action a son prix en drops (1 drop = 0,01 €). Aucun abonnement, 120 drops offerts à l'inscription.`,
      jsonLd: [offres, faqLd(faq), breadcrumbLd(trail)],
      body: `${hero({
        trail,
        overline: '05 / Sans abonnement',
        h1: 'Chaque action.',
        em: 'Son juste montant.',
        intro: 'Vous payez les actions utilisées, en drops. Les prix ci-dessous sont affichés en euros pour vous aider à choisir.',
        cta: 'Profiter des 120 drops offerts',
        demo,
      })}
<section class="content" id="details">
${enTeteSection('L’essentiel, simplement', 'Combien pour votre projet ?', 'Une estimation immédiate, avant d’utiliser votre crédit.')}
<div class="bento">
<article class="tile calculator wide featured"><span class="overline">Simulateur</span><h3>Choisissez une action.</h3><label for="action">Action</label><select id="action">${payants.map(([nom, drops], i) => `<option value="${drops}"${i === 0 ? ' selected' : ''}>${esc(libelleCourt(nom))}</option>`).join('')}</select><div class="quantity"><label for="quantity">Quantité</label><input id="quantity" type="number" min="1" max="10000" value="${exemple}" inputmode="numeric"></div><div class="estimate" aria-live="polite"><strong id="total">${euros(exemple * payants[0][1])}</strong><span id="drops">${nombre(exemple * payants[0][1])} drops</span></div><p class="footnote">Tarif de base, avant crédit offert et remise sur recharge. Simulation sans achat.</p></article>
<article class="tile">${video('les-drops', 'Les drops, la monnaie de DropShipper IA')}<h3>120 drops offerts</h3><p>De quoi importer ${Math.floor(120 / dropsUnite)} annonces à ${dropsUnite} drops. La réécriture IA est comprise.</p><a class="textlink" href="/register">Créer mon compte ↗</a></article>
<article class="tile"><span class="tile-icon" aria-hidden="true">✓</span><h3>Vous payez à l’usage</h3><p>Aucun abonnement. Le crédit est rendu quand une action échoue : une réécriture non faite, une boutique qui n’aboutit pas.</p></article>
<article class="tile wide"><span class="overline">Les actions les plus courantes</span><h3>Des prix concrets.</h3><div class="price-list">${courants.map(([nom, , eur]) => `<div><span>${esc(libelleCourt(nom))}</span><b>${esc(eur)}</b></div>`).join('')}</div></article>
<article class="tile full"><span class="tile-icon" aria-hidden="true">0 €</span><h3>Déjà compris</h3><p>Inscription, extension Chrome, flux catalogue, annuaire des ${canaux.length} canaux et des ${FOURNISSEURS.length} fournisseurs, analyses quotidiennes en AUTO-MODE. Une vitrine à thèmes gratuite est aussi disponible.</p></article>
</div>
${faqBloc(grille, { overline: 'LA GRILLE COMPLÈTE', titre: 'Tous les prix.<br>Sans détour.' })}
${faqBloc(faq)}
${outilsBloc(['calculateur-marge'])}
${fonctionsBloc('tarifs')}
${suite('tarifs')}
</section>`,
    }),
  }
}

module.exports = { pageFonctionRefonte, pageTarifsRefonte, boutique }
