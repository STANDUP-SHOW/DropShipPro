/*
 * Le banc d'une boutique écrite par l'IA — ce que « je teste le rendu » veut dire.
 *
 *   node dropshop/verifier.cjs <page.html>   → JSON { ok, echecs[], avertissements[] } sur la sortie
 *
 * La page est montée dans un navigateur simulé (jsdom) avec le VRAI moteur
 * (sdk.js, inséré à la place de sa balise) et un faux serveur qui sert un thème
 * et trois produits. Puis on fait ce qu'un visiteur fait : arriver, ouvrir une
 * catégorie, ouvrir un produit, l'ajouter au panier, aller commander, envoyer
 * le formulaire — et on regarde ce qui s'affiche et ce qui part au serveur.
 *
 * Chaque échec est écrit pour être LU PAR LE MODÈLE qui répare : il nomme ce
 * qui manque et où, pas seulement « rate ».
 *
 * Ce fichier tourne dans un processus enfant à l'environnement vidé (voir
 * services/siteGenerator.ts) : jsdom exécute du code écrit par un modèle à
 * partir d'un texte de vendeur, et jsdom n'est pas un bac à sable. Sans
 * variables d'environnement ni accès à la base, une évasion ne trouve rien.
 */
const fs = require('fs')
const path = require('path')
const { JSDOM, VirtualConsole } = require('jsdom')

const SDK = fs.readFileSync(path.join(__dirname, 'sdk.js'), 'utf8')

/**
 * Les options de contrôle, selon ce que le vendeur a demandé :
 *   --modes  la boutique doit offrir des modes visiteur ([data-mode] + [data-theme=…])
 *   --logo   le marchand a un logo : il doit être affiché dans l'en-tête
 */
const OPTIONS = { modes: process.argv.includes('--modes'), logo: process.argv.includes('--logo') }

const THEME = {
  theme: 'comptoir',
  jetons: {},
  polices: { titre: 'Fraunces', texte: 'Inter', familles: ['Fraunces', 'Inter'] },
  contenu: {
    annonce: 'Livraison offerte dès 300 €',
    accroche: 'Le temps,',
    accrocheSuite: 'à votre poignet.',
    sousTitre: 'Montres et écouteurs choisis un par un.',
    fraisPort: 4.9,
    portOffertDes: 300,
  },
  boutique: { nom: 'Maison Test', logo: null, logoEntete: OPTIONS.logo ? 'https://cdn.test/logo.png' : null, logoAccueil: OPTIONS.logo ? 'https://cdn.test/logo-grand.png' : null },
}
const PRODUITS = {
  shop: { name: 'Maison Test' },
  count: 3,
  paiement: 'sans',
  products: [
    { id: 'p1', title: 'Montre Aurore acier', description: 'Boîtier 40 mm, verre saphir.', price: 249, currency: 'EUR', images: ['https://cdn.test/aurore.jpg'], category: 'Bijoux et montres > Montres', bulletPoints: ['Verre saphir'], attributes: { Boîtier: '40 mm' } },
    { id: 'p2', title: 'Montre Nuit noire', description: 'Cadran noir mat.', price: 59.9, currency: 'EUR', images: [], category: 'Bijoux et montres > Montres', bulletPoints: [], attributes: {} },
    { id: 'p3', title: 'Écouteurs Onde', description: 'Réduction de bruit active.', price: 18, currency: 'EUR', images: ['/storage/onde.jpg'], category: 'Audio', bulletPoints: [], attributes: {} },
  ],
}

const patienter = (ms) => new Promise((r) => setTimeout(r, ms))
async function attendre(condition, delaiMs = 2500) {
  const debut = Date.now()
  while (Date.now() - debut < delaiMs) {
    try { if (condition()) return true } catch (e) { /* pas encore */ }
    await patienter(15)
  }
  return false
}

/* ---------- Contrôles de structure : sans exécuter la page ---------- */
function controlerStructure(page, echecs, avertissements) {
  if (!/^\s*<!doctype html>/i.test(page)) echecs.push('La page doit commencer par <!doctype html>.')
  if (!/<html[^>]*\blang=/i.test(page)) echecs.push('La balise <html> doit porter lang="fr".')
  if (!/<meta[^>]+name=["']viewport["']/i.test(page)) echecs.push('Il manque <meta name="viewport" content="width=device-width, initial-scale=1"> : la page ne sera pas responsive.')
  if (!/<title>[^<]+<\/title>/i.test(page)) echecs.push('Il manque une balise <title>.')
  if (!/<div[^>]+id=["']app["']/i.test(page)) echecs.push('Il manque le conteneur <div id="app"></div> dans lequel le moteur affiche les écrans.')
  const sdk = page.match(/<script[^>]+src=["']\/dropshop\/sdk\.js["'][^>]*><\/script>/gi) || []
  if (sdk.length !== 1) echecs.push('La page doit charger le moteur exactement une fois : <script src="/dropshop/sdk.js"></script> (trouvé ' + sdk.length + ' fois).')
  const scriptsExternes = (page.match(/<script[^>]+src=["'][^"']+["']/gi) || []).filter((s) => !/\/dropshop\/sdk\.js/.test(s))
  if (scriptsExternes.length) echecs.push('Aucun script externe n\'est autorisé (trouvé : ' + scriptsExternes.map((s) => s.slice(0, 80)).join(' ; ') + '). Tout le JavaScript de la page est écrit dans la page.')
  const liens = page.match(/<link[^>]+>/gi) || []
  liens.forEach((l) => {
    if (/rel=["']stylesheet["']/i.test(l) && !/fonts\.googleapis\.com/.test(l)) echecs.push('Feuille de style externe interdite : ' + l.slice(0, 100) + '. Seul Google Fonts est autorisé ; le CSS est écrit dans la page.')
  })
  if (/<iframe/i.test(page)) echecs.push('Aucune <iframe> dans la boutique.')
  if (/\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon|\bimport\s*\(/.test(page)) echecs.push('La page ne fait aucun appel réseau elle-même (fetch, XMLHttpRequest, import()) : le moteur lit le catalogue et envoie la commande.')
  if (!/DropShop\.pages\s*\(/.test(page)) echecs.push('La page doit décrire ses écrans avec DropShop.pages({ cadre, accueil, boutique, categorie, produit, panier, commande, merci, introuvable }).')
  if (!/@media/.test(page)) echecs.push('Le CSS ne contient aucune règle @media : la boutique doit être responsive (téléphone, tablette, ordinateur).')
  if (/<script[^>]*>[\s\S]*?on(click|submit|change)\s*=/i.test(page) || /\son(click|submit|change)=["']/i.test(page)) avertissements.push('Des gestionnaires inline (onclick=…) ont été trouvés : préférer les attributs data-ajouter, data-retirer, data-commande, que le moteur branche lui-même.')
  const taille = Buffer.byteLength(page, 'utf8')
  if (taille > 400_000) echecs.push('La page pèse ' + Math.round(taille / 1024) + ' Ko : au-delà de 400 Ko. Pas de données en dur, pas d\'images encodées dans la page.')
  // Faute vue sur la première boutique réelle : un « .wrap » recevant width:100%
  // par une seconde classe perd ses marges, et le titre du héros colle au bord.
  const css = (page.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || []).join('\n')
  if (/\.wrap\s*\{[^}]*width\s*:\s*100%/.test(css)) echecs.push('La règle .wrap ne doit pas poser width:100% : elle centre le contenu avec une largeur bornée (min(1200px, 92vw)) et margin-inline:auto.')
  if (OPTIONS.modes) {
    const themes = new Set((css.match(/\[data-theme=["']?([a-z0-9-]+)["']?\]/gi) || []).map((m) => m.toLowerCase()))
    if (themes.size < 3) echecs.push('Les modes visiteur ont été demandés : le CSS doit définir au moins 3 ambiances complètes sous [data-theme="…"] (fond, surfaces, texte, accent), trouvé ' + themes.size + '.')
  }
}

/* ---------- Montage ---------- */
async function monter(page, echecs) {
  const appels = []
  const inline = page.replace(/<script[^>]+src=["']\/dropshop\/sdk\.js["'][^>]*><\/script>/i, () => '<script>' + SDK + '</script>')
  const erreursJs = []
  const virtualConsole = new VirtualConsole()
  virtualConsole.on('jsdomError', (e) => erreursJs.push(String((e && e.message) || e).slice(0, 200)))
  virtualConsole.on('error', (...args) => erreursJs.push(args.map(String).join(' ').slice(0, 200)))
  const dom = new JSDOM(inline, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://api.test/b/maison-test',
    virtualConsole,
    beforeParse(w) {
      w.BOUTIQUE = { api: 'https://api.test', shopKey: 'cle-test', slug: 'maison-test', nom: 'Maison Test' }
      w.scrollTo = () => {}
      w.matchMedia = w.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }))
      w.IntersectionObserver = w.IntersectionObserver || class { observe() {} unobserve() {} disconnect() {} }
      w.ResizeObserver = w.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} }
      w.requestAnimationFrame = w.requestAnimationFrame || ((fn) => setTimeout(() => fn(Date.now()), 16))
      w.fetch = (url, options = {}) => {
        appels.push({ url: String(url), options })
        const reponds = (status, corps) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(corps) })
        const u = String(url)
        if (u.endsWith('/theme')) return reponds(200, THEME)
        if (u.endsWith('/products')) return reponds(200, PRODUITS)
        if (u.endsWith('/checkout')) return reponds(201, { ok: true, commandes: 1, paiement: null })
        return Promise.reject(new Error('adresse inattendue : ' + u))
      }
    },
  })
  const w = dom.window
  const d = w.document
  const monte = await attendre(() => d.getElementById('app') && d.getElementById('app').textContent.includes('Maison Test'), 3000)
  if (!monte) {
    echecs.push('Après chargement, l\'accueil n\'affiche pas le nom de la boutique (c.boutique.nom). Le moteur a-t-il bien été appelé avec DropShop.pages(...) ? Erreurs JS : ' + (erreursJs.join(' | ') || 'aucune'))
  }
  return { w, d, appels, erreursJs }
}

async function aller(w, hash) {
  w.location.hash = hash
  await patienter(40)
}

function texte(d) {
  return d.getElementById('app').textContent.replace(/\s+/g, ' ')
}

/* ---------- Le parcours du visiteur ---------- */
async function parcours(page, echecs, avertissements) {
  const { w, d, appels, erreursJs } = await monter(page, echecs)
  if (echecs.length) return { erreursJs }

  const app = () => d.getElementById('app')
  const verifier = (condition, message) => { try { if (!condition()) echecs.push(message) } catch (e) { echecs.push(message + ' (' + String(e.message).slice(0, 80) + ')') } }

  // Accueil
  verifier(() => d.title.includes('Maison Test'), 'Le titre de l\'onglet doit porter le nom de la boutique.')
  verifier(() => texte(d).includes('Montre Aurore acier'), 'L\'accueil doit montrer des produits du catalogue (c.nouveautes) — « Montre Aurore acier » n\'apparaît pas.')
  verifier(() => app().querySelector('a[href="#/boutique"], a[href^="#/boutique"]'), 'L\'accueil doit proposer un lien vers la boutique complète (c.lien.boutique = "#/boutique").')
  verifier(() => app().querySelector('a[href^="#/c/"]'), 'L\'accueil doit lister les catégories du catalogue avec des liens c.lien.categorie(slug) (aucun lien #/c/… trouvé).')
  verifier(() => app().querySelector('a[href="#/panier"]'), 'Le cadre (en-tête) doit porter un lien vers le panier (c.lien.panier = "#/panier").')
  verifier(() => texte(d).includes('249,00 €'), 'Les prix s\'affichent avec c.prix(p.price) — « 249,00 € » n\'apparaît pas sur l\'accueil.')
  verifier(() => app().querySelector('img[src="https://cdn.test/aurore.jpg"]'), 'Les photos des produits s\'affichent via c.photo(produit) — la photo de « Montre Aurore acier » n\'est pas dans la page.')
  verifier(() => app().querySelector('h1'), 'L\'accueil doit porter un <h1> : l\'accroche du héros (c.boutique.accroche + accrocheSuite).')
  // Un .wrap qui reçoit width:100% d'une autre classe : le contenu colle au bord.
  verifier(() => !Array.from(app().querySelectorAll('.wrap')).some((el) => w.getComputedStyle(el).width === '100%'), 'Un élément .wrap reçoit width:100% (par une autre classe) : il perd ses marges et le texte colle au bord de l\'écran. Le conteneur centré garde sa largeur bornée ; mettre width:100% sur un enfant, pas sur .wrap.')
  if (OPTIONS.modes) {
    verifier(() => app().querySelectorAll('[data-mode]').length >= 3, 'Les modes visiteur ont été demandés : le cadre doit offrir au moins 3 boutons [data-mode="…"] (un sélecteur d\'ambiance dans l\'en-tête).')
    const premier = app().querySelector('[data-mode]')
    if (premier) {
      const mode = premier.getAttribute('data-mode')
      premier.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }))
      verifier(() => d.documentElement.getAttribute('data-theme') === mode, 'Un clic sur [data-mode] doit laisser le moteur poser data-theme sur <html> : ne pas intercepter ce clic.')
    }
  }
  if (OPTIONS.logo) {
    verifier(() => app().querySelector('header img[src="https://cdn.test/logo.png"], img[src="https://cdn.test/logo.png"]'), 'Le marchand a un logo d\'en-tête (c.boutique.logoEntete) : il doit être affiché dans l\'en-tête à la place ou à côté du nom.')
  }

  // Boutique
  await aller(w, '#/boutique')
  verifier(() => ['Montre Aurore acier', 'Montre Nuit noire', 'Écouteurs Onde'].every((t) => texte(d).includes(t)), 'L\'écran boutique doit lister TOUS les produits reçus ({ produits }).')
  await aller(w, '#/boutique?q=onde')
  verifier(() => texte(d).includes('Écouteurs Onde') && !texte(d).includes('Montre Aurore acier'), 'L\'écran boutique reçoit { produits, recherche } déjà filtrés : avec ?q=onde il ne doit montrer que « Écouteurs Onde ».')

  // Catégorie
  await aller(w, '#/c/montres')
  verifier(() => texte(d).includes('Montre Aurore acier') && texte(d).includes('Montre Nuit noire') && !texte(d).includes('Écouteurs Onde'), 'L\'écran catégorie reçoit la catégorie avec ses produits (categorie.produits) : « Montres » doit montrer les deux montres et pas les écouteurs.')
  verifier(() => texte(d).includes('Montres'), 'L\'écran catégorie doit afficher le nom de la catégorie (categorie.nom).')

  // Produit
  await aller(w, '#/p/p1')
  verifier(() => texte(d).includes('Montre Aurore acier') && texte(d).includes('249,00 €'), 'La fiche produit doit montrer le titre et le prix (c.prix(produit.price)).')
  verifier(() => texte(d).includes('Verre saphir') || texte(d).includes('40 mm') || texte(d).includes('verre saphir'), 'La fiche produit doit montrer la description, les points forts (produit.bulletPoints) ou les caractéristiques (produit.attributes).')
  const bouton = app().querySelector('[data-ajouter="p1"]')
  verifier(() => bouton, 'La fiche produit doit porter un bouton [data-ajouter="ID_DU_PRODUIT"] : c\'est lui que le moteur branche pour ajouter au panier.')
  if (bouton) {
    bouton.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }))
    await patienter(40)
    verifier(() => JSON.parse(w.localStorage.getItem('dropshop-panier-cle-test') || '[]').some((l) => l.productId === 'p1' && l.quantity === 1), 'Le clic sur [data-ajouter] n\'a pas ajouté le produit au panier : ne pas intercepter le clic (pas de preventDefault ni de stopPropagation sur ce bouton).')
    verifier(() => /\b1\b/.test(app().textContent), 'Après un ajout, le cadre doit afficher le nombre d\'articles du panier (c.panier.nombre).')
  }

  // Produit inconnu
  await aller(w, '#/p/inconnu')
  verifier(() => app().textContent.trim().length > 20 && !app().textContent.includes('problème d\'affichage'), 'L\'écran introuvable doit s\'afficher pour un produit inconnu, sans erreur.')

  // Panier
  await aller(w, '#/panier')
  verifier(() => texte(d).includes('Montre Aurore acier'), 'Le panier doit lister les lignes (c.panier.lignes : produit, quantite, total).')
  verifier(() => texte(d).includes('253,90 €') || (texte(d).includes('249,00 €') && texte(d).includes('4,90 €')), 'Le panier doit afficher le total port compris (c.panier.total = 253,90 € ici : 249 + 4,90 de port) ou le sous-total et le port.')
  verifier(() => app().querySelector('a[href="#/commande"], [href="#/commande"]'), 'Le panier doit mener à la commande (c.lien.commande = "#/commande").')
  verifier(() => app().querySelector('[data-retirer="p1"], [data-moins="p1"]'), 'Chaque ligne du panier doit permettre de retirer ou diminuer ([data-retirer="id"] ou [data-moins="id"]).')

  // Commande
  await aller(w, '#/commande')
  const form = app().querySelector('form[data-commande]')
  verifier(() => form, 'L\'écran commande doit contenir <form data-commande> avec les champs name, email, street, zip, city, phone.')
  if (form) {
    for (const champ of ['name', 'street', 'zip', 'city']) {
      verifier(() => form.querySelector('[name="' + champ + '"]'), 'Le formulaire de commande doit avoir un champ name="' + champ + '".')
    }
    verifier(() => form.querySelector('[name="email"]'), 'Le formulaire de commande doit avoir un champ name="email" (l\'acheteur reçoit sa confirmation).')
    verifier(() => form.querySelector('button[type="submit"], input[type="submit"], button:not([type])'), 'Le formulaire de commande doit avoir un bouton d\'envoi.')
    const poser = (n, v) => { const el = form.querySelector('[name="' + n + '"]'); if (el) el.value = v }
    poser('name', 'Alice Martin'); poser('email', 'alice@test.fr'); poser('street', '3 rue des Lilas'); poser('zip', '34000'); poser('city', 'Montpellier'); poser('phone', '0600000000')
    form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }))
    await patienter(80)
    const envoi = appels.find((a) => a.url.endsWith('/checkout'))
    verifier(() => envoi, 'L\'envoi du formulaire n\'a pas déclenché la commande : ne pas intercepter submit (pas de onsubmit, pas de preventDefault) — le moteur écoute <form data-commande>.')
    if (envoi) {
      const corps = JSON.parse(envoi.options.body)
      verifier(() => corps.buyer && corps.buyer.name === 'Alice Martin' && corps.buyer.zip === '34000' && corps.lignes && corps.lignes[0].productId === 'p1' && corps.lignes[0].quantity === 1, 'La commande envoyée ne porte pas les bonnes coordonnées ou lignes.')
      await attendre(() => w.location.hash === '#/merci', 1500)
      verifier(() => w.location.hash === '#/merci', 'Après la commande, le moteur mène à #/merci.')
      await patienter(40)
      verifier(() => app().textContent.trim().length > 20, 'L\'écran merci doit remercier l\'acheteur (c.merci.nombre articles).')
      verifier(() => JSON.parse(w.localStorage.getItem('dropshop-panier-cle-test') || '[]').length === 0, 'Après une commande sans paiement en ligne, le panier est vidé par le moteur.')
    }
  }

  return { erreursJs }
}

async function verifier(page) {
  const echecs = []
  const avertissements = []
  controlerStructure(page, echecs, avertissements)
  if (echecs.length) return { ok: false, echecs, avertissements }
  const { erreursJs } = await parcours(page, echecs, avertissements)
  erreursJs.filter((e) => !/Could not load|Not implemented|canvas|getContext/i.test(e)).forEach((e) => echecs.push('Erreur JavaScript pendant le parcours : ' + e))
  return { ok: echecs.length === 0, echecs, avertissements }
}

module.exports = { verifier, THEME, PRODUITS }

if (require.main === module) {
  const fichier = process.argv[2]
  if (!fichier) {
    console.error('usage : node dropshop/verifier.cjs <page.html>')
    process.exit(2)
  }
  const chien = setTimeout(() => {
    process.stdout.write(JSON.stringify({ ok: false, echecs: ['La page ne finit jamais de se charger (délai de 20 s dépassé) : boucle ou attente infinie dans le JavaScript.'], avertissements: [] }))
    process.exit(0)
  }, 20_000)
  verifier(fs.readFileSync(fichier, 'utf8'))
    .then((r) => { clearTimeout(chien); process.stdout.write(JSON.stringify(r)); process.exit(0) })
    .catch((e) => { clearTimeout(chien); process.stdout.write(JSON.stringify({ ok: false, echecs: ['Le banc a levé : ' + String(e && e.message).slice(0, 200)], avertissements: [] })); process.exit(0) })
}
