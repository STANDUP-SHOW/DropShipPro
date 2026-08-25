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
</head><body><main>
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
</main></body></html>`

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
const source = fs.readFileSync(
  'C:/Users/maxma/Downloads/DropPost/backend/extension/content/capture.js',
  'utf8',
)
const morceaux = []
for (const nom of ['collectPageText', 'collectDescription', 'collectVariants']) {
  const debut = source.indexOf(`  function ${nom}(`)
  if (debut === -1) throw new Error(`${nom} introuvable`)
  // Jusqu'à l'accolade fermante de même indentation.
  const fin = source.indexOf('\n  }\n', debut)
  morceaux.push(source.slice(debut, fin + 4))
}

const constantes = source.match(/const GROUPE_OPTIONS =[\s\S]*?const ETIQUETTE = '[^']*'/)[0]
const contexte = { document, window, CSS: global.CSS, console }
vm.createContext(contexte)
vm.runInContext(`${constantes}\n${morceaux.join('\n')}\nglobalThis.__t = { collectPageText, collectDescription, collectVariants }`, contexte)

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

console.log(`\ndescription : ${description.length} caracteres`)
console.log(`pageText    : ${texte.length} caracteres`)
console.log(`variantes   : ${JSON.stringify(variantes)}`)
console.log(echecs === 0 ? '\nTout passe.' : `\n${echecs} echec(s).`)
process.exit(echecs === 0 ? 0 : 1)
