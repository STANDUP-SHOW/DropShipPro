/**
 * Fabrique l'annuaire des canaux à partir des fichiers de logos.
 *
 * Le dossier compte 742 fichiers, et c'est ce nombre qui circulait — mais il ne
 * désigne pas 742 plateformes :
 *
 * — **390 sont anonymes** (`quality-70---117-.png`, `format-webp---3-.png`).
 *   Leur nom n'identifie aucune marque ; il faudrait ouvrir chaque image pour
 *   savoir de qui il s'agit, et la moitié sont des doublons. Ils sont écartés.
 * — **une trentaine ne sont pas des plateformes** : éléments d'interface,
 *   pages du site d'origine (« cas-clients », « devenir-partenaire »), logos
 *   d'assistants IA. Écartés aussi, par liste explicite.
 *
 * Reste environ trois cents marques réelles. C'est cet annuaire-là qui a du
 * sens : places de marché, comparateurs, plateformes d'affiliation, régies
 * publicitaires et enseignes.
 *
 * Le fichier produit est relu et corrigé à la main ensuite — un classement
 * automatique se trompe, et il vaut mieux « autre » qu'une catégorie inventée.
 *
 * Relancer : node build-channel-directory.cjs
 */

const fs = require('fs')
const path = require('path')

const LOGOS = path.resolve(__dirname, '../frontend/public/logos')
const SORTIE = path.resolve(__dirname, 'src/services/channelDirectory.ts')

/** Ce qui n'identifie aucune marque, ou n'est pas une plateforme. */
const ECARTES = new Set([
  'README',
  'blog',
  'calque_2',
  'cas-clients',
  'centre-d-aide',
  'comparateurs',
  'comparer',
  'coverlogos',
  'devenir-partenaire',
  'dialog-hub',
  'industries',
  'marque',
  'master-logo-rgb',
  'modules-api',
  'new-logo-rdc-500',
  'partenaires-agences',
  'partenaires-eco-systemes',
  'qui-sommes-nous',
  'retailers',
  'share',
  'support',
  'webinaire',
  'web-to-store',
  'syndication-marketplaces',
  'repricing-marketplaces',
  'pricing-monitoring',
  'ma-b2c-230',
  'niveales',
  'petch',
  'squadata',
  'semisphere3d',
  'solutelabs',
  'zbomedia',
  // Assistants et moteurs : ils ne reçoivent pas d'annonces produit.
  'chatgpt-logo-svg',
  'claude-ai-logo',
  'google-gemini-logo',
  'microsoft-copilot-logo-444x250',
  'perplexity',
  'qwant',
])

/** Les noms qu'un nettoyage automatique écrirait mal. */
const NOMS = {
  '1200px-media_markt_logo-svg': 'MediaMarkt',
  'b-q-logo': 'B&Q',
  'bed-bath-beyond_logo': 'Bed Bath & Beyond',
  'best-buy-logo': 'Best Buy',
  'bhvmarais': 'BHV Marais',
  'big-bang-logo-2023': 'Big Bang',
  'black_red_white_logo-svg': 'Black Red White',
  'bol-logo': 'Bol.com',
  'cdiscount-new-logo': 'Cdiscount',
  'cjaffiliategs': 'CJ Affiliate',
  'eleclerc': 'E.Leclerc',
  'elcorteingles': 'El Corte Inglés',
  'fanatics_company_logo-svg': 'Fanatics',
  'fonq-logo-new-svg': 'fonQ',
  'galerieslafayette': 'Galeries Lafayette',
  'h-m-logo-svg': 'H&M',
  'hbc_logo': "Hudson's Bay",
  'home-depot-logo': 'The Home Depot',
  'jd-sport': 'JD Sports',
  'joom-logo-new': 'Joom',
  'kaufland_marketplace': 'Kaufland',
  'kelkoogroup': 'Kelkoo',
  'kiabi_logo': 'Kiabi',
  'kohl-s_logo': "Kohl's",
  'laredoute': 'La Redoute',
  'lazada-1': 'Lazada',
  'lowes_companies_logo-svg': "Lowe's",
  'macy-s_logo_2019': "Macy's",
  'manomanopro': 'ManoMano Pro',
  'manor-logo-blk-rgb-1': 'Manor',
  'maxeda_diy_group': 'Maxeda DIY',
  'miintomarketplace': 'Miinto',
  'misterauto_pro': 'Mister Auto Pro',
  'obi-logo-orange-rgb': 'OBI',
  'otto_logo': 'Otto',
  'place_des_tendances_logo': 'Place des Tendances',
  'private_sport_shop': 'Private Sport Shop',
  'logotype_printemps-vert': 'Printemps',
  'rinascente_logo-svg': 'La Rinascente',
  'shein-logo': 'Shein',
  'shop-apotheke': 'Shop Apotheke',
  'shoppingcom': 'Shopping.com',
  'shopbotinc': 'ShopBot',
  'showroomprive': 'Showroomprivé',
  'slood-logo': 'Slood',
  'superdrug_logo-svg': 'Superdrug',
  'target-logo': 'Target',
  'temu_logo-svg': 'Temu',
  'tesco_logo': 'Tesco',
  'tiktokshop_logo': 'TikTok Shop',
  'tradetrackercom': 'TradeTracker',
  'twenganew': 'Twenga',
  'veepeegroup': 'Veepee',
  'vtwonen-logo-1': 'vtwonen',
  'wmt-marketplace-wordmark-stacked-rgb': 'Walmart Marketplace',
  'xxxlutz-logo': 'XXXLutz',
  'yves-rocher-france': 'Yves Rocher',
  'zooplus-new': 'Zooplus',
  'refurbed-new': 'Refurbed',
  '31m2': '31m2',
  'nature-et-decouvertes': 'Nature & Découvertes',
  'natureetdecouvertes': 'Nature & Découvertes',
  'onachetefrancais': 'On Achète Français',
  'googleshoppingads': 'Google Shopping Ads',
  'bingproductsads': 'Bing Product Ads',
  'ads-google-instagram-tiktok': 'Google, Instagram & TikTok Ads',
  'facebookads': 'Facebook Ads',
  'googlelocal': 'Google Local',
  'usinenouvelle': "L'Usine Nouvelle",
  'lequipement': "L'Équipement",
  'pourdebon': 'Pour de Bon',
}

/** Classement par nom exact, quand le mot-clé ne suffit pas. */
const TYPES = {
  comparateur: [
    'achatmoinscher', 'bestlist', 'biliger', 'ceneo', 'cocote', 'comparer', 'connexity',
    'coompra', 'dealplaza', 'electromenagercompare', 'guenstiger', 'homecinecompare',
    'icomparateur', 'idealo', 'informaprezzi', 'kelkoogroup', 'kuantokusta', 'lcdcompare',
    'ledenicheur', 'leguide', 'lionshome', 'livingo', 'musicompare', 'mybestbrands',
    'nokaut', 'otiendas', 'pagineprezzi', 'plusbaslesprix', 'pneucompare', 'prezzifacili',
    'prezzigomme', 'pricegrabber', 'pricerunner', 'prisvis', 'prixing', 'pronto',
    'pureshopping', 'quelpneu', 'quesabesde', 'radarprice', 'shopalike', 'shopbotinc',
    'shopmania', 'shoppingcom', 'shoppydoo', 'shopstyle', 'shopzilla', 'stileo',
    'topnegozi', 'touslesprix', 'trovaprezzi', 'twenganew', 'glami', 'kelbike',
    'keldelice', 'ktaloguebio', 'ktaloguesexy', 'fashiola', 'fashionchick', 'cherchons',
    'bonial', 'beautetest', 'winedecider', 'trygr', 'tightr', 'priceobservatory',
  ],
  affiliation: [
    'affilae', 'adverline', 'awin', 'cjaffiliategs', 'effiliation', 'kwanko-logo',
    'shareasale', 'timeone', 'tradedoubler', 'tradetrackercom', 'webepartners',
    'webgains', 'ebuyclub', 'reductionmarque', 'sponsorboost', 'tracdelight',
  ],
  regie: [
    'adroll', 'ads-google-instagram-tiktok', 'bingproductsads', 'caasttv', 'criteo',
    'esearchvision', 'facebookads', 'googlelocal', 'googleshoppingads', 'instagram',
    'mythings', 'pinterest', 'radvertising', 'snapchat', 'sociomantic', 'target2sell',
    'nuukik', 'reelevant',
  ],
  outil: [
    'attraqt-navy-logo', 'bazaarvoice', 'catalogate', 'contentsquare', 'doofinder',
    'fitizzy', 'getflowbox', 'icecat', 'netreviews', 'nowinstore', 'perfectcorp',
    'reetags', 'socloz', 'spycommerce', 'stockly', 'thunderstone', 'commerceconnector',
    'click2buy', 'clicktofournisseur', 'cartageous', 'catchys', 'gearscore', 'happytal_logo',
    'neokasa', 'spareka_logo', 'refurbed-new', 'sabdoo', 'solostocks',
  ],
}

const parType = new Map()
for (const [type, liste] of Object.entries(TYPES)) {
  for (const nom of liste) parType.set(nom, type)
}

/** Le nom affiché, déduit du fichier quand il n'est pas dans la table. */
function nomDe(base) {
  if (NOMS[base]) return NOMS[base]
  return base
    .replace(/[-_]?logo.*$/i, '')
    .replace(/[-_]svg$/i, '')
    .replace(/^\d+px[-_]/, '')
    .replace(/[-_]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

const fichiers = fs
  .readdirSync(LOGOS)
  .filter((f) => /\.(png|svg|jpe?g|webp)$/i.test(f))
  .filter((f) => !/^(quality-\d+|format-webp)/.test(f))

const entrees = []
const vus = new Set()

for (const fichier of fichiers.sort()) {
  const base = fichier.replace(/\.[a-z]+$/i, '')
  if (ECARTES.has(base)) continue

  const label = nomDe(base)
  const cle = label.toLowerCase()
  if (vus.has(cle)) continue
  vus.add(cle)

  entrees.push({
    id: base,
    label,
    logo: fichier,
    // « marketplace » par défaut : c'est ce que sont la plupart des marques
    // restantes, et une catégorie fausse se corrige à la lecture.
    type: parType.get(base) ?? 'marketplace',
  })
}

const ts = `/**
 * L'annuaire des canaux, engendré depuis le dossier des logos.
 *
 * NE PAS ÉDITER À LA MAIN sans relancer le générateur, ou l'inverse : le
 * fichier est produit par \`node build-channel-directory.cjs\`. Les noms mal
 * nettoyés et les classements douteux se corrigent dans les tables du
 * générateur, pas ici.
 *
 * Ce que cet annuaire est, et ce qu'il n'est pas : une liste de marques dont
 * nous avons le logo, rangées par famille. **Aucune n'est intégrée du seul
 * fait d'être listée.** Les destinations où l'on publie vraiment sont dans
 * \`platforms.ts\`, et elles sont ${'${INTEGREES}'} — le reste est là pour que le
 * vendeur voie le paysage et nous dise ce qu'il veut.
 *
 * Le dossier compte 742 fichiers, mais 390 sont anonymes
 * (\`quality-70---117-.png\`) et n'identifient aucune marque ; une trentaine ne
 * sont pas des plateformes. D'où ${entrees.length} entrées et non 742.
 */

export type TypeCanal = 'marketplace' | 'comparateur' | 'affiliation' | 'regie' | 'outil'

export interface CanalAnnuaire {
  id: string
  label: string
  /** Le fichier dans frontend/public/logos. */
  logo: string
  type: TypeCanal
}

export const CANAUX: CanalAnnuaire[] = ${JSON.stringify(entrees, null, 2)}

export const TYPES_CANAL: Array<{ id: TypeCanal; label: string; aide: string }> = [
  {
    id: 'marketplace',
    label: 'Places de marché et enseignes',
    aide: "Elles vendent au public et acceptent des vendeurs tiers, chacune avec ses règles d'entrée.",
  },
  {
    id: 'comparateur',
    label: 'Comparateurs de prix',
    aide: "Ils ne vendent pas : ils affichent votre produit et renvoient l'acheteur chez vous, contre un coût au clic.",
  },
  {
    id: 'affiliation',
    label: "Plateformes d'affiliation",
    aide: 'Des éditeurs poussent vos produits et se rémunèrent à la vente.',
  },
  {
    id: 'regie',
    label: 'Régies publicitaires',
    aide: 'Vous payez pour être vu. Le flux produit y sert de matière première.',
  },
  {
    id: 'outil',
    label: 'Outils du commerce en ligne',
    aide: "Avis clients, moteur de recherche, essayage virtuel : ils entourent la vente sans être un canal de diffusion.",
  },
]
`

fs.writeFileSync(SORTIE, ts.replace('${INTEGREES}', 'vingt et une'), 'utf8')

const compte = {}
for (const e of entrees) compte[e.type] = (compte[e.type] ?? 0) + 1
console.log(`${entrees.length} entrées écrites dans ${path.relative(process.cwd(), SORTIE)}`)
for (const [type, n] of Object.entries(compte).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${type.padEnd(14)} ${n}`)
}
