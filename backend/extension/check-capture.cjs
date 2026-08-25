/**
 * Éprouve collectDescription, collectPageText et collectVariants sur une page
 * de montre bâtie comme le sont les vraies : accroche courte en og:description,
 * caractéristiques dans un tableau plus bas, tailles dans un select et couleurs
 * en pastilles.
 *
 * Le but est de vérifier que « bracelet acier inoxydable » et « 22 rubis »
 * arrivent jusqu'au serveur — c'est exactement ce qui disparaissait.
 */
const fs = require('fs')
const vm = require('vm')
const { JSDOM } = require('jsdom')

const HTML = `<!doctype html><html><head>
<meta property="og:title" content="Montre automatique homme">
<meta property="og:description" content="Une montre elegante pour toutes les occasions. Livraison rapide.">
<meta property="og:image" content="https://cdn.exemple.fr/product/montre-face.jpg">
<script type="application/ld+json">{"@type":"Product","name":"Montre automatique homme","image":["https://cdn.exemple.fr/product/montre-face.jpg","https://cdn.exemple.fr/product/montre-profil.jpg"]}</script>
</head><body>
<header><img src="https://cdn.exemple.fr/product/banniere-soldes-ete.jpg" alt="Soldes"></header>
<nav><img src="https://cdn.exemple.fr/product/menu-promo.jpg" alt="Promo"></nav>
<main>
  <div class="gallery">
    <img src="https://cdn.exemple.fr/product/montre-face.jpg" alt="">
    <img src="https://cdn.exemple.fr/product/montre-profil.jpg" alt="">
  </div>
  <h1>Montre automatique homme</h1>
  <div class="price">129,90 €</div>

  <div class="sku-selector">
    <div class="sku-title">Couleur</div>
    <ul>
      <li role="option" aria-label="Noir">Noir</li>
      <li role="option" aria-label="Argent">Argent</li>
      <li role="option" aria-label="Or rose">Or rose</li>
    </ul>
  </div>

  <label for="taille">Taille du bracelet</label>
  <select id="taille" name="taille">
    <option>Choisir une taille</option>
    <option>18 mm</option>
    <option>20 mm</option>
    <option>22 mm</option>
  </select>

  <div class="product-description">
    Montre mecanique a remontage automatique, concue pour un port quotidien.
    Le boitier est protege par un verre mineral durci et la lunette tourne dans un seul sens.
    Elle convient aussi bien au bureau qu aux activites de plein air, et se porte sans crainte sous la pluie.
  </div>

  <table class="specs">
    <tr><td>Mouvement</td><td>Automatique 22 rubis</td></tr>
    <tr><td>Bracelet</td><td>Acier inoxydable 316L</td></tr>
    <tr><td>Etancheite</td><td>10 ATM</td></tr>
    <tr><td>Diametre du boitier</td><td>42 mm</td></tr>
    <tr><td>Reserve de marche</td><td>40 heures</td></tr>
  </table>

  <div class="reviews">${'Tres bon produit, conforme a la description. '.repeat(200)}</div>
</main>
<footer><img src="https://cdn.exemple.fr/product/logo-pied.jpg" alt=""></footer>
</body></html>`

const dom = new JSDOM(HTML)

/*
 * jsdom n'implémente pas innerText — il rend undefined, et tout le relevé
 * ressortait vide. Le navigateur, lui, l'implémente : c'est le banc d'essai
 * qui manquait, pas le code. On l'approxime par textContent, en gardant un
 * retour à la ligne par bloc pour que les tableaux restent lisibles.
 */
Object.defineProperty(dom.window.HTMLElement.prototype, 'innerText', {
  get() {
    const blocs = ['DIV', 'P', 'LI', 'TR', 'TD', 'TH', 'DT', 'DD', 'SECTION', 'H1', 'H2', 'H3']
    const lire = (noeud) => {
      let out = ''
      for (const enfant of noeud.childNodes) {
        if (enfant.nodeType === 3) out += enfant.textContent
        else if (enfant.nodeType === 1) {
          const texte = lire(enfant)
          out += blocs.includes(enfant.tagName) ? `\n${texte.trim()}\n` : texte
        }
      }
      return out
    }
    return lire(this).replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim()
  },
})

global.window = dom.window
global.document = dom.window.document
global.CSS = dom.window.CSS ?? { escape: (s) => s }
global.location = dom.window.location
global.getComputedStyle = dom.window.getComputedStyle
global.MutationObserver = dom.window.MutationObserver
global.Image = dom.window.Image

// Les trois fonctions sont extraites du fichier livré : tester une copie
// testerait un code qui ne tourne pas.
const source =
  fs.readFileSync('C:/Users/maxma/Downloads/DropPost/backend/extension/content/capture.js', 'utf8') +
  '\n' +
  fs.readFileSync('C:/Users/maxma/Downloads/DropPost/backend/extension/content/image-scan.js', 'utf8')
const morceaux = []
for (const nom of ['collectPageText', 'collectDescription', 'collectVariants', 'dspDeclaredImages', 'dspChromeImages']) {
  /*
   * Les deux indentations, parce que les deux existent : capture.js met tout
   * dans une IIFE indentée de deux espaces, image-scan.js n'indente pas.
   * Chercher une seule forme faisait échouer l'extraction avec « introuvable »
   * sur une fonction qui était bel et bien là.
   */
  const indente = source.indexOf(`  function ${nom}(`)
  const brut = source.indexOf(`\nfunction ${nom}(`)
  const debut = indente !== -1 ? indente : brut + 1
  if (indente === -1 && brut === -1) throw new Error(`${nom} introuvable`)

  // Jusqu'à l'accolade fermante de même indentation que la déclaration.
  const fermeture = indente !== -1 ? '\n  }\n' : '\n}\n'
  const fin = source.indexOf(fermeture, debut)
  morceaux.push(source.slice(debut, fin + fermeture.length))
}

const constantes = source.match(/const GROUPE_OPTIONS =[\s\S]*?const ETIQUETTE = '[^']*'/)[0]
/*
 * `location` et `getComputedStyle` comptent autant que `document`.
 *
 * dspAbsoluteUrl résout chaque adresse contre `location.href` : sans lui, la
 * référence lève, le try/catch l'avale, et la fonction rend une liste vide —
 * un échec silencieux qui ressemble à un défaut du code testé.
 */
const contexte = {
  document,
  window,
  location: dom.window.location,
  getComputedStyle: dom.window.getComputedStyle,
  CSS: global.CSS,
  console,
  /*
   * `URL` est un global de Node, pas une primitive du langage : un contexte vm
   * neuf ne l'a pas. Sans lui, `new URL(...)` lève ReferenceError, le try/catch
   * de dspAbsoluteUrl l'avale, et chaque relevé rend une liste vide — le code
   * testé passait pour fautif alors qu'il est parfaitement correct dans un
   * navigateur. Même famille de défaut que « NOT_A_PHOTO is not defined » :
   * un nom absent, masqué par un catch.
   */
  URL,
  URLSearchParams,
}
vm.createContext(contexte)
/*
 * dspDeclaredImages et dspChromeImages s'appuient sur deux aides d'image-scan.js
 * — l'une rend une adresse absolue, l'autre relève toutes les sources d'un
 * élément. Elles sont reprises telles quelles plutôt que réécrites : une copie
 * éprouverait un code qui ne tourne pas.
 */
const aides = ['dspAbsoluteUrl', 'dspWidestFromSrcset', 'dspUrlsFromCss', 'dspSourcesOfElement']
  .map((nom) => {
    const debut = source.indexOf(`\nfunction ${nom}(`)
    if (debut === -1) throw new Error(`${nom} introuvable`)
    const fin = source.indexOf('\n}\n', debut)
    return source.slice(debut + 1, fin + 3)
  })
  .join('\n')

const constantesScan = ['DSP_IMAGE_ATTRS', 'DSP_IMAGE_EXT']
  .map((nom) => {
    const debut = source.indexOf(`const ${nom} =`)
    if (debut === -1) throw new Error(`${nom} introuvable`)
    // Jusqu'à la ligne vide qui suit la déclaration.
    const fin = source.indexOf('\n\n', debut)
    return source.slice(debut, fin)
  })
  .join('\n')

vm.runInContext(
  `${constantes}\n${constantesScan}\n${aides}\n${morceaux.join('\n')}\n` +
    'globalThis.__t = { collectPageText, collectDescription, collectVariants, dspDeclaredImages, dspChromeImages }',
  contexte,
)

const { collectPageText, collectDescription, collectVariants } = contexte.__t

let echecs = 0
const exige = (nom, condition, detail) => {
  if (!condition) {
    echecs++
    console.log(`ECHEC ${nom} : ${detail}`)
  }
}

const description = collectDescription()
exige(
  'description',
  description.length > 200 && /remontage automatique/i.test(description),
  `la vraie description n'a pas ete prise (${description.length} car.) : « ${description.slice(0, 80)} »`,
)
exige(
  'description',
  !/Livraison rapide/.test(description),
  "l'accroche og:description a ete prise alors qu'un vrai bloc existait",
)

const texte = collectPageText()
for (const attendu of ['22 rubis', 'Acier inoxydable 316L', '10 ATM', '42 mm', '40 heures']) {
  exige('pageText', texte.includes(attendu), `« ${attendu} » absent du texte envoye au serveur`)
}
exige('pageText', texte.startsWith('CARACTÉRISTIQUES'), 'le tableau n a pas ete remonte en tete')

const variantes = collectVariants() || {}
exige('variantes', Object.keys(variantes).length >= 2, `groupes trouves : ${JSON.stringify(variantes)}`)
exige('variantes', (variantes['Couleur'] || []).length === 3, `couleurs : ${JSON.stringify(variantes['Couleur'])}`)
const taille = variantes['Taille du bracelet'] || variantes['taille'] || []
exige('variantes', taille.length === 3, `tailles : ${JSON.stringify(taille)}`)
exige(
  'variantes',
  !taille.some((v) => /choisir/i.test(v)),
  'le libelle « Choisir une taille » a ete pris pour une taille',
)

const declarees = contexte.__t.dspDeclaredImages()
const mobilier = contexte.__t.dspChromeImages()

exige(
  'declarees',
  declarees.length === 2 && declarees.every((u) => /montre-(face|profil)/.test(u)),
  `declarees : ${JSON.stringify(declarees)}`,
)
for (const attendu of ['banniere-soldes-ete', 'menu-promo', 'logo-pied']) {
  exige('mobilier', mobilier.some((u) => u.includes(attendu)), `${attendu} n'est pas reconnu comme mobilier`)
}
exige(
  'mobilier',
  !mobilier.some((u) => /montre-(face|profil)/.test(u)),
  'une photo du produit a ete classee dans le mobilier',
)

console.log(`declarees   : ${declarees.length}`)
console.log(`mobilier    : ${mobilier.length}`)
console.log(`\ndescription : ${description.length} caracteres`)
console.log(`pageText    : ${texte.length} caracteres`)
console.log(`variantes   : ${JSON.stringify(variantes)}`)
console.log(echecs === 0 ? '\nTout passe.' : `\n${echecs} echec(s).`)
process.exit(echecs === 0 ? 0 : 1)
