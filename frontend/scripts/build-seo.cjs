/**
 * Generates the static SEO pages, the sitemap and robots.txt into dist/.
 *
 * They are real HTML files, not React routes: a single-page application serves the
 * same empty shell on every URL, with one shared <title> and no description, which
 * is unusable for search. Vercel checks the filesystem before applying the
 * catch-all rewrite, so these files win over the SPA on their own paths and the
 * application keeps every other route.
 *
 *   node scripts/build-seo.cjs        (run automatically by npm run build)
 */
const fs = require('fs')
const path = require('path')

const platforms = require('./seo-platforms.cjs')
const topics = require('./seo-topics.cjs')
const { canaux, types: typesCanal } = require('./seo-channels.cjs')

const SITE = 'https://www.drop-shipper.fr'
const DIST = path.resolve(__dirname, '..', 'dist')
const TODAY = new Date().toISOString().slice(0, 10)

/** Escapes text going into HTML. Content is authored by us, but titles end up in
 *  attributes and JSON-LD where an unescaped quote breaks the document. */
function esc(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const INTEGRATION_WORDING = {
  live: {
    label: 'Publication automatique',
    how: [
      "La publication est réelle et immédiate : la fiche part par API, avec ses photos filigranées, sa description, ses attributs et son prix.",
      "Cette destination fait partie de celles qui acceptent la publication en lot : sélectionnez vos annonces dans la liste, et l'ensemble part en une fois.",
    ],
  },
  'api-ready': {
    label: 'API — compte vendeur requis',
    how: [
      "Cette plateforme possède une API, mais elle exige un compte vendeur validé. Tant que vos identifiants ne sont pas saisis, la publication est enregistrée « en attente », avec la catégorie de destination déjà calculée : le jour où le compte est ouvert, rien n'est à ressaisir.",
      "Vos annonces sont préparées au bon format en attendant : titre, description, attributs structurés et mots-clés, rédigés en français.",
    ],
  },
  extension: {
    label: "Publication assistée par l'extension",
    how: [
      "Aucune API publique n'existe pour les annonces de cette plateforme. L'extension Chrome ouvre le formulaire de dépôt dans votre navigateur et le remplit avec votre annonce : titre, description, prix et photos filigranées.",
      "Vous relisez, vous complétez ce qui manque, et c'est vous qui cliquez sur « Publier ». L'outil ne valide jamais à votre place : rejouer une connexion ou publier automatiquement viole les conditions d'utilisation de ces sites et fait suspendre les comptes vendeur.",
    ],
  },
  none: {
    label: 'Aucune publication possible',
    how: [
      "Aucune publication n'est possible vers cette enseigne, ni par API ni par l'extension : il n'existe pas d'espace vendeur tiers.",
    ],
  },
}

const CSS = `
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:#140f28;color:#e9e6f5;font:16px/1.65 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:#c4b5fd}
.wrap{max-width:52rem;margin:0 auto;padding:0 1.25rem}
header{border-bottom:1px solid #ffffff1a}
header .wrap{display:flex;align-items:center;justify-content:space-between;padding-top:1rem;padding-bottom:1rem;gap:1rem}
.brand{font-weight:700;color:#fff;text-decoration:none;font-size:1.05rem}
.cta{display:inline-block;background:linear-gradient(90deg,#a855f7,#ec4899);color:#fff;text-decoration:none;font-weight:600;padding:.7rem 1.15rem;border-radius:.75rem}
.cta.small{padding:.5rem .9rem;font-size:.9rem}
h1{font-size:1.9rem;line-height:1.25;margin:2rem 0 .5rem}
h2{font-size:1.25rem;margin:2.25rem 0 .5rem}
h3{font-size:1rem;margin:1.5rem 0 .35rem}
p{margin:.6rem 0}
.lede{font-size:1.08rem;color:#cfc9e8}
.crumb{font-size:.82rem;color:#9d95c0;padding-top:1.25rem}
.crumb a{color:#9d95c0}
.badge{display:inline-block;font-size:.75rem;padding:.2rem .6rem;border-radius:999px;border:1px solid #ffffff26;color:#cfc9e8}
.note{border:1px solid #fb923c4d;background:#f973161a;padding:.85rem 1rem;border-radius:.75rem;font-size:.92rem;color:#fed7aa}
.card{border:1px solid #ffffff1a;background:#ffffff0d;border-radius:.9rem;padding:1.1rem 1.25rem;margin:1rem 0}
.couts{border:1px solid #ffffff1a;background:#ffffff08;border-radius:.9rem;overflow:hidden;margin:1rem 0}
.couts .row{display:grid;grid-template-columns:12rem 1fr;gap:.75rem;padding:.75rem 1.1rem;border-top:1px solid #ffffff12}
.couts .row:first-child{border-top:0}
.couts dt{color:#c4b5fd;font-weight:600;font-size:.9rem;margin:0}
.couts dd{margin:0;font-size:.95rem}
@media(max-width:34rem){.couts .row{grid-template-columns:1fr;gap:.15rem}}
.fine{font-size:.8rem;color:#9d95c0;margin:.4rem 0 0}
.gratuit{border:1px solid #34d39940;background:linear-gradient(135deg,#34d39914,#a855f714);border-radius:.9rem;padding:1.1rem 1.25rem;margin:1.25rem 0}
.gratuit h3{margin:.9rem 0 .2rem;color:#fff}
.gratuit h3:first-child{margin-top:0}
.gratuit .pitch{font-weight:700;color:#fff}
.gratuit .free{background:linear-gradient(90deg,#34d399,#facc15);-webkit-background-clip:text;background-clip:text;color:transparent}
.dir{display:flex;flex-wrap:wrap;gap:.4rem;margin:.8rem 0 0}
.dir a,.dir span{font-size:.82rem;padding:.32rem .7rem;border-radius:999px;border:1px solid #ffffff1a;background:#ffffff08}
.dir a{color:#d9d3f0;text-decoration:none}
.dir a:hover{border-color:#c4b5fd66;background:#c4b5fd1a}
.dir span{color:#9d95c0}
.count{font-weight:400;color:#9d95c0;font-size:.85rem}
ul{padding-left:1.1rem}
li{margin:.3rem 0}
.grid{display:grid;gap:.6rem;grid-template-columns:repeat(auto-fill,minmax(15rem,1fr));margin:1rem 0}
.tile{display:flex;align-items:center;gap:.6rem;border:1px solid #ffffff1a;background:#ffffff0d;border-radius:.75rem;padding:.7rem .8rem;text-decoration:none;color:#e9e6f5;font-size:.93rem}
.dot{width:1.6rem;height:1.6rem;border-radius:.4rem;flex:none}
footer{border-top:1px solid #ffffff1a;margin-top:3rem;padding:1.5rem 0;font-size:.85rem;color:#9d95c0}
footer a{color:#9d95c0;margin-right:1rem}
.end{margin:2.5rem 0;text-align:center}
`

function layout({ url, title, description, jsonLd, body }) {
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
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<style>${CSS}</style>
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body>
<header><div class="wrap">
  <a class="brand" href="/">DropShipper IA</a>
  <a class="cta small" href="/register">Créer un compte</a>
</div></header>
<main class="wrap">
${body}
<div class="end"><a class="cta" href="/register">Essayer DropShipper IA</a></div>
</main>
<footer><div class="wrap">
  <a href="/">Accueil</a>
  <a href="/dropshipping/">Dropshipping</a>
  <a href="/vendre-sur-marketplaces/">Où vendre</a>
  <a href="/avis">Avis</a>
  <a href="/confidentialite">Confidentialité</a>
</div></footer>
</body>
</html>
`
}

function breadcrumbLd(trail) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `${SITE}${item.url}`,
    })),
  }
}

function faqLd(faq) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  }
}

function faqHtml(faq) {
  return `<h2>Questions fréquentes</h2>
${faq.map(({ q, a }) => `<h3>${esc(q)}</h3>\n<p>${esc(a)}</p>`).join('\n')}`
}

function crumb(trail) {
  return `<nav class="crumb">${trail
    .map((item, i) => (i === trail.length - 1 ? esc(item.name) : `<a href="${item.url}">${esc(item.name)}</a>`))
    .join(' › ')}</nav>`
}

/** Sibling links, so every page is reachable from every other one. */
function tiles(items) {
  return `<div class="grid">${items
    .map(
      (p) =>
        `<a class="tile" href="/vendre-sur-${p.slug}/"><span class="dot" style="background:${p.color}"></span>${esc(
          p.name,
        )}</a>`,
    )
    .join('')}</div>`
}

/**
 * Le coût de vente par plateforme, relevé en 2026 (grille marketplaces).
 *
 * Rien d'inventé : chaque ligne vient des barèmes publics ou confirmés par
 * sources tierces. Les tarifs évoluent — la page le dit sous le tableau. Absent
 * pour une entrée qui n'est pas une place de marché (Atlas For Men).
 */
const COUTS = {
  amazon: {
    pro: 'Non requis (particulier accepté) — mais une activité de revente régulière impose un statut d’entreprise (SIRET).',
    abo: '39 € HT/mois (compte Professionnel) ; 0 € en compte Individuel, qui facture alors 0,99 € HT par article vendu.',
    inscr: 'Aucun',
    comm: 'Frais de vente ~7–15 % selon la catégorie (minimum 0,30 €/vente) ; de ~5 % en high-tech jusqu’à ~45 % sur certains accessoires.',
    note: 'Au-delà d’environ 40 ventes/mois, le compte Pro à 39 € HT devient plus avantageux que l’Individuel. Frais HT : la TVA (20 %) s’ajoute pour un non-assujetti.',
  },
  ebay: {
    pro: 'Non requis (particulier accepté), mais le statut pro (SIRET) devient obligatoire dès une revente habituelle et pour ouvrir une Boutique.',
    abo: 'Facultatif — Boutique dès 19,50 € HT/mois (À la Une 39,50 €, Premium 149,50 €).',
    inscr: 'Aucun',
    comm: '3–12 % selon la catégorie (souvent ~9 %) sur le total article + livraison, + ~0,35 €/commande + 0,35 % de frais réglementaires.',
    note: 'Sans Boutique : ~300 annonces à prix fixe gratuites/mois, puis frais d’insertion (0,30–0,40 €/annonce). La commission se calcule sur le total, TVA et port compris.',
  },
  etsy: {
    pro: 'Non requis pour ouvrir — mais en France une vente régulière impose un statut (micro-entreprise/SIRET).',
    abo: 'Aucun (formule standard gratuite). Option Etsy Plus : ~10 $/mois.',
    inscr: 'Aucun (ouverture de boutique gratuite), mais 0,20 $/article à la mise en vente (valable 4 mois).',
    comm: '~11–14 % cumulés : 6,5 % de transaction + 4 % + 0,30 € de paiement + frais réglementaires FR ~1,14 %.',
    note: 'Etsy interdit la revente de produits manufacturés : un catalogue de dropshipping classique y risque la fermeture. Attention au poids du fixe sur les petits paniers.',
  },
  cdiscount: {
    pro: 'Oui — SIRET + extrait KBIS de moins de 3 mois. Un auto-entrepreneur est accepté, pas un particulier sans statut.',
    abo: '39,99 € HT/mois (~48 € TTC), sans engagement, catalogue illimité.',
    inscr: 'Aucun',
    comm: '5–20 % selon la catégorie (produits neufs), +2 % pour l’occasion/reconditionné, sur le prix TTC + port.',
    note: 'Détail par catégorie : high-tech ~5–7 %, gros électroménager ~8 %, bricolage ~12 %, mode ~15 %, bijoux ~20 %. Règlement du vendeur tous les 10 jours.',
  },
  'google-shopping': {
    pro: 'Non exigé par Google — mais il faut un site e-commerce conforme (mentions légales, retours, paiement sécurisé), donc en pratique une immatriculation.',
    abo: 'Aucun',
    inscr: 'Aucun',
    comm: 'Aucune commission : les fiches produits gratuites n’appliquent aucun prélèvement sur les ventes.',
    note: 'Modèle 100 % gratuit pour lister ses produits. On ne paie que si l’on lance des campagnes Google Ads / Shopping : au clic (CPC), jamais à la vente.',
  },
  wish: {
    pro: 'Oui — vendeur validé sur dossier (accès sur invitation/validation). Un SIRET renforce l’acceptation.',
    abo: 'Aucun',
    inscr: 'Aucun (pas de caution à l’ouverture)',
    comm: 'Jusqu’à 15 % du total (livraison incluse) ; fourchette réelle 5–25 % selon catégorie et palier vendeur, + 0,30 $ fixe/article.',
    note: 'Aucun frais tant qu’on ne vend pas. Prix en USD (pas d’euros). Barème progressif UE : taux plein sur les premiers 20 $ de l’article, réduit au-delà.',
  },
  'tiktok-shop': {
    pro: 'Oui — un particulier sans statut ne peut PAS vendre : auto-entrepreneur/entreprise avec SIRET, RIB français, pièce d’identité et Kbis de moins de 3 mois.',
    abo: 'Aucun (pas d’abonnement vendeur mensuel)',
    inscr: 'Aucun (ouverture de boutique gratuite)',
    comm: '9 % standard ; 7 % pour l’électronique et la beauté ; 4 % pour un nouveau vendeur pendant ses 60 premiers jours (barème depuis le 8 janvier 2026).',
    note: 'Piège de calcul : la commission porte sur la valeur TOTALE de la commande, frais de port payés par le client INCLUS — pas seulement le prix du produit.',
  },
  kaufland: {
    pro: 'Oui — compte professionnel exigé (n° de TVA + registre du commerce). Un particulier sans structure ne peut pas vendre.',
    abo: '39,95 € HT/mois (formule Basic) ; 59,95 € HT/mois (formule Plus).',
    inscr: 'Aucun',
    comm: '7–16 % HT selon la catégorie (électronique ~7 %, majorité ~13 %, mode 14 %, bijoux 16 %), sur le prix brut + port.',
    note: 'Un seul abonnement de base couvre les 9 marchés Kaufland (DE, AT, CZ, SK, PL, FR, IT, ES, NL). L’EAN est obligatoire pour créer une offre.',
  },
  vinted: {
    pro: 'Non pour un particulier (0 % de commission) ; le SIRET n’est exigé que pour ouvrir un compte Vinted Pro.',
    abo: 'Aucun (le compte Vinted Pro est aussi sans abonnement).',
    inscr: 'Aucun',
    comm: '0 % pour un vendeur particulier ; 5 % pour un vendeur Vinted Pro.',
    note: 'Ce n’est pas une commission vendeur classique : le particulier touche 100 % du prix affiché. C’est l’ACHETEUR qui paie la Protection acheteur (0,70 € + 5 %). Seules les options de visibilité (Boost) sont payantes, et facultatives.',
  },
  leboncoin: {
    pro: 'Non pour un particulier ; des abonnements n’existent que pour les comptes Pro.',
    abo: 'Aucun pour un particulier.',
    inscr: 'Aucun',
    comm: '0 % sur les ventes entre particuliers : le vendeur encaisse l’intégralité du prix.',
    note: 'Les frais de la transaction sécurisée (0,70 € + 5 %) sont à la charge de l’ACHETEUR. Attention au quota d’annonces gratuites (~50) : au-delà, des frais d’insertion s’appliquent.',
  },
  'facebook-marketplace': {
    pro: 'Non (particulier accepté).',
    abo: 'Aucun',
    inscr: 'Aucun',
    comm: '0 % en vente locale (remise en main propre). Un frais d’environ 10 % n’existe que sur les ventes avec paiement + expédition intégrés, quasi absentes en France.',
    note: 'En France, Marketplace fonctionne comme des petites annonces gratuites : les transactions se règlent hors plateforme et Meta ne prélève rien. Meta se rémunère par la publicité.',
  },
  'la-redoute': {
    pro: 'Oui — SIRET + n° de TVA intracommunautaire exigés. Un particulier ne peut pas vendre.',
    abo: '~49 € HT/mois.',
    inscr: 'Aucun frais annoncé (à confirmer).',
    comm: '8–20 % selon la catégorie.',
    note: 'Plateforme Mirakl (dépôt d’offres). Le tarif exact (abonnement + commission par catégorie) est communiqué après candidature.',
  },
  shopify: {
    pro: 'Non exigé pour ouvrir la boutique — mais vendre professionnellement en France suppose un statut (SIRET).',
    abo: 'Abonnement Shopify (votre boutique) : à partir de ~27 €/mois selon la formule.',
    inscr: 'Aucun',
    comm: 'Aucune commission de place de marché. Frais de transaction ~2 % si vous n’utilisez pas Shopify Payments, plus les frais de carte bancaire.',
    note: 'Shopify n’est pas une place de marché : c’est VOTRE site. Pas d’audience fournie (le trafic est à vous d’amener), mais aucune commission sur vos ventes.',
  },
}

/** Le coût de vente commun aux marketplaces d’enseignes opérées par Mirakl. */
const COUTS_MIRAKL = {
  pro: 'Oui — SIRET + n° de TVA, et dossier vendeur accepté par l’enseigne. Un particulier ne peut pas vendre.',
  abo: 'Abonnement mensuel le plus souvent, typiquement ~39–49 € HT/mois (négocié au dossier ; parfois offert au lancement).',
  inscr: 'Aucun en général (inscription sur candidature via le back-office Mirakl de l’enseigne).',
  comm: '≈ 5–20 % HT selon la catégorie (souvent 10–15 %). Le taux exact est propre à chaque enseigne et rarement public.',
  note: 'Tarifs quasi jamais publiés : abonnement et commission se négocient au dossier. Sélection stricte (délais, taux d’acceptation) et EAN/GTIN généralement requis.',
}
for (const slug of ['e-leclerc', 'bhv-marais', 'kiabi', 'brandalley', 'spartoo', 'miinto']) {
  if (!COUTS[slug]) COUTS[slug] = COUTS_MIRAKL
}

function coutsHtml(name, c) {
  if (!c) return ''
  const row = (label, val) => (val ? `<div class="row"><dt>${esc(label)}</dt><dd>${esc(val)}</dd></div>` : '')
  return `<h2>Combien coûte la vente sur ${esc(name)}</h2>
<dl class="couts">
${row('Compte pro / SIRET', c.pro)}
${row('Abonnement', c.abo)}
${row("Frais d'inscription", c.inscr)}
${row('Commission', c.comm)}
</dl>
${c.note ? `<p class="note">${esc(c.note)}</p>` : ''}
<p class="fine">Tarifs indicatifs relevés en 2026, susceptibles d'évoluer — vérifiez sur le site de la plateforme avant de vous lancer.</p>`
}

/**
 * Le bloc « ce que DropShipper IA apporte », le même sur chaque page : une
 * boutique en ligne gratuite et instantanée (pas d'abonnement Shopify à payer)
 * et le dropshipping automatique du mode Auto-Shipper. Demandé pour chaque
 * plateforme le 10/09/2026.
 */
function argumentsDropShipper(name) {
  const de = /^[aeiouyàâäéèêëîïôöûü]/i.test(name.trim()) ? "d'" : 'de '
  return `<h2>Votre boutique en ligne, en plus ${de}${esc(name)}</h2>
<div class="gratuit">
  <p class="pitch">Créez votre <span class="free">boutique en ligne gratuite et instantanée</span> — sans payer 29 € par mois d'abonnement Shopify.</p>
  <p>Vendre sur ${esc(name)} vous soumet à ses règles et à sa commission. Une boutique à vous, en parallèle, ne prélève aucune commission sur vos ventes et vous garde le client. DropShipper IA vous en ouvre une en quelques secondes : une adresse en ligne, votre logo, vos couleurs, votre catalogue déjà en vente — sans frais mensuels, sans carte bancaire, sans savoir coder.</p>
  <h3>Dropshipping automatique : le mode Auto-Shipper</h3>
  <p>L'Auto-Shipper fait tourner le magasin en pilote automatique : il repère les produits gagnants, rédige les annonces en français, filigrane les photos à vos couleurs et publie tout seul, à intervalle régulier, sur votre boutique comme sur ${esc(name)}. Vous gardez la main — chaque passage est plafonné et facturé d'avance, jamais de surprise.</p>
  <p><a class="cta small" href="/register">Ouvrir ma boutique gratuite</a></p>
</div>`
}

/**
 * L'annuaire complet, rendu en pastilles. Les plateformes qui ont leur propre
 * page SEO y renvoient ; les autres restent en texte — jamais un lien vers une
 * page qui n'existe pas, qui vaudrait un 404 à Google.
 */
const SEO_SLUG_PAR_CANAL = {
  amazon: 'amazon',
  ebay: 'ebay',
  etsy: 'etsy',
  'cdiscount-new-logo': 'cdiscount',
  kaufland_marketplace: 'kaufland',
  laredoute: 'la-redoute',
  tiktokshop_logo: 'tiktok-shop',
  brandalley: 'brandalley',
  spartoo: 'spartoo',
  miintomarketplace: 'miinto',
  kiabi_logo: 'kiabi',
  eleclerc: 'e-leclerc',
  bhvmarais: 'bhv-marais',
}

function annuaire(list) {
  return `<div class="dir">${list
    .map((c) => {
      const slug = SEO_SLUG_PAR_CANAL[c.id]
      return slug
        ? `<a href="/vendre-sur-${slug}/">${esc(c.label)}</a>`
        : `<span>${esc(c.label)}</span>`
    })
    .join('')}</div>`
}

/**
 * L'annuaire complet sur la page « Où vendre » : les 300 et quelques canaux
 * rangés par famille, plus les réseaux sociaux à part. C'est la même liste que
 * l'annuaire de l'application, pour que la page publique montre tout le paysage
 * — et non les seules vingt plateformes qui ont leur propre page.
 */
function annuaireComplet() {
  const social = [
    { label: 'Facebook Marketplace', slug: 'facebook-marketplace', detail: 'annonces locales, remplies par l’extension' },
    { label: 'Boutique Facebook', detail: 'votre flux catalogue, lu par Commerce Manager' },
    { label: 'Instagram Shopping', detail: 'le même flux Meta, repris par la boutique Instagram' },
    { label: 'Pinterest — catalogue', detail: 'flux produit lu par le catalogue Pinterest' },
    { label: 'TikTok — catalogue', detail: 'flux produit lu par TikTok Ads Manager' },
    { label: 'Snapchat — catalogue', detail: 'flux produit lu par Snap Business Manager' },
  ]

  const parType = typesCanal
    .map((t) => {
      const liste = canaux.filter((c) => c.type === t.id)
      return liste.length
        ? `<h3>${esc(t.label)} <span class="count">(${liste.length})</span></h3>\n${annuaire(liste)}`
        : ''
    })
    .filter(Boolean)
    .join('\n')

  return `<h2>L'annuaire complet : plus de 300 plateformes</h2>
<p>Au-delà des plateformes ci-dessus, voici tout le paysage que DropShipper IA connaît : places de marché et enseignes, comparateurs de prix, plateformes d'affiliation, régies publicitaires et outils du commerce en ligne. Être listée ici ne veut pas dire être déjà reliée — mais chacune peut recevoir votre catalogue, aujourd'hui par un flux produit, demain par un connecteur si vous la demandez.</p>

<h3>Réseaux sociaux : vendre et publier</h3>
<p>Les réseaux sociaux, à part : on y vend le catalogue (social markets) et on y publie au nom de ses pages. La plupart se nourrissent d'un simple flux produit.</p>
<ul>
${social
  .map(
    (s) =>
      `<li>${s.slug ? `<a href="/vendre-sur-${s.slug}/">${esc(s.label)}</a>` : `<b>${esc(s.label)}</b>`} — ${esc(s.detail)}</li>`,
  )
  .join('\n')}
</ul>

${parType}`
}

function platformPage(platform) {
  const url = `/vendre-sur-${platform.slug}/`
  const wording = INTEGRATION_WORDING[platform.integration]
  const trail = [
    { name: 'Accueil', url: '/' },
    { name: 'Où vendre', url: '/vendre-sur-marketplaces/' },
    { name: platform.name, url },
  ]
  const others = platforms.filter((p) => p.slug !== platform.slug).slice(0, 8)

  const body = `${crumb(trail)}
<h1>${esc(platform.title)}</h1>
<p class="lede">${esc(platform.intro)}</p>
<p><span class="badge">${esc(wording.label)}</span></p>

<h2>À qui ${esc(platform.name)} s'adresse</h2>
<p>${esc(platform.audience)}</p>

${coutsHtml(platform.name, COUTS[platform.slug])}

<h2>Ce qu'il faut savoir avant de se lancer</h2>
<p>${esc(platform.constraints)}</p>

<h2>Publier sur ${esc(platform.name)} avec DropShipper IA</h2>
${wording.how.map((p) => `<p>${esc(p)}</p>`).join('\n')}
<div class="card">
  <p>Importez un produit depuis n'importe quelle boutique, laissez l'IA rédiger le titre, la description, les attributs et les mots-clés en français, filigranez les photos à vos couleurs, puis diffusez.</p>
  <p><a class="cta small" href="/register">Créer un compte gratuitement</a></p>
</div>

${argumentsDropShipper(platform.name)}

${faqHtml(platform.faq)}

<h2>Vendre ailleurs</h2>
<p>Un catalogue diffusé sur un seul canal dépend entièrement des règles de ce canal. Les autres destinations disponibles :</p>
${tiles(others)}
<p><a href="/vendre-sur-marketplaces/">Voir toutes les plateformes</a> · <a href="/dropshipping/">Le dropshipping expliqué</a></p>`

  return {
    url,
    title: `${platform.title} | DropShipper IA`,
    description: platform.description,
    jsonLd: [breadcrumbLd(trail), faqLd(platform.faq)],
    body,
  }
}

function topicPage(topic) {
  const url = `/${topic.slug}/`
  const trail = [
    { name: 'Accueil', url: '/' },
    { name: topic.title.split(' :')[0], url },
  ]

  const sections = topic.sections
    .map(
      (s) =>
        `<h2>${esc(s.h2)}</h2>\n${s.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('\n')}${
          s.note ? `\n<p class="note">${esc(s.note)}</p>` : ''
        }`,
    )
    .join('\n')

  const body = `${crumb(trail)}
<h1>${esc(topic.title)}</h1>
<p class="lede">${esc(topic.intro)}</p>
${sections}
${faqHtml(topic.faq)}
<h2>Où publier vos annonces</h2>
${tiles(platforms.slice(0, 8))}
<p><a href="/vendre-sur-marketplaces/">Toutes les plateformes, une par une</a></p>`

  return {
    url,
    title: `${topic.title} | DropShipper IA`,
    description: topic.description,
    jsonLd: [breadcrumbLd(trail), faqLd(topic.faq)],
    body,
  }
}

/** The hub every platform page links back to — the page that consolidates the
 *  "vendre sur …" queries and spreads authority to the leaves. */
function hubPage() {
  const url = '/vendre-sur-marketplaces/'
  const trail = [
    { name: 'Accueil', url: '/' },
    { name: 'Où vendre', url },
  ]

  const group = (title, intro, list) =>
    list.length
      ? `<h2>${esc(title)}</h2>\n<p>${esc(intro)}</p>\n${tiles(list)}`
      : ''

  const body = `${crumb(trail)}
<h1>Où vendre ses produits en ligne : les plateformes, une par une</h1>
<p class="lede">Chaque plateforme a ses règles, son public et son mode de publication. Certaines acceptent une publication automatique par API, d'autres exigent que le vendeur valide chaque annonce lui-même. Voici les deux catégories, sans confusion entre les deux.</p>

${group(
  'Publication automatique',
  "Votre boutique et Shopify : la fiche part réellement, tout de suite, et accepte la publication en lot.",
  platforms.filter((p) => p.integration === 'live'),
)}

${group(
  'Marketplaces à API, compte vendeur requis',
  "Elles possèdent une API, mais demandent un compte vendeur validé. En attendant, vos publications sont enregistrées avec la bonne catégorie de destination.",
  platforms.filter((p) => p.integration === 'api-ready'),
)}

${group(
  "Publication assistée par l'extension",
  "Aucune API publique d'annonces n'existe : le formulaire est ouvert et pré-rempli dans votre navigateur, et vous validez vous-même.",
  platforms.filter((p) => p.integration === 'extension'),
)}

${group(
  'Aucune publication possible',
  "Ces enseignes n'ouvrent pas leur catalogue à des vendeurs tiers. Autant le savoir avant de chercher.",
  platforms.filter((p) => p.integration === 'none'),
)}

${annuaireComplet()}

<h2>Pour aller plus loin</h2>
<ul>
${topics.map((t) => `<li><a href="/${t.slug}/">${esc(t.title)}</a></li>`).join('\n')}
</ul>`

  const faq = [
    {
      q: 'Sur combien de plateformes faut-il publier ?',
      a: "Commencez par celles où votre catégorie de produits se vend réellement, puis élargissez. Publier partout sans adapter les catégories ne produit que des annonces invisibles.",
    },
    {
      q: 'Peut-on tout publier automatiquement ?',
      a: "Non. Vinted, Leboncoin et Facebook Marketplace n'ont pas d'API publique d'annonces : la publication y passe par un remplissage assisté que vous validez.",
    },
  ]

  return {
    url,
    title: 'Où vendre ses produits en ligne : toutes les plateformes | DropShipper IA',
    description:
      'Comparatif des plateformes de vente en ligne : lesquelles acceptent une publication automatique par API, lesquelles exigent un dépôt validé par le vendeur.',
    jsonLd: [breadcrumbLd(trail), faqLd(faq)],
    body: `${body}\n${faqHtml(faq)}`,
  }
}

function write(page) {
  const dir = path.join(DIST, page.url)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'index.html'),
    layout({ ...page, jsonLd: page.jsonLd.length === 1 ? page.jsonLd[0] : page.jsonLd }),
  )
}

function main() {
  if (!fs.existsSync(DIST)) {
    console.error(`dist/ absent — lancez vite build avant ${path.basename(__filename)}`)
    process.exit(1)
  }

  const pages = [hubPage(), ...platforms.map(platformPage), ...topics.map(topicPage)]
  pages.forEach(write)

  // The application's own public routes belong in the sitemap too, otherwise the
  // home page is the only entry point Google is told about.
  const appUrls = ['/', '/avis', '/confidentialite']
  const urls = [...appUrls, ...pages.map((p) => p.url)]

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url><loc>${SITE}${u}</loc><lastmod>${TODAY}</lastmod><changefreq>monthly</changefreq><priority>${
        u === '/' ? '1.0' : u.includes('marketplaces') || u === '/dropshipping/' ? '0.9' : '0.8'
      }</priority></url>`,
  )
  .join('\n')}
</urlset>
`
  fs.writeFileSync(path.join(DIST, 'sitemap.xml'), sitemap)

  fs.writeFileSync(
    path.join(DIST, 'robots.txt'),
    `User-agent: *
Allow: /

Sitemap: ${SITE}/sitemap.xml
`,
  )

  console.log(`${pages.length} pages générées dans dist/`)
  for (const p of pages) console.log(`  ${p.url}`)
  console.log(`sitemap.xml : ${urls.length} URL`)
}

main()
