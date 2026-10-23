'use strict'
/**
 * The unified "agent rayon": one category, ONE theme of the day -> one MarketSpy
 * report (study + 20 products + marketing prompts), then the two Markdown
 * reports of the contract.
 *
 * Search engine: `deps.recherche` (Claude's own web search, lib/recherche-claude.js,
 * run in lots) or, when Max chose it, `deps.serper` (one call per query).
 *
 * Order of work (the Claude call is LAST, so every guard fires before it spends):
 *   wave 1  ~20 searches on the theme
 *   pages   read up to `plafondPages` pages (plain HTTP, light on a weak PC)
 *   names   model names pulled from what was read (one small Claude call)
 *   wave 2  one search per model name, to reach product pages (capped): the SELLING price seen in France
 *   sourcing one search per product on supplier sites only (Alibaba, AliExpress, CJ, BigBuy…, the API's
 *           allowed_domains): the only URLs allowed in supplier_url, the only source of a purchase price
 *   fiches  the product pages of wave 2 read in plain HTTP: image (og:image) and
 *           price written by the page itself (schema.org), free of charge
 *   sources readings of the connected data sites (private browser)
 *   write   one Claude call, then validation, then the files
 *
 * Every guard throws: a run that produced nothing must never be recorded as a success.
 */
const fs = require('node:fs')
const path = require('node:path')
const { ErreurFournisseur } = require('./erreurs')
const { valider, cle: cleUrl } = require('./validation')
const { rayonMd, marketingMd } = require('./rapports-md')
const depot = require('./depot')
const { sectionPreuves } = require('./signaux')
const { lecteurMotsCles } = require('./mots-cles')
const { releverSerperEtendu, sectionsPreuvesSerper, urlsVendeurs } = require('./serper-etendu')

const PROMPT_PAR_DEFAUT = path.join(__dirname, '..', 'prompts', 'rayon.md')
const BUDGET_PREUVES = 120_000
// Searches per Claude call: every result read stays in the context of the next searches of the same call
// (billed as input), so small lots cost fewer tokens; 3 keeps the per-call overhead low too.
const TAILLE_LOT = 3
// Where a product is bought, not resold: wholesale and import platforms. A French retailer (Darty, Fnac,
// Cdiscount, Boulanger, Amazon.fr…) only ever gives the selling price, never the supplier (Max, 11/10).
const DOMAINES_FOURNISSEURS = [
  // dhgate.com left out: the API refuses it ("not accessible to our user agent", 11/10)
  'alibaba.com', 'aliexpress.com', 'made-in-china.com', 'globalsources.com',
  'cjdropshipping.com', 'bigbuy.eu', 'banggood.com', 'temu.com', 'vidaxl.com', 'syncee.com', 'ankorstore.com',
]
const hoteDe = (u) => { try { return new URL(u).hostname.toLowerCase() } catch { return '' } }
const chezFournisseur = (u, domaines) => { const h = hoteDe(u); return domaines.some((d) => h === d || h.endsWith('.' + d)) }
// Search, category, showroom and price-list pages of the supplier sites (aliexpress.com/w/wholesale-…,
// alibaba.com/showroom/…, made-in-china.com/products-search/…): not a product page, never a supplier_url.
// Only the first path segment is tested: a product slug may well start with "Wholesale-…".
const PAGE_DE_LISTE = /^\/(w|wholesale|showroom|popular|price|category|categories|catalog|search|searchlist|products-search|manufacturers|suppliers|hot-products|premium|trade)(\/|[-_.]|$)/i
const RECHERCHE_EN_PARAMETRE = /[?&](searchtext|keywords?|q)=/i
function estFicheFournisseur(u) {
  try {
    const x = new URL(u)
    return x.pathname.replace(/\/+$/, '').length > 1 && !PAGE_DE_LISTE.test(x.pathname) && !RECHERCHE_EN_PARAMETRE.test(x.search)
  } catch { return false }
}

function requetesVague1(theme, categorie, annee) {
  const t = theme
  return [
    `${t} meilleures ventes France ${annee}`,
    `${t} tendances ${annee}`,
    `${t} nouveautés ${annee}`,
    `${t} comparatif meilleur rapport qualité prix`,
    `${t} les plus vendus Amazon.fr`,
    `${t} prix idealo`,
    `${t} avis tests ${annee}`,
    `${t} produits tendance dropshipping`,
    `${t} fournisseur dropshipping Europe`,
    `${t} CJ Dropshipping`,
    `${t} BigBuy`,
    `${t} grossiste France`,
    `${t} marché France croissance étude`,
    `${t} saisonnalité ventes`,
    `${t} publicités Facebook TikTok produits qui marchent`,
    `${t} Cdiscount meilleures ventes`,
    `${t} problèmes retours SAV avis négatifs`,
    `${t} accessoires bundle idée pack`,
    `${categorie} ${t} produit gagnant`,
    `${t} marges e-commerce prix de vente conseillé`,
  ]
}

/** First object found in a model answer (tolerates stray text or code fences). */
function extraireJson(texte) {
  const debut = texte.indexOf('{')
  const fin = texte.lastIndexOf('}')
  if (debut < 0 || fin <= debut) throw new Error('aucun objet JSON dans la réponse')
  return JSON.parse(texte.slice(debut, fin + 1))
}

async function enParallele(items, n, fn) {
  const sortie = new Array(items.length)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const k = i++
      sortie[k] = await fn(items[k], k)
    }
  }))
  return sortie
}

/**
 * @param {object} p
 * @param {{categorie,libelleCategorie,theme,libelleTheme,date}} p.rayon
 * @param {object} p.deps  { serper, claude, pages(url)->page, releves()->[{source,url,texte}], journal, racine }
 * @param {object} p.options { plafondPages, plafondDeuxiemeVague, fichierPrompt, envoyer(rapport) }
 */
async function executerRayon({ rayon, deps, options = {} }) {
  const { serper, claude, pages, releves, journal, racine } = deps
  const moteur = deps.recherche || serper
  const plafondPages = options.plafondPages || 25
  const plafondVague2 = options.plafondDeuxiemeVague || 26
  const plafondFiches = options.plafondFiches === undefined ? 30 : options.plafondFiches
  const plafondOffres = options.plafondOffres === undefined ? 20 : options.plafondOffres
  // distinct supplier product pages wanted before the big call: 20 products plus room for the ones it rejects
  const objectifOffres = options.objectifOffres === undefined ? 30 : options.objectifOffres
  const relancesMax = options.relancesSourcing === undefined ? 2 : options.relancesSourcing
  const plafondPagesOffres = options.plafondPagesOffres === undefined ? 30 : options.plafondPagesOffres
  const domaines = options.domainesFournisseurs || deps.domainesFournisseurs || DOMAINES_FOURNISSEURS
  const taux = options.tauxDollarEuro || 0.86
  const annee = rayon.date.slice(0, 4)
  const etiquette = `${rayon.categorie}/${rayon.theme}`
  const usage = { serper: 0, serperEtendu: 0, recherchesWeb: 0, rechercheEntree: 0, rechercheSortie: 0, rechercheDollars: 0, claudeEntree: 0, claudeSortie: 0 }
  const urlsVues = new Set()
  const urlsFournisseurs = new Set()
  const imagesVues = new Set()
  const preuves = []

  // One result list per query, same order. A refusal throws: no silent empty list.
  // With `domaines`, Claude's search keeps to those sites (enforced by the API); Serper cannot, so its
  // results are filtered on the host instead.
  // Every query typed, its site filter and the sites answered: kept in releves/ so a rayon can be diagnosed.
  const traceRecherches = []
  const tracer = (vague, requetes, listes, limite) => requetes.forEach((q, i) => traceRecherches.push({ vague, requete: q, domaines: limite || null, resultats: (listes[i] || []).length, sites: [...new Set((listes[i] || []).map((x) => hoteDe(x.url)))] }))
  const ecrireTrace = () => {
    try {
      const dossier = path.join(racine, 'releves', rayon.date, 'recherches')
      fs.mkdirSync(dossier, { recursive: true })
      fs.writeFileSync(path.join(dossier, `${rayon.categorie}_${rayon.theme}.json`), JSON.stringify({ moteur: moteur.moteur || 'serper', recherches: traceRecherches }, null, 2))
    } catch (err) { journal.erreur(`${etiquette} : trace des recherches non écrite`, { raison: String(err.message || err) }) }
  }

  async function rechercher(requetes, { domaines: limite = null, vague = '' } = {}) {
    const sortie = []
    try { return await rechercherSans(requetes, limite, sortie) } finally { tracer(vague, requetes, sortie, limite); ecrireTrace() }
  }
  async function rechercherSans(requetes, limite, sortie) {
    if (typeof moteur.chercherLot === 'function') {
      for (let i = 0; i < requetes.length; i += TAILLE_LOT) {
        const r = await moteur.chercherLot(requetes.slice(i, i + TAILLE_LOT), limite ? { domaines: limite } : undefined)
        usage.recherchesWeb += r.usage.recherches || 0
        usage.rechercheEntree += r.usage.entree || 0
        usage.rechercheSortie += r.usage.sortie || 0
        usage.rechercheDollars = Math.round((usage.rechercheDollars + (r.usage.dollars || 0)) * 1000) / 1000
        sortie.push(...r.resultats)
      }
      return sortie
    }
    for (const q of requetes) {
      const r = await moteur.chercher(q)
      usage.serper++
      if (!limite) { sortie.push(r); continue }
      const gardes = r.filter((x) => chezFournisseur(x.url, limite))
      sortie.push(Object.assign(gardes, { questions: r.questions || [], associees: r.associees || [] }))
    }
    return sortie
  }

  // ---- wave 1
  const requetes1 = requetesVague1(rayon.libelleTheme, rayon.libelleCategorie, annee)
  const resultats1 = (await rechercher(requetes1, { vague: '1' })).map((r, i) => ({ q: requetes1[i], r }))
  for (const { r } of resultats1) for (const x of r) urlsVues.add(x.url)
  const total1 = resultats1.reduce((n, x) => n + x.r.length, 0)
  if (!total1) throw new Error(`${etiquette} : première vague sans aucune réponse (garde anti faux succès)`)
  journal.info(`${etiquette} : vague 1`, { requetes: requetes1.length, resultats: total1 })

  // ---- pages
  const candidats = []
  const hotes = new Set()
  for (const { r } of resultats1) {
    for (const x of r) {
      let h = ''
      try { h = new URL(x.url).hostname } catch { continue }
      if (/\.(pdf|jpg|png)$/i.test(x.url) || hotes.has(h)) continue
      hotes.add(h)
      candidats.push(x)
    }
  }
  const lues = (await enParallele(candidats.slice(0, plafondPages), 2, (x) => pages(x.url))).filter(Boolean)
  for (const p of lues) {
    if (p.lisible) {
      urlsVues.add(p.url)
      if (p.urlFinale) urlsVues.add(p.urlFinale)
      for (const l of p.liens || []) urlsVues.add(l)
    }
  }
  const nbLues = lues.filter((p) => p.lisible).length
  journal.info(`${etiquette} : pages`, { demandees: lues.length, lisibles: nbLues })

  // ---- model names (small call, effort low)
  const apercu = resultats1.flatMap(({ r }) => r.slice(0, 5).map((x) => `- ${x.titre} :: ${x.extrait}`)).join('\n').slice(0, 14_000)
  const rep = await claude.message({
    systeme: 'Tu extrais des produits précis pour du dropshipping. Tu réponds par un tableau JSON d’objets, rien d’autre.',
    utilisateur: [
      `Thème : ${rayon.libelleTheme} (${rayon.libelleCategorie}).`,
      `Dans ces résultats de recherche, relève au plus ${plafondVague2} produits réels vendables en France, sans doublon, en préférant ceux qu’un vendeur peut acheter chez un fournisseur (import, gros, marque blanche) et revendre : pas un produit d’une grande marque qu’on ne trouve que chez les distributeurs.`,
      'Pour chacun : {"modele": nom précis tel qu’on le voit en France (marque + modèle s’il y en a un), "fournisseur": 3 à 6 mots en anglais pour trouver ce produit générique chez un fournisseur (ex. "robot vacuum mop cleaner")}.',
      'Réponds uniquement par le tableau JSON.',
      '',
      apercu,
    ].join('\n'),
    maxTokens: 3000,
    effort: 'low',
  })
  usage.claudeEntree += rep.usage.input_tokens || 0
  usage.claudeSortie += rep.usage.output_tokens || 0
  let brut = []
  try {
    const t = rep.texte
    brut = JSON.parse(t.slice(t.indexOf('['), t.lastIndexOf(']') + 1))
  } catch { /* handled by the guard below */ }
  // { modele, fournisseur } (a bare string is still read: the model's name, no supplier wording)
  const produits = []
  for (const x of Array.isArray(brut) ? brut : []) {
    const modele = String((x && typeof x === 'object' ? x.modele : x) || '').trim()
    if (!modele || produits.some((p) => p.modele === modele)) continue
    produits.push({ modele, fournisseur: String((x && typeof x === 'object' && x.fournisseur) || modele).trim() })
  }
  const noms = produits.map((p) => p.modele).slice(0, plafondVague2)
  if (!noms.length) throw new Error(`${etiquette} : liste de noms de modèles vide (garde anti faux succès)`)

  // ---- wave 2
  const resultats2 = (await rechercher(noms.map((n) => `${n} prix fiche produit acheter`), { vague: '2' })).map((r, i) => ({ n: noms[i], r }))
  for (const { r } of resultats2) for (const x of r) urlsVues.add(x.url)
  journal.info(`${etiquette} : vague 2`, { modeles: noms.length, recherchesWeb: usage.recherchesWeb, coutRechercheDollars: usage.rechercheDollars })

  // ---- sourcing: supplier sites only (one search per distinct supplier wording)
  const termes = [...new Set(produits.slice(0, plafondVague2).map((p) => p.fournisseur.toLowerCase()))].slice(0, plafondOffres)
  const offres = []
  const clesOffres = new Set()
  const termesCherches = new Set()
  let listesEcartees = 0
  let relances = 0
  let echecSourcing = null
  async function sourcer(liste, vague) {
    const neufs = liste.filter((t) => !termesCherches.has(t))
    for (const t of neufs) termesCherches.add(t)
    if (!neufs.length) return
    const requetesSourcing = neufs.map((t) => (moteur.chercherLot ? `${t} wholesale supplier price` : `${t} wholesale alibaba aliexpress`))
    const resultatsS = await rechercher(requetesSourcing, { domaines, vague })
    neufs.forEach((t, i) => {
      let pris = 0
      for (const x of resultatsS[i] || []) {
        if (pris >= 4) break
        // a search or category page is not where one buys a product: the report could not use it (prompt rule 3)
        if (!estFicheFournisseur(x.url)) { listesEcartees++; continue }
        if (clesOffres.has(cleUrl(x.url))) continue
        clesOffres.add(cleUrl(x.url))
        pris++
        urlsVues.add(x.url)
        urlsFournisseurs.add(x.url)
        offres.push({ terme: t, titre: x.titre, url: x.url, extrait: x.extrait, plateforme: hoteDe(x.url).replace(/^www\./, ''), prix: null })
      }
    })
  }
  // a failed sourcing wave costs the supplier links, never the rayon: the report is written « à revoir »
  if (termes.length) try {
    await sourcer(termes, 'sourcing')
    // Too few distinct supplier pages for 20 products (11/10, informatique/mini-pc-bureau: 14 products): the
    // product names of a theme often collapse into a handful of generic wordings ("mini pc n100"). Ask for
    // other wordings of the same theme and search again, before the big call, instead of a short report.
    while (offres.length < objectifOffres && relances < relancesMax) {
      relances++
      const rel = await claude.message({
        systeme: 'Tu proposes des formulations de recherche chez des fournisseurs. Tu réponds par un tableau JSON de chaînes, rien d’autre.',
        utilisateur: [
          `Thème : ${rayon.libelleTheme} (${rayon.libelleCategorie}).`,
          `Propose ${plafondOffres} formulations NOUVELLES en anglais, 3 à 6 mots chacune, pour trouver chez un grossiste (Alibaba, AliExpress, Made-in-China…) des produits de ce thème qu’un vendeur peut acheter et revendre en France.`,
          'Chacune vise un produit ou une variante DIFFÉRENTE (format, usage, caractéristique, accessoire du thème), aucune ne reprend une formulation déjà cherchée :',
          ...[...termesCherches].map((t) => `- ${t}`),
          'Réponds uniquement par le tableau JSON.',
        ].join('\n'),
        maxTokens: 2000,
        effort: 'low',
      })
      usage.claudeEntree += rel.usage.input_tokens || 0
      usage.claudeSortie += rel.usage.output_tokens || 0
      let props = []
      try { const t = rel.texte; props = JSON.parse(t.slice(t.indexOf('['), t.lastIndexOf(']') + 1)) } catch { /* nothing new: the loop ends below */ }
      const nouveaux = [...new Set((Array.isArray(props) ? props : [])
        .map((x) => String((x && typeof x === 'object' ? x.fournisseur || x.modele : x) || '').trim().toLowerCase())
        .filter((t) => t && !termesCherches.has(t)))].slice(0, plafondOffres)
      if (!nouveaux.length) break
      const avant = offres.length
      await sourcer(nouveaux, `sourcing-relance-${relances}`)
      journal.info(`${etiquette} : relance fournisseurs ${relances}`, { formulations: nouveaux.length, offresAjoutees: offres.length - avant, offres: offres.length, objectif: objectifOffres })
    }
    // the supplier page itself, in plain HTTP: a price it writes in its structured data (often none: JS sites)
    const lus = await enParallele(offres.slice(0, plafondPagesOffres), 2, async (o) => ({ o, page: await pages(o.url) }))
    for (const { o, page } of lus) {
      if (!page || !page.lisible) continue
      if (page.prix) o.prix = page.prix
      if (page.image) { o.image = page.image; imagesVues.add(page.image) }
    }
    journal.info(`${etiquette} : sourcing fournisseurs`, { recherches: termesCherches.size, relances, offres: offres.length, listesEcartees, avecPrixLu: offres.filter((o) => o.prix).length, avecExtrait: offres.filter((o) => o.extrait).length, sitesRefuses: moteur.domainesRefuses ? moteur.domainesRefuses() : [] })
  } catch (err) {
    echecSourcing = String(err.message || err)
    journal.erreur(`${etiquette} : vague fournisseurs en échec, rapport à revoir`, { raison: echecSourcing })
  }

  // ---- product pages of wave 2 (plain HTTP): image and price the page writes itself
  const fiches = []
  if (plafondFiches > 0) {
    const dejaLues = new Set(lues.map((p) => p.url))
    const aLire = []
    for (const { n, r } of resultats2) {
      for (const x of r.filter((y) => !/\.(pdf|jpg|png)$/i.test(y.url) && !dejaLues.has(y.url)).slice(0, 2)) {
        dejaLues.add(x.url)
        aLire.push({ n, url: x.url })
      }
    }
    const lus = await enParallele(aLire.slice(0, plafondFiches), 2, async (x) => ({ ...x, page: await pages(x.url) }))
    for (const { n, url, page } of lus) {
      if (!page || !page.lisible) continue
      urlsVues.add(url)
      if (page.urlFinale) urlsVues.add(page.urlFinale)
      if (page.image) imagesVues.add(page.image)
      if (page.image || page.prix) fiches.push({ n, url: page.urlFinale || url, titre: page.titre, image: page.image || '', prix: page.prix || null })
    }
    journal.info(`${etiquette} : fiches produits`, { lues: lus.filter((x) => x.page && x.page.lisible).length, avecImage: fiches.filter((f) => f.image).length, avecPrix: fiches.filter((f) => f.prix).length })
  }

  // ---- public signals (Google Trends, Meta Ad Library): enrichment, never a reason to fail the rayon
  let signaux = null
  if (deps.signaux) {
    try {
      signaux = await deps.signaux({ rayon, noms })
      const dossier = path.join(racine, 'releves', rayon.date, 'signaux')
      fs.mkdirSync(dossier, { recursive: true })
      fs.writeFileSync(path.join(dossier, `${rayon.categorie}_${rayon.theme}.json`), JSON.stringify(signaux, null, 2))
      const pubsLues = (signaux.pubs || []).filter((p) => p.statut === 'ok' || p.statut === 'aucun').length
      const courbes = (signaux.tendances || []).filter((g) => g.statut === 'ok').length
      journal.info(`${etiquette} : signaux publics`, { pubsLues, pubsDemandees: (signaux.pubs || []).length, courbes })
    } catch (err) {
      journal.erreur(`${etiquette} : signaux publics indisponibles`, { raison: String(err.message || err) })
    }
  }

  // ---- extra Serper readings (Shopping prices, autocomplete, images): enrichment, never a reason to fail the rayon
  let serperPlus = null
  if (deps.serperEtendu) {
    try {
      serperPlus = await releverSerperEtendu({ rayon, noms, serper, config: deps.serperEtendu, journal })
      usage.serperEtendu = serperPlus.requetes
      const dossier = path.join(racine, 'releves', rayon.date, 'serper')
      fs.mkdirSync(dossier, { recursive: true })
      fs.writeFileSync(path.join(dossier, `${rayon.categorie}_${rayon.theme}.json`), JSON.stringify(serperPlus, null, 2))
      journal.info(`${etiquette} : lectures Serper étendues`, {
        requetes: serperPlus.requetes,
        modelesAvecPrix: serperPlus.shopping.filter((x) => x.prixMin !== null).length,
        modelesAvecImages: serperPlus.images.filter((x) => x.images.length).length,
        coupe: serperPlus.coupe,
      })
      for (const u of urlsVendeurs(serperPlus)) urlsVues.add(u)
      for (const i of serperPlus.images) for (const x of i.images) imagesVues.add(x.image)
    } catch (err) {
      journal.erreur(`${etiquette} : lectures Serper étendues indisponibles`, { raison: String(err.message || err) })
    }
  }

  // ---- Google Keyword Planner volumes (via the site): enrichment, never a reason to fail the rayon
  const motsCles = deps.appelerAdmin ? lecteurMotsCles({ appeler: deps.appelerAdmin, journal, etiquette }) : null
  if (motsCles) {
    await motsCles.mesurer(noms)
    await motsCles.idees([rayon.libelleTheme, `${rayon.libelleTheme} ${rayon.libelleCategorie}`])
  }

  // ---- connected data sites
  const lectures = (releves ? await releves() : []) || []

  // ---- evidence file
  let budget = BUDGET_PREUVES
  const ajouter = (texte) => {
    if (budget <= 0) return
    const t = texte.slice(0, budget)
    budget -= t.length
    preuves.push(t)
  }
  ajouter('# RÉSULTATS DE RECHERCHE (vague 1)\n' + resultats1.map(({ q, r }) => `## ${q}\n` + r.slice(0, 6).map((x) => `- ${x.titre} | ${x.url} | ${x.extrait}`).join('\n')).join('\n'))
  ajouter('# MODÈLES ET FICHES TROUVÉES (vague 2)\n' + resultats2.map(({ n, r }) => `## ${n}\n` + r.slice(0, 5).map((x) => `- ${x.titre} | ${x.url} | ${x.extrait}`).join('\n')).join('\n'))
  // Google's own questions and related wordings, collected from the wave-1 answers
  const uniques = (liste) => [...new Set(liste.map((x) => x.trim()).filter(Boolean))]
  const questions = uniques(resultats1.flatMap(({ r }) => r.questions || [])).slice(0, 40)
  const associees = uniques(resultats1.flatMap(({ r }) => r.associees || [])).slice(0, 40)
  if (questions.length || associees.length) {
    ajouter('# QUESTIONS ET RECHERCHES ASSOCIÉES (Google, France)\n' + (questions.length ? '## Questions posées\n' + questions.map((q) => `- ${q}`).join('\n') + '\n' : '') + (associees.length ? '## Recherches associées\n' + associees.map((q) => `- ${q}`).join('\n') : ''))
  }
  const blocMotsCles = motsCles ? motsCles.section() : ''
  if (blocMotsCles) ajouter(blocMotsCles)
  const blocSignaux = sectionPreuves(signaux)
  if (blocSignaux) ajouter(blocSignaux)
  for (const b of sectionsPreuvesSerper(serperPlus)) ajouter(b)
  if (offres.length) {
    ajouter(`# OFFRES FOURNISSEURS (vague sourcing : sites de fournisseurs uniquement ; SEULES URL autorisées dans supplier_url ; taux du poste pour les prix en dollars : 1 USD = ${String(taux).replace('.', ',')} €)\n` + offres.map((o) => `- ${o.terme} | ${o.plateforme} | ${o.titre} | ${o.url} | extrait : ${o.extrait || '—'} | prix lu sur la page : ${o.prix ? `${String(o.prix.montant).replace('.', ',')} ${o.prix.devise || '(devise non indiquée)'}` : 'aucun'}`).join('\n'))
  } else {
    ajouter('# OFFRES FOURNISSEURS\nAucune offre trouvée sur les sites de fournisseurs : aucune supplier_url ne peut être donnée.')
  }
  const avecPrix = fiches.filter((f) => f.prix)
  if (avecPrix.length) {
    ajouter('# PRIX LUS SUR LES FICHES PRODUITS (écrits par la page elle-même, données structurées ; prix de vente affiché, pas un prix fournisseur)\n' + avecPrix.map((f) => `- ${f.n} | ${String(f.prix.montant).replace('.', ',')} ${f.prix.devise || '(devise non indiquée)'} | ${f.titre || 'sans titre'} | ${f.url}`).join('\n'))
  }
  const avecImage = fiches.filter((f) => f.image)
  if (avecImage.length) {
    ajouter('# IMAGES DES FICHES PRODUITS (balise og:image, adresses réelles, autorisées pour image_url)\n' + avecImage.map((f) => `- ${f.n} | ${f.image} | fiche : ${f.url}`).join('\n'))
  }
  ajouter('# PAGES LUES\n' + lues.filter((p) => p.lisible).map((p) => `## ${p.titre || p.url}\nURL: ${p.url}\n${p.texte.slice(0, 1500)}`).join('\n\n'))
  if (lectures.length) {
    ajouter('# RELEVÉS DES SITES DE DONNÉES CONNECTÉS (sessions de Max)\n' + lectures.map((l) => `## ${l.source} — ${l.url}\n${String(l.texte).slice(0, 3000)}`).join('\n\n'))
    for (const l of lectures) if (l.url) urlsVues.add(l.url)
  }
  const listeUrls = [...urlsVues].filter((u) => /^https?:\/\//i.test(u)).slice(0, 900)
  ajouter('# LISTE DES URL RENCONTRÉES (pour sources et marketplace_prices ; supplier_url vient des OFFRES FOURNISSEURS)\n' + listeUrls.join('\n'))

  const fichierPrompt = options.fichierPrompt || PROMPT_PAR_DEFAUT
  const systeme = fs.readFileSync(fichierPrompt, 'utf8')
  const utilisateur = [
    `Date : ${rayon.date}`,
    `Catégorie : ${rayon.libelleCategorie} (${rayon.categorie})`,
    `Thème du jour : ${rayon.libelleTheme} (${rayon.theme})`,
    '',
    preuves.join('\n\n'),
  ].join('\n')

  // ---- the one big call
  const rep2 = await claude.message({ systeme, utilisateur, maxTokens: options.maxTokens || 32000, effort: 'medium' })
  usage.claudeEntree += rep2.usage.input_tokens || 0
  usage.claudeSortie += rep2.usage.output_tokens || 0
  const nomDiag = `${rayon.date}_${rayon.categorie}_${rayon.theme}`
  if (!rep2.texte.trim() || rep2.arret === 'max_tokens') {
    depot.ecrireDiagnostic(racine, `DIAGNOSTIC-reponse-claude_${nomDiag}.md`, `stop_reason: ${rep2.arret}\nusage: ${JSON.stringify(rep2.usage)}\n\n${rep2.texte}`)
    throw new Error(`${etiquette} : réponse vide ou tronquée (stop_reason ${rep2.arret}) — voir diagnostics/`)
  }
  let rapport
  try {
    rapport = extraireJson(rep2.texte)
  } catch (err) {
    depot.ecrireDiagnostic(racine, `DIAGNOSTIC-reponse-claude_${nomDiag}.md`, rep2.texte)
    throw new Error(`${etiquette} : réponse illisible (${err.message}) — voir diagnostics/`)
  }

  // ---- identity forced from the rotation, never trusted from the model
  rapport.study = { ...(rapport.study || {}), date: rayon.date, category_id: rayon.categorie, category_name: rayon.libelleCategorie, theme_slug: rayon.theme, theme_name: rayon.libelleTheme }
  Object.defineProperty(rapport, '__categorie', { value: rayon.categorie, enumerable: false })
  Object.defineProperty(rapport, '__theme', { value: rayon.theme, enumerable: false })

  let produitsAvecVolume = 0
  if (motsCles && Array.isArray(rapport.products)) produitsAvecVolume = await motsCles.ranger(rapport.products)
  if (motsCles && motsCles.etat.idees.length) rapport.search_demand_ideas = motsCles.etat.idees

  const validation = valider(rapport, urlsVues, { imagesVues, urlsFournisseurs })
  if (echecSourcing) { validation.ok = false; validation.problemes.unshift(`vague fournisseurs en échec : ${echecSourcing}`) }
  rapport.poste = {
    statut: validation.ok ? 'ok' : 'a_revoir',
    problemes: validation.problemes,
    stats: validation.stats,
    usage,
    signaux: signaux ? { courbes: (signaux.tendances || []).filter((g) => g.statut === 'ok').length, pubsLues: (signaux.pubs || []).filter((p) => p.statut === 'ok' || p.statut === 'aucun').length, pubsDemandees: (signaux.pubs || []).length } : null,
    fiches: { avecDonnees: fiches.length, avecImage: avecImage.length, avecPrix: avecPrix.length },
    sourcing: { echec: echecSourcing, sitesRefuses: moteur.domainesRefuses ? moteur.domainesRefuses() : [], offres: offres.length, relances, listesEcartees, avecPrixLu: offres.filter((o) => o.prix).length, plateformes: [...new Set(offres.map((o) => o.plateforme))] },
    serperPlus: serperPlus ? { requetes: serperPlus.requetes, modelesAvecPrix: serperPlus.shopping.filter((x) => x.prixMin !== null).length, modelesAvecImages: serperPlus.images.filter((x) => x.images.length).length, coupe: serperPlus.coupe } : null,
    motsCles: motsCles ? { statut: motsCles.etat.statut, motif: motsCles.etat.motif, demandes: motsCles.etat.demandes, idees: motsCles.etat.idees.length, produitsAvecVolume } : null,
    modele: options.modele || null,
    ecritLe: new Date().toISOString(),
  }
  const chemins = depot.ecrireRapport(racine, {
    date: rayon.date,
    categorie: rayon.categorie,
    theme: rayon.theme,
    json: rapport,
    rayonMd: rayonMd(rapport),
    marketingMd: marketingMd(rapport),
  })
  journal.info(`${etiquette} : rapport écrit (${rapport.poste.statut})`, { ...validation.stats, problemes: validation.problemes, usage })

  if (validation.ok && options.envoyer) {
    try {
      const reponse = await options.envoyer(rapport)
      depot.marquerEnvoye(racine, rayon.date, rayon.categorie, rayon.theme, { rapportEcritLe: rapport.poste.ecritLe, reponse: reponse || null })
      journal.info(`${etiquette} : envoyé au site (rayon et marketing)`)
    } catch (err) {
      journal.erreur(`${etiquette} : envoi au site refusé`, { raison: String(err.message || err) })
    }
  }
  return { statut: rapport.poste.statut, validation, chemins, usage }
}

module.exports = { executerRayon, requetesVague1, extraireJson, cleUrl, DOMAINES_FOURNISSEURS, estFicheFournisseur }
