/* Genere le workflow n8n "Agent rayon unifie". Lancer : node _build-workflow.cjs */
const fs = require('fs');
const path = require('path');

// Le prompt maitre aiMARKET de Max, tel qu'il l'a ecrit. On ne le reecrit pas :
// on le charge et on lui ajoute ce que le pipeline sait faire et qu'un chat ne
// sait pas — les catalogues d'URL fournisseurs et d'images reellement relevees.
const PROMPT_MAITRE = fs.readFileSync(path.join(__dirname, '_prompt-aimarket.txt'), 'utf8').trim();

const CRED_ANTHROPIC = { id: 'OQSfM7vv1HMr4AFo', name: 'Anthropic account' };
const CRED_SERPER = { id: 'xt0AZKIIwgFfVm2C', name: 'Serper.dev' };
const DOSSIER_RAPPORTS = '/files/DropPost/MARKET-ANALYSES/rapports';

// ---------------------------------------------------------------- 1. plan
const codePlan = `
// l'entree vient soit du trigger sous-workflow, soit du webhook de test
let e = {};
try { const t = $('Entree').first().json; if (t && t.categorie) e = t; } catch (err) {}
if (!e.categorie) {
  try {
    const w = $('Webhook test').first().json;
    e = (w && w.body && typeof w.body === 'object') ? w.body : (w || {});
  } catch (err) {}
}
const categorie     = e.categorie || 'telephonie';
const theme         = e.theme || 'smartphones';
const libelleCat    = e.libelle_categorie || categorie;
const libelleTheme  = e.libelle_theme || theme;
const date          = e.date || new Date().toISOString().slice(0, 10);

// ATTENTION : l'operateur site: est refuse par Serper en formule gratuite
// ("Query pattern not allowed for free accounts"). On interroge en langage
// naturel et on filtre les URL par motif cote code.
const SEARCH = 'https://google.serper.dev/search';
const SHOP   = 'https://google.serper.dev/shopping';

const R = [
  // --- contexte marche France (pages a lire)
  ['marche',    SEARCH, libelleTheme + ' marche France 2026 chiffres ventes croissance'],
  ['marche',    SEARCH, libelleTheme + ' France reglementation norme CE obligation vendeur 2026'],
  ['marche',    SEARCH, libelleTheme + ' saisonnalite vente France black friday 2026'],
  ['marche',    SEARCH, libelleTheme + ' comparatif prix France 2026 euros test'],

  // --- URL produit fournisseurs : requetes naturelles, filtrage par motif ensuite
  ['sourcing',  SEARCH, 'aliexpress ' + libelleTheme + ' acheter prix'],
  ['sourcing',  SEARCH, 'alibaba ' + libelleTheme + ' wholesale supplier price'],
  ['sourcing',  SEARCH, 'dhgate ' + libelleTheme + ' wholesale'],
  ['sourcing',  SEARCH, 'cjdropshipping ' + libelleTheme + ' product'],
  ['sourcing',  SEARCH, 'temu ' + libelleTheme + ' prix'],
  ['sourcing',  SEARCH, 'banggood joybuy ' + libelleTheme],
  ['sourcing',  SEARCH, libelleTheme + ' dropshipping fournisseur fiche produit 2026'],

  // --- catalogue marchand reel : prix, marchand, note, IMAGE
  ['catalogue', SHOP,   libelleTheme],
  ['catalogue', SHOP,   libelleTheme + ' pas cher'],
  ['catalogue', SHOP,   libelleTheme + ' 2026'],
  ['catalogue', SHOP,   libelleTheme + ' promo'],
  ['catalogue', SHOP,   libelleTheme + ' haut de gamme'],

  // --- veille sociale et publicitaire
  ['social',    SEARCH, libelleTheme + ' TikTok tendance France 2026 produit viral'],
  ['social',    SEARCH, libelleTheme + ' publicite Meta TikTok angle creatif 2026'],
  ['ads',       SEARCH, 'TikTok Ads CPM CPC CPA benchmark 2026 France par secteur'],
  ['ads',       SEARCH, 'Meta Ads CPM CPC CPA benchmark 2026 France e-commerce'],
];

return R.map(([role, endpoint, q]) => ({
  json: { role, endpoint, q, categorie, theme, libelleCat, libelleTheme, date },
}));
`.trim();

// ------------------------------------------------- 1bis. noms de produits
// Le catalogue /shopping porte de VRAIS noms de modeles. On s'en sert pour
// aller chercher la fiche produit de chacun chez les fournisseurs : c'est ce
// qui transforme une URL de categorie en URL de fiche.
const codeNoms = `
const plan = $('Construire le plan de recherche').all();
const res  = $input.all();

const noms = [];
const vus  = new Set();

for (let i = 0; i < res.length; i++) {
  if (!plan[i] || plan[i].json.role !== 'catalogue') continue;
  const sh = (res[i].json && res[i].json.shopping) || [];
  for (const s of sh) {
    let t = (s.title || '').trim();
    if (!t) continue;
    // on garde le debut du titre : marque + modele, sans le descriptif
    t = t.split(/[,|(\\u2013\\u2014]/)[0].trim();
    t = t.split(' ').slice(0, 6).join(' ');
    const cle = t.toLowerCase();
    if (cle.length < 6 || vus.has(cle)) continue;
    vus.add(cle);
    noms.push(t);
  }
}

// --- GARDE : un echec Serper ne doit JAMAIS passer pour un succes
// Le 23/09/2026, Serper a renvoye 400 "Not enough credits". Le noeud etant en
// onError:continueRegularOutput, l'erreur est arrivee ici sous forme de
// donnee, la liste de noms est sortie vide, et n8n a conclu "success" sans
// qu'aucun rapport ne soit ecrit. Silence complet pendant six jours.
const refus = res.filter((r) => r.json && (r.json.error || r.json.statusCode >= 400 ||
  (typeof r.json.message === 'string' && r.json.message.length)));
if (refus.length) {
  const m = refus[0].json;
  const detail = typeof m.message === 'string' ? m.message : JSON.stringify(m.error || m);
  throw new Error(
    'SERPER a refuse ' + refus.length + ' requete(s) sur ' + res.length + '. Detail : ' +
    String(detail).slice(0, 300) +
    ' | Si le message parle de credits, le forfait Serper est epuise : recharger sur serper.dev.'
  );
}

const nbCatalogue = plan.filter((x) => x.json.role === 'catalogue').length;
if (!noms.length) {
  throw new Error(
    'Aucun nom de produit extrait : les ' + nbCatalogue + ' requetes /shopping ne ' +
    'renvoient rien. Sans nom de modele il n y a pas de 2e vague, donc pas d URL ' +
    'de fiche produit, donc pas de liste produit exploitable. On arrete ici plutot ' +
    'que de livrer un rapport creux.'
  );
}

// une requete fournisseur par modele, plafonnee
const PLAFOND = 26;
return noms.slice(0, PLAFOND).map((n) => ({
  json: {
    role: 'fiche',
    endpoint: 'https://google.serper.dev/search',
    q: n + ' aliexpress OR alibaba OR dhgate OR banggood acheter',
    nom: n,
  },
}));
`.trim();

// ---------------------------------------------------------------- 2. urls
const codeUrls = `
// on relit la 1re vague Serper explicitement : $input porte desormais la 2e
const plan = $('Construire le plan de recherche').all();
const res  = $('Rechercher (Serper)').all();
const vus  = new Set();
const out  = [];

// --- GARDE : la 1re vague doit avoir ramene quelque chose de lisible
if (!res.length) {
  throw new Error('La 1re vague Serper n a produit aucune reponse.');
}

const exclus = [
  'youtube.com', 'facebook.com/ads/library', 'instagram.com', 'pinterest.',
  'x.com/', 'twitter.com', 'linkedin.com', '.pdf',
];

// Seuls les roles d'ANALYSE font l'objet d'une lecture de page.
// 'sourcing' et 'catalogue' partent directement au prompt (le noeud
// "Construire le prompt" relit la sortie Serper brute) : leurs pages sont
// protegees par anti-bot et il n'y a rien a y gagner.
const quota = { marche: 14, social: 8, ads: 6 };
const pris  = { marche: 0, social: 0, ads: 0 };

for (let i = 0; i < res.length; i++) {
  const role = plan[i] ? plan[i].json.role : 'marche';
  if (!(role in quota)) continue;
  const org = (res[i].json && res[i].json.organic) || [];
  for (const o of org) {
    if (!o.link) continue;
    if (vus.has(o.link)) continue;
    if (exclus.some((x) => o.link.toLowerCase().includes(x))) continue;
    if (pris[role] >= quota[role]) break;
    vus.add(o.link);
    pris[role]++;
    out.push({
      json: { url: o.link, role, titre: o.title || '', extrait: o.snippet || '' },
    });
  }
}
return out;
`.trim();

// ---------------------------------------------------------------- 3. extraction
const codeExtrait = `
const meta = $('Collecter les URLs').all();
const res  = $input.all();

const pages    = [];
const bloquees = [];

for (let i = 0; i < res.length; i++) {
  const m = meta[i] ? meta[i].json : {};
  const j = res[i].json || {};
  let brut = '';
  if (typeof j.data === 'string') brut = j.data;
  else if (typeof j.body === 'string') brut = j.body;
  else if (typeof res[i].json === 'string') brut = res[i].json;

  if (j.error || !brut) {
    bloquees.push({
      url: m.url,
      raison: j.error ? String(j.error).slice(0, 140) : 'reponse vide ou refusee',
    });
    continue;
  }

  // image principale : og:image, recuperee dans la meme requete que le prix
  let image = '';
  const mi =
    brut.match(/<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
    brut.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
  if (mi) image = mi[1];

  let titre = '';
  const mt = brut.match(/<title[^>]*>([\\s\\S]{0,300}?)<\\/title>/i);
  if (mt) titre = mt[1].replace(/\\s+/g, ' ').trim();

  const texte = brut
    .replace(/<script[\\s\\S]*?<\\/script>/gi, ' ')
    .replace(/<style[\\s\\S]*?<\\/style>/gi, ' ')
    .replace(/<noscript[\\s\\S]*?<\\/noscript>/gi, ' ')
    .replace(/<svg[\\s\\S]*?<\\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&euro;/g, ' EUR ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\\s+/g, ' ')
    .trim();

  // une page rendue en JavaScript ne laisse quasi pas de texte : on le DIT
  if (texte.length < 400) {
    bloquees.push({ url: m.url, raison: 'page rendue en JavaScript (texte absent du HTML)' });
    continue;
  }

  pages.push({
    url: m.url,
    role: m.role,
    titre: titre || m.titre || '',
    image,
    texte: texte.slice(0, 4500),
  });
}

return [{ json: { pages, bloquees } }];
`.trim();

// ---------------------------------------------------------------- 4. prompt
const codePrompt = `
const MAITRE = ${JSON.stringify(PROMPT_MAITRE)};

const e      = $('Construire le plan de recherche').first().json;
const d      = $input.first().json;
const pages  = d.pages || [];
const bloq   = d.bloquees || [];

const categorie    = e.categorie || 'telephonie';
const theme        = e.theme || 'smartphones';
const libelleCat   = e.libelleCat || categorie;
const libelleTheme = e.libelleTheme || theme;
const date         = e.date || new Date().toISOString().slice(0, 10);

const corpus = pages.map((p, i) =>
  '### SOURCE ' + (i + 1) + ' [' + p.role + ']\\n' +
  'URL: ' + p.url + '\\n' +
  (p.image ? 'IMAGE: ' + p.image + '\\n' : '') +
  'TITRE: ' + p.titre + '\\n' +
  'TEXTE: ' + p.texte
).join('\\n\\n');

const listeBloquees = bloq.length
  ? bloq.map((b) => '- ' + b.url + ' — ' + b.raison).join('\\n')
  : '(aucune)';

// ---- CATALOGUES : relus directement depuis la sortie Serper brute ----
const plan = $('Construire le plan de recherche').all();
const brut = $('Rechercher (Serper)').all();

// 1) URL fournisseurs : on garde les adresses des plateformes de sourcing.
// Motif "fiche" = page produit unique, motif "liste" = page de recherche ou
// de categorie. Les deux sont gardees : l'extension sait scraper les deux.
const PLATEFORMES = [
  ['aliexpress',      'aliexpress.'],
  ['Alibaba',         'alibaba.com'],
  ['DHgate',          'dhgate.com'],
  ['CJ Dropshipping', 'cjdropshipping.com'],
  ['Temu',            'temu.com'],
  ['Banggood',        'banggood.com'],
  ['JoyBuy',          'joybuy.'],
  ['Made-in-China',   'made-in-china.com'],
  ['Global Sources',  'globalsources.com'],
  ['1688',            '1688.com'],
];
const MOTIFS_FICHE = ['/item/', '/product-detail/', '/product/', '/p/', '/pd/', '/goods/'];

const fournisseurs = [];
const vusF = new Set();

function avale(org, nom) {
  for (const o of org) {
    if (!o.link || vusF.has(o.link)) continue;
    const bas = o.link.toLowerCase();
    const pf = PLATEFORMES.find((p) => bas.includes(p[1]));
    if (!pf) continue;
    vusF.add(o.link);
    fournisseurs.push({
      plateforme: pf[0],
      url: o.link,
      type: MOTIFS_FICHE.some((m) => bas.includes(m)) ? 'fiche' : 'liste',
      modele: nom || '',
      titre: (o.title || '').slice(0, 120),
    });
  }
}

// 1re vague : requetes fournisseurs generiques
for (let i = 0; i < brut.length; i++) {
  if (!plan[i] || plan[i].json.role !== 'sourcing') continue;
  avale((brut[i].json && brut[i].json.organic) || [], '');
}

// 2e vague : une requete par nom de modele reel -> ce sont les FICHES
const planF = $('Extraire les noms de produits').all();
const brutF = $('Rechercher fiches produit').all();
for (let i = 0; i < brutF.length; i++) {
  const nom = planF[i] ? planF[i].json.nom : '';
  avale((brutF[i].json && brutF[i].json.organic) || [], nom);
}

// les fiches d'abord : c'est ce que l'import automatique veut
fournisseurs.sort((a, b) => (a.type === 'fiche' ? 0 : 1) - (b.type === 'fiche' ? 0 : 1));

// 2) Catalogue marchand : prix reels, marchand, note et IMAGE produit
const catalogue = [];
const vusC = new Set();
for (let i = 0; i < brut.length; i++) {
  if (!plan[i] || plan[i].json.role !== 'catalogue') continue;
  const sh = (brut[i].json && brut[i].json.shopping) || [];
  for (const s of sh) {
    const cle = (s.title || '') + '|' + (s.source || '');
    if (vusC.has(cle)) continue;
    vusC.add(cle);
    catalogue.push({
      titre: (s.title || '').slice(0, 130),
      prix: s.price || '',
      marchand: s.source || '',
      note: s.rating || null,
      avis: s.ratingCount || null,
      image: s.imageUrl || '',
      lien: s.link || '',
    });
  }
}

const listeFournisseurs = fournisseurs.length
  ? fournisseurs.map((f, i) =>
      '[F' + (i + 1) + '] ' + f.plateforme + ' (' + f.type + ')' +
      (f.modele ? ' [modele: ' + f.modele + ']' : '') + ' — ' + f.url +
      '\\n      ' + f.titre
    ).join('\\n')
  : '(aucune URL fournisseur remontee)';

const listeCatalogue = catalogue.length
  ? catalogue.map((c, i) =>
      '[C' + (i + 1) + '] ' + c.titre + ' | ' + c.prix + ' | ' + c.marchand +
      (c.note ? ' | note ' + c.note + ' (' + (c.avis || 0) + ' avis)' : '') +
      '\\n      IMAGE: ' + c.image
    ).join('\\n')
  : '(catalogue vide)';

const prompt = [
// --- le prompt maitre aiMARKET, tel que Max l'a ecrit, sans retouche
MAITRE,
'',
'=== 0. VARIABLES DE CETTE ETUDE ===',
'Date de l etude : ' + date,
'Pays principal : France',
'Zone commerciale : France + Europe',
'Categorie : ' + libelleCat,
'Slug categorie : ' + categorie,
'Theme analyse : ' + libelleTheme,
'Slug theme : ' + theme,
'',
'=== COMPLEMENT PIPELINE — PRIORITAIRE SUR LE RESTE ===',
'Tu ne navigues pas : toute ta matiere est fournie plus bas. Les catalogues',
'ci-dessous ont ete releves automatiquement pour cette etude. Ils remplacent',
'la recherche web demandee au point 1.1 du prompt maitre.',
'',
'REGLE URL — OBLIGATOIRE SUR LES 20 LIGNES.',
'Le client achete de l IMPORT AUTOMATIQUE : une ligne sans URL ne lui sert a rien.',
'supplier_url est TOUJOURS rempli, avec une adresse prise dans le CATALOGUE',
'FOURNISSEURS [F..]. Tu ne fabriques aucune adresse, et tu n en laisses aucune vide.',
'Privilegie les entrees de type "fiche" : elles sont listees en premier et',
'portent le nom du modele entre crochets. Une entree "liste" n est prise que si',
'aucune fiche ne correspond — un flux de scraping par extension la traitera',
'produit par produit derriere. N utilise jamais deux fois la meme adresse tant',
'qu il en reste de disponibles.',
'Ajoute a chaque produit le champ url_type : "fiche" ou "liste".',
'Ajoute a chaque produit le champ import : "url" si la fiche se lit a l adresse,',
'"extension" si la page se construit en JavaScript (AliExpress, Temu, Alibaba,',
'Shein, 1688), "api" pour un fournisseur relie par cle.',
'',
'REGLE IMAGE — OBLIGATOIRE SUR LES 20 LIGNES.',
'Ajoute a chaque produit le champ image_url, pris dans le CATALOGUE MARCHAND',
'[C..], celui du produit le plus proche. Ces images illustrent les fiches et les',
'articles. Tu ne fabriques aucune adresse d image.',
'',
'REGLE SOURCES BLOQUEES.',
'Les pages listees en SOURCES BLOQUEES n ont pas pu etre lues. Reporte-les',
'telles quelles dans la section 14 et dans la cle sources_bloquees du JSON.',
'Ne comble jamais ce qu elles auraient pu contenir.',
'',
'=== FORMAT DE SORTIE — IMPERATIF ===',
'Tu produis DEUX blocs et rien d autre, dans cet ordre, separes par une ligne',
'contenant exactement <<<JSON>>>.',
'',
'BLOC 1 : la ligne <<<MARKDOWN>>> seule, puis un en-tete YAML entre --- portant',
'type: aimarket, date, categorie, theme, titre, agent, marche_revente, sourcing,',
'produits, sources, sources_bloquees. Puis le rapport Markdown complet avec les',
'16 sections et les 5 tableaux obligatoires du prompt maitre.',
'',
'BLOC 2 : apres <<<JSON>>>, le JSON complet du point 9 du prompt maitre, valide,',
'sans balise de code, avec les trois champs ajoutes ci-dessus (url_type, import,',
'image_url) dans chaque produit, plus la cle sources_bloquees.',
'',
'=== CATALOGUE FOURNISSEURS (' + fournisseurs.length + ' adresses reelles) ===',
'C est la seule source autorisee pour supplier_url.',
listeFournisseurs,
'',
'=== CATALOGUE MARCHAND (' + catalogue.length + ' offres reelles, prix France) ===',
'Source des prix de revente constates ET des images produit.',
listeCatalogue,
'',
'=== SOURCES BLOQUEES (a reporter telles quelles) ===',
listeBloquees,
'',
'=== SOURCES LUES (' + pages.length + ' pages) ===',
corpus,
].join('\\n');

return [{
  json: {
    prompt, categorie, theme, date,
    nbPages: pages.length,
    nbBloquees: bloq.length,
    nbFournisseurs: fournisseurs.length,
    nbCatalogue: catalogue.length,
  },
}];
`.trim();

// ---------------------------------------------------------------- 5. decoupe
const codeDecoupe = `
const e    = $('Construire le plan de recherche').first().json;
const p    = $('Construire le prompt').first().json;
const rep  = $input.first().json;

// la reponse peut arriver sous plusieurs formes selon le parsing de n8n
function extraitTexte(r) {
  if (!r) return '';
  if (typeof r === 'string') {
    try { return extraitTexte(JSON.parse(r)); } catch (e) { return r; }
  }
  if (Array.isArray(r.content)) return r.content.map((c) => c.text || '').join('');
  if (r.data) return extraitTexte(r.data);
  if (r.body) return extraitTexte(r.body);
  return '';
}
let texte = extraitTexte(rep);

// on n'echoue jamais en silence : on ecrit un fichier de diagnostic lisible
if (!texte) {
  const diag = '# DIAGNOSTIC — reponse Claude non exploitable\\n\\n' +
    'Cles de premier niveau : ' + Object.keys(rep || {}).join(', ') + '\\n\\n' +
    '~~~\\n' + JSON.stringify(rep, null, 2).slice(0, 12000) + '\\n~~~\\n';
  return [{
    json: {
      diagnostic: true,
      cles: Object.keys(rep || {}),
      nomMd: 'DIAGNOSTIC-reponse-claude.md',
      nomJson: 'DIAGNOSTIC-reponse-claude.json',
    },
    binary: {
      md: {
        data: Buffer.from(diag, 'utf8').toString('base64'),
        mimeType: 'text/markdown',
        fileName: 'DIAGNOSTIC-reponse-claude.md',
      },
      rapport: {
        data: Buffer.from(JSON.stringify(rep || {}, null, 2), 'utf8').toString('base64'),
        mimeType: 'application/json',
        fileName: 'DIAGNOSTIC-reponse-claude.json',
      },
    },
  }];
}

const i = texte.indexOf('<<<JSON>>>');
let md   = (i >= 0 ? texte.slice(0, i) : texte);
let brut = (i >= 0 ? texte.slice(i + 10) : '{}');

md = md.replace(/^\\s*<<<MARKDOWN>>>\\s*/, '').trim();
brut = brut.trim().replace(/^\\u0060{3}json\\s*/i, '').replace(/\\u0060{3}\\s*$/, '').trim();

let objet = null;
try {
  objet = JSON.parse(brut);
} catch (err) {
  // on ne jette pas le rapport pour un JSON casse : on le signale
  objet = { _erreur_json: String(err).slice(0, 300), _brut: brut.slice(0, 2000) };
}

const base = (e.date || p.date) + '_' + (e.categorie || p.categorie) + '_' + (e.theme || p.theme);
const nomMd   = base + '.md';
const nomJson = base + '.json';

return [{
  json: {
    nomMd,
    nomJson,
    pagesLues: p.nbPages,
    pagesBloquees: p.nbBloquees,
    jsonOk: !objet._erreur_json,
    produits: Array.isArray(objet.produits) ? objet.produits.length : 0,
  },
  binary: {
    md: {
      data: Buffer.from(md, 'utf8').toString('base64'),
      mimeType: 'text/markdown',
      fileName: nomMd,
    },
    rapport: {
      data: Buffer.from(JSON.stringify(objet, null, 2), 'utf8').toString('base64'),
      mimeType: 'application/json',
      fileName: nomJson,
    },
  },
}];
`.trim();

// ---------------------------------------------------------------- noeuds
function code(nom, js, x, y) {
  return {
    parameters: { jsCode: js },
    id: 'n-' + nom.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30),
    name: nom,
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [x, y],
  };
}

const wf = {
  id: 'agentRayonUnifie',
  name: 'DropPost — Agent rayon unifie (Claude)',
  nodes: [
    {
      parameters: {
        workflowInputs: {
          values: [
            { name: 'categorie' },
            { name: 'theme' },
            { name: 'libelle_categorie' },
            { name: 'libelle_theme' },
            { name: 'date' },
          ],
        },
      },
      id: 'n-entree',
      name: 'Entree',
      type: 'n8n-nodes-base.executeWorkflowTrigger',
      typeVersion: 1.1,
      position: [0, 0],
    },

    {
      parameters: {
        httpMethod: 'POST',
        path: 'agent-rayon-unifie',
        responseMode: 'onReceived',
        options: {},
      },
      id: 'n-webhook-test',
      name: 'Webhook test',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [0, 220],
      webhookId: 'c7f1a2b3-4d5e-4f60-9a71-8b2c3d4e5f60',
    },

    code('Construire le plan de recherche', codePlan, 220, 0),

    {
      parameters: {
        method: 'POST',
        url: '={{ $json.endpoint }}',
        authentication: 'genericCredentialType',
        genericAuthType: 'httpHeaderAuth',
        sendHeaders: true,
        headerParameters: {
          parameters: [{ name: 'content-type', value: 'application/json' }],
        },
        sendBody: true,
        specifyBody: 'json',
        jsonBody:
          "={{ JSON.stringify({ q: $json.q, gl: 'fr', hl: 'fr', num: $json.role === 'catalogue' ? 40 : 10 }) }}",
        options: { timeout: 30000 },
      },
      id: 'n-serper',
      name: 'Rechercher (Serper)',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [440, 0],
      credentials: { httpHeaderAuth: CRED_SERPER },
      onError: 'continueRegularOutput',
      retryOnFail: true,
      maxTries: 2,
    },

    code('Extraire les noms de produits', codeNoms, 660, 0),

    {
      parameters: {
        method: 'POST',
        url: 'https://google.serper.dev/search',
        authentication: 'genericCredentialType',
        genericAuthType: 'httpHeaderAuth',
        sendHeaders: true,
        headerParameters: {
          parameters: [{ name: 'content-type', value: 'application/json' }],
        },
        sendBody: true,
        specifyBody: 'json',
        jsonBody:
          "={{ JSON.stringify({ q: $json.q, gl: 'fr', hl: 'fr', num: 8 }) }}",
        options: { timeout: 30000, batching: { batch: { batchSize: 8, batchInterval: 400 } } },
      },
      id: 'n-serper-fiches',
      name: 'Rechercher fiches produit',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [880, 220],
      credentials: { httpHeaderAuth: CRED_SERPER },
      onError: 'continueRegularOutput',
      retryOnFail: true,
      maxTries: 2,
    },

    code('Collecter les URLs', codeUrls, 1100, 0),

    {
      parameters: {
        url: '={{ $json.url }}',
        sendHeaders: true,
        headerParameters: {
          parameters: [
            {
              name: 'user-agent',
              value:
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
            },
            { name: 'accept-language', value: 'fr-FR,fr;q=0.9,en;q=0.8' },
          ],
        },
        options: {
          timeout: 20000,
          redirect: { redirect: { followRedirects: true } },
          response: { response: { responseFormat: 'text', neverError: true } },
          batching: { batch: { batchSize: 6, batchInterval: 800 } },
        },
      },
      id: 'n-lire-pages',
      name: 'Lire les pages',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [880, 0],
      onError: 'continueRegularOutput',
    },

    code('Extraire le contenu', codeExtrait, 1100, 0),
    code('Construire le prompt', codePrompt, 1320, 0),

    {
      parameters: {
        method: 'POST',
        url: 'https://api.anthropic.com/v1/messages',
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'anthropicApi',
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'anthropic-version', value: '2023-06-01' },
            { name: 'content-type', value: 'application/json' },
          ],
        },
        sendBody: true,
        specifyBody: 'json',
        jsonBody:
          "={{ JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 64000, output_config: { effort: 'medium' }, messages: [ { role: 'user', content: $json.prompt } ] }) }}",
        options: { timeout: 600000 },
      },
      id: 'n-claude',
      name: 'Rediger (Claude)',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1540, 0],
      credentials: { anthropicApi: CRED_ANTHROPIC },
      retryOnFail: true,
      maxTries: 2,
    },

    code('Decouper md et json', codeDecoupe, 1760, 0),

    {
      parameters: {
        operation: 'write',
        fileName: '=' + DOSSIER_RAPPORTS + '/{{ $json.nomMd }}',
        dataPropertyName: 'md',
        options: {},
      },
      id: 'n-ecrire-md',
      name: 'Ecrire .md',
      type: 'n8n-nodes-base.readWriteFile',
      typeVersion: 1,
      position: [1980, -100],
    },
    {
      parameters: {
        operation: 'write',
        fileName: '=' + DOSSIER_RAPPORTS + '/{{ $json.nomJson }}',
        dataPropertyName: 'rapport',
        options: {},
      },
      id: 'n-ecrire-json',
      name: 'Ecrire .json',
      type: 'n8n-nodes-base.readWriteFile',
      typeVersion: 1,
      position: [1980, 100],
    },
  ],
  connections: {
    Entree: { main: [[{ node: 'Construire le plan de recherche', type: 'main', index: 0 }]] },
    'Webhook test': { main: [[{ node: 'Construire le plan de recherche', type: 'main', index: 0 }]] },
    'Construire le plan de recherche': { main: [[{ node: 'Rechercher (Serper)', type: 'main', index: 0 }]] },
    'Rechercher (Serper)': { main: [[{ node: 'Extraire les noms de produits', type: 'main', index: 0 }]] },
    'Extraire les noms de produits': { main: [[{ node: 'Rechercher fiches produit', type: 'main', index: 0 }]] },
    'Rechercher fiches produit': { main: [[{ node: 'Collecter les URLs', type: 'main', index: 0 }]] },
    'Collecter les URLs': { main: [[{ node: 'Lire les pages', type: 'main', index: 0 }]] },
    'Lire les pages': { main: [[{ node: 'Extraire le contenu', type: 'main', index: 0 }]] },
    'Extraire le contenu': { main: [[{ node: 'Construire le prompt', type: 'main', index: 0 }]] },
    'Construire le prompt': { main: [[{ node: 'Rediger (Claude)', type: 'main', index: 0 }]] },
    'Rediger (Claude)': { main: [[{ node: 'Decouper md et json', type: 'main', index: 0 }]] },
    'Decouper md et json': {
      main: [[
        { node: 'Ecrire .md', type: 'main', index: 0 },
        { node: 'Ecrire .json', type: 'main', index: 0 },
      ]],
    },
  },
  // 'all' + saveExecutionProgress stockaient 8 a 12 Mo de pages web brutes par
  // execution : la base n8n avait atteint 485 Mo en trois semaines. On garde les
  // donnees des echecs — c'est ce qui a permis de diagnostiquer le 23 septembre —
  // et on jette celles des reussites, dont le resultat est deja sur le disque.
  settings: {
    executionOrder: 'v1',
    saveDataSuccessExecution: 'none',
    saveDataErrorExecution: 'all',
    saveExecutionProgress: false,
  },
};

const sortie = path.join(__dirname, 'agent-rayon-unifie.workflow.json');
fs.writeFileSync(sortie, JSON.stringify(wf, null, 2), 'utf8');
console.log('ecrit : ' + sortie);
console.log('noeuds : ' + wf.nodes.length);
