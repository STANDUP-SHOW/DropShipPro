/**
 * Ce qu'un ROBOT reçoit de www.drop-shipper.fr — moteurs de recherche et, de
 * plus en plus, assistants conversationnels.
 *
 * Mesuré le 19/09/2026 avec l'agent de GPTBot : la page d'accueil rendait
 * **21 caractères de texte**, aucun titre, aucune donnée structurée. Normal :
 * c'est une application React, et ni GPTBot, ni ClaudeBot, ni PerplexityBot
 * n'exécutent JavaScript. `llms.txt` existait, mais un assistant qui cherche
 * « logiciel de dropshipping français » part d'un index de PAGES, pas d'un
 * fichier que personne ne lui a désigné.
 *
 * Ce script passe après `vite build`, `build-seo.cjs` et `build-llms.cjs`, et
 * produit quatre choses dans dist/ :
 *
 *   1. index.html enrichi — titre et description complets, adresse canonique,
 *      Open Graph, et un graphe schema.org (Organization, WebSite,
 *      SoftwareApplication avec ses offres, FAQPage). Surtout : le contenu de la
 *      page, en HTML, DANS `#root`. React s'y monte avec `createRoot` et le
 *      remplace à l'arrivée ; un robot, lui, lit une vraie page. Ce n'est pas du
 *      contenu caché : c'est le même propos que l'accueil, visible le temps que
 *      l'application charge, et seulement sur « / ».
 *   2. /faq/, /tarifs/, /a-propos/ — des pages de FAITS, citables : une question,
 *      sa réponse ; une action, son prix. C'est ce qu'un assistant reprend.
 *   3. robots.txt — les robots des assistants nommés un par un. `User-agent: *`
 *      les couvrait déjà ; les nommer protège d'un futur `Disallow` trop large
 *      et dit l'intention sans ambiguïté.
 *   4. La clé IndexNow (fichier public, ce n'est pas un secret) : elle prouve à
 *      Bing, Yandex, Seznam et Naver que l'annonce d'une adresse vient bien du
 *      site. `node scripts/indexnow.cjs` fait l'annonce, après déploiement.
 *
 * Les tables viennent de build-llms.cjs : une seule source pour les prix, les
 * fonctions et les questions. Banc : backend/check-geo.ts.
 */
const fs = require('node:fs')
const path = require('node:path')

const { layout, esc, faqLd, faqHtml, breadcrumbLd, crumb, SITE, TODAY } = require('./build-seo.cjs')
const { TARIFS, RECHARGES, FOURNISSEURS, FONCTIONS, DIFFERENCES, FAQ, parType } = require('./build-llms.cjs')
const { canaux } = require('./seo-channels.cjs')

const DIST = path.resolve(__dirname, '..', 'dist')

/** Publique par construction : le fichier <clé>.txt à la racine EST la preuve. */
const INDEXNOW_KEY = '7c1f4e2ab95d4c0e8f36a1d2b7e90c54'

const NOM = 'DropShipper IA'
const TITRE = 'DropShipper IA — logiciel de dropshipping français : import, annonces par IA, publication multi-marketplaces'
const DESCRIPTION =
  "Plateforme française de dropshipping : importez un produit depuis n'importe quel fournisseur, l'IA réécrit l'annonce, et publiez sur Shopify, eBay, Kaufland, 41 places de marché Mirakl, Vinted et Leboncoin. À l'acte, sans abonnement : 0,12 € l'annonce."
const CHROME_STORE = 'https://chromewebstore.google.com/detail/dmhhfboiialjghjkjhfnipjafffpodlk'

/** Les robots des assistants et de leurs moteurs de recherche, tels qu'ils se nomment eux-mêmes. */
const ROBOTS_IA = [
  ['GPTBot', 'OpenAI — entraînement'],
  ['OAI-SearchBot', 'OpenAI — recherche de ChatGPT'],
  ['ChatGPT-User', 'OpenAI — page ouverte à la demande d’un utilisateur'],
  ['ClaudeBot', 'Anthropic — entraînement'],
  ['Claude-SearchBot', 'Anthropic — recherche de Claude'],
  ['Claude-User', 'Anthropic — page ouverte à la demande d’un utilisateur'],
  ['PerplexityBot', 'Perplexity — index'],
  ['Perplexity-User', 'Perplexity — page ouverte à la demande d’un utilisateur'],
  ['Google-Extended', 'Google — Gemini et AI Overviews'],
  ['Applebot-Extended', 'Apple Intelligence'],
  ['meta-externalagent', 'Meta AI'],
  ['Amazonbot', 'Amazon — Alexa, Rufus'],
  ['MistralAI-User', 'Mistral — Le Chat'],
  ['DuckAssistBot', 'DuckDuckGo — DuckAssist'],
  ['cohere-ai', 'Cohere'],
  ['CCBot', 'Common Crawl — la source de la plupart des modèles'],
  ['Bingbot', 'Bing — dont dépendent Copilot et la recherche de ChatGPT'],
]

const prixEnEuros = (drops) => (drops / 100).toFixed(2)

function grapheSchema(faq) {
  const n = parType()
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE}/#organisation`,
        name: NOM,
        url: `${SITE}/`,
        logo: `${SITE}/favicon-128.png`,
        email: 'contact@drop-shipper.fr',
        areaServed: ['FR', 'BE', 'CH', 'LU', 'CA'],
        knowsLanguage: 'fr',
        sameAs: [CHROME_STORE],
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE}/#site`,
        url: `${SITE}/`,
        name: NOM,
        inLanguage: 'fr-FR',
        description: DESCRIPTION,
        publisher: { '@id': `${SITE}/#organisation` },
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${SITE}/#application`,
        name: NOM,
        url: `${SITE}/`,
        applicationCategory: 'BusinessApplication',
        applicationSubCategory: 'Logiciel de dropshipping et de diffusion multicanal',
        operatingSystem: 'Web, extension Chrome',
        inLanguage: 'fr-FR',
        description: DESCRIPTION,
        publisher: { '@id': `${SITE}/#organisation` },
        featureList: FONCTIONS.map((f) => f.titre),
        installUrl: CHROME_STORE,
        // Les prix réels, à l'acte. Pas d'aggregateRating : aucune note n'est inventée.
        offers: [
          ...TARIFS.filter(([, drops]) => drops > 0)
            .slice(0, 6)
            .map(([nom, drops]) => ({
              '@type': 'Offer',
              name: nom,
              price: prixEnEuros(drops),
              priceCurrency: 'EUR',
              category: 'Paiement à l’acte, sans abonnement',
            })),
          { '@type': 'Offer', name: 'Inscription — 120 drops offerts', price: '0.00', priceCurrency: 'EUR' },
        ],
        additionalProperty: [
          { '@type': 'PropertyValue', name: 'Fournisseurs référencés', value: FOURNISSEURS.length },
          { '@type': 'PropertyValue', name: 'Canaux de vente référencés', value: canaux.length },
          { '@type': 'PropertyValue', name: 'Places de marché référencées', value: n.marketplace },
          { '@type': 'PropertyValue', name: 'Destinations de publication branchées', value: 45 },
        ],
      },
      { ...faqLd(faq), '@id': `${SITE}/#faq`, '@context': undefined },
    ],
  }
}

/** Le propos de l'accueil, en HTML simple : ce que lit un robot, et ce qu'un visiteur voit une demi-seconde. */
function corpsAccueil(faq) {
  const n = parType()
  return `<div id="contenu-statique" style="max-width:52rem;margin:0 auto;padding:2.5rem 1.25rem;font:16px/1.65 system-ui,-apple-system,Segoe UI,sans-serif;color:inherit">
<header><p style="font-weight:700;letter-spacing:.02em">${NOM}</p></header>
<main>
<h1 style="font-size:1.9rem;line-height:1.2;margin:.6rem 0 1rem">Le logiciel de dropshipping français : prenez l'annonce n'importe où, publiez-la partout</h1>
<p>${esc(DESCRIPTION)}</p>
<p><a href="/register" style="color:#a78bfa">Créer un compte — 120 drops offerts</a> · <a href="/tarifs/" style="color:#a78bfa">Tarifs</a> · <a href="/faq/" style="color:#a78bfa">Questions fréquentes</a> · <a href="/a-propos/" style="color:#a78bfa">À propos</a></p>

<h2>Ce que fait ${NOM}</h2>
<ul>
${FONCTIONS.map((f) => `<li><strong>${esc(f.titre)}</strong> — ${esc(f.lignes[0])}</li>`).join('\n')}
</ul>

<h2>En chiffres</h2>
<ul>
<li>${FOURNISSEURS.length} fournisseurs référencés avec leurs conditions réelles, dont 3 reliés par API (prix et stock en temps réel).</li>
<li>${canaux.length} canaux de vente référencés, dont ${n.marketplace} places de marché ; 45 destinations de publication déjà branchées, dont 41 opérateurs Mirakl.</li>
<li>Une annonce importée et réécrite par l'IA : 0,12 €. Une boutique en ligne écrite par l'IA : 3,50 €, une seule fois. Aucun abonnement.</li>
</ul>

<h2>Ce qui le distingue</h2>
<ul>
${DIFFERENCES.map(([nous, eux]) => `<li><strong>${esc(nous)}.</strong> ${esc(eux)}</li>`).join('\n')}
</ul>

${faqHtml(faq.slice(0, 6))}

<h2>Aller plus loin</h2>
<ul>
<li><a href="/dropshipping/" style="color:#a78bfa">Le guide du dropshipping</a></li>
<li><a href="/vendre-sur-marketplaces/" style="color:#a78bfa">Où vendre : toutes les places de marché</a></li>
<li><a href="/logiciel-dropshipping/" style="color:#a78bfa">Choisir un logiciel de dropshipping</a></li>
<li><a href="/llms.txt" style="color:#a78bfa">Description de la plateforme pour les assistants IA (llms.txt)</a></li>
</ul>
</main>
</div>`
}

function enrichirAccueil(faq) {
  const fichier = path.join(DIST, 'index.html')
  let html = fs.readFileSync(fichier, 'utf8')

  const tete = `<title>${esc(TITRE)}</title>
    <meta name="description" content="${esc(DESCRIPTION)}" />
    <link rel="canonical" href="${SITE}/" />
    <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${NOM}" />
    <meta property="og:title" content="${esc(TITRE)}" />
    <meta property="og:description" content="${esc(DESCRIPTION)}" />
    <meta property="og:url" content="${SITE}/" />
    <meta property="og:image" content="${SITE}/favicon-128.png" />
    <meta name="twitter:card" content="summary" />
    <link rel="alternate" type="text/plain" href="${SITE}/llms.txt" title="Description pour les assistants IA" />
    <script type="application/ld+json">${JSON.stringify(grapheSchema(faq))}</script>
    <!-- Le contenu statique ne vaut que pour « / » : sur les écrans de l'application,
         il clignoterait avant le montage de React ; et l'onglet y garde son titre court. -->
    <script>if (location.pathname !== '/') { document.documentElement.classList.add('ecran-app'); document.title = 'DropShipper IA' }</script>
    <style>.ecran-app #contenu-statique{display:none}</style>`

  if (!/<title>[^<]*<\/title>/.test(html)) throw new Error('index.html : <title> introuvable')
  if (!html.includes('<div id="root"></div>')) throw new Error('index.html : <div id="root"></div> introuvable')

  // L'ancienne description courte laisse la place à la nouvelle : deux balises se contrediraient.
  html = html.replace(/\s*<meta name="description"[^>]*>/, '')
  html = html.replace(/<title>[^<]*<\/title>/, () => tete)
  html = html.replace('<div id="root"></div>', () => `<div id="root">${corpsAccueil(faq)}</div>`)
  fs.writeFileSync(fichier, html)
}

function ecrire(page) {
  const dossier = path.join(DIST, page.url)
  fs.mkdirSync(dossier, { recursive: true })
  fs.writeFileSync(path.join(dossier, 'index.html'), page.html)
}

function pageFaq(faq) {
  const url = '/faq/'
  const trail = [{ name: 'Accueil', url: '/' }, { name: 'Questions fréquentes', url }]
  return {
    url,
    html: layout({
      url,
      title: `Questions fréquentes sur ${NOM} : prix, plateformes, fournisseurs, légalité`,
      description: `Ce que fait ${NOM}, ce que ça coûte, où il publie, depuis quels fournisseurs il importe, et en quoi il diffère d'AutoDS, DSers ou Shopify.`,
      jsonLd: [faqLd(faq), breadcrumbLd(trail)],
      body: `${crumb(trail)}
<h1>Questions fréquentes sur ${NOM}</h1>
<p class="lede">Des réponses courtes et chiffrées. Tout ce qui est écrit ici est vérifiable dans l'application ; les prix sont ceux de la <a href="/tarifs/">grille tarifaire</a>.</p>
${faqHtml(faq)}`,
    }),
  }
}

function pageTarifs() {
  const url = '/tarifs/'
  const trail = [{ name: 'Accueil', url: '/' }, { name: 'Tarifs', url }]
  const offres = {
    '@context': 'https://schema.org',
    '@type': 'OfferCatalog',
    name: `Tarifs de ${NOM}`,
    url: `${SITE}${url}`,
    itemListElement: TARIFS.map(([nom, drops]) => ({
      '@type': 'Offer',
      name: nom,
      price: prixEnEuros(drops),
      priceCurrency: 'EUR',
    })),
  }
  return {
    url,
    html: layout({
      url,
      title: `Tarifs de ${NOM} : à l'acte, sans abonnement — 0,12 € l'annonce`,
      description: `La grille complète de ${NOM} : chaque action a son prix en drops (1 drop = 0,01 €). Aucun abonnement, 120 drops offerts à l'inscription.`,
      jsonLd: [offres, breadcrumbLd(trail)],
      body: `${crumb(trail)}
<h1>Tarifs de ${NOM}</h1>
<p class="lede">Aucun abonnement, aucun engagement : chaque action a un prix, payé en « drops ». <strong>1 drop = 0,01 €.</strong> 120 drops sont offerts à l'inscription — de quoi importer dix annonces sans payer.</p>
<h2>Le prix de chaque action</h2>
<table><thead><tr><th>Action</th><th>Drops</th><th>En euros</th></tr></thead><tbody>
${TARIFS.map(([nom, drops, euros]) => `<tr><td>${esc(nom)}</td><td>${drops}</td><td>${esc(euros)}</td></tr>`).join('\n')}
</tbody></table>
<h2>Les recharges</h2>
<table><thead><tr><th>Vous payez</th><th>Vous recevez</th><th>Prix du drop</th></tr></thead><tbody>
${RECHARGES.map(([prix, drops, unite]) => `<tr><td>${esc(prix)}</td><td>${esc(drops)}</td><td>${esc(unite)}</td></tr>`).join('\n')}
</tbody></table>
<p>Le prix d'une action en drops ne change pas avec la recharge : c'est le drop qui coûte moins cher quand on en achète davantage. Un crédit est rendu quand l'action échoue — une réécriture que le modèle n'a pas faite, une création de boutique qui n'aboutit pas.</p>
<h2>Ce qui est gratuit</h2>
<ul>
<li>L'inscription et 120 drops de bienvenue.</li>
<li>La vitrine à thèmes, les flux catalogue (Google Shopping, Meta), l'annuaire des ${canaux.length} canaux et des ${FOURNISSEURS.length} fournisseurs.</li>
<li>L'AUTO-MODE des chefs de rayon : analyses de marché et produits gagnants quotidiens.</li>
<li>L'extension Chrome, sur le <a href="${CHROME_STORE}">Chrome Web Store</a>.</li>
</ul>`,
    }),
  }
}

function pageAPropos(faq) {
  const url = '/a-propos/'
  const trail = [{ name: 'Accueil', url: '/' }, { name: 'À propos', url }]
  const n = parType()
  return {
    url,
    html: layout({
      url,
      title: `À propos de ${NOM} : la plateforme française de dropshipping assistée par IA`,
      description: `${NOM} en faits : ce que fait la plateforme, pour qui, à quel prix, depuis quels fournisseurs et vers quelles places de marché.`,
      jsonLd: [
        { '@context': 'https://schema.org', '@type': 'AboutPage', url: `${SITE}${url}`, name: `À propos de ${NOM}`, about: { '@id': `${SITE}/#application` } },
        breadcrumbLd(trail),
      ],
      body: `${crumb(trail)}
<h1>À propos de ${NOM}</h1>
<p class="lede">${esc(faq[0].a)}</p>
<h2>La fiche</h2>
<table><tbody>
<tr><th>Nom</th><td>${NOM}</td></tr>
<tr><th>Adresse</th><td><a href="${SITE}/">${SITE.replace('https://', '')}</a></td></tr>
<tr><th>Nature</th><td>Logiciel en ligne (SaaS) d'import, de création et de diffusion d'annonces pour le commerce en ligne, avec une extension Chrome</td></tr>
<tr><th>Pays et langue</th><td>France — interface, support et facturation en français, en euros</td></tr>
<tr><th>Pour qui</th><td>Vendeurs en ligne, dropshippers, boutiques qui diffusent sur plusieurs places de marché</td></tr>
<tr><th>Modèle de prix</th><td>À l'acte, en drops (1 drop = 0,01 €), sans abonnement — voir les <a href="/tarifs/">tarifs</a></td></tr>
<tr><th>Fournisseurs</th><td>${FOURNISSEURS.length} référencés ; import possible depuis n'importe quelle boutique en ligne</td></tr>
<tr><th>Canaux de vente</th><td>${canaux.length} référencés, dont ${n.marketplace} places de marché ; 45 destinations branchées (Shopify, eBay, Kaufland, 41 opérateurs Mirakl, boutique du vendeur)</td></tr>
<tr><th>Extension</th><td><a href="${CHROME_STORE}">Chrome Web Store</a></td></tr>
<tr><th>Contact</th><td>contact@drop-shipper.fr</td></tr>
</tbody></table>
<h2>Ce que fait la plateforme</h2>
${FONCTIONS.map((f) => `<h3>${esc(f.titre)}</h3>\n<ul>${f.lignes.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`).join('\n')}
<h2>Les fournisseurs référencés</h2>
<p>${FOURNISSEURS.map(esc).join(', ')}.</p>
<h2>Pour les assistants IA</h2>
<p>Deux fichiers en texte décrivent la plateforme sans mise en page : <a href="/llms.txt">llms.txt</a> (la carte) et <a href="/llms-full.txt">llms-full.txt</a> (tout le détail). Leur contenu peut être cité.</p>`,
    }),
  }
}

function ecrireRobots() {
  fs.writeFileSync(
    path.join(DIST, 'robots.txt'),
    `# ${NOM} — ouvert à tous les robots, ceux des assistants compris.
User-agent: *
Allow: /

# Les robots des assistants conversationnels et de leurs moteurs, nommés un par
# un : ils sont les bienvenus, y compris pour citer le contenu.
${ROBOTS_IA.map(([agent, qui]) => `# ${qui}\nUser-agent: ${agent}\nAllow: /`).join('\n\n')}

Sitemap: ${SITE}/sitemap.xml
# Les analyses de marché des agents, une page par rapport, servies par l'API (routes/analysesPubliques.ts).
Sitemap: ${SITE}/analyses/sitemap.xml

# Fiche d'identité lisible par les assistants conversationnels
# (convention llms.txt) : ce que fait ${NOM}, en un seul fichier.
LLM-Content: ${SITE}/llms.txt
LLM-Full-Content: ${SITE}/llms-full.txt
`,
  )
}

function completerSitemap(urls) {
  const fichier = path.join(DIST, 'sitemap.xml')
  let xml = fs.readFileSync(fichier, 'utf8')
  const lignes = urls
    .filter((u) => !xml.includes(`<loc>${SITE}${u}</loc>`))
    .map((u) => `  <url><loc>${SITE}${u}</loc><lastmod>${TODAY}</lastmod><changefreq>monthly</changefreq><priority>0.9</priority></url>`)
  if (lignes.length) xml = xml.replace('</urlset>', () => `${lignes.join('\n')}\n</urlset>`)
  fs.writeFileSync(fichier, xml)
  return (xml.match(/<loc>/g) || []).length
}

function main() {
  if (!fs.existsSync(path.join(DIST, 'sitemap.xml'))) {
    console.error('dist/sitemap.xml absent — lancez build-seo.cjs avant build-geo.cjs')
    process.exit(1)
  }
  const faq = FAQ()
  enrichirAccueil(faq)
  const pages = [pageFaq(faq), pageTarifs(), pageAPropos(faq)]
  pages.forEach(ecrire)
  ecrireRobots()
  fs.writeFileSync(path.join(DIST, `${INDEXNOW_KEY}.txt`), INDEXNOW_KEY)
  const total = completerSitemap(pages.map((p) => p.url))
  console.log(`GEO : accueil pré-rendue, ${pages.map((p) => p.url).join(' ')}, robots.txt (${ROBOTS_IA.length} robots nommés), clé IndexNow — sitemap : ${total} URL`)
}

module.exports = { INDEXNOW_KEY, ROBOTS_IA }

if (require.main === module) main()
