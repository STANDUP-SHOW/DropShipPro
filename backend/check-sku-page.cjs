/**
 * Le relevé des variantes AliExpress, sur une page bâtie comme la vraie.
 *
 *   cd backend && node check-sku-page.cjs
 *
 * **Ce banc a été refait après une lecture faite dans le navigateur**, sur
 * `fr.aliexpress.com/item/1005012232149510.html`, le 02/09/2026. Il éprouvait
 * jusque-là une page inventée, et il passait — pendant que le relevé rendait
 * zéro combinaison sur toutes les vraies fiches. Un banc qui décrit ce qu'on
 * imagine ne protège de rien.
 *
 * Trois choses que la page réelle a démenties :
 *
 * 1. **La clé React est `__reactInternalInstance$…`** (React 16). Le relevé ne
 *    cherchait que `__reactFiber$` et `__reactProps$` (React 18). La racine
 *    `#root`, elle, porte encore un troisième nom : `__reactContainere$…`.
 * 2. **Les données ne sont pas atteignables depuis la racine.** Il faut partir
 *    d'un nœud du bloc des variantes et **remonter** onze niveaux de `return`.
 *    Descendre depuis la racine traverse des centaines de fibres sans jamais
 *    croiser la bonne.
 * 3. **Le script doit tourner dans le monde de la page.** Un script de contenu
 *    partage le DOM, pas le tas JavaScript : les propriétés React lui sont
 *    invisibles. D'où le pont par évènement, que ce banc éprouve aussi.
 */
const { JSDOM } = require('jsdom')
const fs = require('fs')
const path = require('path')

const SOURCE = path.join(__dirname, 'extension', 'content', 'aliexpress-sku.js')

let echecs = 0
function verifier(nom, condition, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

/** Les deux modules, dans la forme exacte relevée sur la fiche réelle. */
function modulesReels() {
  return {
    SKU: {
      skuPaths: [
        {
          path: '14:771;200007763:201336104',
          skuAttr: '14:771;200007763:201336104',
          skuIdStr: '12000057817555615',
          skuId: 12000057817555616,
          skuStock: 100,
          salable: true,
        },
      ],
      skuProperties: [
        {
          skuPropertyId: 14,
          skuPropertyName: 'Color',
          skuPropertyValues: [
            { propertyValueIdLong: 771, propertyValueDisplayName: 'Beige' },
          ],
        },
      ],
    },
    PRICE: { skuIdStrPriceInfoMap: { '12000057817555615': { salePriceLocal: '67,39€|67|39' } } },
    // Le reste de la page, que le relevé doit laisser derrière lui.
    RECOMMEND_PC: { items: Array.from({ length: 40 }, (_, i) => ({ id: i })) },
    DESC: { html: 'x'.repeat(5000) },
  }
}

/**
 * Une fiche AliExpress reconstituée : le bloc des variantes, et onze niveaux de
 * fibres au-dessus de lui avant celle qui porte `props.data`.
 *
 * La profondeur n'est pas décorative : elle est ce qui distingue un relevé qui
 * remonte d'un relevé qui abandonne au bout de trois niveaux.
 */
function pageAliExpress({ avecPiege = false, cleReact = '__reactInternalInstance$fy0g9k8f1f' } = {}) {
  const dom = new JSDOM(
    '<div id="root"><div class="sku--wrap--xgoW06M"><div class="sku-item--box--Lrl6ZXB"></div></div></div>',
    { runScripts: 'dangerously', url: 'https://fr.aliexpress.com/item/1005012232149510.html' },
  )
  const w = dom.window

  // La fibre qui porte les données, et dix intermédiaires en dessous d'elle.
  const porteuse = { memoizedProps: { data: modulesReels() }, return: null }
  let courante = porteuse
  for (let i = 0; i < 11; i++) courante = { memoizedProps: {}, return: courante }

  const noeud = w.document.querySelector('.sku--wrap--xgoW06M')
  Object.defineProperty(noeud, cleReact, { value: courante, enumerable: true })

  if (avecPiege) {
    // Une iframe d'une autre origine : l'énumérer est permis, la lire lève.
    Object.defineProperty(w, 'sku', {
      enumerable: true,
      get() {
        throw new Error("Blocked a frame. Failed to read a named property 'sku' from 'Window'")
      },
    })
  }

  const script = w.document.createElement('script')
  script.textContent = fs.readFileSync(SOURCE, 'utf8')
  w.document.head.appendChild(script)
  return w
}

/** Le chemin réel : on demande par évènement, on lit la réponse en JSON. */
function demanderParEvenement(w) {
  return new Promise((resolve) => {
    w.addEventListener('dsp-sku-reponse', (e) => {
      try {
        resolve(e.detail ? JSON.parse(e.detail) : null)
      } catch {
        resolve(null)
      }
    })
    w.dispatchEvent(new w.CustomEvent('dsp-sku-demande'))
    setTimeout(() => resolve(undefined), 500)
  })
}

;(async () => {
  // --- La page réelle, par le pont d'évènements -----------------------------
  console.log('\nUne fiche AliExpress, par le pont entre les deux mondes')
  {
    const w = pageAliExpress()
    const r = await demanderParEvenement(w)
    verifier('le relevé répond', r !== undefined && r !== null)
    verifier('les combinaisons sont là', Array.isArray(r?.SKU?.skuPaths) && r.SKU.skuPaths.length === 1)
    verifier('les prix aussi', !!r?.PRICE?.skuIdStrPriceInfoMap)
    verifier(
      'la clé de jointure est skuIdStr',
      Object.keys(r?.PRICE?.skuIdStrPriceInfoMap ?? {})[0] === '12000057817555615',
    )
    /*
     * Le reste de la page ne part pas.
     *
     * `props.data` porte vingt autres blocs — recommandations, description,
     * vendeur. Vingt-cinq produits d'un lot en feraient plusieurs mégaoctets
     * pour trois champs utiles.
     */
    verifier(
      'le reste de la page est laissé sur place',
      !('RECOMMEND_PC' in (r ?? {})) && !('DESC' in (r ?? {})),
      Object.keys(r ?? {}).join(', '),
    )
  }

  // --- Les autres noms de clé React ----------------------------------------
  console.log('\nLes autres noms que React a portés')
  for (const cle of ['__reactFiber$abc', '__reactProps$abc', '__reactEventHandlers$abc']) {
    const w = pageAliExpress({ cleReact: cle })
    const r = w.__dspReleverSkuAliExpress()
    verifier(`${cle.split('$')[0]} est reconnu`, !!r?.SKU?.skuPaths)
  }

  // --- L'iframe qui lève ----------------------------------------------------
  console.log("\nUne iframe d'une autre origine sur la page")
  {
    const w = pageAliExpress({ avecPiege: true })
    const r = w.__dspReleverSkuAliExpress()
    verifier('le relevé aboutit quand même', !!r?.SKU?.skuPaths)
  }

  // --- Ailleurs qu'AliExpress ----------------------------------------------
  console.log("\nUn site qui n'est pas AliExpress")
  {
    const w = new JSDOM('<div id="root"></div>', {
      runScripts: 'dangerously',
      url: 'https://exemple.fr/produit',
    }).window
    const script = w.document.createElement('script')
    script.textContent = fs.readFileSync(SOURCE, 'utf8')
    w.document.head.appendChild(script)
    verifier('rien de relevé, et null plutôt qu’un objet vide', w.__dspReleverSkuAliExpress() === null)
  }

  console.log(echecs ? `\n${echecs} échec(s).` : '\nTout passe.')
  process.exit(echecs ? 1 : 0)
})()
