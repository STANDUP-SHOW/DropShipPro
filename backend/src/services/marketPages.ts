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
:root{--vert:#6d3fc0;--vert-fonce:#0b0c24;--noir:#010211;--turquoise:#0ce7bb;--bleu:#3da7e2;--violet:#8b5ed0;--orange:#fcb817;--rose:#e53873;--degrade:linear-gradient(90deg,#0ce7bb,#3da7e2,#8b5ed0,#e53873,#fcb817);--encre:#14211a;--gris:#5b6660;--fond:#f6f7f5;--carte:#fff;--trait:#e3e7e4}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--encre);background:var(--fond);line-height:1.5}
a{color:inherit;text-decoration:none}a:hover{text-decoration:underline}
img{max-width:100%;display:block}
.wrap{max-width:1200px;margin:0 auto;padding:0 16px}
header.top{background:var(--noir);color:#fff;position:sticky;top:0;z-index:10}
header.top::after{content:"";display:block;height:4px;background:var(--degrade)}
header.top .wrap{display:flex;align-items:center;gap:20px;min-height:104px;flex-wrap:wrap;padding-top:8px;padding-bottom:8px}
.logo{display:block;flex:none;line-height:0}.logo img{height:92px;width:auto}
form.cherche{flex:1;display:flex;min-width:220px}
form.cherche input{flex:1;border:0;border-radius:999px 0 0 999px;padding:11px 14px;font:inherit;font-size:15px;min-width:0}
form.cherche button{border:0;border-radius:0 999px 999px 0;background:var(--degrade);color:var(--noir);font-weight:800;padding:0 22px;font:inherit;cursor:pointer}
.vendre{font-weight:600;font-size:14px;border:1px solid rgba(255,255,255,.5);border-radius:999px;padding:7px 14px;white-space:nowrap}
nav.rayons{background:var(--vert-fonce);color:#e8e9f7;font-size:14px;position:relative}
nav.rayons .wrap{display:flex;gap:6px;align-items:center;padding-top:6px;padding-bottom:6px}
nav.rayons .defile{display:flex;gap:16px;overflow-x:auto;white-space:nowrap;scrollbar-width:none;flex:1}
nav.rayons .defile::-webkit-scrollbar{display:none}
nav.rayons details{flex:none}
nav.rayons summary{list-style:none;cursor:pointer;font-weight:700;background:rgba(255,255,255,.12);border-radius:8px;padding:5px 12px;white-space:nowrap}
nav.rayons summary::-webkit-details-marker{display:none}
.mega{position:absolute;left:0;right:0;top:100%;background:#fff;color:var(--encre);box-shadow:0 18px 40px rgba(0,0,0,.18);z-index:20;max-height:70vh;overflow:auto}
.mega .wrap{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:18px 24px;padding-top:20px!important;padding-bottom:24px!important;align-items:start!important}
.mega h3{font-size:14px;margin:0 0 6px}.mega h3 a{color:var(--vert)}
.mega ul{list-style:none;margin:0;padding:0;font-size:13px;color:var(--gris)}.mega li{margin:3px 0}
.btn-prime{display:inline-flex;align-items:center;gap:10px;background:var(--degrade);color:var(--noir);font-weight:800;letter-spacing:.06em;border-radius:999px;padding:5px 18px 5px 5px;white-space:nowrap;box-shadow:0 0 18px rgba(139,94,208,.45)}
.btn-prime i{width:28px;height:28px;border-radius:50%;background:#fff;display:inline-block}
.btn-prime:hover{text-decoration:none;filter:brightness(1.05)}
.prime{display:inline-flex;align-items:center;gap:4px;background:#fdbf06;color:#14211a;font-weight:800;font-size:11px;border-radius:6px;padding:2px 7px;letter-spacing:.02em}
.prime-gros{font-size:14px;padding:5px 10px;border-radius:8px}
.carte .img{position:relative}.carte .img .prime{position:absolute;top:8px;left:8px}
.bandeau-prime{display:flex;align-items:center;gap:16px;flex-wrap:wrap;background:var(--noir);color:#fff;border:1.5px solid var(--violet);box-shadow:0 0 22px rgba(139,94,208,.25);border-radius:16px;padding:16px 20px;margin:0 0 28px}
.bandeau-prime .muted{color:#b9bbd3}
.bandeau-prime b{font-size:18px}
.tuiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-bottom:28px}
.tuile{background:#fff;border:1px solid var(--trait);border-radius:14px;padding:14px 12px;display:flex;flex-direction:column;gap:6px;font-weight:600;font-size:14px;line-height:1.25}
.tuile span{font-size:26px}.tuile:hover{border-color:var(--vert);text-decoration:none}
.puces{display:flex;flex-wrap:wrap;gap:8px;margin:4px 0 22px}
.puces a{background:#fff;border:1px solid var(--trait);border-radius:999px;padding:6px 13px;font-size:13px}
.puces a.on{background:var(--vert);border-color:var(--vert);color:#fff;font-weight:700}
main{padding:24px 0 48px}
h1{font-size:clamp(22px,3vw,30px);line-height:1.2;margin:0 0 8px;letter-spacing:-.01em}
h2{font-size:20px;margin:32px 0 12px}
.hero{background:radial-gradient(120% 140% at 0% 0%,rgba(139,94,208,.55),transparent 55%),radial-gradient(100% 120% at 100% 100%,rgba(12,231,187,.35),transparent 50%),var(--noir);color:#fff;border-radius:22px;padding:34px 30px;margin-bottom:28px;border:1px solid rgba(255,255,255,.08)}
.hero h1{font-size:clamp(26px,4vw,40px);letter-spacing:-.02em}
.hero .degrade{background:var(--degrade);-webkit-background-clip:text;background-clip:text;color:transparent}
.atoutsm{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin:22px 0 0}
.atoutsm div{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:13px 14px;font-size:14px;line-height:1.35}
.atoutsm b{display:block;font-size:15px;margin-bottom:2px}
.pays{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}
.pays span{border:1px solid rgba(255,255,255,.3);border-radius:999px;padding:4px 12px;font-size:13px}
.pays small{display:block;width:100%;opacity:.7;font-size:12px}
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
.avis{border-top:1px solid var(--trait);padding:14px 0}.avis:first-of-type{border-top:0}.avis p{margin:6px 0}
.avis .ph{display:flex;gap:6px;margin-top:6px}.avis .ph img{width:64px;height:64px;object-fit:cover;border-radius:8px}
.fil{font-size:13px;color:var(--gris);margin-bottom:12px}.fil a{color:var(--vert)}
.fiche{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:32px}
@media (max-width:820px){.fiche{grid-template-columns:1fr}}
.galerie .principale{background:#fff;border:1px solid var(--trait);border-radius:16px;aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;overflow:hidden}
.galerie .principale img{width:100%;height:100%;object-fit:contain}
.vignettes{display:flex;gap:8px;margin-top:10px;overflow-x:auto}
.vignettes button{border:1px solid var(--trait);background:#fff;border-radius:10px;padding:0;width:64px;height:64px;flex:none;cursor:pointer;overflow:hidden}
.vignettes img{width:100%;height:100%;object-fit:cover}
.prix{font-size:32px;font-weight:800;color:var(--vert);margin:8px 0 2px}
.muted{color:var(--gris);font-size:14px}
.option{margin:16px 0}.option b{display:block;font-size:14px;margin-bottom:6px}
.choix{display:flex;flex-wrap:wrap;gap:8px}
.choix a{border:1.5px solid var(--trait);background:#fff;border-radius:10px;padding:7px 12px;font-size:14px}
.choix a.on{border-color:var(--vert);background:#f1ebfb;font-weight:700}
.choix a.off{opacity:.45;text-decoration:line-through}
.achat{display:flex;gap:10px;margin:18px 0 8px;flex-wrap:wrap}
.achat input{width:80px;border:1.5px solid var(--trait);border-radius:12px;padding:12px;font:inherit;font-size:16px}
.btn{display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:12px;background:linear-gradient(135deg,#8b5ed0,#e53873);color:#fff;font-weight:800;font-size:16px;padding:13px 26px;cursor:pointer;font-family:inherit}
.btn:hover{text-decoration:none;filter:brightness(1.05)}.btn[disabled]{background:#c9cfcb;cursor:not-allowed}
.atouts{list-style:none;padding:0;margin:14px 0;font-size:14px;color:var(--gris)}.atouts li::before{content:"✓ ";color:var(--vert);font-weight:800}
.bloc{background:var(--carte);border:1px solid var(--trait);border-radius:16px;padding:20px 22px;margin-top:24px}
.bloc p{margin:0 0 10px}
table.caract{border-collapse:collapse;width:100%;font-size:14px}table.caract td{border-top:1px solid var(--trait);padding:8px 6px;vertical-align:top}table.caract td:first-child{color:var(--gris);width:40%}
.vendeur{display:inline-block;font-size:14px;color:var(--vert);font-weight:600}
.pager{display:flex;gap:10px;justify-content:center;margin-top:28px}
.pager a{background:#fff;border:1px solid var(--trait);border-radius:10px;padding:8px 14px}
footer{background:var(--noir);border-top:4px solid transparent;border-image:var(--degrade) 1;color:#c3c5d8;font-size:14px;padding:32px 0}
footer .wrap{display:flex;gap:24px;flex-wrap:wrap;justify-content:space-between}
footer a{color:#fff}
.vide{background:#fff;border:1px dashed var(--trait);border-radius:16px;padding:40px;text-align:center;color:var(--gris)}
.etapes{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}
.etapes .bloc{margin:0}
@media (max-width:640px){header.top{position:static}.vendre{font-size:13px;padding:5px 12px}}
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
<meta property="og:image" content="${e(g.image ?? canon('/assets/partage-1200x630.png'))}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#010211">
<link rel="icon" type="image/png" sizes="32x32" href="${base}/assets/favicon-32.png">
<link rel="apple-touch-icon" href="${base}/assets/icone-180.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>${CSS}</style>
${g.head ?? ''}
</head>
<body>
<header class="top"><div class="wrap">
<a class="logo" href="${base}/"><img src="${base}/assets/logo-bandeau.png" alt="DropShop Market : rapide Europe, produits d'importation" width="174" height="92"></a>
<form class="cherche" action="${base}/recherche" method="get" role="search">
<input name="q" type="search" placeholder="Rechercher un produit…" value="${e(g.recherche ?? '')}" aria-label="Rechercher">
<button type="submit">Rechercher</button>
</form>
<a class="btn-prime" href="${base}/prime" aria-label="Articles Prime, livrés en 24 h"><i></i>PRIME 24 H</a>
<a class="vendre" href="${base}/vendre">Vendre sur DropShop Market</a>
</div></header>
${navRayons(base, g.rayons ?? [])}
<main><div class="wrap">
${g.corps}
</div></main>
<footer><div class="wrap">
<div><b style="color:#fff">DropShop Market</b><br>La place de marché des boutiques DropShop.<br>Paiement sécurisé par Stripe.</div>
<div><a href="${base}/vendre">Vendre : inscription gratuite</a><br><a href="https://www.drop-shipper.fr/confidentialite">Confidentialité</a><br><a href="${base}/sitemap.xml">Plan du site</a></div>
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
<div class="muted" style="font-size:12px">${[date(x.date), x.origine ? `Avis recueilli sur ${e(x.origine)}` : 'Avis transmis par le vendeur'].filter(Boolean).join(' · ')}</div></div>`,
  )
  .join('')}
${v.nombre > v.items.length ? `<p class="muted">${v.items.length} avis les plus récents sur ${v.nombre}.</p>` : ''}</section>`
}

export function carte(base: string, a: Annonce): string {
  const o = a.offres[0]
  const { prix, variable } = prixDAppel(a)
  return `<a class="carte" href="${base}${o.cheminProduit}">
<div class="img">${a.prime ? '<span class="prime">⚡ PRIME 24 h</span>' : ''}${o.image ? `<img src="${e(o.image)}" alt="${e(o.titreProduit)}" loading="lazy" width="400" height="400">` : ''}</div>
<div class="txt"><div class="t">${e(o.titreProduit)}</div>
<div class="v">${e(a.vendeur.nom)}${a.offres.length > 1 ? ` · ${a.offres.length} variantes` : ''}</div>
${a.avis?.nombre && a.avis.moyenne != null ? `<div class="note"><span class="etoiles">${etoiles(a.avis.moyenne)}</span> ${a.avis.moyenne.toLocaleString('fr-FR')} (${a.avis.nombre})</div>` : ''}
<div class="p">${variable ? '<small>dès </small>' : ''}${e(prixTexte(prix, o.devise))}</div></div></a>`
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

/** Pays mis en avant sur l'accueil (liste par défaut, à ajuster avec la marque). */
const PAYS = ['France', 'Allemagne', 'Pologne', 'Belgique', 'Espagne', 'Italie', 'Pays-Bas', 'Portugal', 'Luxembourg', 'Autriche']

/** Le bandeau d'accueil : le positionnement du Market, aux couleurs de la charte. */
function heroAccueil(): string {
  return `<section class="hero"><h1>La marketplace <span class="degrade">reliée à tous les dropshops du monde</span></h1>
<p>Achetez des produits d'importation au meilleur prix, déjà importés en Europe, en livraison rapide.</p>
<div class="atoutsm">
<div><b>Déjà en Europe</b>Des produits d'importation stockés en Europe, sans attente de plusieurs semaines.</div>
<div><b>Au meilleur prix</b>Les prix directs des dropshops, réunis au même endroit.</div>
<div><b>Prime : 24 h</b>Utilisez Prime pour une livraison en 24 heures.</div>
<div><b>Direct d'Europe</b>Expédié depuis l'Europe, l'Allemagne, la Pologne.</div>
</div>
<div class="pays">${PAYS.map((p) => `<span>${e(p)}</span>`).join('')}</div></section>`
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
export function pageProduit(base: string, a: Annonce, courante: Offre | null, rayons: Rayon[] = []): string {
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

  const vendable = a.vendeur.encaisse && (choisie?.disponible ?? true)
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
<button class="btn" type="submit"${vendable ? '' : ' disabled'}>${vendable ? 'Acheter maintenant' : choisie.disponible ? 'Bientôt disponible' : 'Épuisé'}</button>
</form>`
    : `<p class="muted">Sélectionnez ${[...new Set(a.offres.flatMap((x) => Object.keys(x.combo ?? {})))].map((k) => k.toLowerCase()).join(' et ')} pour acheter.</p>`
}
<ul class="atouts"><li>Paiement sécurisé par Stripe</li><li>${a.prime ? 'Livraison offerte en 24 h en France métropolitaine' : 'Livraison offerte en France'}</li><li>14 jours pour changer d'avis</li></ul>
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
  page: number
  suivante: boolean
  indexable?: boolean
  recherche?: string
  hero?: boolean
  vide?: string
}): string {
  const { base } = args
  const lienPage = (n: number) => {
    const chemin = args.chemin ?? `/recherche?q=${encodeURIComponent(args.recherche ?? '')}`
    const sep = chemin.includes('?') ? '&' : '?'
    return `${base}${chemin}${n > 1 ? `${sep}page=${n}` : ''}`
  }
  const entete = args.hero && args.accueil && args.page === 1
    ? heroAccueil()
    : args.hero
    ? `<section class="hero"><h1>${e(args.h1)}</h1>${args.intro ? `<p>${e(args.intro)}</p>` : ''}</section>`
    : `<h1>${e(args.h1)}</h1>${args.intro ? `<p class="muted">${e(args.intro)}</p>` : ''}${args.boutique ? `<p><a class="vendeur" href="${e(args.boutique.url)}" target="_blank" rel="noopener">Visiter la boutique ${e(args.boutique.nom)} ↗</a></p>` : ''}`
  const puces = args.puces
    ? `<div class="puces"><a class="${args.puces.courante ? '' : 'on'}" href="${base}${cheminCategorie(args.puces.rayon.id)}">Tout « ${e(args.puces.rayon.label)} »</a>${args.puces.rayon.sousCategories
        .map((c) => `<a class="${args.puces!.courante === c.id ? 'on' : ''}" href="${base}${cheminCategorie(args.puces!.rayon.id, c.id)}">${e(c.label)}</a>`)
        .join('')}</div>`
    : ''
  const accueil = args.accueil && args.page === 1
    ? `<a class="bandeau-prime" href="${base}/prime"><span class="prime prime-gros">⚡ PRIME</span><span><b>Livré en 24 h</b><br><span class="muted">Les articles en stock en France, expédiés le jour même.</span></span><span class="btn" style="margin-left:auto">Voir les articles Prime</span></a>${tuilesRayons(base, args.rayons)}<h2>Les nouveautés</h2>`
    : ''
  const corps = `${entete}
${puces}${accueil}
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
<div class="bloc"><h2 style="margin-top:0">3. Encaissez</h2><p>Activez vos paiements Stripe en quelques minutes. Chaque vente arrive sur votre compte, moins 5 %.</p></div>
</div>`,
  })
}
