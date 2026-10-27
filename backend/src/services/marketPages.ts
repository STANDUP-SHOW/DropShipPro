import { absoluteUrl } from '../lib/urls.js'
import { marketUrl, descriptionDe, attributGoogle, etatPour, type Annonce, type Offre, type Rayon } from './market.js'

/**
 * Les pages de DropShop Market, rendues côté serveur.
 *
 * Rendues ici et non par l'application React : Google indexe ce qu'il reçoit,
 * et une page produit qui n'existe qu'après exécution du JavaScript se
 * référence mal et tard. Chaque page arrive donc complète — titre, prix,
 * variantes en liens, données structurées schema.org — et ne garde qu'un
 * soupçon de JavaScript (la galerie).
 *
 * `base` est le préfixe des liens : vide sur drop-shop.cloud, `/market` quand
 * le Market est servi sous l'adresse de l'API (aperçu). Les adresses
 * canoniques, elles, sont toujours celles de drop-shop.cloud.
 */

export function e(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** JSON-LD dans un <script> : `</script>` ne doit jamais pouvoir s'y fermer. */
function jsonLd(data: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`
}

export function prixTexte(p: number, devise = 'EUR'): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: devise }).format(p)
}

const canon = (chemin: string) => `${marketUrl()}${chemin}`

interface Gabarit {
  base: string
  titre: string
  description: string
  chemin: string | null
  corps: string
  indexable?: boolean
  recherche?: string
  image?: string | null
  head?: string
  /** Les 24 catégories, pour la barre sous l'en-tête. */
  rayons?: Rayon[]
}

const CSS = `
:root{--degrade:linear-gradient(90deg,#07eeb7 0%,#4a98eb 30%,#8c5ed0 50%,#dd2488 70%,#f48e35 90%,#ffc90b 100%);--nuit:#01020f;--nuit-2:#0d0b24;--accent:#6b3fc4;--accent-clair:#f1ecfb;--encre:#15122a;--gris:#5d5a70;--fond:#f6f5fa;--carte:#fff;--trait:#e4e2ee}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--encre);background:var(--fond);line-height:1.5}
a{color:inherit;text-decoration:none}a:hover{text-decoration:underline}
img{max-width:100%;display:block}
.wrap{max-width:1200px;margin:0 auto;padding:0 16px}
header.top{background:var(--nuit);color:#fff;position:sticky;top:0;z-index:10;box-shadow:0 2px 0 0 transparent}
header.top::after{content:"";display:block;height:3px;background:var(--degrade)}
header.top .wrap{display:flex;align-items:center;gap:16px;min-height:64px;flex-wrap:wrap;padding-top:8px;padding-bottom:8px}
.logo{display:flex;align-items:center;flex:none}.logo img{height:44px;width:auto}
form.cherche{flex:1;display:flex;min-width:220px}
form.cherche input{flex:1;border:0;border-radius:999px 0 0 999px;padding:11px 14px;font:inherit;font-size:15px;min-width:0}
form.cherche button{border:0;border-radius:0 999px 999px 0;background:var(--degrade);color:#fff;font-weight:700;padding:0 20px;font:inherit;cursor:pointer;text-shadow:0 1px 2px rgba(0,0,0,.4)}
.vendre{font-weight:600;font-size:14px;border:1px solid rgba(255,255,255,.5);border-radius:999px;padding:7px 14px;white-space:nowrap}
nav.rayons{background:var(--nuit-2);color:#e7e4f5;font-size:14px;position:relative}
nav.rayons .wrap{display:flex;gap:6px;align-items:center;padding-top:6px;padding-bottom:6px}
nav.rayons .defile{display:flex;gap:16px;overflow-x:auto;white-space:nowrap;scrollbar-width:none;flex:1}
nav.rayons .defile::-webkit-scrollbar{display:none}
nav.rayons details{flex:none}
nav.rayons summary{list-style:none;cursor:pointer;font-weight:700;background:rgba(255,255,255,.12);border-radius:8px;padding:5px 12px;white-space:nowrap}
nav.rayons summary::-webkit-details-marker{display:none}
.mega{position:absolute;left:0;right:0;top:100%;background:#fff;color:var(--encre);box-shadow:0 18px 40px rgba(0,0,0,.18);z-index:20;max-height:70vh;overflow:auto}
.mega .wrap{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:18px 24px;padding-top:20px!important;padding-bottom:24px!important;align-items:start!important}
.mega h3{font-size:14px;margin:0 0 6px}.mega h3 a{color:var(--accent)}
.mega ul{list-style:none;margin:0;padding:0;font-size:13px;color:var(--gris)}.mega li{margin:3px 0}
.btn-prime{display:inline-flex;align-items:center;gap:8px;background:var(--degrade);color:#fff;font-weight:800;letter-spacing:.12em;border-radius:999px;padding:5px 16px 5px 5px;white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,.4)}
.btn-prime i{display:block;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3)}
.btn-prime:hover{text-decoration:none;filter:brightness(1.05)}
.prime{display:inline-flex;align-items:center;gap:4px;background:var(--degrade);color:#fff;font-weight:800;font-size:11px;border-radius:999px;padding:2px 9px;letter-spacing:.08em;text-shadow:0 1px 2px rgba(0,0,0,.4)}
.prime-gros{font-size:14px;padding:5px 12px}
.carte .img{position:relative}.carte .img .prime{position:absolute;top:8px;left:8px}
.bandeau-prime{display:flex;align-items:center;gap:16px;flex-wrap:wrap;border:2px solid transparent;background:linear-gradient(#fff,#fff) padding-box,var(--degrade) border-box;border-radius:16px;padding:16px 20px;margin:0 0 28px}
.bandeau-prime b{font-size:18px}
.tuiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-bottom:28px}
.tuile{background:#fff;border:1px solid var(--trait);border-radius:14px;padding:14px 12px;display:flex;flex-direction:column;gap:6px;font-weight:600;font-size:14px;line-height:1.25}
.tuile span{font-size:26px}.tuile:hover{border-color:var(--accent);text-decoration:none}
.puces{display:flex;flex-wrap:wrap;gap:8px;margin:4px 0 22px}
.puces a{background:#fff;border:1px solid var(--trait);border-radius:999px;padding:6px 13px;font-size:13px}
.puces a.on{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:700}
main{padding:24px 0 48px}
h1{font-size:clamp(22px,3vw,30px);line-height:1.2;margin:0 0 8px;letter-spacing:-.01em}
h2{font-size:20px;margin:32px 0 12px}
.hero{position:relative;overflow:hidden;background:radial-gradient(120% 140% at 0% 100%,rgba(7,238,183,.28),transparent 55%),radial-gradient(120% 140% at 100% 0%,rgba(255,201,11,.22),transparent 55%),radial-gradient(90% 120% at 60% 50%,rgba(140,94,208,.35),transparent 70%),var(--nuit);color:#fff;border-radius:18px;padding:32px 28px;margin-bottom:28px}
.hero::after{content:"";position:absolute;left:0;right:0;bottom:0;height:4px;background:var(--degrade)}
.hero .europe{display:inline-block;background:var(--degrade);color:#fff;font-size:12px;font-weight:800;letter-spacing:.3em;padding:3px 10px;border-radius:4px;margin-bottom:10px;text-shadow:0 1px 2px rgba(0,0,0,.4)}
.hero p{margin:6px 0 0;opacity:.9;max-width:640px}
.grille{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:16px}
.carte{background:var(--carte);border:1px solid var(--trait);border-radius:14px;overflow:hidden;display:flex;flex-direction:column;transition:box-shadow .15s}
.carte:hover{box-shadow:0 6px 24px rgba(0,0,0,.08);text-decoration:none}
.carte .img{aspect-ratio:1/1;background:#fff;display:flex;align-items:center;justify-content:center}
.carte .img img{width:100%;height:100%;object-fit:contain}
.carte .txt{padding:10px 12px 14px;display:flex;flex-direction:column;gap:4px;flex:1}
.carte .t{font-size:14px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.carte .p{font-weight:800;font-size:17px;margin-top:auto}.carte .p small{font-weight:500;color:var(--gris);font-size:12px}
.carte .v{font-size:12px;color:var(--gris)}
.etoiles{color:#f5a623;letter-spacing:1px}.note{font-size:12px;color:var(--gris)}
.vedettes{position:relative;margin:0 0 28px}
.vedettes h2{margin:0 0 12px}
.vedettes .piste{display:flex;gap:14px;overflow-x:auto;scroll-snap-type:x mandatory;scroll-behavior:smooth;scrollbar-width:none;padding:2px 2px 6px}
.vedettes .piste::-webkit-scrollbar{display:none}
.vedettes .carte{flex:0 0 190px;scroll-snap-align:start}
.vedettes .fleche{position:absolute;top:50%;width:42px;height:42px;border-radius:50%;border:0;background:var(--nuit);color:#fff;font-size:20px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.3);z-index:2}
.vedettes .fleche.g{left:-12px}.vedettes .fleche.d{right:-12px}
.vedettes .fleche:hover{background:var(--accent)}
@media (max-width:640px){.vedettes .fleche{display:none}.vedettes .carte{flex-basis:160px}}
.avis{border-top:1px solid var(--trait);padding:14px 0}.avis:first-of-type{border-top:0}.avis p{margin:6px 0}
.avis .ph{display:flex;gap:6px;margin-top:6px}.avis .ph img{width:64px;height:64px;object-fit:cover;border-radius:8px}
.fil{font-size:13px;color:var(--gris);margin-bottom:12px}.fil a{color:var(--accent)}
.fiche{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:32px}
@media (max-width:820px){.fiche{grid-template-columns:1fr}}
.galerie .principale{background:#fff;border:1px solid var(--trait);border-radius:16px;aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;overflow:hidden}
.galerie .principale img{width:100%;height:100%;object-fit:contain}
.vignettes{display:flex;gap:8px;margin-top:10px;overflow-x:auto}
.vignettes button{border:1px solid var(--trait);background:#fff;border-radius:10px;padding:0;width:64px;height:64px;flex:none;cursor:pointer;overflow:hidden}
.vignettes img{width:100%;height:100%;object-fit:cover}
.prix{font-size:32px;font-weight:800;color:var(--accent);margin:8px 0 2px}
.muted{color:var(--gris);font-size:14px}
.option{margin:16px 0}.option b{display:block;font-size:14px;margin-bottom:6px}
.choix{display:flex;flex-wrap:wrap;gap:8px}
.choix a{border:1.5px solid var(--trait);background:#fff;border-radius:10px;padding:7px 12px;font-size:14px}
.choix a.on{border-color:var(--accent);background:var(--accent-clair);font-weight:700}
.choix a.off{opacity:.45;text-decoration:line-through}
.achat{display:flex;gap:10px;margin:18px 0 8px;flex-wrap:wrap}
.achat input{width:80px;border:1.5px solid var(--trait);border-radius:12px;padding:12px;font:inherit;font-size:16px}
.btn{display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:999px;background:var(--degrade);color:#fff;font-weight:800;font-size:15px;letter-spacing:.04em;text-transform:uppercase;padding:13px 28px;cursor:pointer;font-family:inherit;text-shadow:0 1px 2px rgba(0,0,0,.45);box-shadow:0 6px 18px rgba(140,94,208,.3)}
.btn:hover{text-decoration:none;filter:brightness(1.05)}.btn[disabled]{background:#cbc9d6;box-shadow:none;cursor:not-allowed}
.atouts{list-style:none;padding:0;margin:14px 0;font-size:14px;color:var(--gris)}.atouts li::before{content:"✓ ";color:var(--accent);font-weight:800}
.bloc{background:var(--carte);border:1px solid var(--trait);border-radius:16px;padding:20px 22px;margin-top:24px}
.bloc p{margin:0 0 10px}
table.caract{border-collapse:collapse;width:100%;font-size:14px}table.caract td{border-top:1px solid var(--trait);padding:8px 6px;vertical-align:top}table.caract td:first-child{color:var(--gris);width:40%}
.vendeur{display:inline-block;font-size:14px;color:var(--accent);font-weight:600}
.pager{display:flex;gap:10px;justify-content:center;margin-top:28px}
.pager a{background:#fff;border:1px solid var(--trait);border-radius:10px;padding:8px 14px}
footer{background:var(--nuit);color:#c9c6dc;border-top:3px solid transparent;border-image:var(--degrade) 1;font-size:14px;padding:32px 0}
footer .wrap{display:flex;gap:24px;flex-wrap:wrap;justify-content:space-between}
footer a{color:#fff}
.vide{background:#fff;border:1px dashed var(--trait);border-radius:16px;padding:40px;text-align:center;color:var(--gris)}
.etapes{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}
.etapes .bloc{margin:0}
a.entete{font-weight:600;font-size:14px;white-space:nowrap;display:inline-flex;align-items:center;gap:6px}
a.entete small{display:block;font-size:11px;font-weight:500;opacity:.75;line-height:1}
.pastille{display:inline-block;min-width:20px;text-align:center;background:var(--degrade);border-radius:999px;padding:1px 6px;font-size:12px;font-weight:800;text-shadow:0 1px 2px rgba(0,0,0,.4)}
.carte a.lien{display:flex;flex-direction:column;flex:1}
.carte a.lien:hover{text-decoration:none}
.carte form{padding:0 12px 12px}
.btn-panier{width:100%;border:1.5px solid var(--accent);background:#fff;color:var(--accent);border-radius:999px;padding:7px 10px;font:inherit;font-size:13px;font-weight:700;cursor:pointer}
.btn-panier:hover{background:var(--accent-clair)}
.btn-second{display:inline-flex;align-items:center;justify-content:center;border:1.5px solid var(--accent);background:#fff;color:var(--accent);border-radius:999px;font-weight:800;font-size:15px;padding:12px 24px;cursor:pointer;font-family:inherit}
.btn-second:hover{background:var(--accent-clair);text-decoration:none}
.lien-bouton{border:0;background:none;color:var(--accent);font:inherit;font-size:14px;cursor:pointer;padding:0;text-decoration:underline}
.filtres{display:flex;flex-wrap:wrap;gap:10px;align-items:end;background:#fff;border:1px solid var(--trait);border-radius:14px;padding:12px 14px;margin:0 0 18px;font-size:14px}
.filtres label{display:flex;flex-direction:column;gap:3px;color:var(--gris);font-size:12px}
.filtres select,.filtres input[type=number]{border:1.5px solid var(--trait);border-radius:10px;padding:7px 9px;font:inherit;font-size:14px;color:var(--encre);background:#fff;width:auto}
.filtres input[type=number]{width:90px}
.filtres .coche{flex-direction:row;align-items:center;gap:6px;color:var(--encre);font-size:14px;padding-bottom:8px}
.formulaire{display:flex;flex-direction:column;gap:12px;max-width:440px}
.formulaire label{display:flex;flex-direction:column;gap:4px;font-size:14px;font-weight:600}
.formulaire input,.formulaire select,.formulaire textarea{border:1.5px solid var(--trait);border-radius:10px;padding:10px 12px;font:inherit;font-size:15px;font-weight:400;background:#fff}
.formulaire textarea{min-height:130px;resize:vertical}
.erreur{background:#fdecef;border:1px solid #f3b6c4;color:#9b1c3a;border-radius:12px;padding:10px 14px;margin:0 0 14px}
.succes{background:#e9faf3;border:1px solid #a6e6cb;color:#0b6b46;border-radius:12px;padding:10px 14px;margin:0 0 14px}
.ligne-panier{display:grid;grid-template-columns:96px 1fr auto;gap:14px;align-items:center;border-top:1px solid var(--trait);padding:14px 0}
.ligne-panier:first-child{border-top:0}
.ligne-panier img{width:96px;height:96px;object-fit:contain;background:#fff;border:1px solid var(--trait);border-radius:10px}
.ligne-panier .q{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.ligne-panier select{border:1.5px solid var(--trait);border-radius:8px;padding:5px 8px;font:inherit}
@media (max-width:640px){.ligne-panier{grid-template-columns:72px 1fr}.ligne-panier img{width:72px;height:72px}.ligne-panier .px{grid-column:2}}
.deux{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:24px;align-items:start}
@media (max-width:820px){.deux{grid-template-columns:1fr}}
.menu-compte{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 20px}
.menu-compte a{background:#fff;border:1px solid var(--trait);border-radius:999px;padding:7px 14px;font-size:14px}
.menu-compte a.on{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:700}
.statut{display:inline-block;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:700;background:var(--accent-clair);color:var(--accent)}
.texte-legal{max-width:820px}.texte-legal h2{font-size:18px;margin:26px 0 8px}.texte-legal p,.texte-legal li{font-size:15px}
footer .cols{display:flex;gap:40px;flex-wrap:wrap}
@media (max-width:1300px){.vendre{display:none}}
@media (max-width:640px){a.entete.cmd{display:none}a.entete small{display:none}}
@media print{header.top,nav.rayons,footer,.non-imprime{display:none!important}body{background:#fff}}
@media (max-width:640px){header.top{position:static}.vendre{font-size:13px;padding:5px 12px}.logo img{height:36px}form.cherche{flex-basis:100%;order:3}.btn-prime{font-size:13px}}
`

export function gabarit(g: Gabarit): string {
  const base = g.base
  const robots = g.indexable === false ? 'noindex,follow' : 'index,follow,max-image-preview:large'
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(g.titre)}</title>
<meta name="description" content="${e(g.description)}">
<meta name="robots" content="${robots}">
${g.chemin !== null ? `<link rel="canonical" href="${e(canon(g.chemin))}">` : ''}
<meta property="og:site_name" content="DropShop Market">
<meta property="og:title" content="${e(g.titre)}">
<meta property="og:description" content="${e(g.description)}">
${g.chemin !== null ? `<meta property="og:url" content="${e(canon(g.chemin))}">` : ''}
${g.image ? `<meta property="og:image" content="${e(g.image)}">` : ''}
<meta name="twitter:card" content="${g.image ? 'summary_large_image' : 'summary'}">
<meta name="theme-color" content="#01020f">
<link rel="icon" type="image/png" sizes="48x48" href="${base}/marque/favicon-48.png">
<link rel="apple-touch-icon" href="${base}/marque/icone.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>${CSS}</style>
${g.head ?? ''}
</head>
<body>
<header class="top"><div class="wrap">
<a class="logo" href="${base}/"><img src="${base}/marque/market-logo.png" alt="DropShop Market" width="351" height="112"></a>
<form class="cherche" action="${base}/recherche" method="get" role="search">
<input name="q" type="search" placeholder="Rechercher un produit…" value="${e(g.recherche ?? '')}" aria-label="Rechercher">
<button type="submit">Rechercher</button>
</form>
<a class="btn-prime" href="${base}/prime"><i aria-hidden="true"></i>PRIME 24 h</a>
<a class="vendre" href="${base}/vendre">Vendre sur DropShop Market</a>
<a class="entete" href="${base}/compte"><span><small>Bonjour</small>Mon compte</span></a>
<a class="entete cmd" href="${base}/compte/commandes"><span><small>Retours</small>et commandes</span></a>
<a class="entete" href="${base}/panier" aria-label="Panier">🛒 Panier <span class="pastille" data-panier>0</span></a>
</div></header>
<script>(function(){try{var m=document.cookie.match(/(?:^|; )dsm_panier=([^;]*)/),n=0;if(m)decodeURIComponent(m[1]).split('|').forEach(function(x){var q=parseInt(x.split('~')[1]||'1',10);if(x)n+=q>0?q:1});document.querySelectorAll('[data-panier]').forEach(function(e){e.textContent=n})}catch(e){}})()</script>
${navRayons(base, g.rayons ?? [])}
<main><div class="wrap">
${g.corps}
</div></main>
<footer><div class="wrap">
<div><img src="${base}/marque/market-europe.png" alt="DropShop Market — Rapide Europe, produits d'importation" width="640" height="337" style="height:88px;width:auto;margin-bottom:10px" loading="lazy"><br>La place de marché des boutiques DropShop.<br>Paiement sécurisé par Stripe.</div>
<div class="cols">
<div><b style="color:#fff">Aide</b><br><a href="${base}/aide">Aide et questions</a><br><a href="${base}/contact">Contacter le service client</a><br><a href="${base}/suivi">Suivre une commande</a><br><a href="${base}/retours">Retours et remboursements</a><br><a href="${base}/livraison">Livraison</a></div>
<div><b style="color:#fff">Votre compte</b><br><a href="${base}/compte">Mon compte</a><br><a href="${base}/compte/commandes">Mes commandes</a><br><a href="${base}/compte/envies">Ma liste d'envies</a><br><a href="${base}/panier">Mon panier</a></div>
<div><b style="color:#fff">Informations</b><br><a href="${base}/cgv">Conditions générales de vente</a><br><a href="${base}/mentions-legales">Mentions légales</a><br><a href="${base}/confidentialite">Confidentialité et cookies</a><br><a href="${base}/vendre">Vendre : inscription gratuite</a><br><a href="${base}/sitemap.xml">Plan du site</a></div>
</div>
</div></footer>
</body>
</html>`
}

/** Le prix le plus bas d'une annonce, et s'il varie selon la variante. */
function prixDAppel(a: Annonce): { prix: number; variable: boolean } {
  const prix = a.offres.filter((o) => o.disponible).map((o) => o.prix)
  const liste = prix.length ? prix : a.offres.map((o) => o.prix)
  const min = Math.min(...liste)
  return { prix: min, variable: liste.some((p) => p !== min) }
}

/** L'adresse absolue de la vidéo du vendeur, ou null. */
export function videoDe(a: Annonce): string | null {
  const v = a.product.videoUrl ? absoluteUrl(a.product.videoUrl) : ''
  return v.startsWith('http') ? v : null
}

/** Cinq étoiles, pleines jusqu'à la note arrondie. */
export function etoiles(note: number): string {
  const n = Math.max(0, Math.min(5, Math.round(note)))
  return '★'.repeat(n) + '☆'.repeat(5 - n)
}

/**
 * Les avis d'acheteurs d'une fiche, chacun avec son origine : un avis recueilli
 * chez le fournisseur et présenté comme recueilli ici serait trompeur.
 */
export function sectionAvis(a: Annonce): string {
  const v = a.avis
  if (!v?.nombre || v.moyenne == null) return ''
  const date = (d: Date | null) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '')
  return `<section class="bloc" id="avis"><h2 style="margin-top:0">Avis clients</h2>
<p><span class="etoiles" style="font-size:20px">${etoiles(v.moyenne)}</span> <strong>${v.moyenne.toLocaleString('fr-FR')} sur 5</strong> <span class="muted">· ${v.nombre} avis</span></p>
${v.items
  .map(
    (x) => `<div class="avis"><div><span class="etoiles">${etoiles(x.etoiles)}</span> <strong>${e(x.auteur)}</strong></div>
<p>${e(x.texte)}</p>
${x.photos.length ? `<div class="ph">${x.photos.map((p) => `<img src="${e(p)}" alt="Photo jointe à l'avis" loading="lazy">`).join('')}</div>` : ''}
<div class="muted" style="font-size:12px">${[date(x.date), x.origine === 'drop-shop.cloud' ? '✓ Achat vérifié sur DropShop Market' : x.origine ? `Avis recueilli sur ${e(x.origine)}` : 'Avis transmis par le vendeur'].filter(Boolean).join(' · ')}</div></div>`,
  )
  .join('')}
${v.nombre > v.items.length ? `<p class="muted">${v.items.length} avis les plus récents sur ${v.nombre}.</p>` : ''}</section>`
}

export function carte(base: string, a: Annonce): string {
  const o = a.offres[0]
  const { prix, variable } = prixDAppel(a)
  // Un produit sans choix à faire s'ajoute au panier depuis la liste ; sinon on choisit sur la fiche.
  const direct = a.offres.length === 1 && o.disponible
  return `<div class="carte"><a class="lien" href="${base}${o.cheminProduit}">
<div class="img">${a.prime ? '<span class="prime">⚡ PRIME 24 h</span>' : ''}${o.image ? `<img src="${e(o.image)}" alt="${e(o.titreProduit)}" loading="lazy" width="400" height="400">` : ''}</div>
<div class="txt"><div class="t">${e(o.titreProduit)}</div>
<div class="v">${e(a.vendeur.nom)}${a.offres.length > 1 ? ` · ${a.offres.length} variantes` : ''}</div>
${a.avis?.nombre && a.avis.moyenne != null ? `<div class="note"><span class="etoiles">${etoiles(a.avis.moyenne)}</span> ${a.avis.moyenne.toLocaleString('fr-FR')} (${a.avis.nombre})</div>` : ''}
<div class="p">${variable ? '<small>dès </small>' : ''}${e(prixTexte(prix, o.devise))}</div></div></a>
${direct ? `<form method="post" action="${base}/panier/ajouter"><input type="hidden" name="offre" value="${e(o.id)}"><button class="btn-panier" type="submit">Ajouter au panier</button></form>` : `<form method="get" action="${base}${o.cheminProduit}"><button class="btn-panier" type="submit">${o.disponible || a.offres.some((x) => x.disponible) ? 'Choisir une option' : 'Épuisé'}</button></form>`}</div>`
}

export function grille(base: string, liste: Annonce[], vide = 'Aucun produit pour le moment.'): string {
  if (!liste.length) return `<div class="vide">${e(vide)}</div>`
  return `<div class="grille">${liste.map((a) => carte(base, a)).join('')}</div>`
}

/** Le chemin d'un rayon ou d'une sous-catégorie. */
export function cheminCategorie(rayonId: string, sousId?: string | null): string {
  return `/c/${encodeURIComponent(rayonId)}${sousId ? `/${encodeURIComponent(sousId)}` : ''}`
}

/**
 * La barre des catégories : les 24 rayons en défilement, et « Toutes les
 * catégories » qui déplie le méga-menu avec chaque sous-catégorie. En HTML pur
 * (<details>) : les liens existent pour un robot comme pour un acheteur.
 */
export function navRayons(base: string, rayons: Rayon[]): string {
  if (!rayons.length) return ''
  const mega = rayons
    .map(
      (r) =>
        `<div><h3><a href="${base}${cheminCategorie(r.id)}">${r.icone ? `${e(r.icone)} ` : ''}${e(r.label)}</a></h3><ul>${r.sousCategories
          .map((c) => `<li><a href="${base}${cheminCategorie(r.id, c.id)}">${e(c.label)}</a></li>`)
          .join('')}</ul></div>`,
    )
    .join('')
  return `<nav class="rayons" aria-label="Catégories"><div class="wrap">
<details><summary>☰ Toutes les catégories</summary><div class="mega"><div class="wrap">${mega}</div></div></details>
<div class="defile">${rayons.map((r) => `<a href="${base}${cheminCategorie(r.id)}">${e(r.label)}</a>`).join('')}</div>
</div></nav>`
}

/** Les 24 rayons en tuiles, sur l'accueil. */
export function tuilesRayons(base: string, rayons: Rayon[]): string {
  return `<h2 style="margin-top:0">Nos catégories</h2><div class="tuiles">${rayons
    .map((r) => `<a class="tuile" href="${base}${cheminCategorie(r.id)}"><span>${e(r.icone ?? '🛍️')}</span>${e(r.label)}</a>`)
    .join('')}</div>`
}

/** Le texte de la description, en paragraphes sûrs (le HTML d'origine n'est jamais rendu tel quel). */
function paragraphes(texte: string): string {
  return texte
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .split(/\n{2,}|\r\n\r\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 30)
    .map((p) => `<p>${e(p).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

const DISPO = (o: Offre) => (o.disponible ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock')
const ETAT: Record<string, string> = {
  new: 'https://schema.org/NewCondition',
  refurbished: 'https://schema.org/RefurbishedCondition',
  used: 'https://schema.org/UsedCondition',
}

/** Les données structurées d'une offre (schema.org Offer), livraison et retours compris. */
function offreLd(a: Annonce, o: Offre) {
  return {
    '@type': 'Offer',
    url: canon(o.chemin),
    price: o.prix.toFixed(2),
    priceCurrency: o.devise,
    availability: DISPO(o),
    itemCondition: ETAT[etatPour(a.product.condition, 'flux')] ?? ETAT.new,
    seller: { '@type': 'Organization', name: a.vendeur.nom, ...(a.vendeur.boutiqueUrl ? { url: a.vendeur.boutiqueUrl } : {}) },
    shippingDetails: {
      '@type': 'OfferShippingDetails',
      shippingRate: { '@type': 'MonetaryAmount', value: '0', currency: o.devise },
      shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'FR' },
      deliveryTime: {
        '@type': 'ShippingDeliveryTime',
        // Prime : expédié le jour même, livré le lendemain. Google compare la promesse au réel.
        handlingTime: { '@type': 'QuantitativeValue', minValue: a.prime ? 0 : 1, maxValue: a.prime ? 0 : 3, unitCode: 'DAY' },
        transitTime: { '@type': 'QuantitativeValue', minValue: a.prime ? 1 : 4, maxValue: a.prime ? 1 : 12, unitCode: 'DAY' },
      },
    },
    hasMerchantReturnPolicy: {
      '@type': 'MerchantReturnPolicy',
      applicableCountry: 'FR',
      returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
      merchantReturnDays: 14,
      returnMethod: 'https://schema.org/ReturnByMail',
    },
  }
}

const VARIE_PAR: Record<string, string> = {
  color: 'https://schema.org/color',
  size: 'https://schema.org/size',
  material: 'https://schema.org/material',
  pattern: 'https://schema.org/pattern',
}

/**
 * schema.org pour la fiche : un `ProductGroup` dont chaque variante est un
 * `Product` avec son `Offer`, son adresse, sa photo et ses attributs — la forme
 * que Google documente pour les variantes (« product variants structured data »).
 */
export function produitLd(a: Annonce, offreCourante: Offre | null) {
  const premiere = a.offres[0]
  const video = videoDe(a)
  // La vidéo du vendeur, décrite pour Google Vidéos (VideoObject). Pas de note
  // agrégée ici : les avis viennent souvent d'un autre site, et Google interdit
  // de baliser des avis qui n'ont pas été recueillis sur la page elle-même.
  const sujet = video
    ? {
        subjectOf: {
          '@type': 'VideoObject',
          name: premiere.titreProduit,
          description: `Vidéo de ${premiere.titreProduit}`,
          contentUrl: video,
          ...(premiere.images[0] ? { thumbnailUrl: [premiere.images[0]] } : {}),
          uploadDate: (a.publishedAt ?? a.product.updatedAt ?? new Date()).toISOString(),
        },
      }
    : {}
  const description = descriptionDe(a.product).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 5000)
  const marque = { '@type': 'Brand', name: a.vendeur.nom }

  if (!premiere.cle) {
    return {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: premiere.titre,
      description,
      image: premiere.images.slice(0, 10),
      sku: premiere.id,
      brand: marque,
      ...(a.categorie?.path ? { category: a.categorie.path } : {}),
      offers: offreLd(a, premiere),
      ...sujet,
    }
  }

  const varie = new Set<string>()
  const variantes = a.offres.map((o) => {
    const attrs: Record<string, string> = {}
    for (const [nom, valeur] of Object.entries(o.combo ?? {})) {
      const g = attributGoogle(nom)
      if (g && !attrs[g]) {
        attrs[g] = valeur
        varie.add(g)
      }
    }
    return {
      '@type': 'Product',
      sku: o.id,
      name: o.titre,
      url: canon(o.chemin),
      image: o.images.slice(0, 5),
      ...attrs,
      offers: offreLd(a, o),
    }
  })

  return {
    '@context': 'https://schema.org',
    '@type': 'ProductGroup',
    name: premiere.titreProduit,
    description,
    url: canon(premiere.cheminProduit),
    productGroupID: a.product.id,
    brand: marque,
    ...(a.categorie?.path ? { category: a.categorie.path } : {}),
    ...(varie.size ? { variesBy: [...varie].map((v) => VARIE_PAR[v]) } : {}),
    ...sujet,
    hasVariant: offreCourante ? [variantes[a.offres.indexOf(offreCourante)], ...variantes.filter((_, i) => a.offres[i] !== offreCourante)] : variantes,
  }
}

function filLd(elements: Array<{ nom: string; chemin: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: elements.map((el, i) => ({ '@type': 'ListItem', position: i + 1, name: el.nom, item: canon(el.chemin) })),
  }
}

/**
 * Les sélecteurs de variantes, en LIENS : chaque valeur mène à la page de la
 * variante voisine (même choix, cette valeur-là). Un robot les suit comme un
 * acheteur, et chaque variante est ainsi découverte et indexée.
 */
function selecteurs(base: string, a: Annonce, courante: Offre | null): string {
  const avecCombo = a.offres.filter((o) => o.combo)
  if (!avecCombo.length) return ''
  const options = new Map<string, string[]>()
  for (const o of avecCombo) {
    for (const [nom, val] of Object.entries(o.combo!)) {
      const l = options.get(nom) ?? []
      if (!l.includes(val)) l.push(val)
      options.set(nom, l)
    }
  }
  const choix = courante?.combo ?? null
  return [...options.entries()]
    .map(([nom, valeurs]) => {
      const liens = valeurs
        .map((val) => {
          const voulu = { ...(choix ?? {}), [nom]: val }
          const exacte = avecCombo.find((o) => Object.entries(voulu).every(([k, v]) => o.combo![k] === v))
          const cible = exacte ?? avecCombo.find((o) => o.combo![nom] === val)!
          const on = choix?.[nom] === val
          const off = !cible.disponible
          return `<a class="${on ? 'on' : ''}${off ? ' off' : ''}" href="${base}${cible.chemin}"${on ? ' aria-current="true"' : ''}>${e(val)}</a>`
        })
        .join('')
      return `<div class="option"><b>${e(nom)}${choix?.[nom] ? ` : ${e(choix[nom])}` : ''}</b><div class="choix">${liens}</div></div>`
    })
    .join('')
}

/** La fiche produit, ou celle d'une de ses variantes. */
export function pageProduit(base: string, a: Annonce, courante: Offre | null, rayons: Rayon[] = [], similaires: Annonce[] = []): string {
  const o = courante ?? a.offres[0]
  const aVariantes = Boolean(a.offres[0].cle)
  const choisie = aVariantes ? courante : o
  const { prix: prixMin, variable } = prixDAppel(a)
  const titreH1 = courante?.cle ? courante.titre : o.titreProduit
  const description = descriptionDe(a.product)
  const video = videoDe(a)
  const meta = (a.product.metaDescription || description.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
  const prixAffiche = choisie ? choisie.prix : prixMin

  const titrePage = `${titreH1} – ${prixTexte(prixAffiche, o.devise)}${!choisie && variable ? ' (dès)' : ''} | DropShop Market`
  const descPage = `${choisie?.libelleVariante ? `${choisie.libelleVariante}. ` : ''}${meta}`.slice(0, 155)

  const fil = [
    { nom: 'Accueil', chemin: '/' },
    ...(a.categorie ? [{ nom: a.categorie.rayon.label, chemin: cheminCategorie(a.categorie.rayon.id) }] : []),
    ...(a.categorie && a.categorie.id !== a.categorie.rayon.id ? [{ nom: a.categorie.label, chemin: cheminCategorie(a.categorie.rayon.id, a.categorie.id) }] : []),
    { nom: o.titreProduit, chemin: o.cheminProduit },
    ...(courante?.cle ? [{ nom: courante.libelleVariante ?? courante.titre, chemin: courante.chemin }] : []),
  ]

  const puces = Array.isArray(a.product.bulletPoints) ? (a.product.bulletPoints as unknown[]).filter((p): p is string => typeof p === 'string') : []
  const attributs =
    a.product.attributes && typeof a.product.attributes === 'object' && !Array.isArray(a.product.attributes)
      ? Object.entries(a.product.attributes as Record<string, unknown>).filter(([, v]) => typeof v === 'string' || typeof v === 'number')
      : []

  // Décision de max (27/10/2026) : tout est achetable ; la part d'un vendeur
  // sans paiements actifs est mise de côté (voir marketStripe.ts).
  const vendable = choisie?.disponible ?? true
  const images = o.images.slice(0, 12)

  const corps = `
<div class="fil">${fil.map((f, i) => (i < fil.length - 1 ? `<a href="${base}${f.chemin}">${e(f.nom)}</a> › ` : e(f.nom))).join('')}</div>
<div class="fiche">
<div class="galerie">
<div class="principale">${images[0] ? `<img id="principale" src="${e(images[0])}" alt="${e(titreH1)}" width="800" height="800">` : ''}</div>
${images.length > 1 ? `<div class="vignettes">${images.map((i, n) => `<button type="button" data-src="${e(i)}" aria-label="Photo ${n + 1}"><img src="${e(i)}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}
</div>
<div>
<h1>${e(titreH1)}</h1>
${a.vendeur.slug ? `<a class="vendeur" href="${base}/vendeur/${encodeURIComponent(a.vendeur.slug)}">Vendu par ${e(a.vendeur.nom)}</a>` : `<span class="vendeur">Vendu par ${e(a.vendeur.nom)}</span>`}${a.vendeur.boutiqueUrl ? ` <a class="muted" style="font-size:13px" href="${e(a.vendeur.boutiqueUrl)}" target="_blank" rel="noopener">Voir sa boutique ↗</a>` : ''}
${a.avis?.nombre && a.avis.moyenne != null ? `<a class="note" href="#avis" style="display:block;margin-top:4px"><span class="etoiles">${etoiles(a.avis.moyenne)}</span> ${a.avis.moyenne.toLocaleString('fr-FR')} · ${a.avis.nombre} avis</a>` : ''}
<div class="prix">${!choisie && variable ? '<small style="font-size:16px;font-weight:600">dès </small>' : ''}${e(prixTexte(prixAffiche, o.devise))}</div>
${a.prime ? '<div style="margin:4px 0 6px"><span class="prime prime-gros">⚡ PRIME · Livré en 24 h</span></div>' : ''}
<div class="muted">Livraison comprise${a.prime ? ', expédiée le jour même' : ''} · ${choisie ? (choisie.disponible ? 'En stock' : 'Épuisé') : 'Choisissez une variante'}</div>
${selecteurs(base, a, courante)}
${
  choisie
    ? `<form class="achat" method="post" action="${base}/acheter">
<input type="hidden" name="offre" value="${e(choisie.id)}">
<label class="muted" style="display:flex;align-items:center;gap:8px">Qté <input type="number" name="quantite" value="1" min="1" max="10"></label>
${vendable ? `<button class="btn" type="submit" formaction="${base}/panier/ajouter">Ajouter au panier</button><button class="btn-second" type="submit">Acheter maintenant</button>` : '<button class="btn" type="button" disabled>Épuisé</button>'}
</form>`
    : `<p class="muted">Sélectionnez ${[...new Set(a.offres.flatMap((x) => Object.keys(x.combo ?? {})))].map((k) => k.toLowerCase()).join(' et ')} pour acheter.</p>`
}
<form method="post" action="${base}/compte/envies/ajouter" style="margin:4px 0 0"><input type="hidden" name="produit" value="${e(a.product.id)}"><button class="lien-bouton" type="submit">♡ Ajouter à ma liste d'envies</button></form>
<ul class="atouts"><li>Paiement sécurisé par Stripe</li><li>${a.prime ? 'Livraison comprise, en 24 h en France métropolitaine' : 'Livraison comprise'} (<a href="${base}/livraison">détails</a>)</li><li>14 jours pour changer d'avis (<a href="${base}/retours">retours</a>)</li></ul>
</div>
</div>
<section class="bloc"><h2 style="margin-top:0">Description</h2>${paragraphes(description)}
${puces.length ? `<ul>${puces.map((p) => `<li>${e(p)}</li>`).join('')}</ul>` : ''}</section>
${
  attributs.length || courante?.combo
    ? `<section class="bloc"><h2 style="margin-top:0">Caractéristiques</h2><table class="caract">${[
        ...Object.entries(courante?.combo ?? {}),
        ...attributs,
      ]
        .map(([k, v]) => `<tr><td>${e(k)}</td><td>${e(v)}</td></tr>`)
        .join('')}<tr><td>État</td><td>${e(etatLisible(a.product.condition))}</td></tr></table></section>`
    : ''
}
${video ? `<section class="bloc"><h2 style="margin-top:0">Vidéo</h2><video src="${e(video)}"${o.image ? ` poster="${e(o.image)}"` : ''} controls playsinline preload="none" style="width:100%;max-height:70vh;border-radius:12px;background:#000"></video></section>` : ''}
${sectionAvis(a)}
${similaires.length ? `<section style="margin-top:28px"><h2>Dans la même catégorie</h2>${grille(base, similaires)}</section>` : ''}
<script>document.querySelectorAll('.vignettes button').forEach(function(b){b.addEventListener('click',function(){var p=document.getElementById('principale');if(p)p.src=b.getAttribute('data-src')})})</script>`

  return gabarit({
    base,
    titre: titrePage,
    description: descPage,
    chemin: courante?.cle ? courante.chemin : o.cheminProduit,
    image: o.image,
    corps,
    rayons,
    head: [
      jsonLd(produitLd(a, courante?.cle ? courante : null)),
      jsonLd(filLd(fil)),
      `<meta property="og:type" content="product">`,
      `<meta property="product:price:amount" content="${prixAffiche.toFixed(2)}">`,
      `<meta property="product:price:currency" content="${e(o.devise)}">`,
    ].join('\n'),
  })
}

function etatLisible(condition: string): string {
  return { neuf: 'Neuf', reconditionne: 'Reconditionné', occasion: 'Occasion' }[condition] ?? 'Neuf'
}

/**
 * Le défilé des produits en vedette, en haut de l'accueil (repris de la PR #37) :
 * glissement tactile ou flèches, sans bibliothèque. Sans script, le défilé se
 * fait au doigt ou à la molette ; le défilement automatique respecte
 * `prefers-reduced-motion`. Moins de quatre produits : rien.
 */
export function carrouselVedettes(base: string, vedettes: Annonce[]): string {
  if (vedettes.length < 4) return ''
  return `<section class="vedettes" aria-label="Produits en vedette"><h2>En vedette</h2>
<button type="button" class="fleche g" aria-label="Précédent" data-sens="-1">‹</button>
<div class="piste">${vedettes.map((a) => carte(base, a)).join('')}</div>
<button type="button" class="fleche d" aria-label="Suivant" data-sens="1">›</button>
<script>(function(){var s=document.currentScript.parentNode,p=s.querySelector('.piste'),pas=function(){return Math.max(200,p.clientWidth*.8)},t;function go(d){if(d>0&&p.scrollLeft+p.clientWidth>=p.scrollWidth-4){p.scrollTo({left:0})}else if(d<0&&p.scrollLeft<=4){p.scrollTo({left:p.scrollWidth})}else{p.scrollBy({left:d*pas()})}}s.querySelectorAll('.fleche').forEach(function(b){b.addEventListener('click',function(){go(+b.dataset.sens)})});if(!matchMedia('(prefers-reduced-motion: reduce)').matches){var auto=function(){t=setInterval(function(){go(1)},5000)};s.addEventListener('mouseenter',function(){clearInterval(t)});s.addEventListener('mouseleave',auto);s.addEventListener('touchstart',function(){clearInterval(t)},{passive:true});auto()}})()</script></section>`
}

export function pageListe(args: {
  base: string
  titre: string
  h1: string
  intro?: string
  /** Page vendeur : lien vers la boutique du vendeur. */
  boutique?: { nom: string; url: string }
  description: string
  chemin: string | null
  annonces: Annonce[]
  rayons: Rayon[]
  /** Les puces de sous-catégories d'un rayon, et celle qui est choisie. */
  puces?: { rayon: Rayon; courante: string | null }
  /** Accueil : bandeau Prime et tuiles des 24 catégories. */
  accueil?: boolean
  /** Accueil : produits en vedette, en défilé avant le bandeau Prime. */
  vedettes?: Annonce[]
  page: number
  suivante: boolean
  indexable?: boolean
  recherche?: string
  hero?: boolean
  vide?: string
  /** Les filtres et tris (recherche, catégories, Prime, vendeur). */
  filtres?: { tri: string; min: number | null; max: number | null; prime: boolean; note4: boolean; actif: boolean }
}): string {
  const { base } = args
  const f = args.filtres
  const requeteFiltres = f?.actif
    ? [
        f.tri !== 'nouveautes' ? `tri=${encodeURIComponent(f.tri)}` : '',
        f.min != null ? `min=${f.min}` : '',
        f.max != null ? `max=${f.max}` : '',
        f.prime ? 'prime=1' : '',
        f.note4 ? 'note4=1' : '',
      ].filter(Boolean).join('&')
    : ''
  const lienPage = (n: number) => {
    const chemin = args.chemin ?? `/recherche?q=${encodeURIComponent(args.recherche ?? '')}`
    const params = [requeteFiltres, n > 1 ? `page=${n}` : ''].filter(Boolean).join('&')
    const sep = chemin.includes('?') ? '&' : '?'
    return `${base}${chemin}${params ? `${sep}${params}` : ''}`
  }
  const action = args.chemin ?? '/recherche'
  const barreFiltres =
    f && !args.accueil
      ? `<form class="filtres" method="get" action="${base}${action.split('?')[0]}">${args.recherche ? `<input type="hidden" name="q" value="${e(args.recherche)}">` : ''}
<label>Trier par<select name="tri">${[['nouveautes', 'Nouveautés'], ['prix-asc', 'Prix croissant'], ['prix-desc', 'Prix décroissant'], ['notes', 'Mieux notés']].map(([k, t]) => `<option value="${k}"${f.tri === k ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
<label>Prix min (€)<input type="number" name="min" min="0" step="1" value="${f.min ?? ''}"></label>
<label>Prix max (€)<input type="number" name="max" min="0" step="1" value="${f.max ?? ''}"></label>
<label class="coche"><input type="checkbox" name="prime" value="1"${f.prime ? ' checked' : ''}> ⚡ Prime 24 h</label>
<label class="coche"><input type="checkbox" name="note4" value="1"${f.note4 ? ' checked' : ''}> ★★★★ et plus</label>
<button class="btn-panier" style="width:auto;padding:8px 16px" type="submit">Appliquer</button>${f.actif ? ` <a class="muted" href="${base}${action}">Effacer</a>` : ''}</form>`
      : ''
  const entete = args.hero
    ? `<section class="hero">${args.accueil ? '<span class="europe">RAPIDE EUROPE</span>' : ''}<h1>${e(args.h1)}</h1>${args.intro ? `<p>${e(args.intro)}</p>` : ''}</section>`
    : `<h1>${e(args.h1)}</h1>${args.intro ? `<p class="muted">${e(args.intro)}</p>` : ''}${args.boutique ? `<p><a class="vendeur" href="${e(args.boutique.url)}" target="_blank" rel="noopener">Visiter la boutique ${e(args.boutique.nom)} ↗</a></p>` : ''}`
  const puces = args.puces
    ? `<div class="puces"><a class="${args.puces.courante ? '' : 'on'}" href="${base}${cheminCategorie(args.puces.rayon.id)}">Tout « ${e(args.puces.rayon.label)} »</a>${args.puces.rayon.sousCategories
        .map((c) => `<a class="${args.puces!.courante === c.id ? 'on' : ''}" href="${base}${cheminCategorie(args.puces!.rayon.id, c.id)}">${e(c.label)}</a>`)
        .join('')}</div>`
    : ''
  const accueil = args.accueil && args.page === 1
    ? `${carrouselVedettes(base, args.vedettes ?? [])}<a class="bandeau-prime" href="${base}/prime"><span class="prime prime-gros">⚡ PRIME</span><span><b>Livré en 24 h</b><br><span class="muted">Les articles en stock en France, expédiés le jour même.</span></span><span class="btn" style="margin-left:auto">Voir les articles Prime</span></a>${tuilesRayons(base, args.rayons)}<h2>Les nouveautés</h2>`
    : ''
  const corps = `${entete}
${puces}${accueil}${barreFiltres}
${grille(base, args.annonces, args.vide)}
${args.page > 1 || args.suivante ? `<div class="pager">${args.page > 1 ? `<a href="${lienPage(args.page - 1)}" rel="prev">← Précédent</a>` : ''}${args.suivante ? `<a href="${lienPage(args.page + 1)}" rel="next">Suivant →</a>` : ''}</div>` : ''}`
  const html = gabarit({
    base,
    titre: args.titre,
    description: args.description,
    chemin: args.chemin === null ? null : `${args.chemin}${args.page > 1 ? `${args.chemin.includes('?') ? '&' : '?'}page=${args.page}` : ''}`,
    corps,
    indexable: args.indexable,
    recherche: args.recherche,
    image: args.annonces[0]?.offres[0]?.image ?? null,
    rayons: args.rayons,
    head:
      args.chemin === '/' && args.page === 1
        ? jsonLd({
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'DropShop Market',
            url: canon('/'),
            potentialAction: { '@type': 'SearchAction', target: `${canon('/recherche')}?q={search_term_string}`, 'query-input': 'required name=search_term_string' },
          })
        : '',
  })
  return html
}

export function pageMessage(base: string, titre: string, message: string, action?: { libelle: string; href: string }): string {
  return gabarit({
    base,
    titre: `${titre} | DropShop Market`,
    description: message.slice(0, 155),
    chemin: null,
    indexable: false,
    corps: `<div class="bloc" style="max-width:640px;margin:40px auto;text-align:center"><h1>${e(titre)}</h1><p>${e(message)}</p>${action ? `<p><a class="btn" href="${e(action.href)}">${e(action.libelle)}</a></p>` : ''}</div>`,
  })
}

export function pageVendre(base: string): string {
  const inscription = 'https://www.drop-shipper.fr/register?source=dropshop-market'
  return gabarit({
    base,
    titre: 'Vendre sur DropShop Market : inscription gratuite, 5 % par vente',
    description: "Publiez vos produits DropShipper sur DropShop Market : inscription gratuite, paiement Stripe, 5 % de commission seulement sur les ventes, annonces Google Shopping par variante.",
    chemin: '/vendre',
    corps: `<section class="hero"><h1>Vendez sur DropShop Market</h1><p>Inscription gratuite. Vous ne payez que 5 % du prix de chaque vente, prélevés automatiquement par Stripe. Vos produits sont référencés sur Google, une annonce par variante.</p><p style="margin-top:18px"><a class="btn" href="${inscription}">Créer mon compte vendeur</a></p></section>
<div class="etapes">
<div class="bloc"><h2 style="margin-top:0">1. Importez</h2><p>Importez vos produits dans DropShipper depuis n'importe quelle boutique : l'IA réécrit les annonces.</p></div>
<div class="bloc"><h2 style="margin-top:0">2. Publiez</h2><p>Choisissez « DropShop Market » comme destination. Chaque variante obtient sa page et son annonce Google Shopping.</p></div>
<div class="bloc"><h2 style="margin-top:0">3. Encaissez</h2><p>Activez vos paiements Stripe en quelques minutes. Chaque vente arrive sur votre compte, moins 5 %. Une vente faite avant l'activation est mise de côté et vous est versée dès que vous activez.</p></div>
</div>`,
  })
}
