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

<h2>Ce qu'il faut savoir avant de se lancer</h2>
<p>${esc(platform.constraints)}</p>

<h2>Publier sur ${esc(platform.name)} avec DropShipper IA</h2>
${wording.how.map((p) => `<p>${esc(p)}</p>`).join('\n')}
<div class="card">
  <p>Importez un produit depuis n'importe quelle boutique, laissez l'IA rédiger le titre, la description, les attributs et les mots-clés en français, filigranez les photos à vos couleurs, puis diffusez.</p>
  <p><a class="cta small" href="/register">Créer un compte gratuitement</a></p>
</div>

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
