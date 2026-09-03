/**
 * Generic image discovery for any product page.
 *
 * Scanning `<img>` tags alone finds a fraction of a gallery: shops hide the real
 * URL in a data-* attribute, paint swatches with a CSS background, keep the full
 * gallery in an inline JSON blob, or render nothing until the element approaches
 * the viewport. This module looks in all of those places, with generic heuristics
 * only — no per-site selector, so it behaves the same on Banggood, Temu,
 * AliExpress or a plain Shopify shop.
 *
 * Two deliberate departures from the usual "download every image" extensions:
 *
 * - `data:`, `blob:` and serialised `<svg>`/`<canvas>` sources are skipped. Our
 *   server downloads each picture by URL to watermark it, and it cannot fetch an
 *   address that only exists inside the visitor's tab. Collecting them would only
 *   fill the picker with entries that fail on import.
 * - Page state objects are read from the text of `<script>` tags, never from
 *   `window.__NEXT_DATA__` and friends. A content script runs in an isolated
 *   world where those variables simply do not exist; reading them would silently
 *   return nothing.
 */


/*
 * Wrapped like capture.js: Chrome can inject the same content script twice into
 * one page (registration plus an explicit injection), and top-level `const`
 * declarations then throw "Identifier has already been declared", which takes
 * down the whole script. The IIFE keeps them private, and the guard makes a
 * second injection a no-op instead of an error.
 */
if (typeof self.dspScanPageImages !== 'function') {
  ;(() => {
/** Attributes shops use to carry the real URL while `src` holds a placeholder. */
const DSP_IMAGE_ATTRS = [
  'data-src',
  'data-original',
  'data-lazy',
  'data-lazy-src',
  'data-bg',
  'data-background',
  'data-background-image',
  'data-img',
  'data-image',
  'data-url',
  'data-href',
  'data-thumb',
  'data-zoom-image',
  'data-large-image',
]

/** Safety rails: a huge page must not freeze the tab or flood the picker. */
const DSP_SCAN_LIMITS = { elements: 6000, urls: 1200, millis: 10000, scriptMillis: 5000 }

const DSP_IMAGE_EXT = /\.(?:jpe?g|png|webp|avif|gif|bmp)(?:[?#]|$)/i

/** Absolute URL, or null when the value cannot be fetched by our server. */
function dspAbsoluteUrl(value) {
  if (!value || typeof value !== 'string') return null
  const raw = value.trim().replace(/^["']|["']$/g, '')
  if (!raw || raw.startsWith('data:') || raw.startsWith('blob:') || raw.startsWith('#')) return null

  try {
    // Resolves relative ("/img/a.jpg") and protocol-relative ("//cdn/a.jpg") forms,
    // which a plain startsWith('http') test throws away.
    const url = new URL(raw, location.href)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

/**
 * Widest candidate of a srcset.
 *
 * Handles both descriptor forms: `w` (width in pixels) and `x` (pixel density).
 * Without this the first entry wins, which is usually the smallest.
 */
function dspWidestFromSrcset(srcset) {
  if (!srcset) return null

  const candidates = srcset
    .split(',')
    .map((part) => {
      const [url, descriptor = ''] = part.trim().split(/\s+/)
      const width = /^(\d+(?:\.\d+)?)w$/.exec(descriptor)
      const density = /^(\d+(?:\.\d+)?)x$/.exec(descriptor)
      // Density is turned into a comparable weight so both forms sort together.
      const weight = width ? Number(width[1]) : density ? Number(density[1]) * 1000 : 1
      return { url, weight }
    })
    .filter((c) => c.url)
    .sort((a, b) => b.weight - a.weight)

  return candidates[0]?.url ?? null
}

/** Every url(...) inside a CSS value — a background can declare several layers. */
function dspUrlsFromCss(value) {
  if (!value || value === 'none') return []
  return [...value.matchAll(/url\((['"]?)([^'")]+)\1\)/g)].map((m) => m[2])
}

/** Collects from one element, whatever kind of element it is. */
function dspSourcesOfElement(el, push) {
  const tag = el.tagName

  if (tag === 'IMG') {
    push(dspWidestFromSrcset(el.getAttribute('srcset') || el.getAttribute('data-srcset')))
    // currentSrc is what the browser actually picked, which can differ from src.
    push(el.currentSrc)
    push(el.getAttribute('src'))
  } else if (tag === 'SOURCE') {
    push(dspWidestFromSrcset(el.getAttribute('srcset')))
    push(el.getAttribute('src'))
  } else if (tag === 'VIDEO') {
    push(el.getAttribute('poster'))
  }

  for (const attr of DSP_IMAGE_ATTRS) {
    const value = el.getAttribute?.(attr)
    if (value) {
      // Some shops put a whole srcset in a data attribute.
      push(value.includes(',') && /\s\d+[wx]/.test(value) ? dspWidestFromSrcset(value) : value)
    }
  }

  // Inline style first — it is free to read. The computed style is what catches
  // backgrounds declared in an external stylesheet, and is the expensive part.
  for (const url of dspUrlsFromCss(el.style?.backgroundImage)) push(url)

  const computed = getComputedStyle(el)
  for (const url of dspUrlsFromCss(computed.backgroundImage)) push(url)
  for (const pseudo of ['::before', '::after']) {
    for (const url of dspUrlsFromCss(getComputedStyle(el, pseudo).content)) push(url)
  }
}

/** Walks a document or shadow root, following open shadow roots and same-origin iframes. */
function dspWalkRoot(root, push, state) {
  let elements
  try {
    elements = root.querySelectorAll('*')
  } catch {
    return
  }

  for (const el of elements) {
    if (state.scanned++ > DSP_SCAN_LIMITS.elements) return
    if (Date.now() > state.deadline) return

    try {
      dspSourcesOfElement(el, push)
    } catch {
      // A single hostile element must not abort the whole scan.
    }

    // Only open shadow roots are readable; a closed one is invisible to everyone.
    if (el.shadowRoot) dspWalkRoot(el.shadowRoot, push, state)

    if (el.tagName === 'IFRAME') {
      try {
        const doc = el.contentDocument
        if (doc) dspWalkRoot(doc, push, state)
      } catch {
        // Cross-origin frame: unreadable by design.
      }
    }
  }
}

/** Pulls image URLs out of a parsed JSON value, wherever they sit in the tree. */
function dspUrlsFromJson(value, out, depth = 0) {
  if (!value || depth > 8 || out.length > DSP_SCAN_LIMITS.urls) return

  if (typeof value === 'string') {
    if (DSP_IMAGE_EXT.test(value) || /^https?:\/\/[^\s"']+\/[^\s"']*image/i.test(value)) out.push(value)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) dspUrlsFromJson(item, out, depth + 1)
    return
  }
  if (typeof value === 'object') {
    for (const item of Object.values(value)) dspUrlsFromJson(item, out, depth + 1)
  }
}

/**
 * The gallery as the page's own data describes it.
 *
 * On sites where the carousel swaps a single <img>, this is the only place the
 * other shots exist. Read from script text rather than from window: a content
 * script cannot see the page's global variables.
 */
function dspImagesFromScripts(deadline = Infinity) {
  const out = []

  for (const script of document.querySelectorAll('script')) {
    // Same rail as the DOM walk: a page whose bundles weigh several megabytes
    // must not hold the import while the regex chews through them.
    if (Date.now() > deadline) break
    const type = (script.getAttribute('type') || '').toLowerCase()
    const text = script.textContent
    if (!text || text.length > 4_000_000) continue

    if (type.includes('ld+json') || type.includes('json')) {
      try {
        dspUrlsFromJson(JSON.parse(text), out)
        continue
      } catch {
        // Malformed JSON-LD is common; fall through to the regex below.
      }
    }

    if (!/image|img|photo|gallery|\.jpe?g|\.png|\.webp/i.test(text)) continue

    // Escaped slashes are how framework payloads embed URLs.
    const unescaped = text.replace(/\\u002F/gi, '/').replace(/\\\//g, '/')
    for (const match of unescaped.matchAll(/https?:\/\/[^\s"'\\<>]+?\.(?:jpe?g|png|webp|avif)/gi)) {
      out.push(match[0])
      if (out.length > DSP_SCAN_LIMITS.urls) return out
    }
  }

  return out
}

/**
 * Nudges the page into loading what it defers.
 *
 * Two mechanisms at once: scrolling triggers the IntersectionObserver most lazy
 * loaders rely on, and a MutationObserver picks up the nodes that arrive while
 * we are scrolling, which a single snapshot afterwards would miss.
 */
async function dspRevealLazyImages(onUrl) {
  const start = window.scrollY
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue
        try {
          dspSourcesOfElement(node, onUrl)
          for (const child of node.querySelectorAll?.('img, source, video, [style*="background"]') ?? []) {
            dspSourcesOfElement(child, onUrl)
          }
        } catch {
          // Ignore: this is a best-effort supplement to the main scan.
        }
      }
      if (record.type === 'attributes' && record.target.nodeType === 1) {
        try {
          dspSourcesOfElement(record.target, onUrl)
        } catch {
          // Same.
        }
      }
    }
  })

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src', 'srcset', 'style', ...DSP_IMAGE_ATTRS],
  })

  const height = document.body?.scrollHeight ?? 0
  for (const ratio of [0.15, 0.35, 0.6, 0.85]) {
    window.scrollTo({ top: Math.round(height * ratio), behavior: 'instant' })
    await new Promise((r) => setTimeout(r, 220))
  }
  window.scrollTo({ top: start, behavior: 'instant' })
  await new Promise((r) => setTimeout(r, 250))

  observer.disconnect()
}

/**
 * Every image URL the page exposes, absolute and deduplicated.
 *
 * Returns raw candidates: filtering by real size, ordering and picking is the
 * caller's job — capture.js measures them and shows the picker.
 */
async function dspScanPageImages() {
  const found = new Set()
  const state = { scanned: 0, deadline: Date.now() + DSP_SCAN_LIMITS.millis }

  const push = (value) => {
    if (found.size >= DSP_SCAN_LIMITS.urls) return
    const url = dspAbsoluteUrl(value)
    if (url) found.add(url)
  }

  // Lazy content first, with the observer catching what appears meanwhile.
  await dspRevealLazyImages(push)

  dspWalkRoot(document, push, state)
  // A budget of its own: the gallery of a JavaScript-built page often exists
  // nowhere but in these blobs, so an exhausted DOM budget must not skip it.
  for (const url of dspImagesFromScripts(Date.now() + DSP_SCAN_LIMITS.scriptMillis)) push(url)

  /*
   * Ce que le tri a besoin de savoir, et qu'un simple lot d'adresses ne dit pas.
   *
   * Le relevé du serveur avait déjà ces deux signaux ; l'extension, non — et
   * c'est elle qui travaille sur Temu et AliExpress. Deux relevés qui divergent
   * finissent par se tromper différemment, ce qui est pire qu'un seul défaut.
   *
   * — ce que le marchand DÉCLARE comme photo du produit (og:image, JSON-LD) :
   *   le seul signal certain de toute la page ;
   * — ce qui appartient au MOBILIER (en-tête, menu, pied, colonne latérale) :
   *   une bannière de soldes a le même CDN, le même chemin, une vraie balise
   *   <img> et souvent une taille supérieure aux photos du produit. Ce qui la
   *   distingue n'est pas son adresse, c'est l'endroit où elle est posée.
   */
  self.dspScanMeta = {
    declarees: dspDeclaredImages(),
    mobilier: dspChromeImages(),
    voisinage: dspVoisinageImages(),
  }

  return [...found]
}

/** Les photos que la page déclare elle-même comme étant le produit. */
function dspDeclaredImages() {
  const out = new Set()

  for (const el of document.querySelectorAll('meta[property="og:image"], meta[name="og:image"]')) {
    const url = dspAbsoluteUrl(el.getAttribute('content'))
    if (url) out.add(url)
  }

  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const parsed = JSON.parse(script.textContent || '{}')
      const candidats = Array.isArray(parsed) ? parsed : [parsed, ...(parsed['@graph'] ?? [])]
      for (const c of candidats) {
        const type = c?.['@type']
        const estProduit = type === 'Product' || (Array.isArray(type) && type.includes('Product'))
        if (!estProduit || !c.image) continue
        for (const i of Array.isArray(c.image) ? c.image : [c.image]) {
          const url = dspAbsoluteUrl(typeof i === 'string' ? i : i?.url)
          if (url) out.add(url)
        }
      }
    } catch {
      // Un JSON-LD mal formé est courant ; il ne doit pas emporter le relevé.
    }
  }

  return [...out].slice(0, 12)
}

/**
 * Une image enfermée dans un lien qui mène ailleurs qu'à cette fiche.
 *
 * **Le défaut du 03/09/2026, et il était invisible à tous les filtres.** Une
 * annonce « bague maçonnique » importée depuis Temu portait quinze photos :
 * en première, un pendentif boussole ; en neuvième, un sac besace kaki
 * « Tokyo Japan ». Aucun contrôle ne pouvait les écarter — elles sont servies
 * par le même CDN que la galerie (`img.kwcdn.com`), sous le même chemin
 * (`/product/`), dans une vraie balise `<img>`, et souvent plus grandes que
 * les photos du produit. L'adaptateur Temu les *certifiait* donc, et le lot,
 * qui n'a personne pour relire, les importait toutes.
 *
 * Ce qui les distingue n'est ni leur adresse, ni leur taille, ni leur
 * position : **c'est le lien qui les enveloppe**. Une vignette de
 * recommandation est toujours cliquable vers une autre fiche — c'est sa raison
 * d'être. Une photo de galerie ne l'est jamais : elle ouvre un agrandissement,
 * change de variante, ou ne fait rien.
 *
 * Le signal est structurel, donc il survit à l'obfuscation des noms de classe
 * — la raison pour laquelle aucun sélecteur ne marche durablement sur Temu — et
 * il vaut pour tous les sites d'un coup : AliExpress, Banggood et DHgate
 * entourent leur carrousel « vous aimerez aussi » exactement de la même façon.
 *
 * Deux exceptions, toutes deux vérifiées avant de conclure « ailleurs » :
 * un lien vers le fichier image lui-même (c'est un agrandissement), et un lien
 * vers la même page avec d'autres paramètres (c'est un choix de variante).
 */
function dspPointeVersUneAutreFiche(el) {
  const lien = typeof el?.closest === 'function' ? el.closest('a[href]') : null
  if (!lien) return false

  const brut = lien.getAttribute('href') || ''
  if (!brut || brut.startsWith('#') || /^javascript:/i.test(brut)) return false

  let cible
  try {
    cible = new URL(lien.href || brut, location.href)
  } catch {
    return false
  }

  // Un lien vers l'image elle-même est une loupe, pas un voisin.
  if (/\.(?:jpe?g|png|webp|avif|gif)$/i.test(cible.pathname)) return false

  // Un autre domaine est toujours ailleurs. Sur le même domaine, seul le chemin
  // tranche : `?sku=2` reste cette fiche, `/autre-produit.html` ne l'est plus.
  if (cible.origin !== location.origin) return true
  return cible.pathname !== location.pathname
}

/** Les produits recommandés autour de la fiche : jamais celui qu'on importe. */
function dspVoisinageImages() {
  const out = new Set()

  for (const lien of document.querySelectorAll('a[href]')) {
    if (!dspPointeVersUneAutreFiche(lien)) continue
    for (const el of lien.querySelectorAll('img, source, [style*="background"]')) {
      try {
        dspSourcesOfElement(el, (value) => {
          const url = dspAbsoluteUrl(value)
          if (url) out.add(url)
        })
      } catch {
        // Un élément hostile ne doit pas interrompre le relevé.
      }
    }
    if (out.size > 300) break
  }

  return [...out]
}

/** Le mobilier de page : jamais le produit, sur aucun site. */
function dspChromeImages() {
  const out = new Set()

  for (const zone of document.querySelectorAll('header, nav, footer, aside')) {
    for (const el of zone.querySelectorAll('img, source, [style*="background"]')) {
      try {
        dspSourcesOfElement(el, (value) => {
          const url = dspAbsoluteUrl(value)
          if (url) out.add(url)
        })
      } catch {
        // Un élément hostile ne doit pas interrompre le relevé.
      }
    }
    if (out.size > 200) break
  }

  return [...out]
}

    // Only the entry point is published; every helper stays private.
    self.dspScanPageImages = dspScanPageImages
    /*
     * Une exception : l'adaptateur du site en a besoin lui aussi.
     *
     * `adapters.js` interroge le DOM avec ses propres sélecteurs, donc il
     * ramassait le carrousel de recommandations avant que le tri générique
     * n'ait son mot à dire — et ce qu'un adaptateur désigne passe devant tout.
     * Recopier la règle là-bas ferait deux versions qui divergeraient au
     * premier ajustement. `image-scan.js` est chargé en premier (voir
     * `background.js`), donc elle est disponible quand il en a besoin.
     */
    self.dspPointeVersUneAutreFiche = dspPointeVersUneAutreFiche
  })()
}
