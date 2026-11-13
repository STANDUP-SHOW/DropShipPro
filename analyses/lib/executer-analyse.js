'use strict'
/**
 * Runs one KANTIX analysis: the connected tabs it names are read, then ONE call
 * to the project's AI key (with the provider's own web search when it has one),
 * then the report is checked and written to the folder.
 *
 * The checks are the lessons of the Poste (CLAUDE.md, 19/09 – 04/10): an empty
 * or cut answer is never a success; every link of the report must be one the
 * provider says it read or a page of a connected tab, otherwise the report is
 * « à revoir » and does not go to the site's feed; a report with no source at
 * all is « à revoir » too.
 */
const fs = require('node:fs')
const path = require('node:path')
const { identifiant } = require('./sources')
const { verifierLiens, corrigerMarkdown } = require('./verifier-liens')

const MAX_PAGE = 20000
const MAX_LECTURES = 120000

const CONTRAT = [
  'Tu es le moteur d’analyses de KANTIX ANALYSER. Tu exécutes la consigne ci-dessous, seul, sans pouvoir poser de question : fais au mieux avec ce que tu peux lire.',
  'Règles absolues : n’invente jamais une URL, un prix, un chiffre, un avis ou une date. Une donnée non trouvée s’écrit « Non vérifié ». Chaque chiffre est suivi de l’URL exacte de la page où tu l’as lu. N’utilise que des URL que tu as réellement lues (recherche web ou pages fournies).',
  'Liens produit (règle qui prime sur toute consigne contraire, même « direct_product_pages_only ») : n’écris le lien d’une fiche produit (AliExpress, Amazon, CJ, Temu, eBay, boutique…) que si tu as réellement ouvert cette page pendant cette analyse, et recopie l’adresse lue telle quelle. Ne compose jamais un lien à partir d’un identifiant d’article AliExpress, d’un ASIN ou d’un numéro de produit. Jamais le même lien pour deux produits différents. Si tu n’as pas lu la fiche, laisse le champ du lien vide, mets dans "search_url" une recherche AliExpress du nom du produit et "url_status": "non_verifie". Un champ vide vaut mieux qu’un lien vraisemblable. Chaque lien produit est ensuite ouvert et son titre comparé au nom du produit : un lien qui mène ailleurs est retiré.',
  'Sortie : le rapport complet en Markdown, puis, en dernier, un bloc ```json contenant un seul objet { "titre": "…", "resume": "trois phrases au plus", "donnees": { … les données structurées demandées par la consigne … }, "sources": ["https://…", …] }.',
].join('\n')

function blocJson(texte) {
  const blocs = [...String(texte).matchAll(/```json\s*([\s\S]*?)```/g)]
  if (!blocs.length) return { objet: null, markdown: String(texte).trim() }
  const dernier = blocs[blocs.length - 1]
  let objet = null
  try { objet = JSON.parse(dernier[1]) } catch { objet = null }
  const markdown = (String(texte).slice(0, dernier.index) + String(texte).slice(dernier.index + dernier[0].length)).trim()
  return { objet, markdown }
}

const normUrl = (u) => {
  try {
    const x = new URL(u)
    x.hash = ''
    return `${x.host.replace(/^www\./, '')}${x.pathname.replace(/\/+$/, '')}${x.search}`.toLowerCase()
  } catch { return String(u).toLowerCase() }
}

/** A product page (item id in the address): it must have been read exactly, its domain being read is not enough. */
const FICHE = /aliexpress\.[a-z.]+\/item\/|amazon\.[a-z.]+\/(.*\/)?(dp|gp\/product)\/|ebay\.[a-z.]+\/itm\/|temu\.com\/.*-g-\d+|cjdropshipping\.com\/product\/|shein\.[a-z.]+\/.*-p-\d+|alibaba\.com\/product-detail\/|cdiscount\.com\/.*\/f-\d+|\/products?\/[^/?#]+/i
const estFicheProduit = (u) => FICHE.test(String(u))

const hote = (u) => { try { return new URL(u).host.toLowerCase().replace(/^www\./, '') } catch { return '' } }

/** URLs written in the text (Markdown links and bare links), trailing punctuation removed. */
function urlsDuTexte(texte) {
  const out = new Set()
  for (const m of String(texte).matchAll(/https?:\/\/[^\s<>"'`\])}]+/g)) out.add(m[0].replace(/[.,;:!?*_]+$/, ''))
  return [...out]
}

function horodatageFichier(d) {
  const p = (n) => String(n).padStart(2, '0')
  return { jour: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, heure: `${p(d.getHours())}${p(d.getMinutes())}` }
}

/**
 * @param {object} p
 * @param {object} p.analyse, p.projet
 * @param {string} p.dossierSortie  absolute folder (project's, or the analysis' own)
 * @param {(args) => Promise} p.generer  bound to the project's key (lib/fournisseurs-ia generer minus the key)
 * @param {boolean} p.rechercheDisponible  the key's provider can search the web
 * @param {(ids:string[]) => Promise<{lectures:Array<{source,url,texte}>, problemes:string[]}>} p.lireOnglets
 */
async function executerAnalyse({ analyse, projet, dossierSortie, generer, rechercheDisponible, lireOnglets, journal, maintenant = new Date(), fetchImpl = globalThis.fetch }) {
  if (!dossierSortie) throw new Error(`Aucun dossier de sortie pour « ${analyse.nom} » : choisissez celui du projet ou de l’analyse.`)
  const problemes = []
  const { lectures, problemes: pbOnglets } = analyse.onglets && analyse.onglets.length ? await lireOnglets(analyse.onglets) : { lectures: [], problemes: [] }
  problemes.push(...pbOnglets)

  let reste = MAX_LECTURES
  const morceaux = []
  for (const l of lectures) {
    if (reste <= 0) { problemes.push(`Pages lues non transmises (plafond de ${MAX_LECTURES} caractères atteint) : ${l.url}`); continue }
    let t = l.texte || ''
    if (t.length > Math.min(MAX_PAGE, reste)) { problemes.push(`Page tronquée à ${Math.min(MAX_PAGE, reste)} caractères : ${l.url}`); t = t.slice(0, Math.min(MAX_PAGE, reste)) }
    reste -= t.length
    morceaux.push(`## ${l.source} — ${l.url}\n\n${t}`)
  }

  const { jour, heure } = horodatageFichier(maintenant)
  const consigne = [
    `Date du jour : ${jour}.`,
    `Projet : ${projet.nom}${projet.url ? ` (${projet.url})` : ''}.`,
    '',
    '# Consigne de l’analyse',
    '',
    analyse.prompt,
    morceaux.length ? `\n# Pages lues dans le navigateur connecté de KANTIX (texte brut)\n\n${morceaux.join('\n\n')}` : '',
  ].join('\n')

  const recherche = Boolean(analyse.rechercheWeb && rechercheDisponible)
  if (analyse.rechercheWeb && !rechercheDisponible) problemes.push('Recherche web demandée mais absente chez ce fournisseur : seules les pages des onglets ont été lues.')
  journal.info(`Analyse « ${analyse.nom} » : appel du modèle`, { projet: projet.nom, pages: lectures.length, recherche })
  const r = await generer({ systeme: CONTRAT, messages: [{ role: 'user', parties: [{ type: 'texte', texte: consigne }] }], rechercheWeb: recherche, maxTokens: 32000 })

  if (!r.texte || r.texte.trim().length < 200) throw new Error(`Réponse vide ou presque (${(r.texte || '').trim().length} caractères, arrêt : ${r.arret || 'inconnu'}) : rien n’est écrit.`)
  if (r.arret === 'max_tokens') problemes.push('Réponse coupée par la limite de longueur : la fin du rapport manque.')

  const bloc = blocJson(r.texte)
  const { objet } = bloc
  let { markdown } = bloc
  if (!objet) problemes.push('Annexe JSON absente ou illisible : données structurées vides.')

  // every product link of the data is opened: a page about something else, or a link shared by two products, is removed
  let liens = null
  const recherches = new Set()
  if (objet && objet.donnees && typeof objet.donnees === 'object') {
    journal.info(`Analyse « ${analyse.nom} » : vérification des liens produit`)
    const b = await verifierLiens(objet.donnees, { fetchImpl })
    if (b.remplacements.size) {
      markdown = corrigerMarkdown(markdown, b.remplacements)
      if (Array.isArray(objet.sources)) objet.sources = objet.sources.filter((u) => !b.remplacements.has(u))
    }
    for (const v of b.remplacements.values()) recherches.add(v)
    liens = { verifies: b.verifies, retires: b.retires, doublons: b.doublons, nonLus: b.nonLus, details: b.details }
    if (b.retires) problemes.push(`${b.retires} lien(s) produit retiré(s) sur ${b.retires + b.verifies} (${b.doublons} donné(s) pour deux produits, ${b.nonLus} page(s) illisible(s), le reste menait à un autre produit) : remplacés par une recherche, url_status « non_verifie ». Détail dans « liens » du .json.`)
  }

  // every link must be one the provider read or a page of a tab
  const connues = new Set([...(r.urls || []), ...lectures.map((l) => l.url)].map(normUrl))
  const citees = [...new Set([...urlsDuTexte(markdown), ...((objet && Array.isArray(objet.sources) && objet.sources) || []).filter((u) => /^https?:\/\//.test(u))])]
  const domaines = new Set(r.domaines || [])
  const lue = (u) => connues.has(normUrl(u)) || (!estFicheProduit(u) && domaines.size > 0 && domaines.has(hote(u)))
  const inconnues = citees.filter((u) => !lue(u) && !recherches.has(u))
  if (inconnues.length) problemes.push(`${inconnues.length} lien(s) cité(s) sans trace d’une lecture : ${inconnues.slice(0, 8).join(' ; ')}${inconnues.length > 8 ? ' …' : ''}`)
  if (!connues.size && !domaines.size) problemes.push('Aucune page lue (ni recherche web ni onglet) : le rapport ne repose sur aucune source.')

  // removed links are already neutralised: they leave a note, not a failed report
  const statut = r.arret === 'max_tokens' || inconnues.length || (!connues.size && !domaines.size) || !objet ? 'a-revoir' : 'ok'
  const rapport = {
    kantix: 1,
    projet: { id: projet.id, nom: projet.nom, url: projet.url || '' },
    analyse: { id: analyse.id, nom: analyse.nom },
    date: jour,
    ecritLe: maintenant.toISOString(),
    statut,
    problemes,
    titre: (objet && objet.titre) || analyse.nom,
    resume: (objet && objet.resume) || '',
    markdown,
    donnees: (objet && objet.donnees) || {},
    sources: citees.filter((u) => lue(u) && !recherches.has(u)),
    liens,
    lues: [...(r.urls || [])],
    moteur: { fournisseur: r.fournisseur, modele: r.modele, recherche, usage: r.usage },
  }

  const dossier = path.join(dossierSortie, identifiant(analyse.nom), jour)
  fs.mkdirSync(dossier, { recursive: true })
  const base = path.join(dossier, heure)
  const entete = [
    `<!-- KANTIX ANALYSER · ${projet.nom} · ${analyse.nom} · ${maintenant.toISOString()} · ${r.fournisseur}/${r.modele} · statut ${statut} -->`,
    problemes.length ? `\n> **À revoir** :\n${problemes.map((p) => `> - ${p}`).join('\n')}\n` : '',
  ].join('\n')
  fs.writeFileSync(`${base}.md`, `${entete}\n${markdown}\n`)
  fs.writeFileSync(`${base}.json`, JSON.stringify(rapport, null, 2))
  journal[statut === 'ok' ? 'info' : 'erreur'](`Analyse « ${analyse.nom} » : ${statut === 'ok' ? 'rapport validé' : 'rapport à revoir'}`, { fichier: `${base}.md`, problemes: problemes.length ? problemes : undefined, usage: r.usage })
  return { rapport, fichiers: { md: `${base}.md`, json: `${base}.json` } }
}

module.exports = { executerAnalyse, blocJson, urlsDuTexte, normUrl, estFicheProduit, CONTRAT }
