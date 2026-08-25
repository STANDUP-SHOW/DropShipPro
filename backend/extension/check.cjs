/**
 * Contrôle de l'extension avant livraison.
 *
 * Deux passes, parce que la première ne suffit pas et que ça s'est vu :
 *
 * 1. La syntaxe. Un `await` dans un callback non-async avait empêché Chrome de
 *    charger toute l'extension.
 * 2. Les constantes utilisées mais jamais définies. `NOT_A_PHOTO` a été écrit à
 *    trois endroits de capture.js sans l'être nulle part : la syntaxe était
 *    parfaite, Chrome chargeait l'extension, et chaque import levait
 *    « NOT_A_PHOTO is not defined » à l'étape des images. Le défaut a vécu
 *    plusieurs jours, diagnostiqué comme une lenteur de machine.
 *
 * `node extension/check.cjs` depuis backend/. Silencieux quand tout va bien,
 * sortie non nulle sinon — utilisable tel quel dans un enchaînement.
 */

const fs = require('fs')
const path = require('path')
const vm = require('vm')

const root = __dirname

/** Tout le JavaScript livré, où qu'il soit rangé. */
function jsFiles() {
  const out = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      // Les scripts d'outillage ne partent pas dans le paquet.
      else if (entry.name.endsWith('.js')) out.push(full)
    }
  }
  walk(root)
  return out.sort()
}

/**
 * Le code, sans ses commentaires ni ses chaînes.
 *
 * Sans ça, « DOM », « CDN » ou « CSS » écrits dans un commentaire français
 * passent pour des constantes manquantes, et le contrôle crie à chaque fois
 * pour rien — un contrôle qu'on apprend à ignorer ne sert à rien.
 *
 * Un seul passage, avec une pile, parce que trois `replace` enchaînés se
 * trompent de deux façons vérifiées ici : un `/*` écrit dans un gabarit de
 * chaîne avalait la moitié du fichier, et un gabarit imbriqué dans un `${…}`
 * inversait la parité des délimiteurs — à partir de là, le contrôle lisait les
 * chaînes comme du code et le code comme des chaînes.
 */
function stripNoise(source) {
  let out = ''
  let i = 0

  /** Le dernier caractère de code lu : il dit si un « / » ouvre une division ou une regex. */
  let previous = ''

  /**
   * Où l'on se trouve. Le sommet dit comment lire le caractère courant.
   *
   * `code` peut être le corps du fichier ou l'intérieur d'un `${…}` ; dans ce
   * second cas `substitution` est vrai et `depth` compte les accolades, pour
   * savoir laquelle referme la substitution et laquelle un objet littéral.
   */
  const stack = [{ mode: 'code', substitution: false, depth: 0 }]

  const keep = (text) => {
    out += text
    const trimmed = text.trimEnd()
    if (trimmed) previous = trimmed[trimmed.length - 1]
  }

  /** Efface le contenu avalé, en gardant les retours à la ligne. */
  const blank = (from, to) => {
    out += source.slice(from, to).replace(/[^\n]/g, ' ')
  }

  while (i < source.length) {
    const top = stack[stack.length - 1]
    const c = source[i]
    const next = source[i + 1]

    if (top.mode === 'template') {
      if (c === '\\') {
        blank(i, i + 2)
        i += 2
        continue
      }
      if (c === '`') {
        blank(i, i + 1)
        stack.pop()
        previous = '`'
        i++
        continue
      }
      if (c === '$' && next === '{') {
        blank(i, i + 2)
        stack.push({ mode: 'code', substitution: true, depth: 0 })
        i += 2
        continue
      }
      blank(i, i + 1)
      i++
      continue
    }

    if (c === '/' && next === '/') {
      const end = source.indexOf('\n', i)
      const stop = end === -1 ? source.length : end
      blank(i, stop)
      i = stop
      continue
    }

    if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2)
      const stop = end === -1 ? source.length : end + 2
      blank(i, stop)
      i = stop
      continue
    }

    if (c === '`') {
      blank(i, i + 1)
      stack.push({ mode: 'template' })
      i++
      continue
    }

    if (c === "'" || c === '"') {
      let j = i + 1
      while (j < source.length) {
        if (source[j] === '\\') j += 2
        else if (source[j] === c) break
        else j++
      }
      blank(i, Math.min(j + 1, source.length))
      previous = c
      i = j + 1
      continue
    }

    // Un « / » ouvre une expression régulière quand ce qui précède ne peut pas
    // terminer une valeur : après « = », « ( », « , », « return »…
    if (c === '/' && !/[\w$)\]]/.test(previous)) {
      let j = i + 1
      let inClass = false
      while (j < source.length && source[j] !== '\n') {
        if (source[j] === '\\') j += 2
        else if (source[j] === '[') (inClass = true), j++
        else if (source[j] === ']') (inClass = false), j++
        else if (source[j] === '/' && !inClass) break
        else j++
      }
      if (source[j] === '/') {
        while (/[a-z]/.test(source[j + 1] ?? '')) j++
        blank(i, j + 1)
        previous = '/'
        i = j + 1
        continue
      }
    }

    if (top.substitution) {
      if (c === '{') top.depth++
      else if (c === '}') {
        if (top.depth === 0) {
          blank(i, i + 1)
          stack.pop()
          i++
          continue
        }
        top.depth--
      }
    }

    keep(c)
    i++
  }

  return out
}

/** Noms en majuscules fournis par le navigateur ou par Chrome. */
const GLOBALS = new Set([
  'URL',
  'JSON',
  'Math',
  'Date',
  'Promise',
  'Image',
  'Set',
  'Map',
  'Array',
  'Object',
  'Number',
  'String',
  'Boolean',
  'RegExp',
  'Error',
  'Infinity',
  'NaN',
  'DOMParser',
  'FormData',
  'FileReader',
  'XMLHttpRequest',
  'MutationObserver',
  'IntersectionObserver',
  'AbortController',
  'TextEncoder',
  'TextDecoder',
  'URLSearchParams',
  'Node',
  'NodeFilter',
  'Element',
  'HTMLElement',
  'KeyboardEvent',
  'MouseEvent',
  'Event',
  'CustomEvent',
  'Blob',
  'File',
  'CSS',
  'DOMRect',
  'JSON',
  'WebSocket',
  'Notification',
])

/**
 * Les constantes lues sans avoir été déclarées dans le même fichier.
 *
 * On ne regarde que les noms tout en majuscules : ce sont les constantes de
 * module, celles qu'on oublie de définir en déplaçant du code. Les variables
 * ordinaires demanderaient une analyse de portée, hors de proportion ici.
 */
function undefinedConstants(source) {
  const code = stripNoise(source)

  const declared = new Set()
  for (const m of code.matchAll(/(?:const|let|var|function|class)\s+([A-Z][A-Z0-9_]{2,})\b/g)) {
    declared.add(m[1])
  }
  // Une constante peut aussi arriver par import ou par déstructuration.
  for (const m of code.matchAll(/(?:import|\{|,)\s*([A-Z][A-Z0-9_]{2,})\s*(?:,|\}|from)/g)) {
    declared.add(m[1])
  }

  const missing = new Set()
  for (const m of code.matchAll(/(?<![.\w$])([A-Z][A-Z0-9_]{2,})\b/g)) {
    const name = m[1]
    if (declared.has(name) || GLOBALS.has(name)) continue
    // Une clé d'objet ou une valeur de chaîne n'est pas une lecture de variable.
    const after = code.slice(m.index + name.length, m.index + name.length + 2)
    if (/^\s*:/.test(after)) continue
    missing.add(name)
  }

  return [...missing]
}

// Requis comme module, le fichier n'expose que ses outils : c'est ce qui permet
// de mettre le découpage lui-même à l'épreuve, sans relancer tout le contrôle.
if (require.main !== module) {
  module.exports = { stripNoise, undefinedConstants, jsFiles }
  return
}

let problemes = 0

for (const file of jsFiles()) {
  const relative = path.relative(root, file).replace(/\\/g, '/')
  const source = fs.readFileSync(file, 'utf8')

  try {
    new vm.Script(source, { filename: relative })
  } catch (err) {
    console.log(`SYNTAXE  ${relative} : ${err.message}`)
    problemes++
    continue
  }

  for (const name of undefinedConstants(source)) {
    console.log(`CONSTANTE ${relative} : ${name} est utilisé mais jamais défini`)
    problemes++
  }
}

/**
 * Troisième passe : les deux filtres qui décident des photos proposées.
 *
 * Une expression régulière compile aussi bien quand elle est fausse, et
 * celles-ci se relisent mal. On les extrait du fichier livré — jamais une copie,
 * qui testerait une regex qui n'est pas celle qui tourne — et on les confronte à
 * des adresses réelles.
 */
function checkPhotoFilters() {
  const source = fs.readFileSync(path.join(root, 'content', 'capture.js'), 'utf8')
  const grab = (name) => {
    const m = source.match(new RegExp('const ' + name + '\\s*=\\s*\\n?\\s*(/.+/i)'))
    if (!m) throw new Error(`${name} introuvable dans content/capture.js`)
    return eval(m[1])
  }

  const NOT_A_PHOTO = grab('NOT_A_PHOTO')
  const OFF_TOPIC = grab('OFF_TOPIC')

  const photos = [
    'https://ae01.alicdn.com/kf/S1234abcd/robe-ete-femme.jpg',
    'https://img.kwcdn.com/product/fancy/8f3a-4c21.jpeg',
    'https://cdn.shopify.com/s/files/1/0512/products/chaise_800x800.jpg',
    'https://img.joybuy.com/n1/jfs/t1/2345/item/manteau.avif',
    'https://static.banggood.com/images/oaupload/banggood/images/AA/BB/lampe.webp',
    'https://m.media-amazon.com/images/I/71QwertyL._AC_SL1500_.jpg',
    'https://cdn.site.com/upload-images/produit-vue-3.jpg',
    'https://cdn.site.com/download-center/notice-produit.png',
    'https://ae01.alicdn.com/kf/H9876/sac_1000x1000.jpg',
    'https://cdn.site.com/media/catalog/product/150x150/vue.jpg',
  ]

  const mobilier = [
    'https://site.com/assets/icons/cart.svg',
    'https://site.com/static/ui/logo-header.png',
    'https://site.com/img/sprite-nav.png',
    'https://site.com/i/avatar-default.jpg',
    'https://site.com/px/pixel.gif',
    'https://analytics.site.com/1x1.png',
    'https://site.com/flags/fr.svg',
    'https://cdn.site.com/product/thumb_50x50.jpg',
    'https://cdn.site.com/loading-spinner.gif',
    'https://site.com/banner-soldes-ete.jpg',
  ]

  const horsSujet = [
    'https://cdn.site.com/recommend/produit-voisin.jpg',
    'https://cdn.site.com/also-bought/article.jpg',
    'https://cdn.site.com/recently-viewed/vue.jpg',
    'https://cdn.site.com/cross-sell/lot.jpg',
    'https://cdn.site.com/ads/campagne-ete.jpg',
    'https://cdn.site.com/sponsor/marque.jpg',
  ]

  let echecs = 0
  const attendre = (etiquette, url, attendu, obtenu) => {
    if (attendu === obtenu) return
    console.log(`FILTRE   ${etiquette} : ${url} → ${obtenu}, attendu ${attendu}`)
    echecs++
  }

  // Une photo de produit ne doit jamais être écartée, ni même pénalisée.
  for (const url of photos) {
    attendre('NOT_A_PHOTO', url, false, NOT_A_PHOTO.test(url))
    attendre('OFF_TOPIC', url, false, OFF_TOPIC.test(url))
  }
  // Le mobilier de la page est écarté d'office.
  for (const url of mobilier) attendre('NOT_A_PHOTO', url, true, NOT_A_PHOTO.test(url))
  // Les photos hors sujet sont pénalisées, jamais exclues : un fournisseur peut
  // ranger sa galerie sous « /recommend/ » sans arrière-pensée.
  for (const url of horsSujet) {
    attendre('OFF_TOPIC', url, true, OFF_TOPIC.test(url))
    attendre('NOT_A_PHOTO', url, false, NOT_A_PHOTO.test(url))
  }

  return echecs
}

problemes += checkPhotoFilters()

if (problemes) {
  console.log(`\n${problemes} problème(s). L'extension n'est pas livrable en l'état.`)
  process.exit(1)
}

console.log('Extension : syntaxe, constantes et filtres de photos vérifiés.')
