/**
 * Ce que la page affiche en grand est le sujet de la page.
 *
 *   cd backend && node check-taille-affichee.cjs
 *
 * **Le constat du vendeur, 03/09/2026 :** « comparatif ImageEye sur les mêmes
 * produits : il sélectionne bien les images produits en premier sans pollution
 * — bien meilleur que nous ».
 *
 * La raison tenait en un mot. Nous classions sur `naturalWidth`, c'est-à-dire
 * sur le **poids du fichier**. Sur Temu, la galerie, le panier et les
 * recommandations sont tous servis en 800 à 1200 px : ce critère ne les sépare
 * pas — il les mélange, et une recommandation servie en 1200 passe même devant
 * une photo de galerie servie en 800.
 *
 * Ce qui les sépare est ce que la page **en fait** : la galerie occupe 600 px
 * au milieu de l'écran, une carte de recommandation 200, une vignette de panier
 * 60. Un rapport de un à dix, sans un seul nom de classe.
 *
 * Ce banc monte une fiche où les trois populations ont **exactement le même
 * fichier source** — même hôte, même chemin, mêmes 1200 px naturels — et ne
 * diffèrent que par leur taille à l'écran. C'est le cas que l'ancien tri ne
 * pouvait pas trancher.
 */
const { JSDOM } = require('jsdom')
const fs = require('fs')
const path = require('path')

let echecs = 0
function verifier(nom, condition, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

const CDN = 'https://img.kwcdn.com/product/fancy'
const FICHE = 'https://www.temu.com/fr/bague-equerre-g-606271004607882.html'

/**
 * Une fiche où seule la taille d'affichage distingue les images.
 *
 * `data-affiche` porte le côté rendu : le bouchon de `getBoundingClientRect`
 * plus bas le lit. jsdom ne fait aucune mise en page, donc sans ce bouchon
 * chaque rectangle vaudrait zéro et le banc ne mesurerait rien.
 */
function pageTemu() {
  // La galerie : six photos affichées en grand, au milieu de la fiche.
  const galerie = [1, 2, 3, 4, 5, 6]
    .map((n) => `<img src="${CDN}/bague-${n}.jpg" data-affiche="600" width="1200" height="1200">`)
    .join('')

  // Les recommandations : mêmes fichiers de 1200 px, affichées en cartes de 200.
  // Sans lien autour d'elles, volontairement : la règle du lien ne doit pas
  // faire le travail à la place de celle qu'on éprouve ici.
  const recommandations = Array.from({ length: 20 }, (_, i) => i + 1)
    .map((n) => `<img src="${CDN}/voisin-${n}.jpg" data-affiche="200" width="1200" height="1200">`)
    .join('')

  // Le panier : une vignette de 60, dans un panneau ordinaire — même raison.
  const panier = `<img src="${CDN}/collier-boussole.jpg" data-affiche="60" width="1200" height="1200">`

  return `<!doctype html><html><head></head><body>
    <div id="galerie">${galerie}</div>
    <div id="recommandations">${recommandations}</div>
    <div id="panier">${panier}</div>
  </body></html>`
}

function monter() {
  const dom = new JSDOM(pageTemu(), { runScripts: 'dangerously', url: FICHE })
  const w = dom.window

  w.scrollTo = () => {}

  /*
   * jsdom ne met rien en page : sans ce bouchon, chaque rectangle vaut zéro et
   * la taille affichée serait « inconnue » partout — le banc passerait sans
   * rien éprouver. Le côté vient de `data-affiche`.
   */
  w.Element.prototype.getBoundingClientRect = function () {
    const cote = Number(this.getAttribute?.('data-affiche') ?? 0)
    return { width: cote, height: cote, top: 0, left: 0, right: cote, bottom: cote, x: 0, y: 0 }
  }

  /*
   * Toutes les images répondent à la mesure avec la MÊME taille naturelle.
   * C'est le cœur du banc : l'ancien critère est aveugle ici, par construction.
   */
  class FausseImage {
    constructor() {
      this.naturalWidth = 0
      this.naturalHeight = 0
      this.onload = null
      this.onerror = null
    }
    set src(valeur) {
      if (!valeur) return
      setTimeout(() => {
        this.naturalWidth = 1200
        this.naturalHeight = 1200
        this.onload?.()
      }, 0)
    }
    get src() {
      return ''
    }
  }
  w.Image = FausseImage

  for (const fichier of ['image-scan.js', 'adapters.js', 'photo-preselect.js', 'capture.js']) {
    const chemin = path.join(__dirname, 'extension', 'content', fichier)
    if (!fs.existsSync(chemin)) continue
    const script = w.document.createElement('script')
    script.textContent = fs.readFileSync(chemin, 'utf8')
    w.document.head.appendChild(script)
  }

  return w
}

async function main() {
  console.log('\nTrois populations, un seul fichier source, trois tailles à l’écran')

  const w = monter()
  const releve = await w.__dspCollecterImages()
  const produits = (releve.produits ?? []).map((i) => i.url)
  const certaines = (releve.certaines ?? []).map((i) => i.url)

  const galerieEnTete = produits.slice(0, 6).filter((u) => /bague-\d\.jpg/.test(u)).length
  verifier(
    'les six photos de la galerie occupent les six premières places',
    galerieEnTete === 6,
    `${galerieEnTete}/6 — première : ${(produits[0] ?? 'aucune').split('/').pop()}`,
  )

  verifier(
    'la vignette de panier ne remonte pas',
    !produits.slice(0, 10).some((u) => u.includes('collier-boussole')),
    'affichée en 60 px pour un fichier de 1200',
  )

  /*
   * Le lot n'a personne pour relire : sa liste doit être stricte là où le
   * sélecteur peut se permettre d'être large.
   */
  console.log('\nCe que le lot importerait')
  verifier(
    'aucune recommandation parmi les certaines',
    !certaines.some((u) => u.includes('/voisin-')),
    `${certaines.filter((u) => u.includes('/voisin-')).length} sur ${certaines.length}`,
  )
  verifier(
    'aucune vignette de panier parmi les certaines',
    !certaines.some((u) => u.includes('collier-boussole')),
  )
  verifier(
    'et la galerie y est entière',
    certaines.filter((u) => /bague-\d\.jpg/.test(u)).length === 6,
    `${certaines.length} certaine(s)`,
  )

  console.log('\nLe dépliage des galeries repliées')
  const w2 = monter()
  const d = w2.document
  let deplie = 0
  d.body.insertAdjacentHTML(
    'beforeend',
    `<button id="plus" data-affiche="40">Voir plus</button>
     <button id="avis" data-affiche="40">Voir plus d'avis</button>
     <button id="acheter" data-affiche="40">Acheter maintenant</button>
     <a href="/autre"><button id="lien" data-affiche="40">Voir plus</button></a>`,
  )
  for (const id of ['plus', 'avis', 'acheter', 'lien']) {
    d.getElementById(id).addEventListener('click', () => {
      deplie++
      d.getElementById(id).setAttribute('data-clique', 'oui')
    })
  }
  w2.dspDeplierGaleries()

  verifier('« Voir plus » est déplié', d.getElementById('plus').getAttribute('data-clique') === 'oui')
  verifier(
    '« Voir plus d’avis » ne l’est pas',
    d.getElementById('avis').getAttribute('data-clique') === null,
    'les avis n’ajoutent que du bruit',
  )
  verifier(
    '« Acheter maintenant » ne l’est jamais',
    d.getElementById('acheter').getAttribute('data-clique') === null,
    'la règle du projet : on ne clique pas ce qui engage',
  )
  verifier(
    'un « voir plus » qui est un lien ne l’est pas non plus',
    d.getElementById('lien').getAttribute('data-clique') === null,
    'il quitterait la fiche',
  )

  console.log(echecs ? `\n${echecs} échec(s).` : '\nTout passe.')
  process.exit(echecs ? 1 : 0)
}

/*
 * Un banc qui meurt en silence est pire qu'un banc absent.
 *
 * Sans ce `catch`, une fonction non exposée faisait lever `main()` au milieu :
 * les assertions déjà passées s'affichaient, les suivantes disparaissaient, et
 * la sortie ressemblait à un banc qui aurait fini. Troisième fois que ce projet
 * y perd du temps.
 */
main().catch((err) => {
  console.log(`\nRATE  le banc s'est interrompu — ${err?.message ?? err}`)
  process.exit(1)
})
