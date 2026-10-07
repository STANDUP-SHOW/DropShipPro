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
/** Les thèmes de l'accueil : la même table que la page React (src/pages/Index.tsx). */
const ACCUEIL = require('../src/data/accueil-themes.json')

const DIST = path.resolve(__dirname, '..', 'dist')

/** Publique par construction : le fichier <clé>.txt à la racine EST la preuve. */
const INDEXNOW_KEY = '7c1f4e2ab95d4c0e8f36a1d2b7e90c54'

const NOM = 'DropShipper IA'
/*
 * Titre et description du pack SEO de Max (07/10/2026), chiffres recomptés au
 * build : un fournisseur ou un canal ajouté change la phrase, jamais un nombre
 * recopié. Titre ≤ 60 caractères (audit du 03/10/2026, banc check-geo.ts) :
 * le « — Import produit, annonces IA, 314 canaux de vente » proposé en faisait 65.
 */
const TITRE = `${NOM} : import produit, annonces IA, ${canaux.length} canaux`
const DESCRIPTION = `Importez depuis ${FOURNISSEURS.length} fournisseurs, réécrivez vos annonces par IA et publiez sur ${canaux.length} canaux. Sans abonnement : 0,12 € l'annonce. 120 drops offerts.`
/** Le slogan de l'accueil, repris par Organization et par l'image de partage. */
const SLOGAN = "Prenez l'annonce n'importe où. Publiez-la partout."
/** Image de partage 1200×630 (Facebook, LinkedIn, X, WhatsApp) — public/images/. */
const IMAGE_PARTAGE = `${SITE}/images/og-dropshipper-1200x630.png`
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
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE}/#organisation`,
        name: NOM,
        url: `${SITE}/`,
        slogan: SLOGAN,
        logo: { '@type': 'ImageObject', '@id': `${SITE}/#logo`, url: `${SITE}/marque/dropshipper-icone.png`, width: 256, height: 256, caption: NOM },
        image: IMAGE_PARTAGE,
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
        '@type': 'WebPage',
        '@id': `${SITE}/#accueil`,
        url: `${SITE}/`,
        name: TITRE,
        inLanguage: 'fr-FR',
        description: DESCRIPTION,
        isPartOf: { '@id': `${SITE}/#site` },
        about: { '@id': `${SITE}/#application` },
        primaryImageOfPage: { '@type': 'ImageObject', url: IMAGE_PARTAGE, width: 1200, height: 630 },
      },
      /*
       * `Service`, pas `SoftwareApplication` : Google n'accepte une fiche
       * « Software App » qu'avec une note (aggregateRating ou review), et l'audit
       * du 03/10/2026 classait ce nœud en erreur de balisage sur l'accueil, /avis,
       * /confidentialite et /register. Inventer une note est exclu ; le type
       * logiciel reste dit par `additionalType`, que les moteurs lisent sans
       * en faire une fiche enrichie.
       */
      {
        '@type': 'Service',
        additionalType: 'https://schema.org/SoftwareApplication',
        '@id': `${SITE}/#application`,
        name: NOM,
        url: `${SITE}/`,
        serviceType: 'Logiciel de dropshipping et de diffusion multicanal (web, extension Chrome)',
        category: 'BusinessApplication',
        areaServed: ['FR', 'BE', 'CH', 'LU', 'CA'],
        availableLanguage: 'fr-FR',
        description: DESCRIPTION,
        provider: { '@id': `${SITE}/#organisation` },
        // Les onze fonctions de l'accueil, dans l'ordre de la page (src/data/accueil-themes.json).
        featureList: ACCUEIL.themes.map((t) => `${t.eyebrow} : ${t.titre}`),
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
<h1 style="font-size:1.9rem;line-height:1.2;margin:.6rem 0 1rem">${esc(ACCUEIL.hero.titre)} — ${esc(ACCUEIL.hero.sousTitre)}</h1>
<p>${esc(ACCUEIL.hero.texte)}</p>
<p><a href="/register" style="color:#a78bfa">Créer un compte — 120 drops offerts</a> · <a href="/tarifs/" style="color:#a78bfa">Tarifs</a> · <a href="/faq/" style="color:#a78bfa">Questions fréquentes</a> · <a href="/a-propos/" style="color:#a78bfa">À propos</a></p>

${ACCUEIL.themes
  .map(
    (t) => `<section id="${t.slug}">
<h2>${esc(t.titre)}</h2>
<p>${esc(t.accroche)}</p>
<ul>${t.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
<p><a href="/fonctions/${t.slug}/" style="color:#a78bfa">Plus d'informations</a> · <a href="${esc(t.offre.href)}" style="color:#a78bfa">${esc(t.offre.label)}</a></p>
</section>`,
  )
  .join('\n')}

<h2>En chiffres</h2>
<ul>
<li>${FOURNISSEURS.length} fournisseurs référencés avec leurs conditions réelles, dont 3 reliés par API (prix et stock en temps réel).</li>
<li>314 canaux de vente référencés, et pour chacun une voie de liaison définie : 51 par publication directe (45 branchées, 6 qui attendent votre compte vendeur), 234 par votre flux produit, 2 par l'extension — et 27 outils qui ne sont pas des canaux de vente, dits tels quels.</li>
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
    <meta property="og:image" content="${IMAGE_PARTAGE}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${esc(`${NOM} — ${SLOGAN}`)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(TITRE)}" />
    <meta name="twitter:description" content="${esc(DESCRIPTION)}" />
    <meta name="twitter:image" content="${IMAGE_PARTAGE}" />
    <!-- Une seule langue : pas de version /en, donc fr et x-default seulement. -->
    <link rel="alternate" hreflang="fr" href="${SITE}/" />
    <link rel="alternate" hreflang="x-default" href="${SITE}/" />
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
  fs.writeFileSync(fichier, html.replace('<div id="root"></div>', () => `<div id="root">${corpsAccueil(faq)}</div>`))
  // La tête enrichie, #root encore vide : le gabarit des écrans publics ci-dessous.
  return html
}

/**
 * Les écrans publics de l'application qui ont leur place dans un index : avant,
 * Vercel leur servait l'index.html de l'accueil, donc son titre, sa description,
 * son graphe schema.org et un canonical vers « / ». L'audit du 03/10/2026 en
 * concluait que /avis et /confidentialite, déclarés dans le sitemap, désignaient
 * une autre page (« pages incorrectes dans le sitemap »).
 *
 * Chacun reçoit une copie de l'index.html construit, avec SA tête et un court
 * texte statique ; React s'y monte comme sur l'accueil. vercel.json route
 * l'adresse vers cette copie, avant le filet « tout vers /index.html ».
 */
const ECRANS_PUBLICS = [
  {
    url: '/avis',
    title: `Avis des utilisateurs de ${NOM}`,
    description: `Les avis laissés par les vendeurs qui utilisent ${NOM} : import de produits, annonces réécrites par l'IA, publication sur les places de marché.`,
    h1: 'Avis des utilisateurs',
    texte: `Ce que les vendeurs disent de ${NOM}, publié tel quel. Chaque compte peut laisser son avis depuis l'application.`,
  },
  {
    url: '/confidentialite',
    title: `Politique de confidentialité | ${NOM}`,
    description: `Quelles données ${NOM} collecte, pourquoi, combien de temps elles sont gardées et comment exercer vos droits (RGPD).`,
    h1: 'Politique de confidentialité',
    texte: `Les données que ${NOM} traite, leur finalité, leur durée de conservation et vos droits d'accès, de rectification et d'effacement.`,
  },
  {
    url: '/register',
    title: `Créer un compte ${NOM} : 120 drops offerts`,
    description: `Ouvrez un compte ${NOM} en une minute : 120 drops offerts, de quoi importer et publier dix annonces réécrites par l'IA, sans abonnement.`,
    h1: 'Créer un compte',
    texte: `120 drops offerts à l'inscription, de quoi importer et publier dix annonces réécrites par l'IA. Aucun abonnement, aucune carte demandée.`,
  },
]

function ecrireEcransPublics(gabarit) {
  for (const e of ECRANS_PUBLICS) {
    const adresse = `${SITE}${e.url}`
    let html = gabarit
      .replace(/<title>[^<]*<\/title>/, () => `<title>${esc(e.title)}</title>`)
      .replace(/<meta name="description" content="[^"]*" \/>/, () => `<meta name="description" content="${esc(e.description)}" />`)
      .replace(/<link rel="canonical" href="[^"]*" \/>/, () => `<link rel="canonical" href="${adresse}" />`)
      .replace(/<meta property="og:type" content="[^"]*" \/>/, '<meta property="og:type" content="article" />')
      .replace(/<meta property="og:title" content="[^"]*" \/>/, () => `<meta property="og:title" content="${esc(e.title)}" />`)
      .replace(/<meta property="og:description" content="[^"]*" \/>/, () => `<meta property="og:description" content="${esc(e.description)}" />`)
      .replace(/<meta property="og:url" content="[^"]*" \/>/, () => `<meta property="og:url" content="${adresse}" />`)
      .replace(/<meta name="twitter:title" content="[^"]*" \/>/, () => `<meta name="twitter:title" content="${esc(e.title)}" />`)
      .replace(/<meta name="twitter:description" content="[^"]*" \/>/, () => `<meta name="twitter:description" content="${esc(e.description)}" />`)
      .replace(/(hreflang="(?:fr|x-default)" href=")[^"]*"/g, (_, debut) => `${debut}${adresse}"`)
      // Le graphe de l'accueil (organisation, offres, FAQ) n'est pas le propos de ces pages.
      .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, () => `<script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: e.title,
        url: adresse,
        inLanguage: 'fr-FR',
        description: e.description,
        isPartOf: { '@type': 'WebSite', '@id': `${SITE}/#site`, name: NOM, url: `${SITE}/` },
      })}</script>`)
      // Le titre de l'onglet reste celui de la page : Google lit le titre APRÈS JavaScript.
      .replace("document.title = 'DropShipper IA'", '')
    const corps = `<div id="contenu-statique" style="max-width:52rem;margin:0 auto;padding:2.5rem 1.25rem;font:16px/1.65 system-ui,-apple-system,Segoe UI,sans-serif;color:inherit">
<main>
<h1>${esc(e.h1)}</h1>
<p>${esc(e.texte)}</p>
<p><a href="/">Accueil</a> · <a href="/tarifs/">Tarifs</a> · <a href="/faq/">Questions fréquentes</a> · <a href="/a-propos/">À propos</a></p>
</main>
</div>`
    html = html.replace('<div id="root"></div>', () => `<div id="root">${corps}</div>`)
    for (const attendu of [`<title>${esc(e.title)}</title>`, `href="${adresse}"`, '"@type":"WebPage"', `<h1>${esc(e.h1)}</h1>`]) {
      if (!html.includes(attendu)) throw new Error(`${e.url} : « ${attendu} » absent de la copie de index.html`)
    }
    ecrire({ url: e.url, html })
  }
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
      title: `Questions fréquentes sur ${NOM} : prix, plateformes`,
      description: `Ce que fait ${NOM}, ce que ça coûte, où il publie, depuis quels fournisseurs il importe, et en quoi il diffère d'AutoDS, DSers ou Shopify.`,
      jsonLd: [faqLd(faq), breadcrumbLd(trail)],
      body: `${crumb(trail)}
<h1>Questions fréquentes sur ${NOM}</h1>
<p class="lede">Des réponses courtes et chiffrées. Tout ce qui est écrit ici est vérifiable dans l'application ; les prix sont ceux de la <a href="/tarifs/">grille tarifaire</a>.</p>
${faqHtml(faq)}`,
    }),
  }
}

/**
 * Les quatre questions du pack SEO de Max (07/10/2026), posées sur /tarifs/ en
 * FAQPage. Chaque réponse est recomptée ou relue dans les tables du site :
 * prix dans TARIFS, fournisseurs dans fournisseurs.json, canaux dans
 * seo-channels.cjs, remboursements dans accueil-themes.json (« les-drops »,
 * « auto-shipper »).
 */
function faqTarifs() {
  const drops = (debut) => TARIFS.find(([nom]) => nom.startsWith(debut))[1]
  const euros = (d) => `${prixEnEuros(d).replace('.', ',')} €`
  const annonce = drops('Importer une annonce')
  const boutique = drops('DropShop IA : création')
  return [
    {
      q: `Combien coûte ${NOM} ?`,
      a: `Aucun abonnement : 1 drop = 0,01 €. Une annonce importée et réécrite par l'IA coûte ${annonce} drops (${euros(annonce)}). Une boutique DropShop IA coûte ${boutique} drops (${euros(boutique)}), payés une seule fois, à vie. 120 drops sont offerts à l'inscription.`,
    },
    {
      q: "Que se passe-t-il si l'IA échoue ?",
      a: "Le crédit est rendu : une réécriture que le modèle n'a pas faite, une boutique qui n'aboutit pas, une journée d'AUTO-SHIPPER où aucun produit n'a été importé.",
    },
    {
      q: "D'où viennent les produits ?",
      a: `De ${FOURNISSEURS.length} fournisseurs référencés — AliExpress, Temu, CJ Dropshipping, BigBuy, vidaXL, Printful, SUPER DELIVERY… — avec leurs conditions lues sur leurs pages : origine, délais, douane, dropshipping autorisé ou non, photos réutilisables ou non. Toute autre boutique s'importe par son adresse ou par l'extension Chrome.`,
    },
    {
      q: 'Où puis-je publier ?',
      a: `${canaux.length} canaux de vente sont référencés. Publication directe vers votre boutique, Shopify, WooCommerce, PrestaShop, eBay, Kaufland et 41 enseignes Mirakl ; Vinted, Leboncoin et Facebook Marketplace par l'extension, qui remplit le formulaire et vous laisse valider ; flux Google Shopping et Meta pour les autres.`,
    },
  ]
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
      title: `Tarifs ${NOM} : 0,12 € l'annonce, sans abonnement`,
      description: `La grille complète de ${NOM} : chaque action a son prix en drops (1 drop = 0,01 €). Aucun abonnement, 120 drops offerts à l'inscription.`,
      jsonLd: [offres, faqLd(faqTarifs()), breadcrumbLd(trail)],
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
</ul>
${faqHtml(faqTarifs())}`,
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
      title: `À propos de ${NOM}, le dropshipping français par IA`,
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
<tr><th>Canaux de vente</th><td>314 canaux de vente référencés, et pour chacun une voie de liaison définie : 51 par publication directe (45 branchées, 6 qui attendent votre compte vendeur), 234 par votre flux produit, 2 par l'extension — et 27 outils qui ne sont pas des canaux de vente, dits tels quels.</td></tr>
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

/**
 * /api-power/ — ce que les API marketing débloquent une fois connectées, avec
 * l'état réel de chaque raccordement. Lit src/data/api-power.json, copie
 * engendrée du registre backend (exporter-api-power.ts) : la page React
 * /api-power lit la même.
 */
function pageApiPower() {
  const url = '/api-power/'
  const trail = [{ name: 'Accueil', url: '/' }, { name: 'API Power', url }]
  const { apis, libelles, univers, resume } = require('../src/data/api-power.json')
  const retenues = apis.filter((a) => a.etat !== 'ecarte')
  return {
    url,
    html: layout({
      url,
      title: `API Power : les API Meta, Google, TikTok et Pinterest`,
      description: `${resume.retenues} API marketing, publicitaires et de publication, ${resume.opportunites} opportunités — publier, mesurer, cibler, répondre — et l'état réel de chaque raccordement.`,
      jsonLd: [
        { '@context': 'https://schema.org', '@type': 'ItemList', name: 'API Power', url: `${SITE}${url}`, numberOfItems: retenues.length, itemListElement: retenues.map((a, i) => ({ '@type': 'ListItem', position: i + 1, name: `${a.nom} (${a.editeur})`, url: `${SITE}${url}#${a.id}` })) },
        breadcrumbLd(trail),
      ],
      body: `${crumb(trail)}
<h1>API Power : ce que les API marketing débloquent, une fois connectées</h1>
<p class="lede">Meta, Google, TikTok, Pinterest et les autres exposent des API. Chacune ouvre des gestes précis — publier, mesurer, cibler, répondre — et chaque donnée a une place dans le back-office de ${NOM}. ${resume.retenues} API retenues, ${resume.opportunites} opportunités, et pour chaque raccordement son état réel.</p>
<h2>Lire l'état d'un raccordement</h2>
<ul>${Object.entries(libelles.etat).map(([e, l]) => `<li><b>${esc(l)}</b> — ${esc({ ecrit: 'connecteur écrit et éprouvé sur un faux serveur, à confronter au vrai service', flux: 'nous servons déjà le flux que cette API consomme', jeton: 'le jeton se colle dans API Connect, rien n’est encore lu', prevu: 'rien n’est écrit, l’opportunité est décrite honnêtement', ecarte: 'non retenu, avec la raison' }[e])}</li>`).join('')}</ul>
${retenues.map((a) => `<h2 id="${a.id}">${esc(a.nom)} — ${esc(univers[a.univers].label.split(' — ')[0])}</h2>
<p><b>${esc(libelles.etat[a.etat])}.</b> ${esc(a.quoi)}${a.existant ? ` <i>${esc(a.existant)}</i>` : ''}</p>
${a.opportunites.map((o) => `<h3>${esc(o.titre)} <small>(${esc(libelles.usage[o.usage])} · dans le back-office : ${esc(libelles.ecran[o.ecran])})</small></h3>
<p>${esc(o.quoi)}</p>
<p>Ce qui remonte : ${o.donnees.map(esc).join(' ; ')}. Vos gestes : ${o.gestes.map(esc).join(' ; ')}.</p>`).join('\n')}
<p>Prérequis chez ${esc(a.editeur)} : ${a.prerequis.map(esc).join(' ')} <a href="${a.doc}">Documentation</a> · <a href="${a.console}">Console</a></p>`).join('\n')}
<h2>Non retenues</h2>
<ul>${apis.filter((a) => a.etat === 'ecarte').map((a) => `<li><b>${esc(a.nom)}</b> — ${esc(a.existant || '')}</li>`).join('')}</ul>
<p>Les raccordements se font dans API Connect, après connexion : les jetons se collent une fois, ne sont jamais réaffichés, et chaque écran dit ce qui est lu.</p>`,
    }),
  }
}

/**
 * /fonctions/<slug>/ — la page « plus d'informations » d'un thème de l'accueil :
 * le texte long, les points, l'illustration, et l'offre correspondante.
 */
function pageFonction(t, index) {
  const url = `/fonctions/${t.slug}/`
  const trail = [{ name: 'Accueil', url: '/' }, { name: 'Fonctions', url: '/#' + t.slug }, { name: t.eyebrow, url }]
  const voisins = ACCUEIL.themes.filter((a) => a.slug !== t.slug)
  const externe = /^https?:/.test(t.offre.href)
  return {
    url,
    html: layout({
      url,
      title: `${t.titre} | ${NOM}`,
      description: t.accroche.length > 158 ? `${t.accroche.slice(0, 155).replace(/\s+\S*$/, '')}…` : t.accroche,
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: t.titre,
          url: `${SITE}${url}`,
          inLanguage: 'fr-FR',
          description: t.accroche,
          isPartOf: { '@id': `${SITE}/#site` },
          about: { '@id': `${SITE}/#application` },
          position: index + 1,
        },
        breadcrumbLd(trail),
        // FAQPage facultative : un tableau `faq: [{ q, a }]` sur le thème, dans
        // src/data/accueil-themes.json, suffit à la poser — balisage et texte visible.
        ...(t.faq?.length ? [faqLd(t.faq)] : []),
      ],
      body: `${crumb(trail)}
<p class="badge">${esc(t.eyebrow)}</p>
<h1>${esc(t.titre)}</h1>
<p class="lede">${esc(t.accroche)}</p>
<img src="${esc(t.image)}" alt="${esc(t.titre)}" loading="lazy" style="display:block;width:100%;border-radius:1rem;margin:1.25rem 0" onerror="this.style.display='none'">
<h2>En détail</h2>
<p>${esc(t.detail)}</p>
<h2>Ce que vous obtenez</h2>
<ul>${t.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
<p><a class="cta" href="${esc(t.offre.href)}"${externe ? ' rel="noopener" target="_blank"' : ''}>${esc(t.offre.label)}</a></p>
${t.faq?.length ? faqHtml(t.faq) : ''}
<h2>Les autres fonctions</h2>
<div class="grid">${voisins.map((v) => `<a class="tile" href="/fonctions/${v.slug}/">${esc(v.eyebrow)}</a>`).join('')}</div>`,
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

# L'index : les pages du site et les analyses de marché des agents (une page par
# rapport, engendrée par l'API à chaque requête, routes/analysesPubliques.ts).
Sitemap: ${SITE}/sitemap.xml
Sitemap: ${SITE}/analyses/sitemap.xml

# Fiche d'identité lisible par les assistants conversationnels (convention
# llms.txt) : ${SITE}/llms.txt et ${SITE}/llms-full.txt (copie : ${SITE}/ai.txt). En commentaire
# seulement : les directives LLM-Content ne sont pas standard, et l'audit du
# 03/10/2026 classait tout le fichier « format invalide » à cause d'elles.
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

/**
 * /sitemap.xml devient un INDEX de sitemaps (demandé par Max le 03/10/2026) :
 * les pages du site, figées au build (sitemap-pages.xml), et les analyses des
 * agents, que l'API engendre à chaque requête depuis rapports.db
 * (/analyses/sitemap.xml). Un moteur qui ne lit que /sitemap.xml trouve ainsi
 * chaque nouvelle page d'analyse sans qu'on redéploie le site.
 */
function ecrireIndexSitemaps() {
  fs.renameSync(path.join(DIST, 'sitemap.xml'), path.join(DIST, 'sitemap-pages.xml'))
  fs.writeFileSync(
    path.join(DIST, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>${SITE}/sitemap-pages.xml</loc><lastmod>${TODAY}</lastmod></sitemap>
  <sitemap><loc>${SITE}/analyses/sitemap.xml</loc></sitemap>
</sitemapindex>
`,
  )
}

function main() {
  if (!fs.existsSync(path.join(DIST, 'sitemap.xml'))) {
    console.error('dist/sitemap.xml absent — lancez build-seo.cjs avant build-geo.cjs')
    process.exit(1)
  }
  const faq = FAQ()
  ecrireEcransPublics(enrichirAccueil(faq))
  const pages = [pageFaq(faq), pageTarifs(), pageAPropos(faq), pageApiPower(), ...ACCUEIL.themes.map(pageFonction)]
  pages.forEach(ecrire)
  ecrireRobots()
  fs.writeFileSync(path.join(DIST, `${INDEXNOW_KEY}.txt`), INDEXNOW_KEY)
  const total = completerSitemap(pages.map((p) => p.url))
  ecrireIndexSitemaps()
  console.log(`GEO : accueil pré-rendue, ${pages.map((p) => p.url).join(' ')}, robots.txt (${ROBOTS_IA.length} robots nommés), clé IndexNow — sitemap : ${total} URL`)
}

module.exports = { INDEXNOW_KEY, ROBOTS_IA }

if (require.main === module) main()
