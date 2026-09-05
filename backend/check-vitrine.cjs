/**
 * Ce que la vitrine générique affiche réellement, écran par écran.
 *
 *   cd backend && node check-vitrine.cjs
 *
 * **Pourquoi ce banc existe.** La vitrine a été refondue le 07/09/2026 sur le
 * modèle d'oguss.fr : accueil avec héro et catégories créées depuis le flux,
 * fiche produit, panier, commande envoyée à l'API. Elle vit derrière `/b/<slug>`
 * et ne se voit qu'en production — exactement le genre de page où trois
 * allers-retours corrigent trois manques qu'un regard aurait montrés d'un coup
 * (leçon du popup, `check-popup.cjs`).
 *
 * Le banc monte la page avec un faux `fetch` qui sert un thème et trois
 * produits, puis décrit des **attentes de visiteur** : « je vois le nom de la
 * boutique et son accroche », « les catégories viennent du catalogue », « le
 * panier compte juste, port compris », « ma commande part avec la bonne forme
 * et la bonne adresse ». Le contrat de la commande est écrit EN DUR ici, pas
 * relu depuis le schéma zod — un faux qui recopie le code validerait ses fautes
 * (leçon du banc Kaufland).
 */
const { JSDOM } = require('jsdom')
const fs = require('fs')
const path = require('path')

const PAGE = fs.readFileSync(path.join(__dirname, 'storefront-boutique', 'index.html'), 'utf8')

let echecs = 0
function verifier(nom, condition, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}
function verifierSansLever(nom, calcul, detail = '') {
  try {
    verifier(nom, calcul(), detail)
  } catch (e) {
    verifier(nom, false, `la page ne le porte pas (${e.message.slice(0, 70)})`)
  }
}
const patienter = (ms) => new Promise((r) => setTimeout(r, ms))
async function attendre(condition, delaiMs = 1500) {
  const debut = Date.now()
  while (Date.now() - debut < delaiMs) {
    try {
      if (condition()) return true
    } catch (e) {
      /* pas encore monté */
    }
    await patienter(10)
  }
  return false
}

/* ---------- Ce que le faux serveur répond ---------- */

const THEME = {
  theme: 'comptoir',
  // Les 16 jetons, comme resoudre() les sert : le mode « Boutique » les pose
  // tous en variables --m-* et c'est lui qui rend le thème marchand visible.
  jetons: {
    primary: '#e11d48', onPrimary: '#ffffff', secondary: '#1f2937', onSecondary: '#ffffff',
    accent: '#f59e0b', onAccent: '#1c1917', background: '#fdf8f3', foreground: '#231a12',
    card: '#ffffff', cardForeground: '#231a12', muted: '#f3e8dc', mutedForeground: '#7a6a58',
    border: '#e5d5c5', destructive: '#dc2626', onDestructive: '#ffffff', ring: '#e11d48',
  },
  polices: { titre: 'Fraunces', texte: 'Inter', familles: ['Fraunces', 'Inter'] },
  contenu: {
    accroche: 'La robotique française',
    accrocheSuite: 'livrée chez vous',
    sousTitre: 'Des robots choisis un par un par nos soins.',
    annonce: 'Livraison offerte dès 79 €',
    fraisPort: 4.9,
    portOffertDes: 79,
  },
  boutique: { nom: 'France ROBOTIQUE', logo: null },
  css: ':root{}',
}

// Le titre du premier produit contient une balise : une vitrine qui l'exécute
// exécuterait le HTML de n'importe quelle fiche importée d'un site tiers.
const PRODUITS = {
  shop: { name: 'France ROBOTIQUE' },
  count: 3,
  products: [
    {
      id: 'p1',
      title: 'Rover X1 <script>window.PIEGE=1</script>',
      price: 249,
      currency: 'EUR',
      images: ['https://api.test/storage/x1.jpg', 'https://api.test/storage/x1-b.jpg'],
      category: 'High-tech > Robots',
      description: 'Un rover tout-terrain.',
      bulletPoints: ['Autonomie 2 heures', 'Caméra embarquée'],
      attributes: { Marque: 'Rover', Poids: '2 kg' },
    },
    { id: 'p2', title: 'AGIBOT X2', price: 59.9, currency: 'EUR', images: [], category: 'High-tech > Robots', bulletPoints: [], attributes: {} },
    { id: 'p3', title: 'Unitree R1', price: 18, currency: 'EUR', images: ['/storage/r1.jpg'], category: 'Jouets > Drones', bulletPoints: [], attributes: {} },
  ],
}

/* ---------- Montage ---------- */

async function ouvrirVitrine({ surCommande, api = 'https://api.test', panne = false } = {}) {
  const appels = []
  const dom = new JSDOM(PAGE, {
    runScripts: 'dangerously',
    url: 'https://api.test/b/france-robotique',
    beforeParse(w) {
      w.BOUTIQUE = { api, shopKey: 'cle-test' }
      w.scrollTo = () => {}
      w.fetch = (url, options = {}) => {
        appels.push({ url: String(url), options })
        if (panne) return Promise.reject(new Error('injoignable'))
        const reponds = (status, corps) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(corps) })
        if (String(url).includes('/theme')) return reponds(200, THEME)
        if (String(url).endsWith('/products')) return reponds(200, PRODUITS)
        if (String(url).endsWith('/orders')) {
          const commande = surCommande ? surCommande(url, options) : { status: 201, corps: { ok: true, commandes: 1 } }
          return reponds(commande.status, commande.corps)
        }
        return Promise.reject(new Error('adresse inattendue : ' + url))
      }
    },
  })
  const w = dom.window
  if (!panne) await attendre(() => w.document.title === 'France ROBOTIQUE')
  else await attendre(() => w.document.getElementById('page').textContent.includes('indisponible'))
  return { w, d: w.document, appels }
}

async function aller(w, hash) {
  w.location.hash = hash
  // jsdom livre hashchange en tâche : on attend que la page ait re-rendu.
  await patienter(30)
}

/* ---------- Les attentes ---------- */

async function main() {
  console.log('— Accueil —')
  const { w, d } = await ouvrirVitrine()
  verifierSansLever('le nom de la boutique est dans l\'onglet et l\'enseigne', () =>
    d.title === 'France ROBOTIQUE' && d.getElementById('enseigne').textContent.includes('France ROBOTIQUE'))
  verifierSansLever('l\'accroche du thème fait le titre du héro', () =>
    d.querySelector('.hero h1').textContent.includes('La robotique française') &&
    d.querySelector('.hero h1').textContent.includes('livrée chez vous'))
  verifierSansLever('le sous-titre du thème est sous le héro', () =>
    d.querySelector('.hero').textContent.includes('choisis un par un par nos soins'))
  verifierSansLever('le bandeau d\'annonce du marchand est affiché', () => {
    const a = d.getElementById('annonce')
    return !a.hidden && a.textContent.includes('offerte dès 79')
  })
  verifierSansLever('les chiffres disent 3 produits et 2 catégories', () => {
    const t = d.querySelector('.chiffres').textContent
    return t.includes('3') && t.includes('2') && t.includes('produits en ligne')
  })
  verifierSansLever('les catégories viennent du flux, trait d\'union gardé', () => {
    const cats = Array.from(d.querySelectorAll('.carte-cat b')).map((b) => b.textContent)
    return cats.includes('High-tech') && cats.includes('Jouets')
  })
  verifierSansLever('les nouveautés montrent les produits avec prix en euros', () => {
    const cartes = d.querySelectorAll('.grille .carte')
    return cartes.length === 3 && d.querySelector('.grille').textContent.includes('249,00 €')
  })
  verifierSansLever('l\'accent du marchand teinte la page', () =>
    d.documentElement.style.getPropertyValue('--accent') === '#e11d48')
  verifierSansLever('les polices du thème sont demandées à Google', () => {
    const lien = d.querySelector('link[href*="fonts.googleapis.com"]')
    return lien && lien.href.includes('Fraunces') && lien.href.includes('Inter')
  })
  verifierSansLever('un titre venu d\'un site tiers ne s\'exécute jamais', () =>
    w.PIEGE === undefined && !d.getElementById('page').querySelector('script'))

  console.log('— Modes visiteur —')
  verifierSansLever('le défaut est le thème du marchand, jetons posés en --m-*', () =>
    d.documentElement.getAttribute('data-theme') === 'boutique' &&
    d.documentElement.style.getPropertyValue('--m-background') === '#fdf8f3' &&
    d.documentElement.style.getPropertyValue('--m-muted-foreground') === '#7a6a58')
  verifierSansLever('les cinq modes sont proposés, Boutique en tête', () => {
    const boutons = Array.from(d.querySelectorAll('#modes button')).map((b) => b.getAttribute('data-mode'))
    return boutons.join(',') === 'boutique,noir,clair,gradient,colorful'
  })
  for (const mode of ['clair', 'gradient', 'colorful', 'noir', 'boutique']) {
    const bouton = d.querySelector(`#modes button[data-mode="${mode}"]`)
    bouton.click()
    verifier(`le mode ${mode} s'applique et se retient`, d.documentElement.getAttribute('data-theme') === mode && w.localStorage.getItem('vitrine-mode') === mode)
  }

  console.log('— Fiche produit —')
  await aller(w, '#/p/p1')
  verifierSansLever('le titre, le prix et le rayon sont là', () => {
    const t = d.getElementById('page').textContent
    return t.includes('Rover X1') && t.includes('249,00 €') && t.includes('High-tech')
  })
  verifierSansLever('les arguments et les caractéristiques sont affichés', () => {
    const t = d.getElementById('page').textContent
    return t.includes('Autonomie 2 heures') && t.includes('Marque') && t.includes('2 kg')
  })
  verifierSansLever('le port offert dès 79 € est annoncé sur la fiche', () =>
    d.getElementById('page').textContent.includes('offerte dès 79,00 €'))
  d.getElementById('plus').click()
  d.getElementById('plus').click()
  d.getElementById('ajouter').click()
  verifierSansLever('« Ajouter » met 3 exemplaires au panier de cette boutique', () => {
    const panier = JSON.parse(w.localStorage.getItem('vitrine-panier-cle-test'))
    return panier.length === 1 && panier[0].productId === 'p1' && panier[0].quantity === 3 &&
      d.getElementById('compte-panier').textContent === '3'
  })

  console.log('— Panier —')
  await aller(w, '#/panier')
  verifierSansLever('la ligne, le sous-total et le port offert sont justes', () => {
    const t = d.getElementById('page').textContent
    // 3 × 249 = 747 ≥ 79 : la livraison est offerte.
    return t.includes('Rover X1') && t.includes('747,00 €') && t.includes('Offerte')
  })

  // Une seconde vitrine, panier vierge : sous le seuil, le port s'ajoute.
  const petit = await ouvrirVitrine()
  await aller(petit.w, '#/p/p3')
  petit.d.getElementById('ajouter').click()
  await aller(petit.w, '#/panier')
  verifierSansLever('sous 79 €, le port de 4,90 € s\'ajoute au total', () => {
    const t = petit.d.getElementById('page').textContent
    return t.includes('4,90 €') && t.includes('22,90 €')
  })

  console.log('— Commande —')
  let recu = null
  const achat = await ouvrirVitrine({
    surCommande: (url, options) => {
      recu = { url, corps: JSON.parse(options.body), contentType: (options.headers || {})['Content-Type'] }
      return { status: 201, corps: { ok: true, commandes: 1 } }
    },
  })
  await aller(achat.w, '#/p/p3')
  achat.d.getElementById('plus').click()
  achat.d.getElementById('ajouter').click()
  await aller(achat.w, '#/panier')
  const form = achat.d.getElementById('form-commande')
  const poser = (nom, valeur) => { form.querySelector(`[name="${nom}"]`).value = valeur }
  poser('name', 'Jean Testeur')
  poser('street', '12 rue des Bancs')
  poser('zip', '34000')
  poser('city', 'Montpellier')
  poser('email', 'jean@test.fr')
  form.dispatchEvent(new achat.w.Event('submit', { bubbles: true, cancelable: true }))
  await attendre(() => achat.w.location.hash.startsWith('#/merci'))
  verifierSansLever('la commande part à la bonne adresse en JSON', () =>
    recu && recu.url === 'https://api.test/api/public/shops/cle-test/orders' && recu.contentType === 'application/json')
  verifierSansLever('le corps porte l\'acheteur complet et les lignes', () => {
    // Le contrat de POST /shops/:shopKey/orders, écrit en dur : buyer
    // {name, street, zip, city, email?} et lignes [{productId, quantity}].
    const b = recu.corps.buyer
    return b.name === 'Jean Testeur' && b.street === '12 rue des Bancs' && b.zip === '34000' &&
      b.city === 'Montpellier' && b.email === 'jean@test.fr' &&
      recu.corps.lignes.length === 1 && recu.corps.lignes[0].productId === 'p3' && recu.corps.lignes[0].quantity === 2
  })
  verifierSansLever('après commande : merci affiché et panier vidé', () =>
    achat.d.getElementById('page').textContent.includes('Merci pour votre commande') &&
    JSON.parse(achat.w.localStorage.getItem('vitrine-panier-cle-test')).length === 0 &&
    achat.d.getElementById('compte-panier').textContent === '0')

  const refus = await ouvrirVitrine({
    surCommande: () => ({ status: 400, corps: { error: 'Un produit du panier n\'est plus disponible' } }),
  })
  await aller(refus.w, '#/p/p2')
  refus.d.getElementById('ajouter').click()
  await aller(refus.w, '#/panier')
  const formRefus = refus.d.getElementById('form-commande')
  ;['name', 'street', 'zip', 'city'].forEach((n, i) => { formRefus.querySelector(`[name="${n}"]`).value = ['Jean Testeur', '1 rue A', '34000', 'Sète'][i] })
  formRefus.dispatchEvent(new refus.w.Event('submit', { bubbles: true, cancelable: true }))
  await attendre(() => !refus.d.getElementById('erreur-commande').hidden)
  verifierSansLever('un refus du serveur est expliqué, pas avalé', () => {
    const e = refus.d.getElementById('erreur-commande')
    return !e.hidden && e.textContent.includes('plus disponible') && !refus.d.getElementById('commander').disabled &&
      JSON.parse(refus.w.localStorage.getItem('vitrine-panier-cle-test')).length === 1
  })

  console.log('— Panne —')
  const panne = await ouvrirVitrine({ panne: true })
  verifierSansLever('une API injoignable donne un message, pas une page figée', () =>
    panne.d.getElementById('page').textContent.includes('momentanément indisponible'))

  console.log('')
  if (echecs) {
    console.log(`${echecs} attente(s) non tenue(s).`)
    process.exitCode = 1
  } else {
    console.log('La vitrine tient toutes les attentes du visiteur.')
  }
}

main().catch((e) => {
  console.error('Le banc lui-même a levé :', e)
  process.exitCode = 1
})
