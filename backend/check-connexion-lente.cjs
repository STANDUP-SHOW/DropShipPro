/**
 * Ce que devient le relevé de photos quand la ligne est lente.
 *
 *   cd backend && node check-connexion-lente.cjs
 *
 * **La question du vendeur, le 03/09/2026 :** « un problème de connexion lente
 * qui a du mal à afficher les images du produit peut-il influer ? »
 *
 * Oui, et le mécanisme est mécanique, pas aléatoire — c'est ce qui le rend
 * grave. Le tri mesure chaque candidat en le chargeant par le réseau, et
 * abandonne à cinq secondes. Or les deux populations ne sont pas à égalité
 * devant ce chronomètre :
 *
 * — une **photo de galerie** fait 800 à 1 200 px et n'a jamais été demandée
 *   avant cette page : sur une ligne lente, elle expire ;
 * — une **vignette de panier** fait 100 à 300 px **et se trouve déjà dans le
 *   cache du navigateur**, puisque le panier est affiché sur toutes les fiches
 *   du site : elle répond instantanément.
 *
 * La lenteur ne brouille donc pas le classement au hasard. Elle **élimine les
 * vraies photos et conserve le mobilier** — exactement le contraire de ce qu'on
 * veut, et exactement ce que le vendeur constatait.
 *
 * Ce banc rejoue cette course avec un faux `Image` : la galerie ne répond
 * jamais, le panier répond tout de suite. Il vérifie que ce que l'adaptateur a
 * désigné survit à l'échec de sa mesure — on le sait par la structure de la
 * page, et ce savoir ne doit pas dépendre du débit.
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
 * Une fiche Temu telle qu'elle se présente sur une ligne lente.
 *
 * La galerie est dans le DOM — les balises existent — mais aucune n'a fini de
 * charger, donc `naturalWidth` vaut zéro et le tri doit passer par le réseau.
 * Le panier, lui, est déjà affiché : le navigateur connaît ses dimensions.
 */
function pageLente() {
  const galerie = [1, 2, 3, 4, 5, 6]
    .map((n) => `<img src="${CDN}/bague-${n}.jpg">`)
    .join('')

  const panier = `<div id="panier" style="position: fixed; right: 0">
    <img src="${CDN}/collier-boussole.jpg" width="300" height="300">
  </div>`

  return `<!doctype html><html><head></head><body>
    <div id="galerie">${galerie}</div>
    ${panier}
  </body></html>`
}

/**
 * Le faux `Image`, qui rejoue la course perdue d'avance.
 *
 * Les adresses de `lentes` n'appellent jamais `onload` : c'est l'expiration à
 * cinq secondes du vrai code. Les autres répondent au tour de boucle suivant,
 * comme une image déjà en cache.
 */
function poserFauxImage(w, { lentes, tailles }) {
  class FausseImage {
    constructor() {
      this._src = ''
      this.naturalWidth = 0
      this.naturalHeight = 0
      this.onload = null
      this.onerror = null
    }
    set src(valeur) {
      this._src = valeur
      if (!valeur) return
      if (lentes.some((m) => valeur.includes(m))) return // jamais de réponse
      const taille = tailles[Object.keys(tailles).find((k) => valeur.includes(k))] ?? { w: 800, h: 800 }
      setTimeout(() => {
        this.naturalWidth = taille.w
        this.naturalHeight = taille.h
        this.onload?.()
      }, 0)
    }
    get src() {
      return this._src
    }
  }
  w.Image = FausseImage
}

function monter() {
  const dom = new JSDOM(pageLente(), { runScripts: 'dangerously', url: FICHE })
  const w = dom.window

  // jsdom ne défile pas ; sans ce bouchon la révélation des images différées lève.
  w.scrollTo = () => {}

  poserFauxImage(w, {
    // La galerie n'arrive jamais : c'est toute la question posée.
    lentes: ['/bague-'],
    tailles: { 'collier-boussole': { w: 300, h: 300 } },
  })

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
  console.log('\nUne fiche dont la galerie n’a pas fini de charger')

  const w = monter()
  verifier('la capture est accessible au banc', typeof w.__dspCollecterImages === 'function')
  if (typeof w.__dspCollecterImages !== 'function') {
    console.log('\n1 échec(s).')
    process.exit(1)
  }

  const releve = await w.__dspCollecterImages()
  const produits = (releve.produits ?? []).map((i) => i.url)
  const certaines = (releve.certaines ?? []).map((i) => i.url)

  /*
   * Le cœur du banc. Avant la correction, `produits` ne contenait que les
   * images réellement mesurées : le panier, et lui seul. Les six photos de la
   * fiche, non mesurables, étaient reléguées dans la bande dépliable — que
   * l'import en lot ne déplie jamais.
   */
  verifier(
    'les photos de la galerie survivent à l’échec de leur mesure',
    produits.filter((u) => /bague-\d\.jpg/.test(u)).length === 6,
    `${produits.filter((u) => /bague-/.test(u)).length} photo(s) de la fiche retenue(s)`,
  )
  verifier(
    'et elles passent devant le panier, qui a répondu le premier',
    /bague-/.test(produits[0] ?? ''),
    `première : ${(produits[0] ?? 'aucune').slice(-30)}`,
  )
  verifier(
    'le panier reste écarté malgré son avantage de vitesse',
    !produits.some((u) => u.includes('collier-boussole')),
    'une réponse rapide n’est pas une preuve de pertinence',
  )
  verifier(
    'l’adaptateur les tient toujours pour sûres',
    certaines.filter((u) => /bague-\d\.jpg/.test(u)).length === 6,
    `${certaines.length} certaine(s) — c’est ce que le lot importe`,
  )

  console.log('\nCe que le code en dit')
  const source = fs.readFileSync(path.join(__dirname, 'extension', 'content', 'capture.js'), 'utf8')
  verifier(
    'les désignées non mesurées sont rattrapées',
    /const rattrapees = nonMesurees\.filter\(\(m\) => designees\.has/.test(source),
  )
  const scan = fs.readFileSync(path.join(__dirname, 'extension', 'content', 'image-scan.js'), 'utf8')
  verifier(
    'et le relevé attend que la page cesse d’ajouter des images',
    /const compter = \(\) => document\.querySelectorAll/.test(scan) && /Date\.now\(\) \+ 4000/.test(scan),
  )

  console.log(echecs ? `\n${echecs} échec(s).` : '\nTout passe.')
  process.exit(echecs ? 1 : 0)
}

main()
