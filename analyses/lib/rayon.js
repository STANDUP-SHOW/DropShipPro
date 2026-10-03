'use strict'
/**
 * The unified "agent rayon": one category, ONE theme of the day -> one MarketSpy
 * report (study + 20 products + marketing prompts), then the two Markdown
 * reports of the contract.
 *
 * Order of work (the Claude call is LAST, so every guard fires before it spends):
 *   wave 1  ~20 searches on the theme
 *   pages   read up to `plafondPages` pages (plain HTTP, light on a weak PC)
 *   names   model names pulled from what was read (one small Claude call)
 *   wave 2  one search per model name, to reach product pages (capped)
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
const { releverSerperEtendu, sectionsPreuvesSerper, urlsVendeurs } = require('./serper-etendu')

const PROMPT_PAR_DEFAUT = path.join(__dirname, '..', 'prompts', 'rayon.md')
const BUDGET_PREUVES = 120_000

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
  const plafondPages = options.plafondPages || 25
  const plafondVague2 = options.plafondDeuxiemeVague || 26
  const annee = rayon.date.slice(0, 4)
  const etiquette = `${rayon.categorie}/${rayon.theme}`
  const usage = { serper: 0, serperEtendu: 0, claudeEntree: 0, claudeSortie: 0 }
  const urlsVues = new Set()
  const preuves = []

  // ---- wave 1
  const requetes1 = requetesVague1(rayon.libelleTheme, rayon.libelleCategorie, annee)
  const resultats1 = []
  for (const q of requetes1) {
    const r = await serper.chercher(q) // a refusal throws: no silent empty list
    usage.serper++
    resultats1.push({ q, r })
    for (const x of r) urlsVues.add(x.url)
  }
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
    systeme: 'Tu extrais des noms de produits précis. Tu réponds par un tableau JSON de chaînes, rien d’autre.',
    utilisateur: `Thème : ${rayon.libelleTheme} (${rayon.libelleCategorie}).\nDans ces résultats de recherche, relève au plus ${plafondVague2} MODÈLES précis de produits réels (marque + modèle), vendables en France, sans doublon. Réponds uniquement par un tableau JSON.\n\n${apercu}`,
    maxTokens: 3000,
    effort: 'low',
  })
  usage.claudeEntree += rep.usage.input_tokens || 0
  usage.claudeSortie += rep.usage.output_tokens || 0
  let noms = []
  try {
    const t = rep.texte
    noms = JSON.parse(t.slice(t.indexOf('['), t.lastIndexOf(']') + 1))
  } catch { /* handled by the guard below */ }
  noms = [...new Set((Array.isArray(noms) ? noms : []).map((n) => String(n).trim()).filter(Boolean))].slice(0, plafondVague2)
  if (!noms.length) throw new Error(`${etiquette} : liste de noms de modèles vide (garde anti faux succès)`)

  // ---- wave 2
  const resultats2 = []
  for (const n of noms) {
    const r = await serper.chercher(`${n} prix fiche produit acheter`)
    usage.serper++
    resultats2.push({ n, r })
    for (const x of r) urlsVues.add(x.url)
  }
  journal.info(`${etiquette} : vague 2`, { modeles: noms.length })

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
    } catch (err) {
      journal.erreur(`${etiquette} : lectures Serper étendues indisponibles`, { raison: String(err.message || err) })
    }
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
  const blocSignaux = sectionPreuves(signaux)
  if (blocSignaux) ajouter(blocSignaux)
  for (const b of sectionsPreuvesSerper(serperPlus)) ajouter(b)
  ajouter('# PAGES LUES\n' + lues.filter((p) => p.lisible).map((p) => `## ${p.titre || p.url}\nURL: ${p.url}\n${p.texte.slice(0, 1500)}`).join('\n\n'))
  if (lectures.length) {
    ajouter('# RELEVÉS DES SITES DE DONNÉES CONNECTÉS (sessions de Max)\n' + lectures.map((l) => `## ${l.source} — ${l.url}\n${String(l.texte).slice(0, 3000)}`).join('\n\n'))
    for (const l of lectures) if (l.url) urlsVues.add(l.url)
  }
  const listeUrls = [...urlsVues].filter((u) => /^https?:\/\//i.test(u)).slice(0, 900)
  ajouter('# LISTE DES URL RENCONTRÉES (seules autorisées dans supplier_url)\n' + listeUrls.join('\n'))

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

  const validation = valider(rapport, urlsVues)
  rapport.poste = {
    statut: validation.ok ? 'ok' : 'a_revoir',
    problemes: validation.problemes,
    stats: validation.stats,
    usage,
    signaux: signaux ? { courbes: (signaux.tendances || []).filter((g) => g.statut === 'ok').length, pubsLues: (signaux.pubs || []).filter((p) => p.statut === 'ok' || p.statut === 'aucun').length, pubsDemandees: (signaux.pubs || []).length } : null,
    serperPlus: serperPlus ? { requetes: serperPlus.requetes, modelesAvecPrix: serperPlus.shopping.filter((x) => x.prixMin !== null).length, modelesAvecImages: serperPlus.images.filter((x) => x.images.length).length, coupe: serperPlus.coupe } : null,
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

module.exports = { executerRayon, requetesVague1, extraireJson, cleUrl }
