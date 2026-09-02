/**
 * Le relevé des variantes AliExpress, dans une page hostile.
 *
 *   cd backend && node check-sku-page.cjs
 *
 * **Pourquoi ce banc existe.** Le 02/09/2026, un import a échoué sur
 * « Blocked a frame … Failed to read a named property 'sku' from 'Window' ».
 * La cause n'était pas dans la lecture des variantes : `Object.keys(window)`
 * énumère aussi les iframes de la page, sous le `name` qu'elles se donnent, et
 * AliExpress en charge plusieurs pour sa publicité. Les énumérer est permis,
 * les lire lève. Une iframe publicitaire faisait donc perdre l'import entier.
 *
 * Le banc reconstitue les deux pièges d'un coup : une propriété de `window` qui
 * lève à la lecture, et un objet d'état légitime **placé après elle** dans
 * l'énumération — c'est ce dernier point qui compte, puisqu'un scan qui
 * s'arrête à la première erreur ne l'atteindrait jamais.
 */
const { JSDOM } = require('jsdom')
const fs = require('fs')
const path = require('path')

const SOURCE = path.join(__dirname, 'extension', 'content', 'aliexpress-sku.js')

/*
 * Le script est injecté par une balise `<script>`, pas par `eval`.
 *
 * `window.eval()` de jsdom évalue hors du contexte de la fenêtre : le script y
 * trouve `window` indéfini et échoue pour une raison qui n'existe pas dans
 * Chrome. Une balise ajoutée au document le fait tourner comme un vrai script
 * de contenu.
 */
function injecter(w, code) {
  const script = w.document.createElement('script')
  script.textContent = code
  w.document.head.appendChild(script)
}

function pageAliExpress({ avecPiege }) {
  const dom = new JSDOM('<div id="root"></div>', {
    url: 'https://fr.aliexpress.com/item/1.html',
    runScripts: 'dangerously',
  })
  const w = dom.window

  if (avecPiege) {
    Object.defineProperty(w, 'sku', {
      enumerable: true,
      get() {
        throw new Error(
          "Blocked a frame with origin. Failed to read a named property 'sku' from 'Window'",
        )
      },
    })
    // Une fenêtre de même origine : lisible, mais sans rapport avec la fiche.
    w.frameAmi = w
  }

  w.runParams = {
    data: {
      SKU: { skuPaths: '14:29;5:100014064', skuProperties: [{ skuPropertyId: 14 }] },
      PRICE: { skuIdStrPriceInfoMap: { '12000': { skuVal: {} } } },
    },
  }

  injecter(w, fs.readFileSync(SOURCE, 'utf8'))
  return w
}

let echecs = 0
function verifier(nom, condition) {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}`)
  if (!condition) echecs++
}

// 1. Une page saine : les deux modules remontent.
const saine = pageAliExpress({ avecPiege: false }).__dspReleverSkuAliExpress()
verifier('page saine : les modules SKU et PRICE remontent', !!saine?.SKU && !!saine?.PRICE)

// 2. La même page, avec l'iframe qui lève : le relevé aboutit quand même.
const hostile = pageAliExpress({ avecPiege: true }).__dspReleverSkuAliExpress()
verifier("iframe cross-origin : le relevé aboutit malgré l'erreur", !!hostile?.SKU)
verifier('iframe cross-origin : le prix est là aussi', !!hostile?.PRICE)

// 3. Une page qui n'est pas AliExpress : `null`, et non un objet vide. L'appelant
//    doit pouvoir distinguer « pas une fiche » de « une fiche sans options ».
const ailleurs = new JSDOM('<div id="root"></div>', {
  url: 'https://exemple.fr/produit',
  runScripts: 'dangerously',
}).window
injecter(ailleurs, fs.readFileSync(SOURCE, 'utf8'))
verifier('autre site : rien de relevé', ailleurs.__dspReleverSkuAliExpress() === null)

console.log(echecs ? `\n${echecs} échec(s).` : '\nTout passe.')
process.exit(echecs ? 1 : 0)
